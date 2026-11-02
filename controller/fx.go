package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/fx_setting"

	"github.com/gin-gonic/gin"
)

// GetFxRateStatus returns the live aggregated rate, each source's answer, and
// the configuration that produces it.
func GetFxRateStatus(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"snapshot": service.GetFxSnapshot(),
		"config":   fxRateConfigView(fx_setting.GetSetting()),
	})
}

// RefreshFxRate forces a refresh so an administrator does not have to wait for
// the next interval after changing a source.
func RefreshFxRate(c *gin.Context) {
	snapshot, err := service.RefreshFx(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"snapshot": snapshot})
}

// fxRateConfigView exposes the active source endpoints and aggregation knobs
// the admin page edits.
func fxRateConfigView(setting *fx_setting.Setting) gin.H {
	return gin.H{
		"enabled":                        setting.Enabled,
		"quote_currency":                 setting.QuoteCurrency,
		"markup_percent":                 setting.MarkupPercent,
		"refresh_minutes":                setting.RefreshInterval(),
		"max_deviation_percent":          setting.MaxDeviationPercent,
		"max_move_percent":               setting.MaxMovePercent,
		"manual_rate":                    setting.ManualRate,
		"fallback_rate":                  setting.FallbackRate,
		"source_ecb_enabled":             setting.EcbEnabled,
		"source_ecb_url":                 setting.EcbURL,
		"source_erapi_enabled":           setting.ErApiEnabled,
		"source_erapi_url":               setting.ErApiURL,
		"source_fawazahmed_enabled":      setting.FawazahmedEnabled,
		"source_fawazahmed_url":          setting.FawazahmedURL,
		"source_exchangeratefun_enabled": setting.ExchangerateFunEnabled,
		"source_exchangeratefun_url":     setting.ExchangerateFunURL,
	}
}
