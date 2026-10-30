package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testPriceIndex() officialPriceIndex {
	return buildOfficialPriceIndex(map[string]liteLLMPrice{
		"openai/gpt-4o":          {InputCostPerToken: 0.0000025, OutputCostPerToken: 0.00001, LiteLLMProvider: "openai"},
		"azure/gpt-4o":           {InputCostPerToken: 0.000003, OutputCostPerToken: 0.000012, LiteLLMProvider: "azure"},
		"claude-sonnet-4-5":      {InputCostPerToken: 0.000003, OutputCostPerToken: 0.000015, LiteLLMProvider: "anthropic"},
		"deepseek/deepseek-chat": {InputCostPerToken: 0.00000027, OutputCostPerToken: 0.0000011, LiteLLMProvider: "deepseek"},
		"anthropic/claude-cache": {InputCostPerToken: 0.000003, OutputCostPerToken: 0.000015, CacheReadInputTokenCost: 0.0000003, CacheCreationInputTokenCost: 0.00000375, CacheCreationInputTokenCost1h: 0.000006, LiteLLMProvider: "anthropic"},
		"openrouter/some-model":  {InputCostPerToken: 0.5, LiteLLMProvider: "openrouter"},
	})
}

func TestOfficialPriceIndexPrefersPrimaryVendor(t *testing.T) {
	index := testPriceIndex()
	entry, ok := index.lookup("gpt-4o")
	require.True(t, ok)
	// openai must win over azure even though azure came later in the map.
	assert.InDelta(t, 0.0000025, entry.InputCostPerToken, 1e-12)
}

func TestOfficialPriceIndexMatchesSnapshotNames(t *testing.T) {
	index := testPriceIndex()
	entry, ok := index.lookup("claude-sonnet-4-5-20250929")
	require.True(t, ok)
	assert.InDelta(t, 0.000003, entry.InputCostPerToken, 1e-12)

	entry, ok = index.lookup("deepseek-chat")
	require.True(t, ok)
	assert.InDelta(t, 0.00000027, entry.InputCostPerToken, 1e-12)

	_, ok = index.lookup("some-model")
	assert.False(t, ok, "aggregator-only rows are ignored")
}

func TestParseLiteLLMPrices(t *testing.T) {
	entries, err := parseLiteLLMPrices([]byte(`{"gpt-4o":{"input_cost_per_token":0.0000025,"output_cost_per_token":0.00001,"litellm_provider":"openai"}}`))
	require.NoError(t, err)
	assert.Len(t, entries, 1)
	_, err = parseLiteLLMPrices([]byte(`{}`))
	require.Error(t, err)
	_, err = parseLiteLLMPrices([]byte(`not json`))
	require.Error(t, err)
}

func TestRoundPriceKeepsSubCentPrices(t *testing.T) {
	assert.InDelta(t, 2.5, roundPrice(2.5), 1e-9)
	assert.InDelta(t, 0.00027, roundPrice(0.00027), 1e-9)
	assert.Equal(t, 0.0, roundPrice(0))
}

func TestOfficialPriceIndexKeepsCacheCosts(t *testing.T) {
	index := testPriceIndex()
	entry, ok := index.lookup("claude-cache-20250101")
	require.True(t, ok)
	assert.InDelta(t, 0.0000003, entry.CacheReadInputTokenCost, 1e-12)
	assert.InDelta(t, 0.00000375, entry.CacheCreationInputTokenCost, 1e-12)
	assert.InDelta(t, 0.000006, entry.CacheCreationInputTokenCost1h, 1e-12)
}
