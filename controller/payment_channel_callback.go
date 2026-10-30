package controller

import (
	"crypto/subtle"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/webhook"
)

func PaymentChannelNotify(c *gin.Context) {
	provider := c.Param("provider")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
	var tradeNo, currency, amount, providerRef string
	var raw []byte
	params := map[string]string{}
	var stripeEvent stripe.Event
	var creemEvent CreemWebhookEvent
	switch provider {
	case "epay", "502":
		if err := c.Request.ParseForm(); err != nil {
			c.String(http.StatusBadRequest, "fail")
			return
		}
		for key, values := range c.Request.Form {
			if len(values) != 1 {
				c.String(http.StatusBadRequest, "fail")
				return
			}
			params[key] = values[0]
		}
		tradeNo, currency, amount, providerRef = params["out_trade_no"], "CNY", params["money"], params["trade_no"]
	case "bepusdt":
		var body map[string]any
		if err := common.DecodeJson(c.Request.Body, &body); err != nil {
			c.String(http.StatusBadRequest, "fail")
			return
		}
		for key, value := range body {
			switch v := value.(type) {
			case string:
				params[key] = v
			case float64:
				params[key] = strconv.FormatFloat(v, 'f', -1, 64)
			case nil:
			default:
				c.String(http.StatusBadRequest, "fail")
				return
			}
		}
		tradeNo, currency, amount, providerRef = params["order_id"], "USD", params["amount"], params["trade_id"]
	case "stripe", "creem":
		raw, err = io.ReadAll(c.Request.Body)
		if err != nil {
			c.String(http.StatusBadRequest, "fail")
			return
		}
		if provider == "stripe" {
			if common.Unmarshal(raw, &stripeEvent) != nil || stripeEvent.Data == nil {
				c.String(http.StatusBadRequest, "fail")
				return
			}
			if stripeEvent.Type != stripe.EventTypeCheckoutSessionCompleted && stripeEvent.Type != stripe.EventTypeCheckoutSessionAsyncPaymentSucceeded {
				c.Status(http.StatusOK)
				return
			}
			tradeNo = stripeEvent.GetObjectValue("client_reference_id")
		} else {
			if common.Unmarshal(raw, &creemEvent) != nil {
				c.String(http.StatusBadRequest, "fail")
				return
			}
			if creemEvent.EventType != "checkout.completed" {
				c.Status(http.StatusOK)
				return
			}
			tradeNo = creemEvent.Object.RequestId
		}
	default:
		c.String(http.StatusNotFound, "fail")
		return
	}
	order, err := model.GetPaymentChannelOrder(tradeNo)
	if err != nil || order.ChannelID != id || order.Provider != provider {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	switch provider {
	case "epay", "502":
		expected := channelEpaySignature(params, order.Config.APIKey)
		if params["pid"] != order.Config.MerchantID || subtle.ConstantTimeCompare([]byte(params["sign"]), []byte(expected)) != 1 {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
		if params["trade_status"] != "TRADE_SUCCESS" {
			c.String(http.StatusOK, "success")
			return
		}
		if params["type"] != order.Method.Type {
			c.String(http.StatusBadRequest, "fail")
			return
		}
	case "bepusdt":
		expected := bepusdtSignature(params, order.Config.APIKey)
		if subtle.ConstantTimeCompare([]byte(params["signature"]), []byte(expected)) != 1 {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
		if params["status"] != "2" {
			c.String(http.StatusOK, "success")
			return
		}
		actual, actualErr := decimal.NewFromString(params["actual_amount"])
		if actualErr != nil || !actual.IsPositive() || params["block_transaction_id"] == "" || (params["fiat"] != "" && params["fiat"] != "USD") {
			c.String(http.StatusBadRequest, "fail")
			return
		}
	case "stripe":
		verified, verifyErr := webhook.ConstructEventWithOptions(raw, c.GetHeader("Stripe-Signature"), order.Config.WebhookSecret, webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
		if verifyErr != nil {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
		if verified.GetObjectValue("payment_status") != "paid" || verified.GetObjectValue("status") != "complete" {
			c.Status(http.StatusOK)
			return
		}
		cents, parseErr := decimal.NewFromString(verified.GetObjectValue("amount_total"))
		if parseErr != nil {
			c.String(http.StatusBadRequest, "fail")
			return
		}
		amount, currency, providerRef = cents.Div(decimal.NewFromInt(100)).String(), strings.ToUpper(verified.GetObjectValue("currency")), verified.GetObjectValue("id")
	case "creem":
		if !verifyCreemSignature(string(raw), c.GetHeader(CreemSignatureHeader), order.Config.WebhookSecret) {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
		if creemEvent.Object.Order.Status != "paid" || creemEvent.Object.Order.Type != "onetime" {
			c.Status(http.StatusOK)
			return
		}
		if creemEvent.Object.Product.Id != order.Method.ProductID {
			c.String(http.StatusBadRequest, "fail")
			return
		}
		amount = decimal.NewFromInt(int64(creemEvent.Object.Order.AmountPaid)).Div(decimal.NewFromInt(100)).String()
		currency, providerRef = strings.ToUpper(creemEvent.Object.Order.Currency), creemEvent.Object.Id
	}
	if providerRef == "" || (order.ProviderRef != "" && order.ProviderRef != providerRef) {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	paid, err := decimal.NewFromString(amount)
	if err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	if err := model.CompletePaymentChannelOrder(tradeNo, id, provider, currency, paid, c.ClientIP()); err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	c.String(http.StatusOK, "success")
}
