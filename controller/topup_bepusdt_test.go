package controller

import (
	"bytes"
	"fmt"
	"maps"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func bepusdtTestConfig(t *testing.T) {
	t.Helper()
	oldURL, oldToken, oldTrade := setting.BepusdtApiURL, setting.BepusdtApiToken, setting.BepusdtTradeType
	oldPrice, oldMin := setting.BepusdtUnitPrice, setting.BepusdtMinTopUp
	oldCompliance := *operation_setting.GetPaymentSetting()
	oldDisplay := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldQuota := common.QuotaPerUnit
	oldRatios := common.TopupGroupRatio2JSONString()
	t.Cleanup(func() {
		setting.BepusdtApiURL, setting.BepusdtApiToken, setting.BepusdtTradeType = oldURL, oldToken, oldTrade
		setting.BepusdtUnitPrice, setting.BepusdtMinTopUp = oldPrice, oldMin
		*operation_setting.GetPaymentSetting() = oldCompliance
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplay
		common.QuotaPerUnit = oldQuota
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(oldRatios))
	})
	setting.BepusdtApiURL, setting.BepusdtApiToken, setting.BepusdtTradeType = "https://pay.example.com", "test-payment-token", "usdt.trc20"
	setting.BepusdtUnitPrice, setting.BepusdtMinTopUp = 1.2, 1
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{10: 0.8}
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	common.QuotaPerUnit = 500000
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1,"vip":0.5}`))
}

func bepusdtTestRequest(t *testing.T, path string, body any, userID int) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := common.Marshal(body)
	require.NoError(t, err)
	r := gin.New()
	r.POST(path, func(c *gin.Context) { c.Set("id", userID) }, func(c *gin.Context) {
		if strings.HasSuffix(path, "/notify") {
			BepusdtNotify(c)
		} else {
			RequestBepusdtPay(c)
		}
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestBepusdtPricingAndSignature(t *testing.T) {
	bepusdtTestConfig(t)
	params := map[string]string{"order_id": "20220201030210321", "amount": "42", "notify_url": "http://example.com/notify", "redirect_url": "http://example.com/redirect"}
	assert.Equal(t, "1cd4b52df5587cfb1968b0c0c6e156cd", bepusdtSignature(params, "epusdt_password_xasddawqe"))
	params["signature"], params["empty"] = "ignored", ""
	assert.Equal(t, "1cd4b52df5587cfb1968b0c0c6e156cd", bepusdtSignature(params, "epusdt_password_xasddawqe"))
	money, err := getBepusdtPayMoney(10, "vip")
	require.NoError(t, err)
	assert.Equal(t, "4.80", money.StringFixed(2))
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	money, err = getBepusdtPayMoney(5000000, "vip")
	require.NoError(t, err)
	assert.Equal(t, "6.00", money.StringFixed(2))
	_, err = getBepusdtPayMoney(499999, "default")
	require.Error(t, err)
	setting.BepusdtUnitPrice = math.Inf(1)
	_, err = getBepusdtPayMoney(5000000, "default")
	require.Error(t, err)
}

func TestBepusdtCheckoutAndSettlementDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Log{}))
			bepusdtTestConfig(t)
			user := model.User{Username: "bepusdt-buyer", Group: "default", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&user).Error)
			require.NoError(t, model.UpdateOptionsBulk(map[string]string{
				"BepusdtApiURL": setting.BepusdtApiURL, "BepusdtApiToken": setting.BepusdtApiToken,
				"BepusdtTradeType": "usdt.trc20", "BepusdtUnitPrice": "1.2", "BepusdtMinTopUp": "1",
			}))
			options := modelManagementRequest(t, GetOptions, http.MethodGet, "/api/option/", nil, nil)
			assert.NotContains(t, options.Body.String(), setting.BepusdtApiToken)
			assert.NotContains(t, options.Body.String(), "BepusdtApiToken")
			for key, value := range map[string]string{"BepusdtApiURL": "javascript:alert(1)", "BepusdtUnitPrice": "NaN", "BepusdtMinTopUp": "0"} {
				require.Error(t, model.UpdateOptionsBulk(map[string]string{key: value}))
			}
			var gatewayOrder string
			badGatewayCurrency := false
			gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/api/v1/order/create-transaction", r.URL.Path)
				var request struct {
					OrderID     string  `json:"order_id"`
					Amount      float64 `json:"amount"`
					Fiat        string  `json:"fiat"`
					TradeType   string  `json:"trade_type"`
					NotifyURL   string  `json:"notify_url"`
					RedirectURL string  `json:"redirect_url"`
					Signature   string  `json:"signature"`
				}
				if !assert.NoError(t, common.DecodeJson(r.Body, &request)) {
					return
				}
				assert.Equal(t, "USD", request.Fiat)
				assert.Equal(t, "usdt.trc20", request.TradeType)
				assert.Equal(t, 9.6, request.Amount)
				assert.True(t, strings.HasSuffix(request.NotifyURL, "/api/bepusdt/notify"))
				expected := bepusdtSignature(map[string]string{"order_id": request.OrderID, "amount": "9.6", "fiat": "USD", "trade_type": "usdt.trc20", "notify_url": request.NotifyURL, "redirect_url": request.RedirectURL}, setting.BepusdtApiToken)
				assert.Equal(t, expected, request.Signature)
				gatewayOrder = request.OrderID
				fiat := "USD"
				if badGatewayCurrency {
					fiat = "CNY"
				}
				_, _ = fmt.Fprintf(w, `{"status_code":200,"data":{"order_id":%q,"trade_id":"gateway-1","fiat":%q,"amount":"9.6","payment_url":"https://pay.example.com/checkout/gateway-1"}}`, request.OrderID, fiat)
			}))
			defer gateway.Close()
			setting.BepusdtApiURL = gateway.URL
			info := httptest.NewRecorder()
			infoContext, _ := gin.CreateTestContext(info)
			infoContext.Set("id", user.Id)
			GetTopUpInfo(infoContext)
			assert.Contains(t, info.Body.String(), `"enable_bepusdt_topup":true`)
			assert.NotContains(t, info.Body.String(), setting.BepusdtApiToken)
			quote := bepusdtTestRequest(t, "/api/user/bepusdt/amount", AmountRequest{Amount: 10}, user.Id)
			assert.Contains(t, quote.Body.String(), `"data":"9.60"`)
			badGatewayCurrency = true
			badCheckout := bepusdtTestRequest(t, "/api/user/bepusdt/pay", AmountRequest{Amount: 10}, user.Id)
			assert.Contains(t, badCheckout.Body.String(), `"message":"error"`)
			assert.NotContains(t, badCheckout.Body.String(), "checkout_url")
			badGatewayCurrency = false
			checkout := bepusdtTestRequest(t, "/api/user/bepusdt/pay", AmountRequest{Amount: 10}, user.Id)
			require.Contains(t, checkout.Body.String(), `"checkout_url":"https://pay.example.com/checkout/gateway-1"`)
			require.NotEmpty(t, gatewayOrder)
			order := model.GetTopUpByTradeNo(gatewayOrder)
			require.NotNil(t, order)
			assert.Equal(t, int64(10), order.Amount)
			assert.Equal(t, 9.6, order.Money)
			callback := map[string]string{"order_id": gatewayOrder, "trade_id": "gateway-1", "amount": "9.6", "actual_amount": "9.601", "status": "2", "token": "wallet", "block_transaction_id": "chain-transaction"}
			for _, tc := range []struct{ name, key, value string }{
				{"bad signature", "signature", "invalid"}, {"wrong amount", "amount", "9.59"},
				{"wrong currency", "fiat", "CNY"}, {"unpaid", "status", "1"},
				{"no crypto paid", "actual_amount", "0"}, {"missing transaction", "block_transaction_id", ""},
				{"unknown order", "order_id", "nonexistent"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					params := maps.Clone(callback)
					params[tc.key] = tc.value
					if tc.key != "signature" {
						params["signature"] = bepusdtSignature(params, setting.BepusdtApiToken)
					}
					w := bepusdtTestRequest(t, "/api/bepusdt/notify", params, 0)
					if tc.name != "unpaid" {
						assert.NotEqual(t, http.StatusOK, w.Code)
					}
					var current model.User
					require.NoError(t, db.First(&current, user.Id).Error)
					assert.Zero(t, current.Quota)
				})
			}
			// A foreign provider's order must never be credited through this callback.
			require.NoError(t, db.Model(order).Update("payment_provider", model.PaymentProviderEpay).Error)
			callback["signature"] = bepusdtSignature(callback, setting.BepusdtApiToken)
			assert.Equal(t, http.StatusBadRequest, bepusdtTestRequest(t, "/api/bepusdt/notify", callback, 0).Code)
			require.NoError(t, db.Model(order).Update("payment_provider", model.PaymentProviderBepusdt).Error)
			require.NoError(t, db.Model(order).Update("status", common.TopUpStatusExpired).Error)
			assert.Equal(t, http.StatusBadRequest, bepusdtTestRequest(t, "/api/bepusdt/notify", callback, 0).Code)
			require.NoError(t, db.Model(order).Update("status", common.TopUpStatusPending).Error)
			// Persisted credit and price survive subsequent admin pricing changes.
			setting.BepusdtUnitPrice = 3
			setting.BepusdtApiURL = ""
			operation_setting.GetPaymentSetting().ComplianceConfirmed = false
			numericCallback := make(map[string]any, len(callback))
			for key, value := range callback {
				numericCallback[key] = value
			}
			numericCallback["amount"], numericCallback["actual_amount"], numericCallback["status"] = 9.6, 9.601, 2
			require.Equal(t, "success", bepusdtTestRequest(t, "/api/bepusdt/notify", numericCallback, 0).Body.String())
			for range 2 {
				w := bepusdtTestRequest(t, "/api/bepusdt/notify", callback, 0)
				require.Equal(t, "success", w.Body.String())
			}
			var current model.User
			require.NoError(t, db.First(&current, user.Id).Error)
			assert.Equal(t, 5000000, current.Quota)
			assert.Equal(t, common.TopUpStatusSuccess, model.GetTopUpByTradeNo(gatewayOrder).Status)
			var logs int64
			require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("user_id = ? AND type = ?", user.Id, model.LogTypeTopup).Count(&logs).Error)
			assert.EqualValues(t, 1, logs)
			// Exercise a real race on engines with row-level locks. SQLite rejects
			// conflicting writers; callbacks can safely retry the failed attempt.
			order.Id = 0
			order.TradeNo = "bepusdt-concurrent"
			order.Status, order.CompleteTime = common.TopUpStatusPending, 0
			require.NoError(t, db.Create(order).Error)
			var wg sync.WaitGroup
			errs := make(chan error, 2)
			for range 2 {
				wg.Go(func() { errs <- model.RechargeBepusdt(order.TradeNo, decimal.RequireFromString("9.6"), "127.0.0.1") })
			}
			wg.Wait()
			close(errs)
			for err := range errs {
				if dialect.kind != "sqlite" {
					assert.NoError(t, err)
				}
			}
			require.NoError(t, model.RechargeBepusdt(order.TradeNo, decimal.RequireFromString("9.6"), "127.0.0.1"))
			require.NoError(t, db.First(&current, user.Id).Error)
			assert.Equal(t, 10000000, current.Quota)
			// Wallet capacity failure must roll back the paid-order transition.
			order.Id, order.TradeNo, order.Status = 0, "bepusdt-overflow", common.TopUpStatusPending
			require.NoError(t, db.Create(order).Error)
			require.NoError(t, db.Model(&user).Update("quota", common.MaxWalletQuota).Error)
			require.Error(t, model.RechargeBepusdt(order.TradeNo, decimal.RequireFromString("9.6"), "127.0.0.1"))
			assert.Equal(t, common.TopUpStatusPending, model.GetTopUpByTradeNo(order.TradeNo).Status)
		})
	}
}
