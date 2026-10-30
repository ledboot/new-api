package controller

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type channelCheckout struct {
	CryptoAmount string `json:"crypto_amount,omitempty"`
	Network      string `json:"network,omitempty"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	Kind         string `json:"kind"`
	CheckoutURL  string `json:"checkout_url,omitempty"`
	QRCode       string `json:"qr_code,omitempty"`
	OrderID      string `json:"order_id"`
	Currency     string `json:"currency"`
	Amount       string `json:"amount"`
	ProviderRef  string `json:"-"`
}

var paymentChannelHTTPClient = &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}

func validChannelCheckoutURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Host != "" && u.User == nil && (u.Scheme == "https" || u.Scheme == "http")
}

func channelEpaySignature(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for name, value := range params {
		if name != "sign" && name != "sign_type" && value != "" {
			keys = append(keys, name)
		}
	}
	slices.Sort(keys)
	values := make([]string, 0, len(keys))
	for _, name := range keys {
		values = append(values, name+"="+params[name])
	}
	sum := md5.Sum([]byte(strings.Join(values, "&") + key)) // Epay V1 wire protocol.
	return hex.EncodeToString(sum[:])
}

func channelGatewayRequest(c *gin.Context, endpoint, contentType string, body []byte, headers map[string]string, output any) error {
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", contentType)
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := paymentChannelHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("Payment gateway rejected checkout")
	}
	return common.DecodeJson(io.LimitReader(response.Body, 1<<20), output)
}

func createChannelCheckout(c *gin.Context, order *model.PaymentChannelOrder, email string) (*channelCheckout, error) {
	notify := channelNotifyURL(order.Provider, order.ChannelID)
	returnURL := paymentReturnPath("/wallet?show_history=true")
	money, _ := decimal.NewFromString(order.Money)
	result := &channelCheckout{Kind: "redirect"}
	switch order.Provider {
	case "epay", "502":
		params := map[string]string{"pid": order.Config.MerchantID, "type": order.Method.Type, "out_trade_no": order.TradeNo,
			"notify_url": notify, "return_url": returnURL, "name": "Wallet top-up", "money": order.Money, "clientip": c.ClientIP(), "device": "pc"}
		params["sign"] = channelEpaySignature(params, order.Config.APIKey)
		params["sign_type"] = "MD5"
		form := url.Values{}
		for key, value := range params {
			form.Set(key, value)
		}
		base := strings.TrimRight(order.Config.GatewayURL, "/")
		if order.Method.Interaction == "redirect" {
			result.CheckoutURL = base + "/submit.php?" + form.Encode()
		} else {
			var response struct {
				Code      int    `json:"code"`
				TradeNo   string `json:"trade_no"`
				PayURL    string `json:"payurl"`
				QRCode    string `json:"qrcode"`
				URLScheme string `json:"urlscheme"`
			}
			if err := channelGatewayRequest(c, base+"/mapi.php", "application/x-www-form-urlencoded", []byte(form.Encode()), nil, &response); err != nil {
				return nil, err
			}
			if response.Code != 1 || response.TradeNo == "" {
				return nil, errors.New("Payment gateway rejected checkout")
			}
			result.ProviderRef = response.TradeNo
			if response.QRCode != "" {
				result.Kind, result.QRCode = "qr", response.QRCode
			} else if response.URLScheme != "" {
				result.Kind, result.QRCode = "qr", response.URLScheme
			} else {
				result.CheckoutURL = response.PayURL
			}
		}
	case "bepusdt":
		params := map[string]string{"order_id": order.TradeNo, "amount": money.String(), "fiat": "USD", "trade_type": order.Method.Type, "notify_url": notify, "redirect_url": returnURL}
		params["signature"] = bepusdtSignature(params, order.Config.APIKey)
		// The existing integration and gateway protocol accept a numeric amount.
		payload := map[string]any{}
		for key, value := range params {
			payload[key] = value
		}
		payload["amount"] = json.Number(money.String())
		body, err := common.Marshal(payload)
		if err != nil {
			return nil, err
		}
		var response struct {
			StatusCode int `json:"status_code"`
			Data       struct {
				OrderID        string      `json:"order_id"`
				TradeID        string      `json:"trade_id"`
				PaymentURL     string      `json:"payment_url"`
				Fiat           string      `json:"fiat"`
				ActualAmount   json.Number `json:"actual_amount"`
				Token          string      `json:"token"`
				ExpirationTime int64       `json:"expiration_time"`
				Amount         json.Number `json:"amount"`
			} `json:"data"`
		}
		if err := channelGatewayRequest(c, strings.TrimRight(order.Config.GatewayURL, "/")+"/api/v1/order/create-transaction", "application/json", body, nil, &response); err != nil {
			return nil, err
		}
		actual, err := decimal.NewFromString(response.Data.Amount.String())
		if response.StatusCode != 200 || response.Data.OrderID != order.TradeNo || response.Data.TradeID == "" || response.Data.Fiat != "USD" || err != nil || !actual.Equal(money) {
			return nil, errors.New("Payment gateway rejected checkout")
		}
		result.CheckoutURL, result.ProviderRef = response.Data.PaymentURL, response.Data.TradeID
		if order.Method.Interaction == "qr" {
			actual, parseErr := decimal.NewFromString(response.Data.ActualAmount.String())
			if parseErr != nil || !actual.IsPositive() || response.Data.Token == "" || response.Data.ExpirationTime <= 0 || response.Data.ExpirationTime > 86400 {
				return nil, errors.New("Payment gateway did not return a valid transfer quote")
			}
			result.Kind, result.QRCode, result.CheckoutURL = "qr", response.Data.Token, ""
			result.CryptoAmount, result.Network = actual.String(), order.Method.Type
			result.ExpiresAt = time.Now().Unix() + response.Data.ExpirationTime
		}
	case "stripe":
		form := url.Values{"mode": {"payment"}, "client_reference_id": {order.TradeNo}, "success_url": {returnURL}, "cancel_url": {paymentReturnPath("/wallet")},
			"line_items[0][quantity]": {"1"}, "line_items[0][price_data][currency]": {strings.ToLower(order.Currency)},
			"line_items[0][price_data][unit_amount]": {money.Mul(decimal.NewFromInt(100)).StringFixed(0)}, "line_items[0][price_data][product_data][name]": {order.Method.Name}}
		if email != "" {
			form.Set("customer_email", email)
		}
		if order.Method.Type != "auto" {
			form.Set("payment_method_types[0]", order.Method.Type)
		}
		var response struct {
			ID  string `json:"id"`
			URL string `json:"url"`
		}
		if err := channelGatewayRequest(c, "https://api.stripe.com/v1/checkout/sessions", "application/x-www-form-urlencoded", []byte(form.Encode()),
			map[string]string{"Authorization": "Bearer " + order.Config.APIKey, "Idempotency-Key": order.TradeNo}, &response); err != nil {
			return nil, err
		}
		if response.ID == "" {
			return nil, errors.New("Payment gateway rejected checkout")
		}
		result.CheckoutURL, result.ProviderRef = response.URL, response.ID
	case "creem":
		body, err := common.Marshal(map[string]any{"product_id": order.Method.ProductID, "request_id": order.TradeNo, "units": 1,
			"success_url": returnURL, "customer": map[string]string{"email": email}})
		if err != nil {
			return nil, err
		}
		endpoint := "https://api.creem.io/v1/checkouts"
		if order.Config.TestMode {
			endpoint = "https://test-api.creem.io/v1/checkouts"
		}
		var response struct {
			ID          string `json:"id"`
			CheckoutURL string `json:"checkout_url"`
		}
		if err := channelGatewayRequest(c, endpoint, "application/json", body, map[string]string{"x-api-key": order.Config.APIKey}, &response); err != nil {
			return nil, err
		}
		if response.ID == "" {
			return nil, errors.New("Payment gateway rejected checkout")
		}
		result.CheckoutURL, result.ProviderRef = response.CheckoutURL, response.ID
	default:
		return nil, errors.New("Unsupported payment provider")
	}
	if result.Kind == "qr" {
		if len(result.QRCode) == 0 || len(result.QRCode) > 4096 {
			return nil, errors.New("Invalid payment QR code")
		}
	} else if !validChannelCheckoutURL(result.CheckoutURL) {
		return nil, errors.New("Invalid payment checkout URL")
	}
	return result, nil
}
