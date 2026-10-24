package controller

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
)

const openLuxOrigin = "https://www.openlux.ai"

// Credentials never come from the browser, travel to another origin, or appear
// in upstream error bodies returned to the administrator.
var openLuxClient = &http.Client{
	Timeout: 15 * time.Second,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return common.NewMessage("OpenLux redirects are not allowed")
	},
}

type openLuxStep struct {
	Size               int64    `json:"step_size"`
	CompletionSize     *int64   `json:"completion_step_size"`
	Prompt             *float64 `json:"prompt_step_ratio"`
	Completion         *float64 `json:"completion_step_ratio"`
	Cache              *float64 `json:"cache_step_ratio"`
	PromptThinking     *float64 `json:"prompt_thinking_step_ratio"`
	CompletionThinking *float64 `json:"completion_thinking_step_ratio"`
}

type openLuxModel struct {
	Name                  string                       `json:"model_name"`
	Description           string                       `json:"description"`
	Icon                  string                       `json:"icon"`
	Tags                  string                       `json:"tags"`
	VendorID              int                          `json:"vendor_id"`
	QuotaType             *int                         `json:"quota_type"`
	Price                 *float64                     `json:"model_price"`
	VideoResolutionRatios any                          `json:"video_resolution_ratios"`
	PixverseRefAudio      any                          `json:"pixverse_v6_ref_audio"`
	PixverseRefSilent     any                          `json:"pixverse_v6_ref_silent"`
	Ratio                 *float64                     `json:"model_ratio"`
	Completion            *float64                     `json:"completion_ratio"`
	Cache                 *float64                     `json:"cache_ratio"`
	CacheCreation         *float64                     `json:"cache_creation_ratio"`
	Cache5m               *float64                     `json:"cache_creation_5m_ratio"`
	Cache1h               *float64                     `json:"cache_creation_1h_ratio"`
	Image                 *float64                     `json:"image_ratio"`
	ImageCache            *float64                     `json:"image_cache_ratio"`
	Audio                 *float64                     `json:"audio_ratio"`
	AudioCompletion       *float64                     `json:"audio_completion_ratio"`
	Groups                []string                     `json:"enable_groups"`
	Endpoints             []string                     `json:"supported_endpoint_types"`
	Steps                 []openLuxStep                `json:"step_ratios"`
	Translations          map[string]map[string]string `json:"translations"`
}

type openLuxVendor struct {
	ID           int                          `json:"id"`
	Name         string                       `json:"name"`
	Description  string                       `json:"description"`
	Icon         string                       `json:"icon"`
	Translations map[string]map[string]string `json:"translations"`
}

type openLuxCatalog struct {
	Success     bool                          `json:"success"`
	Models      []openLuxModel                `json:"data"`
	Vendors     []openLuxVendor               `json:"vendors"`
	Groups      map[string]string             `json:"usable_group"`
	Ratios      map[string]float64            `json:"group_ratio"`
	ModelRatios map[string]map[string]float64 `json:"group_model_ratio"`
}

type openLuxAccount struct {
	Success bool `json:"success"`
	Data    struct {
		Groups map[string]string  `json:"data"`
		Ratios map[string]float64 `json:"ratios"`
		IDs    map[string]int     `json:"group_ids"`
		Uptime map[string]any     `json:"uptime"`
	} `json:"data"`
}

type openLuxSource struct {
	Group string `json:"group"`
	// Explicitly confirmed USD / 1M input tokens for a model_ratio of 1.
	RatioUnit         float64 `json:"ratio_unit"`
	Multiplier        float64 `json:"multiplier"`
	Version           string  `json:"version"`
	KeyGroupConfirmed bool    `json:"key_group_confirmed"`
}

type openLuxQuote struct {
	Version      string            `json:"version"`
	FetchedAt    int64             `json:"fetched_at"`
	Group        string            `json:"group"`
	ChannelID    int               `json:"channel_id"`
	AccountRates bool              `json:"account_rates"`
	RatioUnit    float64           `json:"ratio_unit"`
	Multiplier   float64           `json:"multiplier"`
	Costs        map[string]string `json:"costs"`
	Excluded     map[string]string `json:"excluded"`
}

func fetchOpenLuxJSON(ctx context.Context, path, token string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openLuxOrigin+path, nil)
	if err != nil {
		return common.NewMessage("OpenLux request could not be prepared")
	}
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		if id := os.Getenv("OPENLUX_ACCOUNT_USER_ID"); id != "" {
			req.Header.Set("New-Api-User", id)
		}
	}
	resp, err := openLuxClient.Do(req)
	if err != nil {
		return common.NewMessage("OpenLux request failed; check connectivity and server credentials")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return common.NewMessage("OpenLux returned HTTP {{status}}", map[string]any{"status": resp.StatusCode})
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRatioConfigBytes+1))
	if err != nil {
		return common.NewMessage("OpenLux response could not be read")
	}
	if len(body) > maxRatioConfigBytes {
		return common.NewMessage("OpenLux response exceeds size limit")
	}
	if err := common.Unmarshal(body, out); err != nil {
		return common.NewMessage("OpenLux response is invalid JSON")
	}
	return nil
}

func fetchOpenLuxCatalog(ctx context.Context) (*openLuxCatalog, *openLuxAccount, string, error) {
	var catalog openLuxCatalog
	if err := fetchOpenLuxJSON(ctx, "/api/pricing_new", "", &catalog); err != nil {
		return nil, nil, "", err
	}
	if !catalog.Success || len(catalog.Models) == 0 || len(catalog.Ratios) == 0 {
		return nil, nil, "", common.NewMessage("OpenLux returned an empty or unsuccessful catalog")
	}
	seen := make(map[string]bool, len(catalog.Models))
	for _, item := range catalog.Models {
		if item.Name == "" || seen[item.Name] {
			return nil, nil, "", common.NewMessage("OpenLux returned duplicate model names")
		}
		seen[item.Name] = true
	}
	var account *openLuxAccount
	if token := strings.TrimSpace(os.Getenv("OPENLUX_ACCOUNT_TOKEN")); token != "" {
		account = &openLuxAccount{}
		if err := fetchOpenLuxJSON(ctx, "/api/user/self/groups", token, account); err != nil {
			return nil, nil, "", err
		}
		if !account.Success || len(account.Data.Groups) == 0 || len(account.Data.Ratios) == 0 {
			return nil, nil, "", common.NewMessage("OpenLux account groups are unavailable")
		}
		// Account-specific rates replace public rates; absence is not permission
		// to fall back to another account's price or group access.
		catalog.Groups, catalog.Ratios = account.Data.Groups, account.Data.Ratios
	}
	encoded, err := common.Marshal(catalog)
	if err != nil {
		return nil, nil, "", err
	}
	return &catalog, account, fmt.Sprintf("%x", sha256.Sum256(encoded)), nil
}

func GetOpenLuxCatalog(c *gin.Context) {
	catalog, account, version, err := fetchOpenLuxCatalog(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	data := gin.H{"version": version, "fetched_at": time.Now().Unix(), "groups": catalog.Groups, "ratios": catalog.Ratios, "model_count": len(catalog.Models), "account_rates": account != nil}
	if account != nil {
		data["group_ids"], data["uptime"] = account.Data.IDs, account.Data.Uptime
	}
	common.ApiSuccess(c, data)
}

// openLuxTokenExpression converts only contracts whose full price dimensions
// this integration understands. Unsupported facts must never silently become a
// cheaper ordinary token price. The last tier is the fallback, not a context cap.
func openLuxTokenExpression(item openLuxModel, unit, groupRatio, markup float64) (string, error) {
	if item.QuotaType == nil || *item.QuotaType != 0 || item.Ratio == nil || item.Completion == nil {
		return "", common.NewMessage("Only explicit text token pricing is supported")
	}
	if item.Audio != nil || item.AudioCompletion != nil || item.Image != nil || item.ImageCache != nil || item.VideoResolutionRatios != nil || item.PixverseRefAudio != nil || item.PixverseRefSilent != nil {
		return "", common.NewMessage("Multimodal pricing needs a separate verified adapter")
	}
	for _, endpoint := range item.Endpoints {
		if !slices.Contains([]string{"openai", "openai-response", "anthropic", "gemini"}, endpoint) {
			return "", common.NewMessage("The model exposes an unsupported billing protocol")
		}
	}
	if len(item.Endpoints) == 0 {
		return "", common.NewMessage("No supported text endpoint is available")
	}
	for _, value := range []float64{unit, markup} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
			return "", common.NewMessage("Price unit and markup must be finite positive numbers")
		}
	}
	if math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) || groupRatio < 0 {
		return "", common.NewMessage("The upstream group rate is invalid")
	}
	if *item.Ratio < 0 || math.IsNaN(*item.Ratio) || math.IsInf(*item.Ratio, 0) {
		return "", common.NewMessage("The upstream base rate is invalid")
	}
	base := *item.Ratio * unit * groupRatio * markup
	if math.IsNaN(base) || math.IsInf(base, 0) || base < 0 || (*item.Ratio > 0 && groupRatio > 0 && base == 0) {
		return "", common.NewMessage("The upstream price is outside the supported range")
	}
	cache := 1.0
	if item.Cache != nil {
		cache = *item.Cache
	}
	write := item.CacheCreation
	if item.Cache5m != nil {
		write = item.Cache5m
	}
	if item.Cache1h != nil && write == nil {
		return "", common.NewMessage("A cache write base rate is required")
	}
	steps := item.Steps
	if len(steps) == 0 {
		one := 1.0
		steps = []openLuxStep{{Prompt: &one, Completion: &one, Cache: &one}}
	}
	if len(steps) > 16 {
		return "", common.NewMessage("Too many upstream pricing tiers")
	}
	leaves := make([]string, len(steps))
	for i, step := range steps {
		if step.Prompt == nil || step.Completion == nil || step.Cache == nil {
			return "", common.NewMessage("The upstream pricing tier is incomplete")
		}
		if len(item.Steps) > 0 && (step.Size <= 0 || (i > 0 && step.Size <= steps[i-1].Size)) {
			return "", common.NewMessage("Upstream context thresholds must be positive and increasing")
		}
		if (step.CompletionSize != nil && *step.CompletionSize != -1) || (step.PromptThinking != nil && *step.PromptThinking != 0) || (step.CompletionThinking != nil && *step.CompletionThinking != 0) {
			return "", common.NewMessage("Output or thinking tiers require a separate verified adapter")
		}
		factors := []struct {
			name   string
			values []float64
		}{
			{"p", []float64{*step.Prompt}},
			{"c", []float64{*item.Completion, *step.Completion}},
			{"cr", []float64{cache, *step.Cache}},
		}
		if write != nil {
			factors = append(factors, struct {
				name   string
				values []float64
			}{"cc", []float64{*write, *step.Prompt}})
		}
		if item.Cache1h != nil {
			factors = append(factors, struct {
				name   string
				values []float64
			}{"cc1h", []float64{*item.Cache1h, *step.Prompt}})
		}
		terms := make([]string, 0, len(factors))
		for _, term := range factors {
			price := base
			for _, value := range term.values {
				if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
					return "", common.NewMessage("The upstream price contains an invalid multiplier")
				}
				next := price * value
				if math.IsNaN(next) || math.IsInf(next, 0) || (price > 0 && value > 0 && next == 0) {
					return "", common.NewMessage("The upstream price is outside the supported range")
				}
				price = next
			}
			terms = append(terms, term.name+" * "+strconv.FormatFloat(price, 'g', -1, 64))
		}
		leaves[i] = fmt.Sprintf("tier(\"openlux_%d\", %s)", i+1, strings.Join(terms, " + "))
	}
	expression := leaves[len(leaves)-1]
	for i := len(leaves) - 2; i >= 0; i-- {
		expression = fmt.Sprintf("len <= %d ? %s : %s", steps[i].Size, leaves[i], expression)
	}
	if err := billing_setting.SmokeTestExpr(expression); err != nil {
		return "", common.NewMessage("The generated OpenLux price is invalid")
	}
	return expression, nil
}

func openLuxPricing(ctx context.Context, channelID int, source openLuxSource) (map[string]any, *openLuxQuote, error) {
	if source.RatioUnit <= 0 || source.Multiplier < 1 || source.Multiplier > 1000 || math.IsNaN(source.RatioUnit) || math.IsInf(source.RatioUnit, 0) || math.IsNaN(source.Multiplier) || math.IsInf(source.Multiplier, 0) {
		return nil, nil, common.NewMessage("Confirm a positive USD price unit and a markup between 1 and 1000")
	}
	if !source.KeyGroupConfirmed {
		return nil, nil, common.NewMessage("Confirm that the channel API key is fixed to the selected OpenLux group")
	}
	channel, err := model.GetChannelById(channelID, false)
	if err != nil {
		return nil, nil, common.NewMessage("Select a saved OpenLux channel")
	}
	if strings.TrimRight(channel.GetBaseURL(), "/") != openLuxOrigin {
		return nil, nil, common.NewMessage("The channel base URL must be https://www.openlux.ai")
	}
	if channel.Type != constant.ChannelTypeOpenAI && channel.Type != constant.ChannelTypeNewAPI {
		return nil, nil, common.NewMessage("The model exposes an unsupported billing protocol")
	}
	if channel.Status != common.ChannelStatusEnabled {
		return nil, nil, common.NewMessage("Select an enabled OpenLux channel")
	}
	if raw := strings.TrimSpace(channel.GetModelMapping()); raw != "" {
		var mapping map[string]string
		if err := common.UnmarshalJsonStr(raw, &mapping); err != nil || len(mapping) > 0 {
			return nil, nil, common.NewMessage("OpenLux price sync currently requires a channel without model mappings")
		}
	}
	catalog, account, version, err := fetchOpenLuxCatalog(ctx)
	if err != nil {
		return nil, nil, err
	}
	if source.Version == "" || source.Version != version {
		return nil, nil, common.NewMessage("OpenLux prices changed; reload the source before previewing")
	}
	if _, ok := catalog.Groups[source.Group]; !ok {
		return nil, nil, common.NewMessage("The selected OpenLux group is unavailable")
	}
	ratio, ok := catalog.Ratios[source.Group]
	if !ok {
		return nil, nil, common.NewMessage("The selected OpenLux group has no price")
	}
	if len(catalog.ModelRatios) > 0 {
		return nil, nil, common.NewMessage("Model-specific upstream group rates require verification before import")
	}
	var channels []model.Channel
	if err := model.DB.Where("status = ?", common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return nil, nil, err
	}
	quote := &openLuxQuote{Version: version, FetchedAt: time.Now().Unix(), Group: source.Group, ChannelID: channelID, AccountRates: account != nil, RatioUnit: source.RatioUnit, Multiplier: source.Multiplier, Costs: map[string]string{}, Excluded: map[string]string{}}
	data := map[string]any{"billing_mode": map[string]string{}, "billing_expr": map[string]string{}}
	allowed := strings.Split(channel.Models, ",")
	for _, item := range catalog.Models {
		if !slices.Contains(allowed, item.Name) {
			continue
		}
		if !slices.Contains(item.Groups, source.Group) {
			quote.Excluded[item.Name] = "The model is unavailable in the selected upstream group"
			continue
		}
		conflict := false
		for _, candidate := range channels {
			if candidate.Id != channelID && slices.Contains(strings.Split(candidate.Models, ","), item.Name) {
				conflict = true
				break
			}
		}
		if conflict {
			quote.Excluded[item.Name] = "Disable competing channels before importing this model"
			continue
		}
		modelRatio := ratio
		cost, err := openLuxTokenExpression(item, source.RatioUnit, modelRatio, 1)
		if err != nil {
			quote.Excluded[item.Name] = err.Error()
			continue
		}
		sale, err := openLuxTokenExpression(item, source.RatioUnit, modelRatio, source.Multiplier)
		if err != nil {
			return nil, nil, err
		}
		quote.Costs[item.Name] = cost
		data["billing_mode"].(map[string]string)[item.Name] = billing_setting.BillingModeTieredExpr
		data["billing_expr"].(map[string]string)[item.Name] = sale
	}
	if len(quote.Costs) == 0 {
		return nil, quote, common.NewMessage("No configured channel models have supported OpenLux prices")
	}
	return data, quote, nil
}

func PublishOpenLuxPricing(c *gin.Context) {
	var request struct {
		ChannelID int                        `json:"channel_id"`
		Source    openLuxSource              `json:"source"`
		Changes   []model.ModelPricingChange `json:"changes"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || len(request.Changes) == 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Preview and select OpenLux prices before publishing"))
		return
	}
	data, quote, err := openLuxPricing(c.Request.Context(), request.ChannelID, request.Source)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusConflict, err)
		return
	}
	expressions := data["billing_expr"].(map[string]string)
	for _, change := range request.Changes {
		if change.Reset || expressions[change.ModelName] == "" || change.Pricing["billing_setting.billing_mode"] != billing_setting.BillingModeTieredExpr || change.Pricing["billing_setting.billing_expr"] != expressions[change.ModelName] {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("The selected price differs from the OpenLux preview"))
			return
		}
	}
	if err := model.UpdateModelPricing(request.Changes); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrModelPricingConflict) {
			status = http.StatusConflict
		}
		common.ApiErrorStatus(c, status, err)
		return
	}
	// The audit record is the durable source snapshot: group, channel, unit,
	// markup, source version, cost and published selling expression.
	names := make([]string, 0, len(request.Changes))
	for _, change := range request.Changes {
		names = append(names, change.ModelName)
	}
	recordManageAudit(c, "model.pricing.update", map[string]any{"models": names, "source": quote, "changes": request.Changes})
	common.ApiSuccess(c, gin.H{"published": len(request.Changes)})
}

// Metadata uses the existing versioned preview/apply workflow. Upstream vendor
// IDs remain external identifiers; the metadata importer resolves local IDs.
func openLuxMetadata(ctx context.Context, locale string) (metadataSyncSource, map[string]model.MetadataValues, map[string]model.Vendor, error) {
	catalog, _, _, err := fetchOpenLuxCatalog(ctx)
	source := metadataSyncSource{Locale: locale, ModelsURL: openLuxOrigin + "/api/pricing_new", VendorsURL: openLuxOrigin + "/api/pricing_new"}
	if err != nil {
		return source, nil, nil, err
	}
	models, vendors := map[string]model.MetadataValues{}, map[string]model.Vendor{}
	byID := map[int]openLuxVendor{}
	for _, vendor := range catalog.Vendors {
		byID[vendor.ID] = vendor
		description := vendor.Description
		if value := vendor.Translations[locale]["description"]; value != "" {
			description = value
		}
		vendors[vendor.Name] = model.Vendor{Name: vendor.Name, Description: description, Icon: vendor.Icon, Status: 1}
	}
	for _, item := range catalog.Models {
		if item.Name == "" {
			continue
		}
		if _, duplicate := models[item.Name]; duplicate {
			return source, nil, nil, common.NewMessage("OpenLux returned duplicate model names")
		}
		description := item.Description
		if value := item.Translations[locale]["description"]; value != "" {
			description = value
		}
		tags := strings.Split(item.Tags, ",")
		for i, tag := range tags {
			if value := item.Translations[locale][tag]; value != "" {
				tags[i] = value
			}
		}
		// Upstream endpoint labels describe supported protocols, not local custom
		// routing configuration. Do not copy unverified paths into model endpoints.
		values := model.MetadataValues{Description: description, Icon: item.Icon, Tags: strings.Join(tags, ","), Vendor: byID[item.VendorID].Name, Status: 1}
		if err := model.ValidateMetadataValues(values); err != nil {
			return source, nil, nil, common.NewMessage("OpenLux model {{model}}: invalid metadata", map[string]any{"model": item.Name})
		}
		models[item.Name] = values
	}
	encoded, err := common.Marshal([]any{locale, models, vendors})
	if err != nil {
		return source, nil, nil, err
	}
	source.Version = fmt.Sprintf("%x", sha256.Sum256(encoded))
	return source, models, vendors, nil
}

// Keep host-specific synchronization configuration out of protocol DTOs.
type openLuxUpstreamRequest struct {
	dto.UpstreamRequest
	OpenLux map[int]openLuxSource `json:"openlux"`
}
