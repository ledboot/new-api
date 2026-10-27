package controller

import (
	"context"
	"io"
	"maps"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingSyncExpressionPriority(t *testing.T) {
	expression := `tier("base", p * 2 + c * 8 + cr * 0)`
	cases := []struct {
		name       string
		local      map[string]any
		source     map[string]any
		wantFields []string
	}{
		{"equal expressions suppress stale ratios", map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}, "model_price": map[string]float64{"m": 2}}, nil},
		{"local expression excludes legacy-only source", map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}}, map[string]any{"model_ratio": map[string]float64{"m": 3}, "completion_ratio": map[string]float64{"m": 2}}, nil},
		{"expression imports without legacy conflicts", map[string]any{"model_ratio": map[string]float64{"m": 1}}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}, "model_price": map[string]float64{"m": 2}}, []string{"billing_mode", "billing_expr"}},
		{"inactive expression follows explicit ratio mode", map[string]any{"model_ratio": map[string]float64{"m": 1}}, map[string]any{"billing_mode": map[string]string{"m": "ratio"}, "billing_expr": map[string]string{"m": expression}, "model_ratio": map[string]float64{"m": 3}}, []string{"model_ratio"}},
		{"empty active expression never imports a false free price", map[string]any{}, map[string]any{"billing_mode": map[string]string{"m": "tiered_expr"}, "billing_expr": map[string]string{"m": " "}, "model_ratio": map[string]float64{"m": 0}}, nil},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			diff := buildDifferences(tt.local, []struct {
				name string
				data map[string]any
			}{{"source", tt.source}})
			fields := make([]string, 0, len(diff["m"]))
			for field := range diff["m"] {
				fields = append(fields, field)
			}
			assert.ElementsMatch(t, tt.wantFields, fields)
		})
	}
}

func TestRatioConfigExportsEffectiveExpressions(t *testing.T) {
	before := config.GlobalConfig.ExportAllConfigs()
	expose := ratio_setting.IsExposeRatioEnabled()
	t.Cleanup(func() {
		config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": before["billing_setting.billing_mode"], "billing_expr": before["billing_setting.billing_expr"]})
		ratio_setting.SetExposeRatioEnabled(expose)
	})
	config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": `{"sync-export":"tiered_expr"}`, "billing_expr": `{"sync-export":"tier(\"base\", p * 2)"}`})
	ratio_setting.SetExposeRatioEnabled(true)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/ratio_config", nil)
	GetRatioConfig(c)
	var response struct {
		Success bool
		Data    map[string]any
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, billing_setting.BillingModeTieredExpr, valueMap(response.Data["billing_mode"])["sync-export"])
	assert.Equal(t, `tier("base", p * 2)`, valueMap(response.Data["billing_expr"])["sync-export"])
}

func TestPricingSyncCompleteSourcesAndArrayFormats(t *testing.T) {
	before := config.GlobalConfig.ExportAllConfigs()
	oldRatios, oldCompletion := ratio_setting.ModelRatio2JSONString(), ratio_setting.CompletionRatio2JSONString()
	t.Cleanup(func() {
		config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": before["billing_setting.billing_mode"], "billing_expr": before["billing_setting.billing_expr"]})
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldRatios))
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(oldCompletion))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"sync-token":1}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"sync-token":2}`))
	expression := `len <= 200000 ? tier("short", p * 2 + c * 8 + cr * 0) : tier("long", p * 4 + c * 12)`
	expressions, err := common.Marshal(map[string]string{"sync-already": expression})
	require.NoError(t, err)
	config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": `{"sync-already":"tiered_expr"}`, "billing_expr": string(expressions)})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var data any
		if r.URL.Path == "/ratio_config" {
			data = map[string]any{
				"billing_mode":     map[string]string{"sync-already": "tiered_expr", "sync-expression": "tiered_expr"},
				"billing_expr":     map[string]string{"sync-already": expression, "sync-expression": expression},
				"model_ratio":      map[string]float64{"sync-already": 9, "sync-expression": 9, "sync-token": 1},
				"model_price":      map[string]float64{"sync-expression": 4},
				"completion_ratio": map[string]float64{"sync-token": 4},
				"cache_ratio":      map[string]float64{"sync-token": 0},
			}
		} else {
			data = []map[string]any{
				{"model_name": "sync-already", "model_ratio": 5, "completion_ratio": 3},
				{"model_name": "sync-expression", "model_ratio": 2, "model_price": 1},
				{"model_name": "sync-array-expression", "billing_mode": "tiered_expr", "billing_expr": expression, "quota_type": 1, "model_price": 0},
				{"model_name": "sync-unpriced"},
				{"model_name": "sync-invalid-expression", "billing_mode": "tiered_expr", "billing_expr": "", "model_ratio": 0},
				{"model_name": "sync-free", "model_ratio": 0, "completion_ratio": 0},
			}
		}
		encoded, err := common.Marshal(map[string]any{"success": true, "data": data})
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	var response struct {
		Success bool
		Data    struct {
			Differences map[string]map[string]dto.DifferenceItem
			Prices      map[string]struct {
				Current   map[string]any
				Upstreams map[string]map[string]any
			}
			TestResults []dto.TestResult `json:"test_results"`
		}
	}
	body := map[string]any{"upstreams": []map[string]any{
		{"id": 1, "name": "Expressions", "base_url": server.URL, "endpoint": "/ratio_config"},
		{"id": 2, "name": "Legacy", "base_url": server.URL, "endpoint": "/pricing"},
	}}
	recorder := modelManagementRequest(t, FetchUpstreamRatios, http.MethodPost, "/api/channel/fetch_upstream_ratios", body, &response)
	require.True(t, response.Success, recorder.Body.String())
	require.Len(t, response.Data.TestResults, 2)
	for _, result := range response.Data.TestResults {
		require.Equal(t, "success", result.Status, result.Error)
	}
	assert.NotContains(t, response.Data.Differences, "sync-already")
	assert.NotContains(t, response.Data.Differences, "sync-unpriced")
	assert.NotContains(t, response.Data.Differences, "sync-invalid-expression")
	assert.Equal(t, map[string]any{"billing_mode": "tiered_expr", "billing_expr": expression}, response.Data.Prices["sync-expression"].Upstreams["Expressions(1)"])
	assert.NotContains(t, response.Data.Prices["sync-expression"].Upstreams, "Legacy(2)")
	assert.Equal(t, map[string]any{"billing_mode": "tiered_expr", "billing_expr": expression}, response.Data.Prices["sync-array-expression"].Upstreams["Legacy(2)"])
	assert.Equal(t, float64(1), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["model_ratio"], "unchanged base prices are included for a complete price preview")
	assert.Equal(t, float64(4), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["completion_ratio"])
	assert.Equal(t, float64(0), response.Data.Prices["sync-token"].Upstreams["Expressions(1)"]["cache_ratio"])
	assert.Equal(t, float64(0), response.Data.Prices["sync-free"].Upstreams["Legacy(2)"]["model_ratio"])
	assert.NotContains(t, response.Data.Prices, "sync-already")
	body["include_unchanged"] = true
	recorder = modelManagementRequest(t, FetchUpstreamRatios, http.MethodPost, "/api/ratio_sync/fetch", body, &response)
	require.True(t, response.Success, recorder.Body.String())
	assert.Equal(t, map[string]any{"billing_mode": "tiered_expr", "billing_expr": expression}, response.Data.Prices["sync-already"].Upstreams["Expressions(1)"])
	assert.NotContains(t, response.Data.Prices["sync-already"].Upstreams, "Legacy(2)")
	assert.NotContains(t, response.Data.Prices, "sync-unpriced")
	assert.NotContains(t, response.Data.Prices, "sync-invalid-expression")
	assert.NotContains(t, response.Data.Differences, "sync-already")
}

func TestOpenLuxTokenPricesPreserveTierAndCacheCharges(t *testing.T) {
	item := openLuxModel{
		Name: "gpt-example", QuotaType: new(0), Ratio: new(5.0), Completion: new(5.0),
		Cache: new(0.1), Cache5m: new(1.25), Cache1h: new(2.0), Endpoints: []string{"openai", "openai-response"},
		Steps: []openLuxStep{
			{Size: 272000, CompletionSize: new(int64(-1)), Prompt: new(1.0), Completion: new(1.0), Cache: new(1.0)},
			{Size: 1000000, CompletionSize: new(int64(-1)), Prompt: new(2.0), Completion: new(1.5), Cache: new(2.0)},
		},
	}
	expression, err := openLuxPriceExpression(item, 2, 0.1, 1.2)
	require.NoError(t, err)
	for _, tc := range []struct {
		name         string
		length, want float64
	}{
		{"at first threshold", 272000, 1875},
		{"above first threshold", 272001, 3450},
		{"at final threshold", 1000000, 3450},
		{"final tier remains fallback", 1000001, 3450},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cost, _, err := billingexpr.RunExpr(expression, billingexpr.TokenParams{P: 1000, C: 100, CR: 100, CC: 10, CC1h: 20, Len: tc.length})
			require.NoError(t, err)
			assert.InDelta(t, tc.want, cost, 1e-9)
		})
	}
	item.Cache, item.Cache5m, item.Cache1h = new(0.0), new(0.0), new(0.0)
	expression, err = openLuxPriceExpression(item, 2, 0.1, 1.2)
	require.NoError(t, err)
	cost, _, err := billingexpr.RunExpr(expression, billingexpr.TokenParams{CR: 100, CC: 10, CC1h: 20, Len: 300000})
	require.NoError(t, err)
	assert.Zero(t, cost, "explicit zero cache prices remain free")
}

func TestOpenLuxImagePricesUseImageQuantityAndReportedTokenBreakdown(t *testing.T) {
	fixed := openLuxModel{Name: "gpt-image-2-c", QuotaType: new(1), Price: new(0.12), Endpoints: []string{"openai-编辑", "openai-绘图"}}
	expression, err := openLuxPriceExpression(fixed, 2, 0.1, 1.2)
	require.NoError(t, err)
	count := 3
	cost, trace, err := billingexpr.RunExprWithRequest(expression, billingexpr.TokenParams{P: 10000, C: 20000}, billingexpr.RequestInput{ImageCount: &count})
	require.NoError(t, err)
	assert.InDelta(t, 43200, cost, 1e-8, "fixed image prices charge each image, independently of tokens")
	assert.Equal(t, billingexpr.BillingUnitRequest, trace.BillingUnit)
	// The token conversion base is irrelevant to per-image USD prices.
	same, err := openLuxPriceExpression(fixed, 99, 0.1, 1.2)
	require.NoError(t, err)
	assert.Equal(t, expression, same)
	fixed.Price = new(0.0)
	free, err := openLuxPriceExpression(fixed, 2, 0.1, 1.2)
	require.NoError(t, err)
	cost, _, err = billingexpr.RunExprWithRequest(free, billingexpr.TokenParams{}, billingexpr.RequestInput{ImageCount: &count})
	require.NoError(t, err)
	assert.Zero(t, cost)
	fixed.Price = nil
	_, err = openLuxPriceExpression(fixed, 2, 0.1, 1.2)
	require.Error(t, err, "a missing price never becomes free")
	fixed.Price = new(-1.0)
	_, err = openLuxPriceExpression(fixed, 2, 0, 1.2)
	require.Error(t, err)

	token := openLuxModel{Name: "gpt-image-2", QuotaType: new(0), Ratio: new(2.5), Completion: new(6.0), Image: new(1.6), ImageCache: new(0.64), Cache: new(0.4), Endpoints: []string{"image-generation", "OpenAI image edit"}}
	expression, err = openLuxPriceExpression(token, 2, 0.1, 1.2)
	require.NoError(t, err)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: 1}}
	response := &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":[{"b64_json":"fixture"}],"usage":{"input_tokens":1000,"output_tokens":100,"input_tokens_details":{"text_tokens":400,"image_tokens":600,"cached_tokens":300,"cached_tokens_details":{"text_tokens":100,"image_tokens":200}}}}`))}
	usage, apiErr := openai.OpenaiImageHandler(ctx, info, response)
	require.Nil(t, apiErr)
	params := service.BuildTieredTokenParams(usage, false, billingexpr.UsedVarsByHash(expression, billingexpr.ExprHashString(expression)))
	assert.Equal(t, 300.0, params.P)
	assert.Equal(t, 400.0, params.Img)
	assert.Equal(t, 200.0, params.ImgCR)
	assert.Equal(t, 100.0, params.C)
	cost, _, err = billingexpr.RunExprWithRequest(expression, params, billingexpr.RequestInput{ImageCount: &count})
	require.NoError(t, err)
	assert.InDelta(t, 1024.8, cost, 1e-8, "text, images, and cache are priced once; image count does not multiply token usage")
	token.Image = new(0.0)
	token.ImageCache = new(0.0)
	expression, err = openLuxPriceExpression(token, 2, 0.1, 1.2)
	require.NoError(t, err)
	assert.Contains(t, expression, "img * 0")
	assert.Contains(t, expression, "img_cr * 0")
	token.Image = new(-1.0)
	_, err = openLuxPriceExpression(token, 2, 0, 1.2)
	require.Error(t, err)
}

func TestOpenLuxRejectsIncompleteOrUnsupportedPrices(t *testing.T) {
	for _, tc := range []struct {
		name                string
		patch               func(*openLuxModel)
		unit, group, markup float64
	}{
		{"missing input price", func(m *openLuxModel) { m.Ratio = nil }, 2, 0.1, 1.2},
		{"missing quota type", func(m *openLuxModel) { m.QuotaType = nil }, 2, 0.1, 1.2},
		{"image per-call", func(m *openLuxModel) { m.QuotaType = new(1) }, 2, 0.1, 1.2},
		{"video seconds", func(m *openLuxModel) { m.QuotaType = new(4) }, 2, 0.1, 1.2},
		{"negative base with free group", func(m *openLuxModel) { m.Ratio = new(-1.0) }, 2, 0, 1.2},
		{"negative output", func(m *openLuxModel) { m.Completion = new(-1.0) }, 2, 0.1, 1.2},
		{"audio price", func(m *openLuxModel) { m.Audio = new(2.0) }, 2, 0.1, 1.2},
		{"audio output price", func(m *openLuxModel) { m.AudioCompletion = new(2.0) }, 2, 0.1, 1.2},
		{"image cache price", func(m *openLuxModel) { m.ImageCache = new(0.2) }, 2, 0.1, 1.2},
		{"video resolution price", func(m *openLuxModel) { m.VideoResolutionRatios = map[string]float64{"720p": 1} }, 2, 0.1, 1.2},
		{"unknown endpoint", func(m *openLuxModel) { m.Endpoints = []string{"video"} }, 2, 0.1, 1.2},
		{"overflow", func(m *openLuxModel) { m.Ratio = new(math.MaxFloat64) }, 2, 0.1, 1.2},
		{"negative group", func(m *openLuxModel) {}, 2, -1, 1.2},
		{"nan markup", func(m *openLuxModel) {}, 2, 0.1, math.NaN()},
		{"missing unit", func(m *openLuxModel) {}, 0, 0.1, 1.2},
		{"invalid tier", func(m *openLuxModel) { m.Steps = []openLuxStep{{Size: 32}} }, 2, 0.1, 1.2},
		{"output threshold", func(m *openLuxModel) {
			m.Steps = []openLuxStep{{Size: 32, Prompt: new(1.0), Completion: new(1.0), Cache: new(1.0), CompletionSize: new(int64(10))}}
		}, 2, 0.1, 1.2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := openLuxModel{QuotaType: new(0), Ratio: new(5.0), Completion: new(5.0), Endpoints: []string{"openai"}}
			tc.patch(&item)
			_, err := openLuxPriceExpression(item, tc.unit, tc.group, tc.markup)
			require.Error(t, err)
		})
	}
}

type openLuxTestTransport struct {
	target    *url.URL
	transport http.RoundTripper
}

func (transport openLuxTestTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	clone.URL.Scheme, clone.URL.Host = transport.target.Scheme, transport.target.Host
	return transport.transport.RoundTrip(clone)
}

func openLuxTestServer(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	previous := openLuxClient
	target, err := url.Parse(server.URL)
	require.NoError(t, err)
	client := *previous
	client.Transport = openLuxTestTransport{target: target, transport: server.Client().Transport}
	openLuxClient = &client
	t.Cleanup(func() { openLuxClient = previous })
	t.Setenv("OPENLUX_ACCOUNT_TOKEN", "")
	t.Setenv("OPENLUX_ACCOUNT_USER_ID", "")
}

func TestOpenLuxFetchUsesAccountRatesAndDoesNotLeakCredentials(t *testing.T) {
	status := http.StatusOK
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/pricing_new" {
			assert.Empty(t, r.Header.Get("Authorization"))
			_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"m"}],"group_ratio":{"public":1},"usable_group":{"public":"Public"}}`))
			return
		}
		assert.Equal(t, "Bearer fixture-account-token", r.Header.Get("Authorization"))
		assert.Equal(t, "42", r.Header.Get("New-Api-User"))
		w.WriteHeader(status)
		if status != http.StatusOK {
			_, _ = w.Write([]byte(`fixture-account-token`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":{"data":{"private":"Private"},"ratios":{"private":0.1}}}`))
	})
	t.Setenv("OPENLUX_ACCOUNT_TOKEN", "fixture-account-token")
	t.Setenv("OPENLUX_ACCOUNT_USER_ID", "42")
	catalog, account, version, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	require.NotNil(t, account)
	assert.Equal(t, map[string]float64{"private": 0.1}, catalog.Ratios)
	assert.NotEmpty(t, version)
	status = http.StatusUnauthorized
	_, _, _, err = fetchOpenLuxCatalog(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
	assert.NotContains(t, err.Error(), "fixture-account-token")
}

func TestOpenLuxRejectsRedirectsAndOversizedResponses(t *testing.T) {
	redirect := true
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if redirect {
			http.Redirect(w, r, "https://example.com/stolen", http.StatusFound)
			return
		}
		_, _ = w.Write([]byte(strings.Repeat(" ", maxRatioConfigBytes+1)))
	})
	var value openLuxCatalog
	err := fetchOpenLuxJSON(context.Background(), "/api/user/self/groups", "fixture-secret", &value)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "fixture-secret")
	redirect = false
	err = fetchOpenLuxJSON(context.Background(), "/api/pricing_new", "", &value)
	require.ErrorContains(t, err, "size limit")
}

func TestOpenLuxPreviewPublishAndMetadataDatabaseMatrix(t *testing.T) {
	payload := `{"success":true,"data":[{"model_name":"openlux-text","quota_type":0,"model_ratio":5,"completion_ratio":5,"cache_ratio":0.1,"supported_endpoint_types":["openai"],"enable_groups":["paid"],"description":"Source description","vendor_id":52,"translations":{"zh":{"description":"模型说明"}}},{"model_name":"openlux-video","quota_type":4,"supported_endpoint_types":["video"],"enable_groups":["paid"]}],"vendors":[{"id":52,"name":"OpenLux vendor","icon":"OpenAI"}],"usable_group":{"paid":"Paid"},"group_ratio":{"paid":0.1},"group_model_ratio":{}}`
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(payload))
	})
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			channel := model.Channel{Name: "OpenLux", Key: "fixture-key", Type: 1, Status: 1, Models: "openlux-text,openlux-video", BaseURL: new(openLuxOrigin), Group: "default"}
			require.NoError(t, db.Create(&channel).Error)
			_, _, version, err := fetchOpenLuxCatalog(context.Background())
			require.NoError(t, err)
			source := openLuxSource{Group: "paid", RatioUnit: 2, Multiplier: 1.2, Version: version, KeyGroupConfirmed: true}
			data, quote, err := openLuxPricing(context.Background(), channel.Id, source)
			require.NoError(t, err)
			require.Len(t, quote.Costs, 1)
			assert.Contains(t, quote.Excluded, "openlux-video")
			expression := data["billing_expr"].(map[string]string)["openlux-text"]
			var fetched struct {
				Success bool
				Data    struct {
					OpenLux     map[string]openLuxQuote `json:"openlux"`
					TestResults []dto.TestResult        `json:"test_results"`
				}
			}
			response := modelManagementRequest(t, FetchUpstreamRatios, http.MethodPost, "/api/ratio_sync/fetch", map[string]any{
				"upstreams": []map[string]any{{"id": channel.Id, "name": "OpenLux", "base_url": openLuxOrigin, "endpoint": "openlux"}},
				"openlux":   map[int]openLuxSource{channel.Id: source},
			}, &fetched)
			require.True(t, fetched.Success, response.Body.String())
			require.Len(t, fetched.Data.TestResults, 1)
			require.Equal(t, "success", fetched.Data.TestResults[0].Status, response.Body.String())
			require.Len(t, fetched.Data.OpenLux, 1)
			snapshot, err := model.GetModelPricingSnapshot([]string{"openlux-text"})
			require.NoError(t, err)
			previous := snapshot.EmptyVersion
			for _, entry := range snapshot.Entries {
				if entry.ModelName == "openlux-text" {
					previous = entry.Version
				}
			}
			changes := []model.ModelPricingChange{{ModelName: "openlux-text", ExpectedVersion: previous, Pricing: model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expression}}}
			publish := map[string]any{"channel_id": channel.Id, "source": source, "changes": changes}
			response = modelManagementRequest(t, PublishOpenLuxPricing, http.MethodPost, "/api/ratio_sync/openlux/publish", publish, nil)
			assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
			var audit model.AuditLog
			require.NoError(t, db.Where("action = ?", "model.pricing.update").First(&audit).Error)
			require.NotNil(t, audit.Other.Op)
			encodedSource, err := common.Marshal(audit.Other.Op.Params["source"])
			require.NoError(t, err)
			var savedSource openLuxQuote
			require.NoError(t, common.Unmarshal(encodedSource, &savedSource))
			quote.FetchedAt = savedSource.FetchedAt
			assert.Equal(t, *quote, savedSource)
			encodedAudit, err := common.Marshal(audit)
			require.NoError(t, err)
			assert.NotContains(t, string(encodedAudit), "fixture-key")
			savedExpression, configured := billing_setting.GetBillingExpr("openlux-text")
			require.True(t, configured)
			assert.Equal(t, expression, savedExpression)
			response = modelManagementRequest(t, PublishOpenLuxPricing, http.MethodPost, "/api/ratio_sync/openlux/publish", publish, nil)
			assert.Equal(t, http.StatusConflict, response.Code, "stale local pricing is rejected")
			stale := source
			stale.Version = "stale"
			_, _, err = openLuxPricing(context.Background(), channel.Id, stale)
			require.Error(t, err)
			unconfirmed := source
			unconfirmed.KeyGroupConfirmed = false
			_, _, err = openLuxPricing(context.Background(), channel.Id, unconfirmed)
			require.Error(t, err)
			competitor := model.Channel{Name: "Other", Key: "fixture", Type: 1, Status: 1, Models: "openlux-text", Group: "default"}
			require.NoError(t, db.Create(&competitor).Error)
			_, quote, err = openLuxPricing(context.Background(), channel.Id, source)
			require.Error(t, err)
			assert.Contains(t, quote.Excluded["openlux-text"], "competing")
			metadata, models, vendors, err := openLuxMetadata(context.Background(), "zh")
			require.NoError(t, err)
			assert.Equal(t, "模型说明", models["openlux-text"].Description)
			assert.Equal(t, "OpenLux vendor", models["openlux-text"].Vendor)
			assert.Contains(t, vendors, "OpenLux vendor")
			var preview struct {
				Success bool
				Data    struct {
					Source     metadataSyncSource
					Candidates []metadataSyncCandidate
				}
			}
			response = modelManagementRequest(t, SyncUpstreamPreview, http.MethodGet, "/api/models/sync_upstream/preview?source=openlux&locale=zh", nil, &preview)
			require.True(t, preview.Success, response.Body.String())
			require.Equal(t, metadata.Version, preview.Data.Source.Version)
			var selections []model.MetadataSyncSelection
			for _, candidate := range preview.Data.Candidates {
				if candidate.ModelName == "openlux-text" {
					selections = append(selections, model.MetadataSyncSelection{ModelName: candidate.ModelName, RecordVersion: candidate.RecordVersion, Create: true})
				}
			}
			response = modelManagementRequest(t, SyncUpstreamModels, http.MethodPost, "/api/models/sync_upstream", map[string]any{"source": "openlux", "locale": "zh", "source_version": metadata.Version, "selections": selections}, nil)
			assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
			var saved model.Model
			require.NoError(t, db.Where("model_name = ?", "openlux-text").First(&saved).Error)
			assert.Equal(t, "模型说明", saved.Description)
		})
	}
}

func TestOpenLuxScheduledSyncConfiguration(t *testing.T) {
	handler := openLuxSyncHandler{}
	t.Setenv("OPENLUX_SYNC_ENABLED", "true")
	t.Setenv("OPENLUX_SYNC_INTERVAL_MINUTES", "60")
	assert.True(t, handler.Enabled())
	assert.Equal(t, time.Hour, handler.Interval())
	t.Setenv("OPENLUX_SYNC_ENABLED", "false")
	assert.False(t, handler.Enabled())
	for _, minutes := range []string{"0", "-1", "10081"} {
		t.Setenv("OPENLUX_SYNC_INTERVAL_MINUTES", minutes)
		assert.Equal(t, time.Hour, handler.Interval())
	}
	t.Setenv("OPENLUX_SYNC_INTERVAL_MINUTES", "5")
	assert.Equal(t, 5*time.Minute, handler.Interval())
}

func runOpenLuxScheduledTask(t *testing.T, ctx context.Context) *model.SystemTask {
	t.Helper()
	task, err := model.CreateSystemTask(model.SystemTaskTypeOpenLuxSync, nil, nil)
	require.NoError(t, err)
	claimed, acquired, err := model.ClaimSystemTask(task.ID, task.Type, "openlux-test", common.GetTimestamp()+60)
	require.NoError(t, err)
	require.True(t, acquired)
	openLuxSyncHandler{}.Run(ctx, claimed, "openlux-test")
	saved, err := model.GetSystemTaskByTaskID(task.TaskID)
	require.NoError(t, err)
	return saved
}

func TestOpenLuxScheduledSyncDatabaseMatrix(t *testing.T) {
	catalog := openLuxCatalog{Success: true,
		Models: []openLuxModel{{Name: "scheduled-text", Description: strings.Repeat("source description ", 5000), QuotaType: new(0), Ratio: new(5.0), Completion: new(5.0), Groups: []string{"paid"}, Endpoints: []string{"openai"}}},
		Groups: map[string]string{"paid": "Paid"}, Ratios: map[string]float64{"paid": 0.1},
		Vendors: []openLuxVendor{{ID: 52, Name: "Vendor"}},
	}
	status := http.StatusOK
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		if status != http.StatusOK {
			_, _ = w.Write([]byte("upstream private diagnostic"))
			return
		}
		encoded, err := common.Marshal(catalog)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	})
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.SystemTask{}, &model.SystemTaskLock{}))
			status = http.StatusOK
			catalog.Models = catalog.Models[:1]
			catalog.Models[0].Ratio = new(5.0)
			catalog.Ratios["paid"] = 0.1
			require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"scheduled-text":7}`))
			channel := model.Channel{Name: "unchanged", Key: "fixture", Type: 1, Status: 1, Models: "scheduled-text", Group: "default"}
			require.NoError(t, db.Create(&channel).Error)
			task := runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusSucceeded, task.Status, task.Error)
			var result openLuxSyncResult
			require.NoError(t, common.UnmarshalJsonStr(task.Result, &result))
			assert.True(t, result.Baseline)
			assert.Equal(t, 1, result.Models.Added)
			checkpoint, err := model.LoadOpenLuxSnapshot()
			require.NoError(t, err)
			assert.Greater(t, len(checkpoint), 65535, "source checkpoints exceed MySQL TEXT and must use the existing large option column")
			task = runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusSucceeded, task.Status, task.Error)
			require.NoError(t, common.UnmarshalJsonStr(task.Result, &result))
			assert.False(t, result.Changed)
			assert.False(t, result.Baseline)
			catalog.Models[0].Ratio = new(6.0)
			catalog.Models = append(catalog.Models, openLuxModel{Name: "new-text"})
			catalog.Ratios["paid"] = 0.2
			task = runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusSucceeded, task.Status, task.Error)
			require.NoError(t, common.UnmarshalJsonStr(task.Result, &result))
			assert.True(t, result.Changed)
			assert.Equal(t, 1, result.Models.Added)
			assert.Equal(t, 1, result.Models.Updated)
			assert.Equal(t, 1, result.Groups.Updated)
			checkpoint, err = model.LoadOpenLuxSnapshot()
			require.NoError(t, err)
			status = http.StatusServiceUnavailable
			task = runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusFailed, task.Status)
			assert.NotContains(t, task.Error, "private diagnostic")
			preserved, err := model.LoadOpenLuxSnapshot()
			require.NoError(t, err)
			assert.Equal(t, checkpoint, preserved)
			_, err = model.DeleteSystemTaskHistory(model.SystemTaskFilter{})
			require.NoError(t, err)
			status = http.StatusOK
			task = runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusSucceeded, task.Status, task.Error)
			require.NoError(t, common.UnmarshalJsonStr(task.Result, &result))
			assert.False(t, result.Baseline, "history cleanup must preserve the durable baseline")
			assert.False(t, result.Changed)
			catalog.Models[0], catalog.Models[1] = catalog.Models[1], catalog.Models[0]
			task = runOpenLuxScheduledTask(t, context.Background())
			require.Equal(t, model.SystemTaskStatusSucceeded, task.Status, task.Error)
			require.NoError(t, common.UnmarshalJsonStr(task.Result, &result))
			assert.False(t, result.Changed, "upstream popularity ordering is not a model or price change")
			catalog.Models[0], catalog.Models[1] = catalog.Models[1], catalog.Models[0]
			checkpoint, err = model.LoadOpenLuxSnapshot()
			require.NoError(t, err)
			err = model.FinishOpenLuxSync(task.TaskID, "stale-runner", "{}", nil, nil)
			require.ErrorIs(t, err, model.ErrSystemTaskLockLost)
			preserved, err = model.LoadOpenLuxSnapshot()
			require.NoError(t, err)
			assert.Equal(t, checkpoint, preserved)
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			task = runOpenLuxScheduledTask(t, ctx)
			assert.Equal(t, model.SystemTaskStatusFailed, task.Status)
			assert.Equal(t, `{"scheduled-text":7}`, ratio_setting.ModelRatio2JSONString(), "scheduled checks must not change selling prices")
			var unchanged model.Channel
			require.NoError(t, db.First(&unchanged, channel.Id).Error)
			assert.Equal(t, channel.Models, unchanged.Models)
		})
	}
}

func TestOpenLuxScheduledChangesIncludeRemovalsAndMetadata(t *testing.T) {
	before := &openLuxCatalog{
		Models: []openLuxModel{{Name: "old"}, {Name: "stable", Ratio: new(1.0)}, {Name: "fixed", QuotaType: new(1), Price: new(0.1)}, {Name: "video", QuotaType: new(4), VideoResolutionRatios: map[string]float64{"720p": 1}}},
		Groups: map[string]string{"old-group": "Old"}, Ratios: map[string]float64{"old-group": 0.1},
		Vendors: []openLuxVendor{{ID: 1, Name: "Vendor", Description: "Old"}},
	}
	after := &openLuxCatalog{
		Models: []openLuxModel{{Name: "new"}, {Name: "stable", Ratio: new(2.0)}, {Name: "fixed", QuotaType: new(1), Price: new(0.2)}, {Name: "video", QuotaType: new(4), VideoResolutionRatios: map[string]float64{"720p": 2}}},
		Groups: map[string]string{"new-group": "New"}, Ratios: map[string]float64{"new-group": 0.2},
		Vendors: []openLuxVendor{{ID: 1, Name: "Vendor", Description: "New"}},
	}
	changes := openLuxCatalogChanges(before, after)
	assert.Equal(t, openLuxSyncChanges{Added: 1, Removed: 1, Updated: 3, Names: []string{"fixed", "new", "old", "stable", "video"}}, changes[0])
	assert.Equal(t, openLuxSyncChanges{Added: 1, Removed: 1, Names: []string{"new-group", "old-group"}}, changes[1])
	assert.Equal(t, openLuxSyncChanges{Updated: 1, Names: []string{"Vendor"}}, changes[2])
}

func TestOpenLuxCatalogIncludesFullSourceAndAccountVisibility(t *testing.T) {
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/user/self/groups" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"data":{"paid":"Account group"},"ratios":{"paid":0.05},"group_ids":{"paid":7},"uptime":{"paid":{"uptime":0.9827,"status":"healthy"}}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"gpt-fixture","quota_type":0,"model_ratio":5,"completion_ratio":5,"enable_groups":["paid","other"],"step_ratios":[{"step_size":272000,"prompt_step_ratio":1,"completion_step_ratio":1,"cache_step_ratio":1}],"supported_endpoint_types":["openai"],"cache_ratio":0,"extra_price":{"720p":0.4}}],"vendors":[{"id":52,"name":"Vendor","translations":{"zh":{"description":"厂商"}}}],"supported_endpoint":{"openai":{"path":"/v1/chat/completions"}},"auto_groups":["paid"],"usable_group":{"paid":"Public group","other":"Other"},"group_ratio":{"paid":0.1,"other":1},"group_model_ratio":{},"pixverse_v6max_promo":{"enabled":true}}`))
	})
	t.Setenv("OPENLUX_ACCOUNT_TOKEN", "fixture-secret")
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			OpenLuxCatalog map[string]any     `json:"catalog"`
			Groups         map[string]string  `json:"groups"`
			Ratios         map[string]float64 `json:"ratios"`
			Uptime         map[string]any     `json:"uptime"`
			PriceUnit      float64            `json:"price_unit"`
			ImportSupport  map[string]string  `json:"import_support"`
		} `json:"data"`
	}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/ratio_sync/openlux", nil)
	GetOpenLuxCatalog(ctx)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.NotEmpty(t, response.Data.OpenLuxCatalog)
	assert.Equal(t, float64(2), response.Data.PriceUnit)
	assert.Equal(t, map[string]string{"paid": "Account group"}, response.Data.Groups)
	assert.Equal(t, 0.05, response.Data.Ratios["paid"])
	assert.Contains(t, response.Data.Uptime, "paid")
	assert.Empty(t, response.Data.ImportSupport["gpt-fixture"])
	raw := response.Data.OpenLuxCatalog
	assert.Contains(t, raw, "supported_endpoint")
	assert.Contains(t, raw, "vendors")
	assert.Contains(t, raw, "auto_groups")
	assert.Contains(t, raw, "pixverse_v6max_promo")
	models, ok := raw["data"].([]any)
	require.True(t, ok)
	require.Len(t, models, 1)
	item := models[0].(map[string]any)
	assert.Equal(t, float64(0), item["cache_ratio"])
	assert.Equal(t, map[string]any{"720p": 0.4}, item["extra_price"])
	assert.Contains(t, item, "step_ratios")
	assert.NotContains(t, recorder.Body.String(), "fixture-secret")
}

func TestOpenLuxSalesPublishAndBillingDatabaseMatrix(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousQuota, previousMultiplier := common.QuotaPerUnit, operation_setting.GetQuotaSetting().PreConsumeMultiplier
	previousSpecial := ratio_setting.GroupGroupRatio2JSONString()
	common.QuotaPerUnit = 500000
	operation_setting.GetQuotaSetting().PreConsumeMultiplier = 1
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString("{}"))
	t.Cleanup(func() {
		common.QuotaPerUnit = previousQuota
		operation_setting.GetQuotaSetting().PreConsumeMultiplier = previousMultiplier
		_ = ratio_setting.UpdateGroupGroupRatioByJSONString(previousSpecial)
	})
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			dsn := os.Getenv(dialect.env)
			if dialect.env != "" && dsn == "" {
				t.Skip("database DSN not configured")
			}
			db := modelManagementDB(t, dialect.kind, dsn)
			logDB, _ := newAuditTestDatabase(t, dialect.kind, dsn)
			require.NoError(t, logDB.AutoMigrate(&model.AuditLog{}))
			model.LOG_DB = logDB
			common.SetLogDatabaseType(common.MainDatabaseType())
			operator := model.User{Username: "openlux-operator", Password: "fixture-hash", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
			require.NoError(t, db.Create(&operator).Error)

			previewHandler := func(c *gin.Context) {
				c.Request.Header.Set("Content-Type", "application/json")
				c.Set("id", operator.Id)
				PreviewOpenLuxSales(c)
			}
			publishHandler := func(c *gin.Context) {
				c.Request.Header.Set("Content-Type", "application/json")
				c.Set("id", operator.Id)
				PublishOpenLuxSales(c)
			}
			t.Cleanup(func() {
				if connection, err := model.DB.DB(); err == nil {
					_ = connection.Close()
				}
			})
			savedSales, _ := common.Marshal(billing_setting.GetOpenLuxSales())
			savedRatios, savedUsable := ratio_setting.GroupRatio2JSONString(), setting.UserUsableGroups2JSONString()
			savedTopups := common.TopupGroupRatio2JSONString()
			savedSpecial := ratio_setting.GroupGroupRatio2JSONString()
			require.NoError(t, billing_setting.LoadOpenLuxSales("{}"))
			t.Cleanup(func() {
				require.NoError(t, billing_setting.LoadOpenLuxSales(string(savedSales)))
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(savedRatios))
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(savedUsable))
				require.NoError(t, common.UpdateTopupGroupRatioByJSONString(savedTopups))
				require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(savedSpecial))
			})
			payload := `{"success":true,"data":[{"model_name":"catalog-text","quota_type":0,"model_ratio":5,"completion_ratio":5,"cache_ratio":0.1,"enable_groups":["sale-a","sale-b","rollback-a","rollback-z"],"supported_endpoint_types":["openai"]},{"model_name":"new-text","step_ratios":[{"step_size":100000,"prompt_step_ratio":1,"completion_step_ratio":1,"cache_step_ratio":1},{"step_size":1000000,"prompt_step_ratio":5,"completion_step_ratio":5,"cache_step_ratio":5}],"quota_type":0,"model_ratio":1,"completion_ratio":2,"vendor_id":52,"description":"Source text","enable_groups":["sale-a","sale-b","rollback-a","rollback-z"],"supported_endpoint_types":["openai"]},{"model_name":"video","quota_type":4,"enable_groups":["sale-a","sale-b"]}],"vendors":[{"id":52,"name":"Source vendor","icon":"OpenAI"}],"usable_group":{"sale-a":"A","sale-b":"B","rollback-a":"R1","rollback-z":"R2"},"group_ratio":{"sale-a":0.1,"sale-b":0.2,"rollback-a":0.1,"rollback-z":0.1}}`
			payload = strings.Replace(payload, `],"vendors":`, `,{"model_name":"gpt-image-2-c","quota_type":1,"model_price":0.12,"enable_groups":["sale-a","sale-b"],"supported_endpoint_types":["openai-编辑","openai-绘图"]},{"model_name":"gpt-image-2","quota_type":0,"model_ratio":2.5,"completion_ratio":6,"image_ratio":1.6,"image_cache_ratio":0.64,"cache_ratio":0.4,"enable_groups":["sale-a","sale-b"],"supported_endpoint_types":["image-generation","OpenAI image edit"]}],"vendors":`, 1)
			openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(payload))
			})
			require.NoError(t, db.Create(&model.Model{ModelName: "catalog-text", Description: "Administrator metadata", Status: 1}).Error)
			_, _, version, err := fetchOpenLuxCatalog(context.Background())
			require.NoError(t, err)
			require.NoError(t, model.UpdateOption("TopupGroupRatio", `{"sale-b":0.8,"unrelated":0.7}`))
			request := openLuxSalesRequest{Version: version, RatioUnit: 2, KeyGroupConfirmed: true, Groups: []openLuxSaleSelection{{Group: "sale-a", Multiplier: 1.2, APIKey: "fixture-a-secret"}, {Group: "sale-b", Multiplier: 1.2, APIKey: "fixture-b-secret"}}}
			for _, tc := range []struct {
				name   string
				change func(*openLuxSalesRequest)
			}{
				{"missing confirmation", func(r *openLuxSalesRequest) { r.KeyGroupConfirmed = false }},
				{"missing unit", func(r *openLuxSalesRequest) { r.RatioUnit = 0 }},
				{"discount below cost", func(r *openLuxSalesRequest) { r.Groups[0].Multiplier = 0.9 }},
				{"negative group multiplier", func(r *openLuxSalesRequest) { r.Groups[0].GroupRatio = new(-0.1) }},
				{"negative top-up multiplier", func(r *openLuxSalesRequest) { r.Groups[0].TopupRatio = new(-0.1) }},
				{"missing key", func(r *openLuxSalesRequest) { r.Groups[0].APIKey = "" }},
				{"duplicate group", func(r *openLuxSalesRequest) { r.Groups[1].Group = r.Groups[0].Group }},
				{"unavailable group", func(r *openLuxSalesRequest) { r.Groups[0].Group = "missing" }},
				{"stale source", func(r *openLuxSalesRequest) { r.Version = "old-source" }},
			} {
				invalid := request
				invalid.Groups = slices.Clone(request.Groups)
				tc.change(&invalid)
				var result struct{ Success bool }
				response := modelManagementRequest(t, previewHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/preview", invalid, &result)
				assert.False(t, result.Success, tc.name)
				assert.NotContains(t, response.Body.String(), "fixture-a-secret")
			}
			var preview struct {
				Success bool
				Data    struct {
					Plan           model.OpenLuxSalesPlan
					PreviewVersion string `json:"preview_version"`
				}
			}
			response := modelManagementRequest(t, previewHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/preview", request, &preview)
			require.True(t, preview.Success, response.Body.String())
			require.Len(t, preview.Data.Plan.Groups, 2)
			assert.NotContains(t, response.Body.String(), "fixture-a-secret")
			assert.Contains(t, preview.Data.Plan.Groups[0].Excluded, "video")
			assert.Equal(t, 0.1, preview.Data.Plan.Groups[0].GroupRatio)
			assert.Equal(t, 1.0, preview.Data.Plan.Groups[0].TopupRatio)
			assert.Equal(t, 0.8, preview.Data.Plan.Groups[1].TopupRatio)
			assert.Contains(t, preview.Data.Plan.Groups[1].SellingPrices["catalog-text"], "2.4")
			var count int64
			require.NoError(t, db.Model(&model.Channel{}).Count(&count).Error)
			assert.Zero(t, count, "preview is read-only")
			broken := preview.Data.Plan
			broken.Groups = slices.Clone(broken.Groups)
			broken.Groups[0].Models = maps.Clone(broken.Groups[0].Models)
			invalid := broken.Groups[0].Models["new-text"]
			invalid.Expression = "-1"
			broken.Groups[0].Models["new-text"] = invalid
			_, err = model.PublishOpenLuxSales(broken, map[string]string{"sale-a": "fixture-a-secret", "sale-b": "fixture-b-secret"}, map[string]model.MetadataValues{"new-text": {Status: 1}, "catalog-text": {Status: 1}}, nil)
			require.Error(t, err)
			require.NoError(t, db.Model(&model.Channel{}).Count(&count).Error)
			assert.Zero(t, count, "invalid prices must roll back before commit")
			request.PreviewVersion = preview.Data.PreviewVersion
			var published struct {
				Success bool
				Data    struct {
					Groups   int
					Channels map[string]int
				}
			}
			response = modelManagementRequest(t, publishHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/publish", request, &published)
			require.True(t, published.Success, response.Body.String())
			require.Len(t, published.Data.Channels, 2)
			imported, _, managed := billing_setting.GetOpenLuxSalePrice("sale-a", "new-text")
			require.True(t, managed)
			assert.EqualValues(t, 1000000, imported.InputTokenLimit)
			assert.EqualValues(t, 1000000, billing_setting.GetOpenLuxModelInputLimits("new-text")["sale-a"])
			// Old saved prices omitted context metadata. Republish must fill it
			// without replacing the owned channels or administrator metadata.
			legacy := billing_setting.GetOpenLuxSales()
			for group, sale := range legacy {
				price := sale.Models["new-text"]
				price.InputTokenLimit = 0
				sale.Models["new-text"] = price
				legacy[group] = sale
			}
			legacyRaw, err := common.Marshal(legacy)
			require.NoError(t, err)
			require.NoError(t, db.Model(&model.Option{}).Where(map[string]any{"key": billing_setting.OpenLuxSalesOption}).Update("value", string(legacyRaw)).Error)
			require.NoError(t, billing_setting.LoadOpenLuxSales(string(legacyRaw)))
			legacyPrice, _, _ := billing_setting.GetOpenLuxSalePrice("sale-a", "new-text")
			assert.Zero(t, legacyPrice.InputTokenLimit)
			var audit model.AuditLog
			require.NoError(t, logDB.First(&audit).Error)
			assert.Equal(t, operator.Id, audit.UserId)
			assert.Equal(t, "model.pricing.update", audit.Action)
			auditData, err := common.Marshal(audit.Other)
			require.NoError(t, err)
			assert.Contains(t, string(auditData), "sale-a")
			assert.Contains(t, string(auditData), "catalog-text")
			assert.NotContains(t, string(auditData), "fixture-a-secret")
			assert.NotContains(t, string(auditData), "fixture-b-secret")

			require.NoError(t, db.Model(&model.Ability{}).Count(&count).Error)
			assert.EqualValues(t, 8, count)
			var metadata model.Model
			require.NoError(t, db.Where("model_name = ?", "catalog-text").First(&metadata).Error)
			assert.Equal(t, "Administrator metadata", metadata.Description)
			metadata = model.Model{}
			require.NoError(t, db.Where("model_name = ?", "new-text").First(&metadata).Error)
			assert.NotZero(t, metadata.VendorID)
			assert.NotEqual(t, 52, metadata.VendorID)
			assert.Equal(t, 0.1, ratio_setting.GetGroupRatio("sale-a"))
			assert.Equal(t, 0.2, ratio_setting.GetGroupRatio("sale-b"))
			assert.Equal(t, 1.0, common.GetTopupGroupRatio("sale-a"))
			assert.Equal(t, 0.8, common.GetTopupGroupRatio("sale-b"))
			assert.Equal(t, 0.7, common.GetTopupGroupRatio("unrelated"))
			assert.Contains(t, setting.GetUserUsableGroupsCopy(), "sale-a")
			public := model.GetPricing()
			pricingIndex := slices.IndexFunc(public, func(item model.Pricing) bool { return item.ModelName == "catalog-text" })
			require.NotEqual(t, -1, pricingIndex)
			assert.Len(t, public[pricingIndex].GroupBillingExpr, 2)
			assert.Contains(t, public[pricingIndex].GroupBillingExpr["sale-b"], "p * 12")
			var snapshot *billingexpr.BillingSnapshot
			for _, tc := range []struct {
				group       string
				pre, actual int
			}{{"sale-a", 900, 2700}, {"sale-b", 1800, 5400}} {
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`))
				info := &relaycommon.RelayInfo{OriginModelName: "catalog-text", UsingGroup: tc.group, UserGroup: "default", ChannelMeta: &relaycommon.ChannelMeta{ChannelId: published.Data.Channels[tc.group]}, BillingRequestInput: &billingexpr.RequestInput{Body: []byte(`{}`)}}
				price, err := helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.NoError(t, err)
				assert.Equal(t, tc.pre*2/3, price.QuotaToPreConsume, "reservation uses input only")
				settled, err := billingexpr.ComputeTieredQuotaWithRequest(info.TieredBillingSnapshot, billingexpr.TokenParams{P: 2000, C: 500, Len: 2000}, *info.BillingRequestInput)
				require.NoError(t, err)
				assert.Equal(t, tc.actual, settled.ActualQuotaAfterGroup)
				if tc.group == "sale-a" {
					snapshot = info.TieredBillingSnapshot
				}
				info.ChannelId++
				_, err = helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.Error(t, err, "a different channel cannot reuse a managed group's price")
				info.ChannelId--
				info.OriginModelName = "catalog-text@thinking:on"
				_, err = helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.NoError(t, err)
				assert.Equal(t, "catalog-text", info.GetBillingModelName())
				info.OriginModelName = "unknown-model"
				_, err = helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.Error(t, err, "unpublished models cannot inherit a global fallback price")
			}
			for _, tc := range []struct {
				model string
				quota int
			}{{"gpt-image-2-c", 21600}, {"gpt-image-2", 300}} {
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
				info := &relaycommon.RelayInfo{OriginModelName: tc.model, UsingGroup: "sale-a", UserGroup: "default", Request: &dto.ImageRequest{Model: tc.model, N: new(uint(3))}, ChannelMeta: &relaycommon.ChannelMeta{ChannelId: published.Data.Channels["sale-a"]}, BillingRequestInput: &billingexpr.RequestInput{}}
				price, err := helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.NoError(t, err)
				assert.Equal(t, tc.quota, price.QuotaToPreConsume)
				imageCount := 1
				actual, err := billingexpr.ComputeTieredQuotaWithRequest(info.TieredBillingSnapshot, billingexpr.TokenParams{P: 1000, Len: 1000}, billingexpr.RequestInput{ImageCount: &imageCount})
				require.NoError(t, err)
				if tc.model == "gpt-image-2-c" {
					assert.Equal(t, 7200, actual.ActualQuotaAfterGroup)
				} else {
					assert.Equal(t, 300, actual.ActualQuotaAfterGroup)
				}
				var savedImage model.Model
				require.NoError(t, db.Where("model_name = ?", tc.model).First(&savedImage).Error)
				assert.Contains(t, savedImage.Endpoints, "/v1/images/edits")
				assert.Contains(t, savedImage.Endpoints, "/v1/images/generations")
			}
			// Simulate the earlier saved contract, which embedded source ratios and
			// used a local ratio of 1. Absolute user-group overrides must rebase once.
			legacy = billing_setting.GetOpenLuxSales()
			old := legacy["sale-a"]
			old.NormalizedPrices = false
			sourceCatalog, _, _, err := fetchOpenLuxCatalog(context.Background())
			require.NoError(t, err)
			for _, candidate := range sourceCatalog.Models {
				if price, exists := old.Models[candidate.Name]; exists {
					price.Expression, err = openLuxPriceExpression(candidate, 2, 0.1, 1.2)
					require.NoError(t, err)
					old.Models[candidate.Name] = price
				}
			}
			legacy["sale-a"] = old
			legacyRaw, err = common.Marshal(legacy)
			require.NoError(t, err)
			require.NoError(t, db.Model(&model.Option{}).Where(map[string]any{"key": billing_setting.OpenLuxSalesOption}).Update("value", string(legacyRaw)).Error)
			require.NoError(t, billing_setting.LoadOpenLuxSales(string(legacyRaw)))
			require.NoError(t, model.UpdateOption("GroupRatio", `{"sale-a":1,"sale-b":0.2}`))
			require.NoError(t, model.UpdateOption("GroupGroupRatio", `{"vip":{"sale-a":0.5,"sale-b":1.5}}`))
			// Replays must conflict; an explicit fresh preview updates owned channels.
			response = modelManagementRequest(t, publishHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/publish", request, nil)
			assert.Equal(t, http.StatusConflict, response.Code)
			payload = strings.ReplaceAll(payload, `"step_size":1000000`, `"step_size":2000000`)
			_, _, version, err = fetchOpenLuxCatalog(context.Background())
			require.NoError(t, err)
			request.Version = version
			request.Groups[0].Multiplier = 1.5
			request.Groups[0].GroupRatio = new(0.15)
			request.Groups[0].TopupRatio = new(0.0)
			request.Groups[1].GroupRatio = new(0.4)
			request.Groups[0].APIKey = ""
			request.Groups[1].APIKey = ""
			response = modelManagementRequest(t, previewHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/preview", request, &preview)
			require.True(t, preview.Success, response.Body.String())
			request.PreviewVersion = preview.Data.PreviewVersion
			var updated struct {
				Success bool
				Data    struct{ Channels map[string]int }
			}
			response = modelManagementRequest(t, publishHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/publish", request, &updated)
			require.True(t, updated.Success, response.Body.String())
			assert.Equal(t, published.Data.Channels, updated.Data.Channels)
			assert.Equal(t, 0.15, ratio_setting.GetGroupRatio("sale-a"))
			assert.Equal(t, 0.4, ratio_setting.GetGroupRatio("sale-b"))
			assert.Zero(t, common.GetTopupGroupRatio("sale-a"))
			assert.Equal(t, 0.8, common.GetTopupGroupRatio("sale-b"))
			special, exists := ratio_setting.GetGroupGroupRatio("vip", "sale-a")
			require.True(t, exists)
			assert.InDelta(t, 0.05, special, 1e-12)
			special, exists = ratio_setting.GetGroupGroupRatio("vip", "sale-b")
			require.True(t, exists)
			assert.Equal(t, 1.5, special, "already normalized overrides are not rescaled")
			for _, tc := range []struct {
				group, user string
				quota       int
			}{{"sale-a", "default", 5063}, {"sale-b", "default", 10800}, {"sale-a", "vip", 1688}} {
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
				info := &relaycommon.RelayInfo{OriginModelName: "catalog-text", UsingGroup: tc.group, UserGroup: tc.user, ChannelMeta: &relaycommon.ChannelMeta{ChannelId: published.Data.Channels[tc.group]}, BillingRequestInput: &billingexpr.RequestInput{}}
				_, err := helper.ModelPriceHelper(ctx, info, 1000, nil)
				require.NoError(t, err)
				actual, err := billingexpr.ComputeTieredQuotaWithRequest(info.TieredBillingSnapshot, billingexpr.TokenParams{P: 2000, C: 500, Len: 2000}, billingexpr.RequestInput{})
				require.NoError(t, err)
				assert.Equal(t, tc.quota, actual.ActualQuotaAfterGroup)
			}
			// Omitted values preserve the current project settings after normalization.
			request.Groups[0].GroupRatio, request.Groups[0].TopupRatio, request.Groups[1].GroupRatio = nil, nil, nil
			response = modelManagementRequest(t, previewHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/preview", request, &preview)
			require.True(t, preview.Success, response.Body.String())
			assert.Equal(t, 0.15, preview.Data.Plan.Groups[0].GroupRatio)
			assert.Zero(t, preview.Data.Plan.Groups[0].TopupRatio)
			request.PreviewVersion = preview.Data.PreviewVersion
			response = modelManagementRequest(t, publishHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/publish", request, &updated)
			require.True(t, updated.Success, response.Body.String())
			special, _ = ratio_setting.GetGroupGroupRatio("vip", "sale-a")
			assert.InDelta(t, 0.05, special, 1e-12, "republishing never rebases twice")
			updatedPrice, _, _ := billing_setting.GetOpenLuxSalePrice("sale-a", "new-text")
			assert.EqualValues(t, 2000000, updatedPrice.InputTokenLimit)
			foundLimit := false
			for _, pricing := range model.GetPricing() {
				if pricing.ModelName == "new-text" {
					foundLimit = true
					assert.EqualValues(t, 2000000, pricing.GroupInputTokenLimits["sale-a"])
					visible := filterPricingByUsableGroups([]model.Pricing{pricing}, map[string]string{"sale-a": "A"})
					require.Len(t, visible, 1)
					assert.Equal(t, map[string]int64{"sale-a": 2000000}, visible[0].GroupInputTokenLimits)
				}
			}
			require.True(t, foundLimit, "published model must expose its source context limit")
			settled, err := billingexpr.ComputeTieredQuotaWithRequest(snapshot, billingexpr.TokenParams{P: 2000, C: 500, Len: 2000}, billingexpr.RequestInput{})
			require.NoError(t, err)
			assert.Equal(t, 2700, settled.ActualQuotaAfterGroup, "in-flight settlement uses the frozen price")
			var channel model.Channel
			require.NoError(t, db.First(&channel, published.Data.Channels["sale-a"]).Error)
			assert.Equal(t, "fixture-a-secret", channel.Key)
			require.NoError(t, model.UpdateOption("GroupRatio", `{"sale-a":0.15,"sale-b":0.4,"rollback-z":1}`))
			rollback := openLuxSalesRequest{Version: version, RatioUnit: 2, KeyGroupConfirmed: true, Groups: []openLuxSaleSelection{{Group: "rollback-a", Multiplier: 1.2, APIKey: "fixture-secret"}, {Group: "rollback-z", Multiplier: 1.2, APIKey: "fixture-secret"}}}
			response = modelManagementRequest(t, previewHandler, http.MethodPost, "/api/ratio_sync/openlux/sales/preview", rollback, &preview)
			assert.False(t, preview.Success, response.Body.String())
			assert.Contains(t, response.Body.String(), "already uses")
			require.NoError(t, db.Model(&model.Channel{}).Count(&count).Error)
			assert.EqualValues(t, 2, count, "failed batches roll back earlier groups")
			assert.NotContains(t, billing_setting.GetOpenLuxSales(), "rollback-a")
			// Existing schemas require no migration. Restart twice and retain prices,
			// channel identities, credentials, and unrelated administrator metadata.
			for range 2 {
				connection, err := model.DB.DB()
				require.NoError(t, err)
				require.NoError(t, connection.Close())
				require.NoError(t, model.InitDB())
				model.InitOptionMap()
				price, id, managed := billing_setting.GetOpenLuxSalePrice("sale-a", "catalog-text")
				require.True(t, managed)
				assert.Equal(t, published.Data.Channels["sale-a"], id)
				assert.Contains(t, price.Expression, "p * 15")
				assert.Equal(t, 0.15, ratio_setting.GetGroupRatio("sale-a"))
				assert.Zero(t, common.GetTopupGroupRatio("sale-a"))
				assert.Equal(t, 0.8, common.GetTopupGroupRatio("sale-b"))
				persisted, _, _ := billing_setting.GetOpenLuxSalePrice("sale-a", "new-text")
				assert.EqualValues(t, 2000000, persisted.InputTokenLimit)
			}

			validSnapshot, err := common.Marshal(billing_setting.GetOpenLuxSales())
			require.NoError(t, err)
			config.UpdateConfigFromMap(config.GlobalConfig.Get("billing_setting"), map[string]string{"billing_mode": `{"global-model":"tiered_expr"}`, "billing_expr": `{"global-model":"tier(\"base\", p * 1 + c * 1)"}`})
			require.Error(t, billing_setting.LoadOpenLuxSales("{invalid"))
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			info := &relaycommon.RelayInfo{OriginModelName: "global-model", UsingGroup: "default", UserGroup: "default", BillingRequestInput: &billingexpr.RequestInput{}}
			_, err = helper.ModelPriceHelper(ctx, info, 1000, nil)
			require.Error(t, err, "corrupt managed pricing cannot silently fall back to global prices")
			require.NoError(t, billing_setting.LoadOpenLuxSales(string(validSnapshot)))
			_, err = helper.ModelPriceHelper(ctx, info, 1000, nil)
			require.NoError(t, err)
		})
	}
}

func TestOpenLuxSalesRejectsCrossSiteAndNonJSONRequests(t *testing.T) {
	for _, tc := range []struct{ contentType, site string }{{"text/plain", "same-origin"}, {"application/json", "cross-site"}} {
		response := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(response)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/ratio_sync/openlux/sales/publish", strings.NewReader(`{"groups":[]}`))
		ctx.Request.Header.Set("Content-Type", tc.contentType)
		ctx.Request.Header.Set("Sec-Fetch-Site", tc.site)
		PublishOpenLuxSales(ctx)
		assert.Equal(t, http.StatusForbidden, response.Code)
	}
}

func TestOpenLuxCatalogVersionTracksPricesInsteadOfPresentation(t *testing.T) {
	catalog := openLuxCatalog{Success: true, Models: []openLuxModel{
		{Name: "text", Ratio: new(5.0), Groups: []string{"a", "b"}, Endpoints: []string{"openai", "anthropic"}},
		{Name: "other", Ratio: new(1.0)},
	}, Groups: map[string]string{"a": "A", "b": "B"}, Ratios: map[string]float64{"a": 0.1, "b": 0.2}}
	openLuxTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		encoded, err := common.Marshal(catalog)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	})
	_, _, original, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	catalog.Models[0].Endpoints = []string{"anthropic", "openai"}
	catalog.Models[0].Groups = []string{"b", "a"}
	catalog.Models[0].Description = "Updated model description"
	catalog.Groups["a"] = "Updated group label"
	catalog.Vendors = []openLuxVendor{{ID: 1, Name: "Updated vendor"}}
	slices.Reverse(catalog.Models)
	_, _, reordered, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	assert.Equal(t, original, reordered, "Presentation and set ordering must not invalidate a reviewed price")
	catalog.Models[1].Ratio = new(6.0)
	_, _, repriced, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	assert.NotEqual(t, original, repriced, "Actual model price changes must require a fresh preview")
	catalog.Models[1].Ratio = new(5.0)
	catalog.Ratios["a"] = 0.3
	_, _, regrouped, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	assert.NotEqual(t, original, regrouped, "Actual group rate changes must require a fresh preview")
	catalog.Ratios["a"] = 0.1
	catalog.Models[1].Endpoints = []string{"openai"}
	_, _, rerouted, err := fetchOpenLuxCatalog(context.Background())
	require.NoError(t, err)
	assert.NotEqual(t, original, rerouted, "Protocol availability changes must invalidate the reviewed contract")
}
