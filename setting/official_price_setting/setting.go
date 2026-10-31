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
	// OpenRouter covers models the primary table does not carry under a
	// first-party provider (GLM/Qwen/DeepSeek entries live there). It is used
	// only as a fallback for models the primary source could not match.
	OpenRouterEnabled bool   `json:"openrouter_enabled"`
	OpenRouterURL     string `json:"openrouter_url"`
}

// DefaultOpenRouterURL is OpenRouter's public model catalog with per-token prices.
const DefaultOpenRouterURL = "https://openrouter.ai/api/v1/models"

var setting = Setting{
	Enabled:           true,
	IntervalHours:     24,
	SourceURL:         DefaultSourceURL,
	OpenRouterEnabled: true,
	OpenRouterURL:     DefaultOpenRouterURL,
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
