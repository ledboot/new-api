package controller

import (
	"bytes"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

func isBepusdtConfigured() bool {
	u, err := url.Parse(setting.BepusdtApiURL)
	return err == nil && u.Host != "" && (u.Scheme == "https" || u.Scheme == "http") &&
		u.User == nil && u.RawQuery == "" && u.Fragment == "" &&
		strings.TrimSpace(setting.BepusdtApiToken) != "" && strings.TrimSpace(setting.BepusdtTradeType) != ""
}

func isBepusdtTopUpEnabled() bool {
	return isPaymentComplianceConfirmed() && isBepusdtConfigured() &&
		setting.BepusdtUnitPrice > 0 && !math.IsInf(setting.BepusdtUnitPrice, 0) && !math.IsNaN(setting.BepusdtUnitPrice) && setting.BepusdtMinTopUp > 0
}

// BEpusdt's protocol signs sorted, unescaped values followed by the API token.
func bepusdtSignature(params map[string]string, token string) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if key != "signature" && value != "" {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	var b strings.Builder
	for i, key := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(key)
		b.WriteByte('=')
		b.WriteString(params[key])
	}
	b.WriteString(token)
	sum := md5.Sum([]byte(b.String())) // Required by BEpusdt's wire protocol.
	return hex.EncodeToString(sum[:])
}

func getBepusdtPayMoney(amount int64, group string) (decimal.Decimal, error) {
	if !isBepusdtTopUpEnabled() {
		return decimal.Zero, common.NewMessage("Payment information has not been configured by administrator")
	}
	minAmount := decimal.NewFromInt(int64(setting.BepusdtMinTopUp))
	units := decimal.NewFromInt(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		if common.QuotaPerUnit <= 0 {
			return decimal.Zero, common.NewMessage("Invalid top-up amount")
		}
		units = units.Div(decimal.NewFromFloat(common.QuotaPerUnit)).Floor()
	}
	if units.LessThan(minAmount) {
		return decimal.Zero, common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": setting.BepusdtMinTopUp})
	}
	ratio := common.GetTopupGroupRatio(group)
	if ratio == 0 {
		ratio = 1
	}
	discount := 1.0
	if value, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok {
		discount = value
	}
	if ratio <= 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) || discount <= 0 || math.IsNaN(discount) || math.IsInf(discount, 0) {
		return decimal.Zero, common.NewMessage("Payment configuration error")
	}
	money := units.Mul(decimal.NewFromFloat(setting.BepusdtUnitPrice)).Mul(decimal.NewFromFloat(ratio)).Mul(decimal.NewFromFloat(discount)).Round(2)
	if money.LessThan(decimal.NewFromFloat(0.01)) || money.GreaterThan(decimal.NewFromInt(1000000)) {
		return decimal.Zero, common.NewMessage("Invalid top-up amount")
	}
	return money, nil
}

func RequestBepusdtPay(c *gin.Context) {
	var req AmountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	id := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, id, req.Amount) {
		return
	}
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}
	money, err := getBepusdtPayMoney(req.Amount, group)
	if err != nil {
		paymentError(c, err)
		return
	}
	if c.FullPath() == "/api/user/bepusdt/amount" {
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": money.StringFixed(2)})
		return
	}
	tradeNo := fmt.Sprintf("BEPUSDT-%d-%s", id, randstr.Hex(32))
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).Floor().IntPart()
	}
	topUp := &model.TopUp{UserId: id, Amount: amount, Money: money.InexactFloat64(), TradeNo: tradeNo,
		PaymentMethod: model.PaymentMethodBepusdt, PaymentProvider: model.PaymentProviderBepusdt,
		CreateTime: time.Now().Unix(), Status: common.TopUpStatusPending}
	if err := topUp.Insert(); err != nil {
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}
	params := map[string]string{
		"order_id": tradeNo, "amount": money.String(), "fiat": "USD", "trade_type": setting.BepusdtTradeType,
		"notify_url": service.GetCallbackAddress() + "/api/bepusdt/notify", "redirect_url": paymentReturnPath("/wallet?show_history=true"),
	}
	params["signature"] = bepusdtSignature(params, setting.BepusdtApiToken)
	payload := make(map[string]any, len(params))
	for key, value := range params {
		payload[key] = value
	}
	payload["amount"] = json.Number(money.String())
	body, err := common.Marshal(payload)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, strings.TrimRight(setting.BepusdtApiURL, "/")+"/api/v1/order/create-transaction", bytes.NewReader(body))
	if err != nil {
		paymentError(c, common.NewMessage("Payment configuration error"))
		return
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	var result struct {
		StatusCode int `json:"status_code"`
		Data       struct {
			OrderID    string      `json:"order_id"`
			TradeID    string      `json:"trade_id"`
			PaymentURL string      `json:"payment_url"`
			Fiat       string      `json:"fiat"`
			Amount     json.Number `json:"amount"`
		} `json:"data"`
	}
	if err == nil {
		defer response.Body.Close()
		err = common.DecodeJson(io.LimitReader(response.Body, 1<<20), &result)
		quotedAmount, amountErr := decimal.NewFromString(result.Data.Amount.String())
		if response.StatusCode != http.StatusOK || result.StatusCode != 200 || result.Data.OrderID != tradeNo || result.Data.TradeID == "" || result.Data.Fiat != "USD" || amountErr != nil || !quotedAmount.Equal(money) {
			err = errors.New("gateway rejected order")
		}
	}
	u, urlErr := url.Parse(result.Data.PaymentURL)
	if err != nil || urlErr != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
		// A timeout can occur after upstream accepted the order. Keep it pending
		// so a later valid paid notification can still settle it.
		logger.LogWarn(c.Request.Context(), common.LogText("BEpusdt checkout failed user_id=%d trade_no=%s", id, tradeNo))
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"checkout_url": result.Data.PaymentURL, "order_id": tradeNo, "currency": "USD"}})
}

func BepusdtNotify(c *gin.Context) {
	if strings.TrimSpace(setting.BepusdtApiToken) == "" { // Existing paid orders remain valid when new checkouts are disabled.
		c.String(http.StatusForbidden, "fail")
		return
	}
	var raw map[string]any
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10), &raw); err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	params := make(map[string]string, len(raw))
	for key, value := range raw {
		switch v := value.(type) {
		case string:
			params[key] = v
		case float64:
			params[key] = strconv.FormatFloat(v, 'f', -1, 64)
		case bool:
			params[key] = strconv.FormatBool(v)
		case nil:
		default:
			c.String(http.StatusBadRequest, "fail")
			return
		}
	}
	expected := bepusdtSignature(params, setting.BepusdtApiToken)
	if subtle.ConstantTimeCompare([]byte(params["signature"]), []byte(expected)) != 1 {
		c.String(http.StatusUnauthorized, "fail")
		return
	}
	if params["status"] != "2" {
		c.String(http.StatusOK, "success")
		return
	}
	amount, err := decimal.NewFromString(params["amount"])
	actual, actualErr := decimal.NewFromString(params["actual_amount"])
	if err != nil || actualErr != nil || !actual.IsPositive() || params["trade_id"] == "" || params["block_transaction_id"] == "" || (params["fiat"] != "" && params["fiat"] != "USD") {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	if err := model.RechargeBepusdt(params["order_id"], amount, c.ClientIP()); err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("BEpusdt settlement failed trade_no=%s error=%q", params["order_id"], err.Error()))
		c.String(http.StatusBadRequest, "fail")
		return
	}
	c.String(http.StatusOK, "success")
}
