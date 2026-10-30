package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/official_price_setting"
)

// LiteLLM publishes one flat object keyed by model name (sometimes prefixed
// with a provider, e.g. "anthropic/claude-...") with per-token costs.
type liteLLMPrice struct {
	InputCostPerToken  float64 `json:"input_cost_per_token"`
	OutputCostPerToken float64 `json:"output_cost_per_token"`
	// Anthropic-style prompt caching: cache hits, 5-minute writes, 1-hour writes.
	CacheReadInputTokenCost       float64 `json:"cache_read_input_token_cost"`
	CacheCreationInputTokenCost   float64 `json:"cache_creation_input_token_cost"`
	CacheCreationInputTokenCost1h float64 `json:"cache_creation_input_token_cost_above_1hr"`
	LiteLLMProvider               string  `json:"litellm_provider"`
	Mode                          string  `json:"mode"`
}

var officialPriceHTTPClient = &http.Client{Timeout: 45 * time.Second}

// Primary vendors only: aggregator or reseller rows must not redefine the list
// price of a model. Lower rank wins when the same model appears twice.
var officialPriceProviderRank = map[string]int{
	"openai":    1,
	"anthropic": 1,
	"gemini":    1,
	"deepseek":  1,
	"xai":       1,
	"vertex_ai": 2,
	"mistral":   3,
	"cohere":    3,
}

type officialPriceIndex struct {
	prices map[string]liteLLMPrice
	rank   map[string]int
}

func normalizeModelKey(name string) string {
	key := strings.ToLower(strings.TrimSpace(name))
	if slash := strings.LastIndex(key, "/"); slash >= 0 {
		key = key[slash+1:]
	}
	return strings.TrimSuffix(key, ":free")
}

// stripSnapshotDate removes "-2024-08-06" / "20250806" / "-latest" style
// suffixes so a dated site model still matches its undated price entry.
func stripSnapshotDate(name string) string {
	for _, marker := range []string{"-2023-", "-2024-", "-2025-", "-2026-"} {
		if index := strings.LastIndex(name, marker); index > 0 {
			return name[:index]
		}
	}
	for _, length := range []int{8, 6} {
		if len(name) > length+1 {
			suffix := name[len(name)-length:]
			if isDigits(suffix) {
				return strings.TrimSuffix(name[:len(name)-length], "-")
			}
		}
	}
	return strings.TrimSuffix(name, "-latest")
}

func isDigits(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return value != ""
}

func buildOfficialPriceIndex(entries map[string]liteLLMPrice) officialPriceIndex {
	index := officialPriceIndex{
		prices: map[string]liteLLMPrice{},
		rank:   map[string]int{},
	}
	for rawName, entry := range entries {
		priority, ok := officialPriceProviderRank[entry.LiteLLMProvider]
		if !ok {
			continue
		}
		key := normalizeModelKey(rawName)
		if key == "" {
			continue
		}
		if current, exists := index.rank[key]; exists && current <= priority {
			continue
		}
		index.prices[key] = entry
		index.rank[key] = priority
	}
	return index
}

func (index officialPriceIndex) lookup(modelName string) (liteLLMPrice, bool) {
	key := normalizeModelKey(modelName)
	if entry, ok := index.prices[key]; ok {
		return entry, true
	}
	if stripped := stripSnapshotDate(key); stripped != key {
		if entry, ok := index.prices[stripped]; ok {
			return entry, true
		}
	}
	return liteLLMPrice{}, false
}

func parseLiteLLMPrices(body []byte) (map[string]liteLLMPrice, error) {
	entries := map[string]liteLLMPrice{}
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("parse price table: %w", err)
	}
	if len(entries) == 0 {
		return nil, errors.New("price table is empty")
	}
	return entries, nil
}

func fetchOfficialPriceTable(ctx context.Context, url string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	response, err := officialPriceHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("price source returned %d", response.StatusCode)
	}
	// The table is a few megabytes; cap it so a hostile source cannot exhaust memory.
	return io.ReadAll(io.LimitReader(response.Body, 64<<20))
}

// SyncOfficialPrices imports vendor list prices for the models this site serves.
// Manual edits are preserved; failures leave the previous values untouched.
func SyncOfficialPrices(ctx context.Context) (model.OfficialPriceSyncState, error) {
	url := official_price_setting.GetSourceURL()
	state := model.OfficialPriceSyncState{
		LastRunTime:  common.GetTimestamp(),
		SourceURL:    url,
		SourceFormat: "litellm",
	}
	body, err := fetchOfficialPriceTable(ctx, url)
	if err != nil {
		return failOfficialPriceSync(state, err)
	}
	entries, err := parseLiteLLMPrices(body)
	if err != nil {
		return failOfficialPriceSync(state, err)
	}
	index := buildOfficialPriceIndex(entries)

	rows := make([]model.OfficialPrice, 0, len(entries))
	for _, pricing := range model.GetPricing() {
		// Task/usage priced models have no comparable per-token list price.
		if pricing.BillingUsageSchema != nil {
			continue
		}
		entry, ok := index.lookup(pricing.ModelName)
		if !ok {
			continue
		}
		state.Matched++
		input := roundPrice(entry.InputCostPerToken * 1_000_000)
		output := roundPrice(entry.OutputCostPerToken * 1_000_000)
		cacheRead := roundPrice(entry.CacheReadInputTokenCost * 1_000_000)
		cacheWrite := roundPrice(entry.CacheCreationInputTokenCost * 1_000_000)
		cacheWrite1h := roundPrice(entry.CacheCreationInputTokenCost1h * 1_000_000)
		if input == 0 && output == 0 && cacheRead == 0 && cacheWrite == 0 && cacheWrite1h == 0 {
			state.Skipped++
			continue
		}
		rows = append(rows, model.OfficialPrice{
			ModelName:         pricing.ModelName,
			InputPrice:        input,
			OutputPrice:       output,
			CacheReadPrice:    cacheRead,
			CacheWritePrice:   cacheWrite,
			CacheWrite1hPrice: cacheWrite1h,
		})
	}
	updated, err := model.SaveOfficialPriceSync(rows)
	if err != nil {
		return failOfficialPriceSync(state, err)
	}
	state.Updated = updated
	state.Skipped += len(rows) - updated
	if err := model.SaveOfficialPriceSyncState(state); err != nil {
		return state, err
	}
	model.InvalidatePricingCache()
	return state, nil
}

func failOfficialPriceSync(state model.OfficialPriceSyncState, err error) (model.OfficialPriceSyncState, error) {
	state.Error = err.Error()
	_ = model.SaveOfficialPriceSyncState(state)
	return state, err
}

func roundPrice(value float64) float64 {
	if value <= 0 {
		return 0
	}
	// Keep up to six decimals: some vendors price below $0.01 / 1M.
	scaled := float64(int64(value*1_000_000 + 0.5))
	if scaled < 1 {
		return 0.000001
	}
	return scaled / 1_000_000
}

const officialPriceSyncCheckInterval = 30 * time.Minute

// StartOfficialPriceSync runs the import on a master node at the configured
// interval. It is a no-op when syncing is disabled.
func StartOfficialPriceSync() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		// Let startup finish (options loaded, pricing cache warm) first.
		time.Sleep(2 * time.Minute)
		ticker := time.NewTicker(officialPriceSyncCheckInterval)
		defer ticker.Stop()
		for {
			if officialPriceSyncDue() {
				SyncOfficialPricesWithTimeout()
			}
			<-ticker.C
		}
	}()
}

func officialPriceSyncDue() bool {
	setting := official_price_setting.GetSetting()
	if !setting.Enabled {
		return false
	}
	state := model.GetOfficialPriceSyncState()
	if state.LastRunTime == 0 {
		return true
	}
	interval := time.Duration(setting.IntervalHours) * time.Hour
	if interval <= 0 {
		interval = 24 * time.Hour
	}
	return time.Since(time.Unix(state.LastRunTime, 0)) >= interval
}

// SyncOfficialPricesWithTimeout wraps the import with a request budget and logs
// the outcome; used by both the scheduler and the "sync now" endpoint.
func SyncOfficialPricesWithTimeout() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	state, err := SyncOfficialPrices(ctx)
	if err != nil {
		common.SysError(common.LogText("official price sync failed: %s", err.Error()))
		return
	}
	common.SysLog(common.LogText("official price sync done: matched=%d updated=%d skipped=%d", state.Matched, state.Updated, state.Skipped))
}
