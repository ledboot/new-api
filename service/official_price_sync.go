package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
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
// Every provider has a distinct rank: equal ranks would let map iteration order
// decide the winner, so the imported price could change between runs.
var officialPriceProviderRank = map[string]int{
	// First-party vendor entries are the true list price.
	"openai":           1,
	"anthropic":        2,
	"gemini":           3,
	"deepseek":         4,
	"xai":              5,
	"zai":              6,
	"bigmodel":         7,
	"dashscope":        8,
	"qwencloud":        9,
	"qwen_ai_platform": 10,
	"moonshot":         11,
	"minimax":          12,
	"vertex_ai":        20,
	"mistral":          30,
	"cohere":           31,
}

// officialPriceFamilyOwner maps a model family to the vendor that publishes its
// list price. The same model is often resold by other platforms (Alibaba hosts
// DeepSeek, Z.ai mirrors GLM); those rows must not override the original price.
var officialPriceFamilyOwner = []struct {
	prefix   string
	provider string
}{
	{"deepseek", "deepseek"},
	{"glm", "zai"},
	{"chatglm", "zai"},
	{"qwen", "dashscope"},
	{"qwq", "dashscope"},
	{"kimi", "moonshot"},
	{"minimax", "minimax"},
	{"claude", "anthropic"},
	{"gpt", "openai"},
	{"grok", "xai"},
	{"gemini", "gemini"},
}

// officialPriceScore ranks an entry for one model key. A family owner always
// beats a reseller of the same model, then the provider rank breaks the tie.
func officialPriceScore(provider, key string) int {
	score := officialPriceProviderRank[provider]
	for _, family := range officialPriceFamilyOwner {
		if !strings.HasPrefix(key, family.prefix) {
			continue
		}
		if provider == family.provider {
			return score - 100
		}
		break
	}
	return score
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
	// Vendor snapshots appear as -2024-08-06, -20241022 / -0902 or -1017.
	for _, length := range []int{8, 6, 4} {
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
		if _, ok := officialPriceProviderRank[entry.LiteLLMProvider]; !ok {
			continue
		}
		key := normalizeModelKey(rawName)
		if key == "" {
			continue
		}
		score := officialPriceScore(entry.LiteLLMProvider, key)
		if current, exists := index.rank[key]; exists && current <= score {
			continue
		}
		index.prices[key] = entry
		index.rank[key] = score
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

// officialPriceRow converts a price-table entry into a stored row. An entry
// with no usable per-token price yields false so the caller can skip it.
func officialPriceRow(modelName string, entry liteLLMPrice) (model.OfficialPrice, bool) {
	row := model.OfficialPrice{
		ModelName:         modelName,
		InputPrice:        roundPrice(entry.InputCostPerToken * 1_000_000),
		OutputPrice:       roundPrice(entry.OutputCostPerToken * 1_000_000),
		CacheReadPrice:    roundPrice(entry.CacheReadInputTokenCost * 1_000_000),
		CacheWritePrice:   roundPrice(entry.CacheCreationInputTokenCost * 1_000_000),
		CacheWrite1hPrice: roundPrice(entry.CacheCreationInputTokenCost1h * 1_000_000),
	}
	if row.InputPrice == 0 && row.OutputPrice == 0 && row.CacheReadPrice == 0 && row.CacheWritePrice == 0 && row.CacheWrite1hPrice == 0 {
		return model.OfficialPrice{}, false
	}
	return row, true
}

// Hosts that resell a model list it at the vendor's price, so their median is a
// usable reference when no first-party row exists. A published price far below
// every host is a promotional or off-peak number rather than a list price.
const (
	officialPriceConsensusSamples = 3
	officialPriceOutlierRatio     = 0.5
)

// buildOfficialPriceConsensus returns the median per-token price of every host
// listing a model, whatever its provider.
func buildOfficialPriceConsensus(entries map[string]liteLLMPrice) map[string]liteLLMPrice {
	grouped := map[string][]liteLLMPrice{}
	for rawName, entry := range entries {
		key := normalizeModelKey(rawName)
		if key == "" || entry.InputCostPerToken <= 0 {
			continue
		}
		grouped[key] = append(grouped[key], entry)
	}
	consensus := make(map[string]liteLLMPrice, len(grouped))
	for key, list := range grouped {
		if len(list) < officialPriceConsensusSamples {
			continue
		}
		consensus[key] = liteLLMPrice{
			InputCostPerToken:             medianCost(list, func(entry liteLLMPrice) float64 { return entry.InputCostPerToken }),
			OutputCostPerToken:            medianCost(list, func(entry liteLLMPrice) float64 { return entry.OutputCostPerToken }),
			CacheReadInputTokenCost:       medianCost(list, func(entry liteLLMPrice) float64 { return entry.CacheReadInputTokenCost }),
			CacheCreationInputTokenCost:   medianCost(list, func(entry liteLLMPrice) float64 { return entry.CacheCreationInputTokenCost }),
			CacheCreationInputTokenCost1h: medianCost(list, func(entry liteLLMPrice) float64 { return entry.CacheCreationInputTokenCost1h }),
		}
	}
	return consensus
}

// medianCost ignores missing (zero) prices so one silent host does not drag the
// reference price down.
func medianCost(list []liteLLMPrice, pick func(liteLLMPrice) float64) float64 {
	values := make([]float64, 0, len(list))
	for _, entry := range list {
		if value := pick(entry); value > 0 {
			values = append(values, value)
		}
	}
	if len(values) == 0 {
		return 0
	}
	sort.Float64s(values)
	middle := len(values) / 2
	if len(values)%2 == 0 {
		return (values[middle-1] + values[middle]) / 2
	}
	return values[middle]
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

// OpenRouter publishes per-token prices as decimal strings, e.g.
// {"prompt":"0.000000045","completion":"0.0000005"}.
type openRouterModel struct {
	ID      string `json:"id"`
	Pricing struct {
		Prompt          string `json:"prompt"`
		Completion      string `json:"completion"`
		InputCacheRead  string `json:"input_cache_read"`
		InputCacheWrite string `json:"input_cache_write"`
	} `json:"pricing"`
}

type openRouterCatalog struct {
	Data []openRouterModel `json:"data"`
}

func parseOpenRouterPrices(body []byte) (map[string]openRouterModel, error) {
	var catalog openRouterCatalog
	if err := json.Unmarshal(body, &catalog); err != nil {
		return nil, fmt.Errorf("parse OpenRouter price table: %w", err)
	}
	if len(catalog.Data) == 0 {
		return nil, errors.New("OpenRouter price table is empty")
	}
	index := make(map[string]openRouterModel, len(catalog.Data))
	for _, item := range catalog.Data {
		key := normalizeOpenRouterKey(item.ID)
		if key == "" {
			continue
		}
		// Plain ids win over variants ("~vendor/model", ":free", ":batch").
		if existing, ok := index[key]; ok && openRouterVariantRank(item.ID) >= openRouterVariantRank(existing.ID) {
			continue
		}
		index[key] = item
	}
	return index, nil
}

func normalizeOpenRouterKey(id string) string {
	key := strings.ToLower(strings.TrimSpace(id))
	key = strings.TrimPrefix(key, "~")
	for _, suffix := range []string{":free", ":batch", ":extended", ":thinking", ":online", ":nitro"} {
		key = strings.TrimSuffix(key, suffix)
	}
	if slash := strings.LastIndex(key, "/"); slash >= 0 {
		key = key[slash+1:]
	}
	return key
}

func openRouterVariantRank(id string) int {
	rank := 0
	if strings.HasPrefix(id, "~") {
		rank += 2
	}
	lower := strings.ToLower(id)
	for _, suffix := range []string{":free", ":batch", ":extended", ":thinking", ":online", ":nitro"} {
		if strings.HasSuffix(lower, suffix) {
			rank++
		}
	}
	return rank
}

func parseOpenRouterPrice(value string) float64 {
	price, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil || math.IsNaN(price) || math.IsInf(price, 0) || price < 0 {
		return 0
	}
	return roundPrice(price * 1_000_000)
}

func lookupOpenRouter(index map[string]openRouterModel, modelName string) (model.OfficialPrice, bool) {
	key := normalizeModelKey(modelName)
	item, ok := index[key]
	if !ok {
		if stripped := stripSnapshotDate(key); stripped != key {
			item, ok = index[stripped]
		}
	}
	if !ok {
		return model.OfficialPrice{}, false
	}
	input := parseOpenRouterPrice(item.Pricing.Prompt)
	output := parseOpenRouterPrice(item.Pricing.Completion)
	cacheRead := parseOpenRouterPrice(item.Pricing.InputCacheRead)
	cacheWrite := parseOpenRouterPrice(item.Pricing.InputCacheWrite)
	if input == 0 && output == 0 && cacheRead == 0 && cacheWrite == 0 {
		return model.OfficialPrice{}, false
	}
	return model.OfficialPrice{
		ModelName:       modelName,
		InputPrice:      input,
		OutputPrice:     output,
		CacheReadPrice:  cacheRead,
		CacheWritePrice: cacheWrite,
	}, true
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
	consensus := officialPriceIndex{prices: buildOfficialPriceConsensus(entries)}

	setting := official_price_setting.GetSetting()
	rows := make([]model.OfficialPrice, 0, len(entries))
	matchedModels := map[string]bool{}
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
		row, ok := officialPriceRow(pricing.ModelName, entry)
		if !ok {
			state.Skipped++
			continue
		}
		matchedModels[pricing.ModelName] = true
		rows = append(rows, row)
	}

	// Fallback: OpenRouter carries GLM/Qwen/DeepSeek families under first-party
	// ids that the primary table only lists through third-party hosts.
	if setting.OpenRouterEnabled {
		var unmatched []string
		for _, pricing := range model.GetPricing() {
			if pricing.BillingUsageSchema != nil || matchedModels[pricing.ModelName] {
				continue
			}
			unmatched = append(unmatched, pricing.ModelName)
		}
		if len(unmatched) > 0 {
			openRouterURL := setting.OpenRouterURL
			if openRouterURL == "" {
				openRouterURL = official_price_setting.DefaultOpenRouterURL
			}
			if body, fetchErr := fetchOfficialPriceTable(ctx, openRouterURL); fetchErr == nil {
				if catalog, parseErr := parseOpenRouterPrices(body); parseErr == nil {
					for _, name := range unmatched {
						row, ok := lookupOpenRouter(catalog, name)
						if !ok {
							continue
						}
						if agreed, found := consensus.lookup(name); found {
							if agreedRow, valid := officialPriceRow(name, agreed); valid && row.InputPrice < agreedRow.InputPrice*officialPriceOutlierRatio {
								row = agreedRow
							}
						}
						state.MatchedOpenRouter++
						rows = append(rows, row)
					}
				}
			}
		}
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
