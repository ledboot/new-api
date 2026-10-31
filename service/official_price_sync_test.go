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

func TestOpenRouterPricesCoverGlmQwenDeepSeek(t *testing.T) {
	body := []byte(`{"data":[
		{"id":"deepseek/deepseek-v4.1-flash","pricing":{"prompt":"0.000000045","completion":"0.0000005","input_cache_read":"0.000000006"}},
		{"id":"z-ai/glm-5.3","pricing":{"prompt":"0.0000000699","completion":"0.0000014"}},
		{"id":"qwen/qwen3.8-max-0902","pricing":{"prompt":"0.0000002","completion":"0.0000008"}},
		{"id":"~deepseek/deepseek-v4-flash-latest","pricing":{"prompt":"0.0000001","completion":"0.0000004"}},
		{"id":"deepseek/deepseek-v4-flash","pricing":{"prompt":"0.0000002","completion":"0.0000006"}}
	]}`)
	index, err := parseOpenRouterPrices(body)
	require.NoError(t, err)

	row, ok := lookupOpenRouter(index, "deepseek-v4.1-flash")
	require.True(t, ok)
	assert.InDelta(t, 0.045, row.InputPrice, 1e-9)
	assert.InDelta(t, 0.5, row.OutputPrice, 1e-9)
	assert.InDelta(t, 0.006, row.CacheReadPrice, 1e-9)

	row, ok = lookupOpenRouter(index, "glm-5.3")
	require.True(t, ok)
	assert.InDelta(t, 0.0699, row.InputPrice, 1e-9)

	// A dated site model still matches, and plain ids beat ":batch"/"~" variants.
	row, ok = lookupOpenRouter(index, "qwen3.8-max-0902")
	require.True(t, ok)
	assert.InDelta(t, 0.2, row.InputPrice, 1e-9)

	row, ok = lookupOpenRouter(index, "deepseek-v4-flash")
	require.True(t, ok)
	assert.InDelta(t, 0.2, row.InputPrice, 1e-9)

	_, ok = lookupOpenRouter(index, "zz-unknown-model")
	assert.False(t, ok)
}

func TestOpenRouterRejectsEmptyCatalog(t *testing.T) {
	_, err := parseOpenRouterPrices([]byte(`{"data":[]}`))
	require.Error(t, err)
}
