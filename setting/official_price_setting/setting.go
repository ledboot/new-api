package official_price_setting

import "github.com/QuantumNous/new-api/setting/config"

// DefaultSourceURL is LiteLLM's community-maintained price table: input and
// output cost per token for most vendor models, refreshed upstream.
const DefaultSourceURL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

// Setting controls the scheduled import of vendor list prices. The import only
// writes the "official reference price" used for the comparison hint; selling
// prices stay in the model ratios.
type Setting struct {
	Enabled       bool   `json:"enabled"`
	IntervalHours int    `json:"interval_hours"`
	SourceURL     string `json:"source_url"`
}

var setting = Setting{
	Enabled:       true,
	IntervalHours: 24,
	SourceURL:     DefaultSourceURL,
}

func init() {
	config.GlobalConfig.Register("official_price_setting", &setting)
}

func GetSetting() Setting {
	return setting
}

func GetSourceURL() string {
	if setting.SourceURL == "" {
		return DefaultSourceURL
	}
	return setting.SourceURL
}
