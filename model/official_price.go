package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm/clause"
)

// OfficialPrice is the vendor list price used only for the "vs official" hint
// shown in the model square. It never affects billing: selling prices stay in
// the model ratios.
type OfficialPrice struct {
	ModelName string `json:"model_name" gorm:"primaryKey;type:varchar(191)"`
	// USD per 1M tokens.
	InputPrice  float64 `json:"input_price"`
	OutputPrice float64 `json:"output_price"`
	// USD per request, for pay-per-call models.
	RequestPrice float64 `json:"request_price"`
	// USD per 1M cached tokens: cache hits, 5-minute cache writes and
	// 1-hour cache writes.
	CacheReadPrice    float64 `json:"cache_read_price" gorm:"column:cache_read_price"`
	CacheWritePrice   float64 `json:"cache_write_price" gorm:"column:cache_write_price"`
	CacheWrite1hPrice float64 `json:"cache_write_1h_price" gorm:"column:cache_write_1h_price"`
	// manual: edited by an administrator and never overwritten by a sync.
	// sync: imported from the price source.
	Source      string `json:"source" gorm:"type:varchar(16);index"`
	UpdatedTime int64  `json:"updated_time"`
}

const (
	OfficialPriceSourceManual  = "manual"
	OfficialPriceSourceSync    = "sync"
	OfficialPriceSourceDefault = "default"
)

func ListOfficialPrices() ([]OfficialPrice, error) {
	var rows []OfficialPrice
	err := DB.Order("model_name ASC").Find(&rows).Error
	return rows, err
}

func GetOfficialPriceMap() (map[string]OfficialPrice, error) {
	rows, err := ListOfficialPrices()
	if err != nil {
		return nil, err
	}
	prices := make(map[string]OfficialPrice, len(rows))
	for _, row := range rows {
		prices[row.ModelName] = row
	}
	return prices, nil
}

// ValidateOfficialPrice rejects negative prices and empty model names.
func ValidateOfficialPrice(row *OfficialPrice) error {
	row.ModelName = strings.TrimSpace(row.ModelName)
	if row.ModelName == "" || len(row.ModelName) > 191 {
		return common.NewMessage("Invalid model name")
	}
	prices := []float64{
		row.InputPrice,
		row.OutputPrice,
		row.RequestPrice,
		row.CacheReadPrice,
		row.CacheWritePrice,
		row.CacheWrite1hPrice,
	}
	for _, price := range prices {
		if price < 0 || price > 1000000 {
			return common.NewMessage("Invalid official price")
		}
	}
	empty := true
	for _, price := range prices {
		if price > 0 {
			empty = false
			break
		}
	}
	if empty {
		return common.NewMessage("Enter at least one official price")
	}
	if row.Source != OfficialPriceSourceManual && row.Source != OfficialPriceSourceSync {
		row.Source = OfficialPriceSourceManual
	}
	return nil
}

func SaveOfficialPrice(row *OfficialPrice) error {
	if err := ValidateOfficialPrice(row); err != nil {
		return err
	}
	row.UpdatedTime = common.GetTimestamp()
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "model_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"input_price", "output_price", "request_price", "cache_read_price", "cache_write_price", "cache_write_1h_price", "source", "updated_time"}),
	}).Create(row).Error
}

func DeleteOfficialPrice(modelName string) error {
	return DB.Where("model_name = ?", modelName).Delete(&OfficialPrice{}).Error
}

// SaveOfficialPriceSync upserts synced rows while keeping manual edits intact.
func SaveOfficialPriceSync(rows []OfficialPrice) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	manual := map[string]bool{}
	var manualRows []OfficialPrice
	if err := DB.Select("model_name").Where("source = ?", OfficialPriceSourceManual).Find(&manualRows).Error; err != nil {
		return 0, err
	}
	for _, row := range manualRows {
		manual[row.ModelName] = true
	}
	kept := make([]OfficialPrice, 0, len(rows))
	for _, row := range rows {
		if manual[row.ModelName] {
			continue
		}
		row.Source = OfficialPriceSourceSync
		row.UpdatedTime = common.GetTimestamp()
		kept = append(kept, row)
	}
	if len(kept) == 0 {
		return 0, nil
	}
	err := DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "model_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"input_price", "output_price", "request_price", "cache_read_price", "cache_write_price", "cache_write_1h_price", "source", "updated_time"}),
	}).CreateInBatches(kept, 100).Error
	if err != nil {
		return 0, err
	}
	return len(kept), nil
}

// SyncState is persisted so every node reports the same last-run information.
type OfficialPriceSyncState struct {
	LastRunTime       int64  `json:"last_run_time"`
	Updated           int    `json:"updated"`
	Matched           int    `json:"matched"`
	MatchedOpenRouter int    `json:"matched_openrouter"`
	Skipped           int    `json:"skipped"`
	Error             string `json:"error"`
	SourceURL         string `json:"source_url"`
	SourceFormat      string `json:"source_format"`
}

const officialPriceSyncStateKey = "official_price_sync_state"

func GetOfficialPriceSyncState() OfficialPriceSyncState {
	var option Option
	if err := DB.Where("key = ?", officialPriceSyncStateKey).First(&option).Error; err != nil {
		return OfficialPriceSyncState{}
	}
	var state OfficialPriceSyncState
	if err := common.Unmarshal([]byte(option.Value), &state); err != nil {
		return OfficialPriceSyncState{}
	}
	return state
}

func SaveOfficialPriceSyncState(state OfficialPriceSyncState) error {
	value, err := common.Marshal(state)
	if err != nil {
		return err
	}
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&Option{Key: officialPriceSyncStateKey, Value: string(value)}).Error
}
