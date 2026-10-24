package controller

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
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
	expression, err := openLuxTokenExpression(item, 2, 0.1, 1.2)
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
	expression, err = openLuxTokenExpression(item, 2, 0.1, 1.2)
	require.NoError(t, err)
	cost, _, err := billingexpr.RunExpr(expression, billingexpr.TokenParams{CR: 100, CC: 10, CC1h: 20, Len: 300000})
	require.NoError(t, err)
	assert.Zero(t, cost, "explicit zero cache prices remain free")
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
			_, err := openLuxTokenExpression(item, tc.unit, tc.group, tc.markup)
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
