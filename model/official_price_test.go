package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyOfficialPricePrefersOverride(t *testing.T) {
	pricing := Pricing{QuotaType: 0, ModelRatio: 1, CompletionRatio: 4}
	applyOfficialPrice(&pricing, "gpt-4o", OfficialPrice{})
	assert.InDelta(t, 2.5, pricing.OfficialInputPrice, 0.0001)
	assert.InDelta(t, 10, pricing.OfficialOutputPrice, 0.0001)
	// Built-in cache-read default for gpt-4o is 0.5x the input price.
	assert.InDelta(t, 1.25, pricing.OfficialCacheReadPrice, 0.0001)
	assert.Zero(t, pricing.OfficialCacheWrite1hPrice)
	assert.Equal(t, OfficialPriceSourceDefault, pricing.OfficialPriceSource)

	manual := OfficialPrice{
		ModelName: "gpt-4o", InputPrice: 3, OutputPrice: 12,
		CacheReadPrice: 0.3, CacheWritePrice: 3.75, CacheWrite1hPrice: 6,
		Source: OfficialPriceSourceManual,
	}
	applyOfficialPrice(&pricing, "gpt-4o", manual)
	assert.InDelta(t, 3, pricing.OfficialInputPrice, 0.0001)
	assert.InDelta(t, 12, pricing.OfficialOutputPrice, 0.0001)
	assert.InDelta(t, 0.3, pricing.OfficialCacheReadPrice, 0.0001)
	assert.InDelta(t, 3.75, pricing.OfficialCacheWritePrice, 0.0001)
	assert.InDelta(t, 6, pricing.OfficialCacheWrite1hPrice, 0.0001)
	assert.Equal(t, OfficialPriceSourceManual, pricing.OfficialPriceSource)
}

func TestApplyOfficialPriceSkipsModelsWithoutBaseline(t *testing.T) {
	pricing := Pricing{QuotaType: 0, ModelRatio: 1, CompletionRatio: 4}
	applyOfficialPrice(&pricing, "zz-model-without-default", OfficialPrice{})
	assert.Zero(t, pricing.OfficialInputPrice)
	assert.Empty(t, pricing.OfficialPriceSource)
}

func TestSaveOfficialPriceSyncKeepsManualRows(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&OfficialPrice{}))
	require.NoError(t, DB.Exec("DELETE FROM official_prices").Error)
	t.Cleanup(func() { require.NoError(t, DB.Exec("DELETE FROM official_prices").Error) })

	require.NoError(t, SaveOfficialPrice(&OfficialPrice{
		ModelName: "gpt-4o", InputPrice: 9, OutputPrice: 9,
	}))
	updated, err := SaveOfficialPriceSync([]OfficialPrice{
		{ModelName: "gpt-4o", InputPrice: 2.5, OutputPrice: 10},
		{ModelName: "claude-sonnet-4-5", InputPrice: 3, OutputPrice: 15},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, updated)

	prices, err := GetOfficialPriceMap()
	require.NoError(t, err)
	assert.Equal(t, OfficialPriceSourceManual, prices["gpt-4o"].Source)
	assert.InDelta(t, 9, prices["gpt-4o"].InputPrice, 0.0001)
	assert.Equal(t, OfficialPriceSourceSync, prices["claude-sonnet-4-5"].Source)
	assert.InDelta(t, 3, prices["claude-sonnet-4-5"].InputPrice, 0.0001)
}

func TestValidateOfficialPriceRejectsBadValues(t *testing.T) {
	require.Error(t, ValidateOfficialPrice(&OfficialPrice{ModelName: ""}))
	require.Error(t, ValidateOfficialPrice(&OfficialPrice{ModelName: "gpt-4o"}))
	require.Error(t, ValidateOfficialPrice(&OfficialPrice{ModelName: "gpt-4o", InputPrice: -1}))
	require.NoError(t, ValidateOfficialPrice(&OfficialPrice{ModelName: "gpt-4o", InputPrice: 2.5}))
}
