package controller

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"mime"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

type openLuxSaleSelection struct {
	Group      string   `json:"group"`
	Multiplier float64  `json:"multiplier"`
	GroupRatio *float64 `json:"group_ratio,omitempty"`
	TopupRatio *float64 `json:"topup_ratio,omitempty"`
	APIKey     string   `json:"api_key,omitempty"`
}

type openLuxSalesRequest struct {
	Version           string                 `json:"version"`
	RatioUnit         float64                `json:"ratio_unit"`
	Groups            []openLuxSaleSelection `json:"groups"`
	KeyGroupConfirmed bool                   `json:"key_group_confirmed"`
	PreviewVersion    string                 `json:"preview_version,omitempty"`
}

var openLuxSaleGroupName = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

func buildOpenLuxSalesPlan(ctx context.Context, request openLuxSalesRequest) (model.OpenLuxSalesPlan, map[string]model.MetadataValues, map[string]model.Vendor, error) {
	plan := model.OpenLuxSalesPlan{Groups: []model.OpenLuxSalePlanGroup{}}
	if !request.KeyGroupConfirmed || request.RatioUnit <= 0 || math.IsNaN(request.RatioUnit) || math.IsInf(request.RatioUnit, 0) || len(request.Groups) == 0 || len(request.Groups) > 100 {
		return plan, nil, nil, common.NewMessage("Confirm the price unit, selected groups, and fixed-group API keys")
	}
	catalog, _, version, err := fetchOpenLuxCatalog(ctx)
	if err != nil {
		return plan, nil, nil, err
	}
	if request.Version != version {
		return plan, nil, nil, common.NewMessage("OpenLux prices changed; reload the source before previewing")
	}
	if len(catalog.ModelRatios) > 0 {
		return plan, nil, nil, common.NewMessage("Model-specific upstream group rates require verification before import")
	}
	topups := map[string]float64{}
	if err := common.UnmarshalJsonStr(common.TopupGroupRatio2JSONString(), &topups); err != nil {
		return plan, nil, nil, err
	}
	seen := map[string]bool{}
	owned := billing_setting.GetOpenLuxSales()
	for _, selection := range request.Groups {
		group := selection.Group
		ratio, exists := catalog.Ratios[group]
		if !openLuxSaleGroupName.MatchString(group) || group == "auto" || group == "all" || seen[group] || !exists {
			return plan, nil, nil, common.NewMessage("Select available, distinct OpenLux groups")
		}
		if _, exists := catalog.Groups[group]; !exists {
			return plan, nil, nil, common.NewMessage("The selected OpenLux group is unavailable")
		}
		seen[group] = true
		if selection.Multiplier < 1 || selection.Multiplier > 1000 || math.IsNaN(selection.Multiplier) || math.IsInf(selection.Multiplier, 0) {
			return plan, nil, nil, common.NewMessage("Confirm a positive USD price unit and a markup between 1 and 1000")
		}
		key := strings.TrimSpace(selection.APIKey)
		if (key == "" && owned[group].ChannelID == 0) || len(key) > 8192 || strings.ContainsAny(key, "\r\n\x00") {
			return plan, nil, nil, common.NewMessage("Provide one fixed-group API key for each new group")
		}
		groupRatio := ratio
		if owned[group].NormalizedPrices && ratio_setting.ContainsGroupRatio(group) {
			groupRatio = ratio_setting.GetGroupRatio(group)
		}
		if selection.GroupRatio != nil {
			groupRatio = *selection.GroupRatio
		}
		topupRatio := 1.0
		if saved, exists := topups[group]; exists {
			topupRatio = saved
		}
		if selection.TopupRatio != nil {
			topupRatio = *selection.TopupRatio
		}
		for _, value := range []float64{ratio, groupRatio, topupRatio} {
			if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
				return plan, nil, nil, common.NewMessage("Group and top-up multipliers must be finite and non-negative")
			}
		}
		groupRatio, err = billing_setting.RoundOpenLuxGroupRatio(groupRatio)
		if err != nil {
			return plan, nil, nil, err
		}
		item := model.OpenLuxSalePlanGroup{Group: group, Multiplier: selection.Multiplier, SourceGroupRatio: ratio, GroupRatio: groupRatio, TopupRatio: topupRatio, SourceVersion: version, Models: map[string]billing_setting.OpenLuxSalePrice{}, SellingPrices: map[string]string{}, Excluded: map[string]string{}}
		for _, candidate := range catalog.Models {
			if !slices.Contains(candidate.Groups, group) {
				continue
			}
			if len(candidate.Name) > 128 || strings.ContainsAny(candidate.Name, ",\r\n") {
				return plan, nil, nil, common.NewMessage("OpenLux model metadata is invalid")
			}
			cost, err := openLuxPriceExpression(candidate, request.RatioUnit, ratio, 1)
			if err != nil {
				item.Excluded[candidate.Name] = err.Error()
				continue
			}
			expression, err := openLuxPriceExpression(candidate, request.RatioUnit, 1, selection.Multiplier)
			if err != nil {
				return plan, nil, nil, err
			}
			rounded, err := billing_setting.OpenLuxPriceExpressions(expression, groupRatio)
			if err != nil {
				return plan, nil, nil, err
			}
			var inputLimit int64
			if len(candidate.Steps) > 0 {
				inputLimit = candidate.Steps[len(candidate.Steps)-1].Size
			}
			if inputLimit > 1<<53-1 {
				item.Excluded[candidate.Name] = "The upstream pricing tier is incomplete"
				continue
			}
			item.SellingPrices[candidate.Name] = rounded.SellingExpression
			item.Models[candidate.Name] = billing_setting.OpenLuxSalePrice{Cost: cost, Expression: expression, InputTokenLimit: inputLimit}
		}
		if len(item.Models) == 0 {
			return plan, nil, nil, common.NewMessage("No supported text or image models are available in a selected group")
		}
		plan.Groups = append(plan.Groups, item)
	}
	slices.SortFunc(plan.Groups, func(a, b model.OpenLuxSalePlanGroup) int { return strings.Compare(a.Group, b.Group) })
	plan.LocalVersion, err = model.PreviewOpenLuxSalesGroups(plan.Groups)
	if errors.Is(err, model.ErrOpenLuxSalesGroupConflict) {
		return plan, nil, nil, common.NewMessage("A local group or channel already uses a selected OpenLux group name")
	}
	if err != nil {
		return plan, nil, nil, err
	}
	_, metadata, vendors, err := openLuxMetadataFromCatalog(catalog, "zh")
	return plan, metadata, vendors, err
}

func openLuxSalesPreviewVersion(plan model.OpenLuxSalesPlan) string {
	encoded, _ := common.Marshal(plan)
	return fmt.Sprintf("%x", sha256.Sum256(encoded))
}

// JSON-only + browser-origin checks supplement the session-only root route.
// Never echo request objects: they contain upstream API keys.
func decodeOpenLuxSalesRequest(c *gin.Context) (openLuxSalesRequest, bool) {
	var request openLuxSalesRequest
	contentType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || contentType != "application/json" || c.GetHeader("Sec-Fetch-Site") == "cross-site" {
		common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("OpenLux sales requests require same-site JSON"))
		return request, false
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid OpenLux sales request"))
		return request, false
	}
	return request, true
}

// GetPublishedOpenLuxSales reads the locally published contract, without
// contacting OpenLux or returning channel credentials.
func GetPublishedOpenLuxSales(c *gin.Context) {
	billing_setting.OpenLuxSalesConfigMu.RLock()
	defer billing_setting.OpenLuxSalesConfigMu.RUnlock()
	sales := billing_setting.GetOpenLuxSales()
	ratios := make(map[string]float64, len(sales))
	effective := make(map[string]map[string]string, len(sales))
	configuredRatios := ratio_setting.GetGroupRatioCopy()
	for group, sale := range sales {
		for name := range sale.Models {
			_, channelID, managed := billing_setting.GetOpenLuxSalePrice(group, name)
			if !managed || channelID != sale.ChannelID {
				common.ApiError(c, common.NewMessage("Published OpenLux prices are unavailable"))
				return
			}
			break
		}
		ratios[group] = 1
		if ratio, exists := configuredRatios[group]; exists {
			ratios[group] = ratio
		}
		effective[group] = make(map[string]string, len(sale.Models))
		for name, price := range sale.Models {
			rounded, err := billing_setting.OpenLuxPriceExpressions(price.Expression, ratios[group])
			if err != nil {
				common.ApiError(c, common.NewMessage("Published OpenLux prices are unavailable"))
				return
			}
			ratios[group] = rounded.GroupRatio
			effective[group][name] = rounded.SellingExpression
		}
	}
	c.Header("Cache-Control", "no-store")
	common.ApiSuccess(c, gin.H{"sales": sales, "group_ratios": ratios, "effective_prices": effective})
}

func PreviewOpenLuxSales(c *gin.Context) {
	request, ok := decodeOpenLuxSalesRequest(c)
	if !ok {
		return
	}
	plan, _, _, err := buildOpenLuxSalesPlan(c.Request.Context(), request)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"plan": plan, "preview_version": openLuxSalesPreviewVersion(plan)})
}

func PublishOpenLuxSales(c *gin.Context) {
	request, ok := decodeOpenLuxSalesRequest(c)
	if !ok {
		return
	}
	plan, metadata, vendors, err := buildOpenLuxSalesPlan(c.Request.Context(), request)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if request.PreviewVersion == "" || request.PreviewVersion != openLuxSalesPreviewVersion(plan) {
		common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage("OpenLux sales configuration changed; preview again"))
		return
	}
	keys := map[string]string{}
	for _, group := range request.Groups {
		keys[group.Group] = group.APIKey
	}
	channels, err := model.PublishOpenLuxSales(plan, keys, metadata, vendors)
	if err != nil {
		if errors.Is(err, model.ErrOpenLuxSalesConflict) {
			common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage("OpenLux sales configuration changed; preview again"))
			return
		}
		common.SysError("OpenLux sales publication failed")
		common.ApiError(c, common.NewMessage("OpenLux sales publication failed; no changes were applied"))
		return
	}
	recordManageAudit(c, "model.pricing.update", map[string]any{"source": "openlux-sales", "plan": plan, "channels": channels})
	common.ApiSuccess(c, gin.H{"groups": len(channels), "channels": channels})
}
