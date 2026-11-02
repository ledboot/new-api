package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/fx_setting"
)

const (
	fxSourceECB             = "ecb"
	fxSourceErApi           = "er-api"
	fxSourceFawazahmed      = "fawazahmed"
	fxSourceExchangerateFun = "exchangerate-fun"

	fxRequestTimeout = 8 * time.Second
	fxBodyLimit      = 1 << 20
	fxMaxAge         = 3 * time.Hour
	fxRateDecimals   = 6
)

// FxQuote is one source's answer for "1 USD = Rate QuoteCurrency".
type FxQuote struct {
	Source      string  `json:"source"`
	Rate        float64 `json:"rate"`
	PublishedAt int64   `json:"published_at"`
	Error       string  `json:"error,omitempty"`
}

// FxSnapshot is what the price calculation and the admin page read.
type FxSnapshot struct {
	// Rate already includes the markup; RawRate is the aggregated market rate.
	Rate        float64   `json:"rate"`
	RawRate     float64   `json:"raw_rate"`
	Currency    string    `json:"currency"`
	Source      string    `json:"source"`
	MarkupPct   float64   `json:"markup_percent"`
	UpdatedAt   int64     `json:"updated_at"`
	Stale       bool      `json:"stale"`
	LastError   string    `json:"last_error,omitempty"`
	Quotes      []FxQuote `json:"quotes"`
	PendingRate float64   `json:"pending_rate,omitempty"`
}

var fxClient = &http.Client{Timeout: fxRequestTimeout}

var fxState struct {
	mu       sync.RWMutex
	snapshot FxSnapshot
	pending  float64
}

// GetFxRate converts one USD of wallet credit into the channel currency.
// It returns 1 while the conversion is disabled so every existing channel
// keeps charging exactly what it charged before.
func GetFxRate(currency string) (float64, error) {
	trimmed := strings.TrimSpace(currency)
	if trimmed == "" || strings.EqualFold(trimmed, "USD") {
		return 1, nil
	}
	setting := fx_setting.GetSetting()
	if !setting.Enabled {
		return 1, nil
	}
	if !strings.EqualFold(trimmed, setting.QuoteCurrency) {
		return 0, common.NewMessage("No exchange rate is configured for {{currency}}", map[string]any{"currency": trimmed})
	}
	if setting.ManualRate > 0 {
		return setting.ManualRate, nil
	}
	snapshot := GetFxSnapshot()
	if snapshot.Rate > 0 {
		if time.Since(time.Unix(snapshot.UpdatedAt, 0)) > fxMaxAge {
			go RefreshFxWithTimeout()
		}
		return snapshot.Rate, nil
	}
	snapshot = RefreshFxWithTimeout()
	if snapshot.Rate > 0 {
		return snapshot.Rate, nil
	}
	if setting.FallbackRate > 0 {
		return setting.FallbackRate, nil
	}
	return 0, common.NewMessage("The exchange rate is unavailable; try again later or set a manual rate")
}

func GetFxSnapshot() FxSnapshot {
	fxState.mu.RLock()
	defer fxState.mu.RUnlock()
	snapshot := fxState.snapshot
	snapshot.PendingRate = fxState.pending
	if snapshot.UpdatedAt > 0 {
		snapshot.Stale = time.Since(time.Unix(snapshot.UpdatedAt, 0)) > fxMaxAge
	}
	return snapshot
}

// RefreshFxWithTimeout wraps RefreshFx with a request budget for callers that
// cannot wait on a shared context.
func RefreshFxWithTimeout() FxSnapshot {
	ctx, cancel := context.WithTimeout(context.Background(), fxRequestTimeout*2)
	defer cancel()
	snapshot, err := RefreshFx(ctx)
	if err != nil {
		common.SysError(common.LogText("exchange rate refresh failed: %s", err.Error()))
	}
	return snapshot
}

// RefreshFx queries every enabled source, aggregates the answers, and applies
// the markup and the per-refresh move limit.
func RefreshFx(ctx context.Context) (FxSnapshot, error) {
	setting := fx_setting.GetSetting()
	currency := strings.ToUpper(strings.TrimSpace(setting.QuoteCurrency))
	if currency == "" {
		return GetFxSnapshot(), errors.New("exchange rate quote currency is empty")
	}
	quotes := fetchFxQuotes(ctx, setting, currency)
	raw, err := aggregateRates(quotes, setting.MaxDeviationPercent)
	if err != nil {
		fxState.mu.Lock()
		fxState.snapshot.Quotes = quotes
		fxState.snapshot.LastError = err.Error()
		snapshot := fxState.snapshot
		fxState.mu.Unlock()
		return snapshot, err
	}
	rate := roundRate(raw * (1 + setting.MarkupPercent/100))

	fxState.mu.Lock()
	defer fxState.mu.Unlock()
	held, pending, clamped := limitFxMove(fxState.snapshot.RawRate, raw, setting.MaxMovePercent, fxState.pending)
	fxState.pending = pending
	effectiveRaw := raw
	if clamped {
		effectiveRaw = held
	}
	if effectiveRaw <= 0 {
		effectiveRaw = raw
	}
	finalRate := roundRate(effectiveRaw * (1 + setting.MarkupPercent/100))
	if clamped && fxState.snapshot.Rate > 0 {
		// A held move keeps the exact price buyers already see.
		finalRate = fxState.snapshot.Rate
	}
	if finalRate <= 0 {
		finalRate = rate
	}
	fxState.snapshot = FxSnapshot{
		Rate:      finalRate,
		RawRate:   effectiveRaw,
		Currency:  currency,
		Source:    "aggregate",
		MarkupPct: setting.MarkupPercent,
		UpdatedAt: time.Now().Unix(),
		Quotes:    quotes,
	}
	if clamped {
		fxState.snapshot.PendingRate = raw
	}
	return fxState.snapshot, nil
}

// StartFxRefresh refreshes the rate in the background on the master node.
func StartFxRefresh() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		time.Sleep(30 * time.Second)
		for {
			setting := fx_setting.GetSetting()
			if setting.Enabled && setting.ManualRate <= 0 {
				RefreshFxWithTimeout()
			}
			interval := time.Duration(setting.RefreshInterval()) * time.Minute
			time.Sleep(interval)
		}
	}()
}

func fetchFxQuotes(ctx context.Context, setting *fx_setting.Setting, currency string) []FxQuote {
	fetchers := []struct {
		enabled bool
		source  string
		fetch   func(context.Context) (FxQuote, error)
	}{
		{setting.EcbEnabled, fxSourceECB, func(ctx context.Context) (FxQuote, error) {
			endpoint := strings.TrimSpace(setting.EcbURL)
			if endpoint == "" {
				return FxQuote{}, errors.New("endpoint is empty")
			}
			if strings.HasSuffix(endpoint, "=") {
				endpoint += url.QueryEscape(currency)
			}
			return fetchFxHTTP(ctx, fxSourceECB, endpoint, "", "", func(body []byte) (float64, int64, error) {
				var payload struct {
					Date  string             `json:"date"`
					Rates map[string]float64 `json:"rates"`
				}
				if err := common.Unmarshal(body, &payload); err != nil {
					return 0, 0, err
				}
				published, _ := time.Parse(time.DateOnly, payload.Date)
				return payload.Rates[currency], published.Unix(), nil
			})
		}},
		{setting.ErApiEnabled, fxSourceErApi, func(ctx context.Context) (FxQuote, error) {
			return fetchFxHTTP(ctx, fxSourceErApi, strings.TrimSpace(setting.ErApiURL), "", "", func(body []byte) (float64, int64, error) {
				var payload struct {
					Result    string             `json:"result"`
					UpdatedAt int64              `json:"time_last_update_unix"`
					Rates     map[string]float64 `json:"rates"`
				}
				if err := common.Unmarshal(body, &payload); err != nil {
					return 0, 0, err
				}
				if payload.Result != "success" {
					return 0, 0, errors.New("source reported failure")
				}
				return payload.Rates[currency], payload.UpdatedAt, nil
			})
		}},
		{setting.FawazahmedEnabled, fxSourceFawazahmed, func(ctx context.Context) (FxQuote, error) {
			return fetchFxHTTP(ctx, fxSourceFawazahmed, strings.TrimSpace(setting.FawazahmedURL), "", "", func(body []byte) (float64, int64, error) {
				var payload struct {
					Date string             `json:"date"`
					USD  map[string]float64 `json:"usd"`
				}
				if err := common.Unmarshal(body, &payload); err != nil {
					return 0, 0, err
				}
				published, _ := time.Parse(time.DateOnly, payload.Date)
				return payload.USD[strings.ToLower(currency)], published.Unix(), nil
			})
		}},
		{setting.ExchangerateFunEnabled, fxSourceExchangerateFun, func(ctx context.Context) (FxQuote, error) {
			endpoint := strings.TrimSpace(setting.ExchangerateFunURL)
			if endpoint == "" {
				return FxQuote{}, errors.New("endpoint is empty")
			}
			parsedEndpoint, err := url.Parse(endpoint)
			if err != nil {
				return FxQuote{}, errors.New("endpoint is invalid")
			}
			// The aggregation always compares USD-based quotes, so pin the
			// base unless the administrator already set one.
			query := parsedEndpoint.Query()
			if query.Get("base") == "" {
				query.Set("base", "USD")
				parsedEndpoint.RawQuery = query.Encode()
			}
			return fetchFxHTTP(ctx, fxSourceExchangerateFun, parsedEndpoint.String(), "", "", func(body []byte) (float64, int64, error) {
				var payload struct {
					Timestamp int64              `json:"timestamp"`
					Base      string             `json:"base"`
					Rates     map[string]float64 `json:"rates"`
				}
				if err := common.Unmarshal(body, &payload); err != nil {
					return 0, 0, err
				}
				if !strings.EqualFold(payload.Base, "USD") {
					return 0, 0, errors.New("source did not return USD-based rates")
				}
				return payload.Rates[currency], payload.Timestamp, nil
			})
		}},
	}

	quotes := make([]FxQuote, 0, len(fetchers))
	var mu sync.Mutex
	var group sync.WaitGroup
	for _, entry := range fetchers {
		if !entry.enabled {
			continue
		}
		group.Go(func() {
			quote, err := entry.fetch(ctx)
			quote.Source = entry.source
			if err != nil {
				quote.Rate = 0
				quote.Error = err.Error()
			}
			mu.Lock()
			quotes = append(quotes, quote)
			mu.Unlock()
		})
	}
	group.Wait()
	slices.SortFunc(quotes, func(a, b FxQuote) int { return strings.Compare(a.Source, b.Source) })
	return quotes
}

func fetchFxHTTP(ctx context.Context, source, endpoint, headerName, headerValue string, parse func([]byte) (float64, int64, error)) (FxQuote, error) {
	if endpoint == "" {
		return FxQuote{}, errors.New("endpoint is empty")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return FxQuote{}, err
	}
	request.Header.Set("Accept", "application/json")
	if headerName != "" {
		request.Header.Set(headerName, headerValue)
	}
	response, err := fxClient.Do(request)
	if err != nil {
		return FxQuote{}, errors.New("request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return FxQuote{Source: source}, fmt.Errorf("http %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, fxBodyLimit))
	if err != nil {
		return FxQuote{}, errors.New("response could not be read")
	}
	rate, publishedAt, err := parse(body)
	if err != nil {
		return FxQuote{}, errors.New("response could not be parsed")
	}
	if !(rate > 0) || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return FxQuote{}, errors.New("source returned no usable rate")
	}
	return FxQuote{Source: source, Rate: rate, PublishedAt: publishedAt}, nil
}

// aggregateRates returns the median of the quotes that agree with the median,
// which keeps a single broken feed from setting the price.
func aggregateRates(quotes []FxQuote, maxDeviationPercent float64) (float64, error) {
	values := make([]float64, 0, len(quotes))
	for _, quote := range quotes {
		if quote.Error == "" && quote.Rate > 0 {
			values = append(values, quote.Rate)
		}
	}
	if len(values) == 0 {
		return 0, errors.New("no exchange rate source answered")
	}
	slices.Sort(values)
	median := values[len(values)/2]
	if len(values)%2 == 0 {
		median = (values[len(values)/2-1] + values[len(values)/2]) / 2
	}
	if maxDeviationPercent <= 0 || len(values) == 1 {
		return median, nil
	}
	kept := make([]float64, 0, len(values))
	for _, value := range values {
		if math.Abs(value-median)/median*100 <= maxDeviationPercent {
			kept = append(kept, value)
		}
	}
	if len(kept) == 0 {
		return 0, errors.New("every exchange rate source disagreed")
	}
	slices.Sort(kept)
	aggregate := kept[len(kept)/2]
	if len(kept)%2 == 0 {
		aggregate = (kept[len(kept)/2-1] + kept[len(kept)/2]) / 2
	}
	return aggregate, nil
}

// limitFxMove keeps a large one-off move on hold until a later refresh repeats
// it, so a single bad feed cannot reprice checkout instantly.
func limitFxMove(current, next, maxMovePercent, pending float64) (rate, newPending float64, clamped bool) {
	if current <= 0 || maxMovePercent <= 0 {
		return next, 0, false
	}
	if math.Abs(next-current)/current*100 <= maxMovePercent {
		return next, 0, false
	}
	if pending > 0 && math.Abs(next-pending)/pending*100 <= maxMovePercent {
		return next, 0, false
	}
	return current, next, true
}

func roundRate(value float64) float64 {
	if !(value > 0) {
		return 0
	}
	pow := math.Pow(10, fxRateDecimals)
	return math.Round(value*pow) / pow
}
