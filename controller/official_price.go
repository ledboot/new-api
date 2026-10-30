package controller

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/official_price_setting"
	"github.com/gin-gonic/gin"
)

type officialPriceItem struct {
	ModelName         string  `json:"model_name"`
	QuotaType         int     `json:"quota_type"`
	InputPrice        float64 `json:"input_price"`
	OutputPrice       float64 `json:"output_price"`
	RequestPrice      float64 `json:"request_price"`
	CacheReadPrice    float64 `json:"cache_read_price"`
	CacheWritePrice   float64 `json:"cache_write_price"`
	CacheWrite1hPrice float64 `json:"cache_write_1h_price"`
	Source            string  `json:"source"`
	UpdatedTime       int64   `json:"updated_time"`
}

// GetOfficialPrices returns the effective vendor list price of every served
// model, together with the sync state so the console can show the last import.
func GetOfficialPrices(c *gin.Context) {
	overrides, err := model.GetOfficialPriceMap()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pricing := model.GetPricing()
	items := make([]officialPriceItem, 0, len(pricing))
	for _, row := range pricing {
		items = append(items, officialPriceItem{
			ModelName:         row.ModelName,
			QuotaType:         row.QuotaType,
			InputPrice:        row.OfficialInputPrice,
			OutputPrice:       row.OfficialOutputPrice,
			RequestPrice:      row.OfficialRequestPrice,
			CacheReadPrice:    row.OfficialCacheReadPrice,
			CacheWritePrice:   row.OfficialCacheWritePrice,
			CacheWrite1hPrice: row.OfficialCacheWrite1hPrice,
			Source:            row.OfficialPriceSource,
			UpdatedTime:       overrides[row.ModelName].UpdatedTime,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ModelName < items[j].ModelName })
	setting := official_price_setting.GetSetting()
	common.ApiSuccess(c, gin.H{
		"items": items,
		"state": model.GetOfficialPriceSyncState(),
		"settings": gin.H{
			"enabled":        setting.Enabled,
			"interval_hours": setting.IntervalHours,
			"source_url":     setting.SourceURL,
		},
	})
}

type officialPriceUpdateRequest struct {
	ModelName         string   `json:"model_name"`
	InputPrice        *float64 `json:"input_price"`
	OutputPrice       *float64 `json:"output_price"`
	RequestPrice      *float64 `json:"request_price"`
	CacheReadPrice    *float64 `json:"cache_read_price"`
	CacheWritePrice   *float64 `json:"cache_write_price"`
	CacheWrite1hPrice *float64 `json:"cache_write_1h_price"`
}

// SaveOfficialPrice stores an administrator-provided reference price. Manual
// rows are never overwritten by the scheduled import.
func SaveOfficialPrice(c *gin.Context) {
	var request officialPriceUpdateRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10), &request); err != nil {
		common.ApiError(c, common.NewMessage("Invalid parameters"))
		return
	}
	request.ModelName = strings.TrimSpace(request.ModelName)
	if request.ModelName == "" {
		common.ApiError(c, common.NewMessage("Invalid model name"))
		return
	}
	row := model.OfficialPrice{
		ModelName: request.ModelName,
		Source:    model.OfficialPriceSourceManual,
	}
	if request.InputPrice != nil {
		row.InputPrice = *request.InputPrice
	}
	if request.OutputPrice != nil {
		row.OutputPrice = *request.OutputPrice
	}
	if request.RequestPrice != nil {
		row.RequestPrice = *request.RequestPrice
	}
	if request.CacheReadPrice != nil {
		row.CacheReadPrice = *request.CacheReadPrice
	}
	if request.CacheWritePrice != nil {
		row.CacheWritePrice = *request.CacheWritePrice
	}
	if request.CacheWrite1hPrice != nil {
		row.CacheWrite1hPrice = *request.CacheWrite1hPrice
	}
	if err := model.SaveOfficialPrice(&row); err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidatePricingCache()
	common.ApiSuccess(c, row)
}

// ResetOfficialPrice removes the override so the built-in default (or the next
// import) applies again.
func ResetOfficialPrice(c *gin.Context) {
	name := strings.TrimSpace(c.Query("model"))
	if name == "" {
		common.ApiError(c, common.NewMessage("Invalid model name"))
		return
	}
	if err := model.DeleteOfficialPrice(name); err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidatePricingCache()
	common.ApiSuccess(c, nil)
}

// SyncOfficialPricesNow imports the price table immediately.
func SyncOfficialPricesNow(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()
	state, err := service.SyncOfficialPrices(ctx)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, state)
}
