package fx_setting

import "github.com/QuantumNous/new-api/setting/config"

// Setting controls how a top-up amount in USD is converted to the currency a
// payment channel settles in. Wallet credit stays denominated in USD; this
// setting only decides how much money the buyer is charged.
type Setting struct {
	// Enabled turns the conversion on. While it is off every channel keeps
	// charging its own unit price, which is the previous behaviour.
	Enabled bool `json:"enabled"`
	// QuoteCurrency is the currency converted into. Channels that settle in
	// another currency are rejected rather than priced with the wrong rate.
	QuoteCurrency string `json:"quote_currency"`
	// MarkupPercent is added on top of the aggregated market rate to cover
	// gateway and settlement costs.
	MarkupPercent float64 `json:"markup_percent"`
	// RefreshMinutes is the minimum interval between automatic refreshes.
	RefreshMinutes int `json:"refresh_minutes"`
	// MaxDeviationPercent drops a quote that disagrees with the median by more
	// than this, so one broken feed cannot move the price.
	MaxDeviationPercent float64 `json:"max_deviation_percent"`
	// MaxMovePercent limits how far one refresh may move the live rate. A
	// larger move is held until a second refresh confirms it.
	MaxMovePercent float64 `json:"max_move_percent"`
	// ManualRate, when positive, replaces the aggregated rate and is applied
	// as-is without markup.
	ManualRate float64 `json:"manual_rate"`
	// FallbackRate is used when every source fails and no cached rate exists.
	FallbackRate float64 `json:"fallback_rate"`

	EcbEnabled bool   `json:"source_ecb_enabled"`
	EcbURL     string `json:"source_ecb_url"`

	ErApiEnabled bool   `json:"source_erapi_enabled"`
	ErApiURL     string `json:"source_erapi_url"`

	FawazahmedEnabled bool   `json:"source_fawazahmed_enabled"`
	FawazahmedURL     string `json:"source_fawazahmed_url"`

	ExchangerateFunEnabled bool   `json:"source_exchangeratefun_enabled"`
	ExchangerateFunURL     string `json:"source_exchangeratefun_url"`
}

var setting = Setting{
	Enabled:                false,
	QuoteCurrency:          "CNY",
	MarkupPercent:          1,
	RefreshMinutes:         30,
	MaxDeviationPercent:    1,
	MaxMovePercent:         1,
	EcbEnabled:             true,
	EcbURL:                 "https://api.frankfurter.dev/v1/latest?base=USD&symbols=",
	ErApiEnabled:           true,
	ErApiURL:               "https://open.er-api.com/v6/latest/USD",
	FawazahmedEnabled:      true,
	FawazahmedURL:          "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
	ExchangerateFunEnabled: true,
	ExchangerateFunURL:     "https://api.exchangerate.fun/latest",
}

func init() {
	config.GlobalConfig.Register("fx_setting", &setting)
}

func GetSetting() *Setting {
	return &setting
}

// RefreshInterval returns a usable refresh interval even if the option holds an
// unusable value.
func (s *Setting) RefreshInterval() int {
	if s.RefreshMinutes <= 0 {
		return 30
	}
	return s.RefreshMinutes
}
