package controller

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestPaymentChannelRejectsInvalidFee(t *testing.T) {
	for name, method := range map[string]model.PaymentChannelMethod{
		"percent over 100": {ID: "alipay", Name: "Alipay", Type: "alipay", Interaction: "redirect", UnitPrice: "1", MinTopup: 1, FeePercent: "101", Enabled: true},
		"negative fixed":   {ID: "alipay", Name: "Alipay", Type: "alipay", Interaction: "redirect", UnitPrice: "1", MinTopup: 1, FeeFixed: "-1", Enabled: true},
		"unparsable":       {ID: "alipay", Name: "Alipay", Type: "alipay", Interaction: "redirect", UnitPrice: "1", MinTopup: 1, FeePercent: "abc", Enabled: true},
	} {
		t.Run(name, func(t *testing.T) {
			channel := model.PaymentChannel{Name: "502 merchant", Provider: "502", Currency: "CNY", Enabled: true,
				Config:  model.PaymentChannelConfig{GatewayURL: "https://pay.example", MerchantID: "1001", APIKey: "secret"},
				Methods: []model.PaymentChannelMethod{method}}
			require.Error(t, model.ValidatePaymentChannel(&channel))
		})
	}
	zero := model.PaymentChannel{Name: "502 merchant", Provider: "502", Currency: "CNY", Enabled: true,
		Config:  model.PaymentChannelConfig{GatewayURL: "https://pay.example", MerchantID: "1001", APIKey: "secret"},
		Methods: []model.PaymentChannelMethod{{ID: "alipay", Name: "Alipay", Type: "alipay", Interaction: "redirect", UnitPrice: "1", MinTopup: 1, Enabled: true}}}
	require.NoError(t, model.ValidatePaymentChannel(&zero))
}

func TestPaymentChannelRejectsUnsupportedInteraction(t *testing.T) {
	channel := model.PaymentChannel{
		Name: "Cards", Provider: "stripe", Currency: "USD", Enabled: true,
		Config:  model.PaymentChannelConfig{APIKey: "sk_test", WebhookSecret: "whsec_test"},
		Methods: []model.PaymentChannelMethod{{ID: "card", Name: "Card", Type: "card", Interaction: "qr", UnitPrice: "1", MinTopup: 1, Enabled: true}},
	}
	require.Error(t, model.ValidatePaymentChannel(&channel))
}

func paymentChannelTestRequest(t *testing.T, path string, userID int, body any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := common.Marshal(body)
	require.NoError(t, err)
	r := gin.New()
	r.POST(path, func(c *gin.Context) { c.Set("id", userID); RequestChannelPayment(c) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, bytes.NewReader(data)))
	return w
}

func TestPaymentChannelsDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env)
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			bepusdtTestConfig(t)
			require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Log{}))
			legacy := model.TopUp{TradeNo: "before-channel-migration", Amount: 10, Money: 10, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(&legacy).Error)
			// New tables must be additive and migration must be repeatable against an
			// existing deployment with historical recharge orders.
			require.NoError(t, db.AutoMigrate(&model.PaymentChannel{}, &model.PaymentChannelOrder{}))
			user := model.User{Username: "channel-buyer", Group: "default", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&user).Error)
			channel := model.PaymentChannel{Name: "502 merchant", Provider: "502", Currency: "CNY", Enabled: true,
				Config: model.PaymentChannelConfig{GatewayURL: "https://pay.example/xpay/epay", MerchantID: "1001", APIKey: "original-secret"},
				Methods: []model.PaymentChannelMethod{
					{ID: "alipay", Name: "Alipay", Type: "alipay", Interaction: "redirect", UnitPrice: "7", MinTopup: 1, Enabled: true},
					{ID: "wxpay", Name: "WeChat", Type: "wxpay", Interaction: "qr", UnitPrice: "7", MinTopup: 1, Enabled: true},
				}}
			require.NoError(t, model.SavePaymentChannel(&channel))
			stale := channel
			require.NoError(t, db.AutoMigrate(&model.PaymentChannel{}, &model.PaymentChannelOrder{}))
			stored, err := model.GetPaymentChannel(channel.ID)
			require.NoError(t, err)
			assert.Equal(t, channel.Config, stored.Config)
			require.Len(t, stored.Methods, 2)
			assert.Equal(t, "wxpay", stored.Methods[1].Type)
			assert.Equal(t, int64(10), model.GetTopUpByTradeNo(legacy.TradeNo).Amount)
			admin := modelManagementRequest(t, GetPaymentChannels, http.MethodGet, "/", nil, nil)
			assert.NotContains(t, admin.Body.String(), "original-secret")
			wallet, _, err := channelWalletMethods("default")
			require.NoError(t, err)
			require.Len(t, wallet, 2)
			assert.NotContains(t, fmt.Sprint(wallet), "original-secret")
			// A single write updates the channel and all methods, retaining unchanged
			// secret values while rejecting stale edits.
			channel.Config.APIKey = "rotated-secret"
			require.NoError(t, model.SavePaymentChannel(&channel))
			require.Error(t, model.SavePaymentChannel(&stale))
			checkout := paymentChannelTestRequest(t, "/api/user/payment/checkout", user.Id, EpayRequest{Amount: 10, PaymentMethod: channelPaymentKey(channel.ID, "alipay")})
			var response struct {
				Message string          `json:"message"`
				Data    channelCheckout `json:"data"`
			}
			require.NoError(t, common.Unmarshal(checkout.Body.Bytes(), &response))
			require.Equal(t, "success", response.Message, checkout.Body.String())
			assert.Equal(t, "CNY", response.Data.Currency)
			assert.Equal(t, "56.00", response.Data.Amount) // 10 * 7 * configured preset discount 0.8
			link, err := url.Parse(response.Data.CheckoutURL)
			require.NoError(t, err)
			assert.Equal(t, "alipay", link.Query().Get("type"))
			order, err := model.GetPaymentChannelOrder(response.Data.OrderID)
			require.NoError(t, err)
			assert.Equal(t, "rotated-secret", order.Config.APIKey)
			require.Equal(t, 5000000, order.CreditedQuota)
			// Deleting or rotating a channel must not prevent an old payment settling.
			require.NoError(t, db.Model(&model.PaymentChannel{}).Where("id = ?", channel.ID).Updates(map[string]any{"archived": true, "enabled": false, "config": `{}`}).Error)
			params := map[string]string{"pid": "1001", "out_trade_no": order.TradeNo, "trade_no": "external-1", "type": "alipay", "money": order.Money, "trade_status": "TRADE_SUCCESS"}
			notify := func(values map[string]string, channelID int) *httptest.ResponseRecorder {
				r := gin.New()
				r.GET("/notify/:provider/:id", PaymentChannelNotify)
				query := url.Values{}
				for key, value := range values {
					query.Set(key, value)
				}
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/notify/502/%d?%s", channelID, query.Encode()), nil))
				return w
			}
			params["sign"] = "invalid"
			assert.Equal(t, http.StatusUnauthorized, notify(params, channel.ID).Code)
			params["money"] = "0.01"
			params["sign"] = channelEpaySignature(params, order.Config.APIKey)
			assert.Equal(t, http.StatusBadRequest, notify(params, channel.ID).Code)
			params["money"] = order.Money
			params["sign"] = channelEpaySignature(params, order.Config.APIKey)
			assert.Equal(t, http.StatusBadRequest, notify(params, channel.ID+1).Code)
			assert.Equal(t, http.StatusOK, notify(params, channel.ID).Code)
			assert.Equal(t, http.StatusOK, notify(params, channel.ID).Code)
			var buyer model.User
			require.NoError(t, db.First(&buyer, user.Id).Error)
			assert.Equal(t, 5000000, buyer.Quota)
			assert.Equal(t, common.TopUpStatusSuccess, model.GetTopUpByTradeNo(order.TradeNo).Status)
			// Import is idempotent, even when all previously imported rows are archived.
			require.NoError(t, model.ImportLegacyPaymentChannels(nil))
			require.NoError(t, model.ImportLegacyPaymentChannels(nil))
		})
	}
}

func TestPaymentChannelBepusdtMethodsAndCreemQuote(t *testing.T) {
	bepusdtTestConfig(t)
	for _, network := range []string{"usdt.bep20", "usdt.trc20"} {
		channel := model.PaymentChannel{Name: "USDT", Provider: "bepusdt", Currency: "USD", Config: model.PaymentChannelConfig{GatewayURL: "https://pay.example", APIKey: "token"}, Methods: []model.PaymentChannelMethod{
			{ID: "network", Name: network, Type: network, Interaction: "redirect", UnitPrice: "1", MinTopup: 1, Enabled: true},
		}}
		require.NoError(t, model.ValidatePaymentChannel(&channel))
		money, quota, err := quoteChannelPayment(&channel, &channel.Methods[0], 10, "default")
		require.NoError(t, err)
		assert.Equal(t, "8.00", money.StringFixed(2))
		assert.Equal(t, 5000000, quota)
	}
	feeChannel := model.PaymentChannel{Provider: "bepusdt", Currency: "USD"}
	feeMethod := model.PaymentChannelMethod{UnitPrice: "0.8", MinTopup: 1, FeePercent: "2.5", FeeFixed: "0.3"}
	feeMoney, feeQuota, feeErr := quoteChannelPayment(&feeChannel, &feeMethod, 10, "default")
	require.NoError(t, feeErr)
	// Base 10 x 0.8 x group ratio 0.8 = 6.40, then 2.5% + 0.30 fixed = 6.86.
	assert.Equal(t, "6.86", feeMoney.StringFixed(2))
	assert.Equal(t, 5000000, feeQuota)

	channel := model.PaymentChannel{Provider: "creem"}
	method := model.PaymentChannelMethod{UnitPrice: "9.99", CreditAmount: "10.5", ProductID: "prod_one"}
	money, quota, err := quoteChannelPayment(&channel, &method, 9999, "default")
	require.NoError(t, err)
	assert.Equal(t, "9.99", money.StringFixed(2))
	assert.Equal(t, 5250000, quota)
	importedStripe := model.PaymentChannel{Provider: "stripe", LegacyProvider: "stripe"}
	stripeMethod := model.PaymentChannelMethod{UnitPrice: "1", MinTopup: 1}
	money, quota, err = quoteChannelPayment(&importedStripe, &stripeMethod, 10, "vip")
	require.NoError(t, err)
	assert.Equal(t, "4.00", money.StringFixed(2))
	assert.Equal(t, 2500000, quota)
}

type channelRoundTripFunc func(*http.Request) (*http.Response, error)

func (f channelRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPaymentChannelProviderCheckout(t *testing.T) {
	previous := paymentChannelHTTPClient
	t.Cleanup(func() { paymentChannelHTTPClient = previous })
	for _, provider := range []string{"502", "bepusdt", "stripe", "creem"} {
		t.Run(provider, func(t *testing.T) {
			order := model.PaymentChannelOrder{TradeNo: "PC-one", ChannelID: 3, Provider: provider, Currency: "USD", Money: "12.00", Config: model.PaymentChannelConfig{APIKey: "channel-secret", MerchantID: "1001"}, Method: model.PaymentChannelMethod{Name: "Pay", Type: "card", Interaction: "redirect", ProductID: "prod_one"}}
			gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch provider {
				case "502":
					assert.Equal(t, "/mapi.php", r.URL.Path)
					require.NoError(t, r.ParseForm())
					assert.Equal(t, "wxpay", r.PostForm.Get("type"))
					assert.Equal(t, "1001", r.PostForm.Get("pid"))
					params := map[string]string{}
					for k, v := range r.PostForm {
						params[k] = v[0]
					}
					assert.Equal(t, channelEpaySignature(params, "channel-secret"), params["sign"])
					_, _ = w.Write([]byte(`{"code":1,"trade_no":"upstream-1","qrcode":"weixin://wxpay/test"}`))
				case "bepusdt":
					assert.Equal(t, "/api/v1/order/create-transaction", r.URL.Path)
					var request map[string]any
					require.NoError(t, common.DecodeJson(r.Body, &request))
					assert.Equal(t, "usdt.bep20", request["trade_type"])
					assert.Equal(t, "USD", request["fiat"])
					_, _ = w.Write([]byte(`{"status_code":200,"data":{"order_id":"PC-one","trade_id":"upstream-1","amount":12,"actual_amount":"12.123","token":"0xwallet","expiration_time":1200,"fiat":"USD","payment_url":"https://pay.example/one"}}`))
				case "stripe":
					assert.Equal(t, "/v1/checkout/sessions", r.URL.Path)
					assert.Equal(t, "Bearer channel-secret", r.Header.Get("Authorization"))
					require.NoError(t, r.ParseForm())
					assert.Equal(t, "1200", r.PostForm.Get("line_items[0][price_data][unit_amount]"))
					assert.Equal(t, "PC-one", r.PostForm.Get("client_reference_id"))
					_, _ = w.Write([]byte(`{"id":"upstream-1","url":"https://checkout.stripe.com/test"}`))
				case "creem":
					assert.Equal(t, "/v1/checkouts", r.URL.Path)
					assert.Equal(t, "channel-secret", r.Header.Get("x-api-key"))
					var request map[string]any
					require.NoError(t, common.DecodeJson(r.Body, &request))
					assert.Equal(t, "prod_one", request["product_id"])
					assert.Equal(t, "PC-one", request["request_id"])
					_, _ = w.Write([]byte(`{"id":"upstream-1","checkout_url":"https://creem.io/test"}`))
				}
			}))
			defer gateway.Close()
			gatewayURL, err := url.Parse(gateway.URL)
			require.NoError(t, err)
			paymentChannelHTTPClient = &http.Client{Transport: channelRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				r.URL.Scheme, r.URL.Host = gatewayURL.Scheme, gatewayURL.Host
				return http.DefaultTransport.RoundTrip(r)
			})}
			order.Config.GatewayURL = gateway.URL
			if provider == "502" {
				order.Currency = "CNY"
				order.Method.Type = "wxpay"
				order.Method.Interaction = "qr"
			}
			if provider == "bepusdt" {
				order.Method.Type = "usdt.bep20"
			}
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/checkout", nil)
			result, err := createChannelCheckout(c, &order, "buyer@example.com")
			require.NoError(t, err)
			assert.Equal(t, "upstream-1", result.ProviderRef)
			if provider == "502" {
				assert.Equal(t, "qr", result.Kind)
				assert.Equal(t, "weixin://wxpay/test", result.QRCode)
			} else {
				assert.Equal(t, "redirect", result.Kind)
				assert.True(t, validChannelCheckoutURL(result.CheckoutURL))
			}
			if provider == "bepusdt" {
				order.Method.Interaction = "qr"
				native, err := createChannelCheckout(c, &order, "buyer@example.com")
				require.NoError(t, err)
				assert.Equal(t, "qr", native.Kind)
				assert.Equal(t, "0xwallet", native.QRCode)
				assert.Equal(t, "12.123", native.CryptoAmount)
				assert.Equal(t, "usdt.bep20", native.Network)
				assert.Greater(t, native.ExpiresAt, time.Now().Unix())
			}
		})
	}
}

func TestPaymentChannelSignedWebhooks(t *testing.T) {
	for _, provider := range []string{"stripe", "creem", "bepusdt"} {
		t.Run(provider, func(t *testing.T) {
			db := modelManagementDB(t, "sqlite", "")
			bepusdtTestConfig(t)
			require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Log{}, &model.PaymentChannel{}, &model.PaymentChannelOrder{}))
			user := model.User{Username: "webhook-buyer", Group: "default", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&user).Error)
			order := model.PaymentChannelOrder{TradeNo: "PC-signed", ChannelID: 2, UserID: user.Id, Provider: provider, Currency: "USD", Money: "12.00", CreditedQuota: 5250000, WalletAmount: "10.5", ProviderRef: "upstream-1", Config: model.PaymentChannelConfig{APIKey: "frozen-api-key", WebhookSecret: "frozen-webhook-secret"}, Method: model.PaymentChannelMethod{ProductID: "prod_one", Name: "USDT"}}
			topup := model.TopUp{TradeNo: order.TradeNo, UserId: user.Id, Amount: 10, Money: 12, PaymentProvider: model.PaymentProviderChannel, Status: common.TopUpStatusPending}
			require.NoError(t, model.CreatePaymentChannelOrder(&order, &topup))
			body := map[string]any{}
			switch provider {
			case "stripe":
				body = map[string]any{"id": "evt_one", "type": "checkout.session.completed", "data": map[string]any{"object": map[string]any{"id": "upstream-1", "client_reference_id": order.TradeNo, "status": "complete", "payment_status": "paid", "amount_total": 1200, "currency": "usd"}}}
			case "creem":
				body = map[string]any{"id": "evt_one", "eventType": "checkout.completed", "object": map[string]any{"id": "upstream-1", "request_id": order.TradeNo, "product": map[string]any{"id": "prod_one"}, "order": map[string]any{"status": "paid", "type": "onetime", "amount_paid": 1200, "currency": "usd"}}}
			case "bepusdt":
				body = map[string]any{"order_id": order.TradeNo, "trade_id": "upstream-1", "amount": "12", "actual_amount": "12.1", "fiat": "USD", "block_transaction_id": "tx-one", "status": 2}
			}
			send := func(valid bool) *httptest.ResponseRecorder {
				if provider == "bepusdt" {
					params := map[string]string{}
					for k, v := range body {
						if k != "signature" {
							params[k] = fmt.Sprint(v)
						}
					}
					body["signature"] = bepusdtSignature(params, order.Config.APIKey)
					if !valid {
						body["signature"] = "invalid"
					}
				}
				raw, err := common.Marshal(body)
				require.NoError(t, err)
				request := httptest.NewRequest(http.MethodPost, "/notify/"+provider+"/2", bytes.NewReader(raw))
				request.Header.Set("Content-Type", "application/json")
				signature := "invalid"
				if valid {
					if provider == "stripe" {
						timestamp := strconv.FormatInt(time.Now().Unix(), 10)
						mac := hmac.New(sha256.New, []byte(order.Config.WebhookSecret))
						_, _ = mac.Write(append([]byte(timestamp+"."), raw...))
						signature = "t=" + timestamp + ",v1=" + hex.EncodeToString(mac.Sum(nil))
					} else {
						signature = generateCreemSignature(string(raw), order.Config.WebhookSecret)
					}
				}
				if provider == "stripe" {
					request.Header.Set("Stripe-Signature", signature)
				} else if provider == "creem" {
					request.Header.Set(CreemSignatureHeader, signature)
				}
				router := gin.New()
				router.POST("/notify/:provider/:id", PaymentChannelNotify)
				w := httptest.NewRecorder()
				router.ServeHTTP(w, request)
				return w
			}
			assert.Equal(t, http.StatusUnauthorized, send(false).Code)
			assert.Equal(t, http.StatusOK, send(true).Code)
			assert.Equal(t, http.StatusOK, send(true).Code)
			var buyer model.User
			require.NoError(t, db.First(&buyer, user.Id).Error)
			assert.Equal(t, 5250000, buyer.Quota)
			records := []*model.TopUp{model.GetTopUpByTradeNo(order.TradeNo)}
			require.NoError(t, model.AttachPaymentChannelDetails(records))
			assert.Equal(t, "10.5", records[0].WalletAmount)
			assert.Equal(t, "USD", records[0].PaymentCurrency)
			assert.NotContains(t, common.GetJsonString(records), order.Config.APIKey)
			assert.NotContains(t, common.GetJsonString(records), order.Config.WebhookSecret)
		})
	}
}
