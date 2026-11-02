package controller

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
	"gorm.io/gorm"
)

func GetPaymentChannels(c *gin.Context) {
	channels, err := model.ListPaymentChannels(false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]gin.H, 0, len(channels))
	for _, channel := range channels {
		configured := channel.Config.APIKey != ""
		webhookConfigured := channel.Config.WebhookSecret != ""
		channel.Config.APIKey, channel.Config.WebhookSecret = "", ""
		result = append(result, gin.H{"channel": channel, "api_key_configured": configured, "webhook_secret_configured": webhookConfigured,
			"notify_url": channelNotifyURL(channel.Provider, channel.ID)})
	}
	common.ApiSuccess(c, result)
}

func SavePaymentChannel(c *gin.Context) {
	var channel model.PaymentChannel
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10), &channel); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if channel.ID != 0 {
		saved, err := model.GetPaymentChannel(channel.ID)
		if err != nil {
			common.ApiErrorT(c, "Payment channel does not exist")
			return
		}
		if saved.Provider != channel.Provider {
			common.ApiErrorT(c, "Payment provider cannot be changed. Create another channel instead")
			return
		}
		if channel.Config.APIKey == "" {
			channel.Config.APIKey = saved.Config.APIKey
		}
		if channel.Config.WebhookSecret == "" {
			channel.Config.WebhookSecret = saved.Config.WebhookSecret
		}
	}
	if channel.Enabled && !isPaymentComplianceConfirmed() {
		common.ApiErrorT(c, "Confirm payment compliance before enabling payment channels")
		return
	}
	if err := model.SavePaymentChannel(&channel); err != nil {
		common.ApiError(c, err)
		return
	}
	channel.Config.APIKey, channel.Config.WebhookSecret = "", ""
	common.ApiSuccess(c, channel)
}

func DeletePaymentChannel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	// Archive instead of removing: existing orders must still settle and migrated
	// legacy gateway entries must not silently reappear after deletion.
	result := model.DB.Model(&model.PaymentChannel{}).Where("id = ? AND archived = ?", id, false).
		Updates(map[string]any{"archived": true, "enabled": false, "version": gorm.Expr("version + 1")})
	if result.Error != nil {
		common.ApiError(c, result.Error)
		return
	}
	common.ApiSuccess(c, nil)
}

func channelNotifyURL(provider string, id int) string {
	return fmt.Sprintf("%s/api/payment/channels/%s/%d/notify", service.GetCallbackAddress(), provider, id)
}

func channelPaymentKey(channelID int, methodID string) string {
	return fmt.Sprintf("channel:%d:%s", channelID, methodID)
}

func resolveChannelPayment(key string) (*model.PaymentChannel, *model.PaymentChannelMethod, error) {
	parts := strings.Split(key, ":")
	if len(parts) != 3 || parts[0] != "channel" {
		return nil, nil, common.NewMessage("Invalid payment method")
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, nil, err
	}
	channel, err := model.GetPaymentChannel(id)
	if err != nil || !channel.Enabled || !isPaymentComplianceConfirmed() {
		return nil, nil, common.NewMessage("Payment channel is unavailable")
	}
	for _, method := range channel.Methods {
		if method.ID == parts[2] && method.Enabled {
			return channel, &method, nil
		}
	}
	return nil, nil, common.NewMessage("Payment method is unavailable")
}

// channelPaymentQuote is the full money breakdown of one top-up attempt, so the
// checkout and the wallet estimate can show exactly what the gateway charges.
type channelPaymentQuote struct {
	Total      decimal.Decimal `json:"-"`
	Subtotal   decimal.Decimal `json:"-"`
	FeeAmount  decimal.Decimal `json:"-"`
	FeePercent float64         `json:"-"`
	FeeFixed   decimal.Decimal `json:"-"`
	FxRate     decimal.Decimal `json:"-"`
	Currency   string          `json:"-"`
	Quota      int             `json:"-"`
}

// channelFxRate converts the USD price of wallet credit into the currency the
// channel settles in. USD channels are charged as-is.
func channelFxRate(currency string) (decimal.Decimal, error) {
	trimmed := strings.TrimSpace(currency)
	if trimmed == "" || strings.EqualFold(trimmed, "USD") {
		return decimal.NewFromInt(1), nil
	}
	rate, err := service.GetFxRate(trimmed)
	if err != nil {
		return decimal.Zero, err
	}
	if !(rate > 0) || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return decimal.Zero, common.NewMessage("The exchange rate is unavailable")
	}
	return decimal.NewFromFloat(rate), nil
}

func quoteChannelPayment(channel *model.PaymentChannel, method *model.PaymentChannelMethod, amount int64, group string) (channelPaymentQuote, error) {
	quote := channelPaymentQuote{Currency: channel.Currency, FxRate: decimal.NewFromInt(1), FeeFixed: decimal.Zero}
	if common.QuotaPerUnit <= 0 || math.IsNaN(common.QuotaPerUnit) || math.IsInf(common.QuotaPerUnit, 0) {
		return quote, common.NewMessage("Invalid top-up amount")
	}
	price, err := decimal.NewFromString(method.UnitPrice)
	if err != nil || !price.IsPositive() {
		return quote, common.NewMessage("Invalid payment price")
	}
	var units decimal.Decimal
	creditRatio := decimal.NewFromInt(1)
	if channel.Provider == "creem" {
		units, err = decimal.NewFromString(method.CreditAmount)
		if err != nil {
			return quote, err
		}
	} else {
		if amount <= 0 || common.QuotaPerUnit <= 0 {
			return quote, common.NewMessage("Invalid top-up amount")
		}
		units = decimal.NewFromInt(amount)
		if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
			units = units.Div(decimal.NewFromFloat(common.QuotaPerUnit)).Floor()
		}
		if units.LessThan(decimal.NewFromInt(method.MinTopup)) || (method.MaxTopup > 0 && units.GreaterThan(decimal.NewFromInt(method.MaxTopup))) || units.GreaterThan(decimal.NewFromInt(1000000)) {
			return quote, common.NewMessage("Top-up amount is outside this payment method's limits")
		}
		ratio := common.GetTopupGroupRatio(group)
		if ratio == 0 {
			ratio = 1
		}
		discount := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]
		if discount == 0 {
			discount = 1
		}
		if ratio <= 0 || discount <= 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) || math.IsNaN(discount) || math.IsInf(discount, 0) {
			return quote, common.NewMessage("Invalid payment price")
		}
		if channel.LegacyProvider == "stripe" {
			creditRatio = decimal.NewFromFloat(ratio)
		}
		price = units.Mul(price).Mul(decimal.NewFromFloat(ratio)).Mul(decimal.NewFromFloat(discount))
		fxRate, err := channelFxRate(channel.Currency)
		if err != nil {
			return quote, err
		}
		price = price.Mul(fxRate).Round(2)
		quote.FxRate = fxRate
		quote.Subtotal = price
		// The surcharge is charged on top of the listed price; credited quota
		// stays derived from the price alone.
		feePercent, feeFixed, err := model.ChannelMethodFees(method)
		if err != nil {
			return quote, err
		}
		percentValue, _ := feePercent.Float64()
		quote.FeePercent = percentValue
		quote.FeeFixed = feeFixed
		if !feePercent.IsZero() || !feeFixed.IsZero() {
			price = price.Mul(decimal.NewFromInt(1).Add(feePercent.Div(decimal.NewFromInt(100)))).Add(feeFixed).Round(2)
		}
		quote.FeeAmount = price.Sub(quote.Subtotal)
	}
	quota, err := validateCreditedQuota(units.Mul(creditRatio).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil {
		return quote, err
	}
	if price.LessThan(decimal.RequireFromString("0.01")) || price.GreaterThan(decimal.NewFromInt(99999999)) {
		return quote, common.NewMessage("Invalid payment amount")
	}
	quote.Total = price
	quote.Quota = quota
	return quote, nil
}

// QuoteChannelPayment previews the amount a payment method charges without
// creating an order, so the wallet can show the rate and fee breakdown before
// the buyer commits.
func QuoteChannelPayment(c *gin.Context) {
	var request EpayRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10), &request); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	channel, method, err := resolveChannelPayment(request.PaymentMethod)
	if err != nil {
		paymentError(c, err)
		return
	}
	user, err := model.GetUserById(c.GetInt("id"), false)
	if err != nil || user == nil {
		paymentError(c, common.NewMessage("User does not exist"))
		return
	}
	quote, err := quoteChannelPayment(channel, method, request.Amount, user.Group)
	if err != nil {
		paymentError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"payment_method": request.PaymentMethod,
		"amount":         request.Amount,
		"currency":       quote.Currency,
		"fx_rate":        quote.FxRate.StringFixed(6),
		"subtotal":       quote.Subtotal.StringFixed(2),
		"fee_percent":    quote.FeePercent,
		"fee_fixed":      quote.FeeFixed.StringFixed(2),
		"fee_amount":     quote.FeeAmount.StringFixed(2),
		"total":          quote.Total.StringFixed(2),
		"quota":          quote.Quota,
	})
}

func RequestChannelPayment(c *gin.Context) {
	var request EpayRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10), &request); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	channel, method, err := resolveChannelPayment(request.PaymentMethod)
	if err != nil {
		paymentError(c, err)
		return
	}
	user, err := model.GetUserById(c.GetInt("id"), false)
	if err != nil || user == nil {
		paymentError(c, common.NewMessage("User does not exist"))
		return
	}
	quote, err := quoteChannelPayment(channel, method, request.Amount, user.Group)
	if err != nil {
		paymentError(c, err)
		return
	}
	money, quota := quote.Total, quote.Quota
	if err := model.ValidateTopUpQuotaCapacity(user.Id, quota); err != nil {
		paymentError(c, err)
		return
	}
	if strings.HasSuffix(c.FullPath(), "/amount") {
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": money.StringFixed(2), "currency": channel.Currency, "credited_quota": quota})
		return
	}
	tradeNo := "PC-" + randstr.Hex(32)
	order := model.PaymentChannelOrder{TradeNo: tradeNo, ChannelID: channel.ID, UserID: user.Id, Provider: channel.Provider,
		Currency: channel.Currency, Money: money.StringFixed(2), CreditedQuota: quota, Config: channel.Config, Method: *method}
	walletAmount := decimal.NewFromInt(int64(quota)).Div(decimal.NewFromFloat(common.QuotaPerUnit))
	order.WalletAmount = walletAmount.String()
	units := walletAmount.IntPart()
	topup := model.TopUp{UserId: user.Id, Amount: units, Money: money.InexactFloat64(), TradeNo: tradeNo, PaymentMethod: method.Type,
		PaymentProvider: model.PaymentProviderChannel, CreateTime: common.GetTimestamp(), Status: common.TopUpStatusPending}
	if err := model.CreatePaymentChannelOrder(&order, &topup); err != nil {
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}
	checkout, err := createChannelCheckout(c, &order, user.Email)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	// 502 orders close at a fixed deadline; the countdown must match the one the
	// notify callback enforces, so it is derived from the stored order time.
	if channel.Provider == "502" {
		checkout.ExpiresAt = topup.CreateTime + model.Payment502OrderValiditySeconds
	}
	// Keep pending on upstream timeout; a later authenticated callback may still
	// settle an order that the upstream accepted before the connection failed.
	if err := model.DB.Model(&model.PaymentChannelOrder{}).Where("trade_no = ?", tradeNo).Update("provider_ref", checkout.ProviderRef).Error; err != nil {
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	checkout.OrderID, checkout.Currency, checkout.Amount = tradeNo, channel.Currency, order.Money
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": checkout})
}

func GetChannelPaymentStatus(c *gin.Context) {
	order, err := model.GetPaymentChannelOrder(c.Param("order"))
	if err != nil || order.UserID != c.GetInt("id") {
		c.Status(http.StatusNotFound)
		return
	}
	topup := model.GetTopUpByTradeNo(order.TradeNo)
	if topup == nil {
		c.Status(http.StatusNotFound)
		return
	}
	common.ApiSuccess(c, gin.H{"status": topup.Status})
}

// channelWalletMethods returns only public display data, never gateway secrets.
func channelWalletMethods(group string) ([]map[string]string, map[string]bool, error) {
	channels, err := model.ListPaymentChannels(true)
	if err != nil {
		return nil, nil, err
	}
	methods := []map[string]string{}
	migrated := map[string]bool{}
	for _, channel := range channels {
		if channel.LegacyProvider != "" {
			migrated[channel.LegacyProvider] = true
		}
		if channel.Archived || !channel.Enabled || !isPaymentComplianceConfirmed() {
			continue
		}
		for _, method := range channel.Methods {
			if !method.Enabled {
				continue
			}
			price, _ := decimal.NewFromString(method.UnitPrice)
			ratio := common.GetTopupGroupRatio(group)
			if ratio == 0 {
				ratio = 1
			}
			if ratio > 0 && !math.IsNaN(ratio) && !math.IsInf(ratio, 0) {
				price = price.Mul(decimal.NewFromFloat(ratio))
			}
			if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens && common.QuotaPerUnit > 0 {
				price = price.Div(decimal.NewFromFloat(common.QuotaPerUnit))
			}
			min := decimal.NewFromInt(method.MinTopup)
			fixed := method.CreditAmount
			if channel.Provider == "creem" {
				min = decimal.Zero
			}
			if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
				min = min.Mul(decimal.NewFromFloat(common.QuotaPerUnit))
				if value, err := decimal.NewFromString(fixed); err == nil {
					fixed = value.Mul(decimal.NewFromFloat(common.QuotaPerUnit)).String()
				}
			}
			icon := channel.Icon
			if icon == "" {
				icon = map[string]string{"alipay": "SiAlipay", "wxpay": "SiWechat", "card": "SiStripe", "creem": "LuLandmark"}[method.Type]
			}
			if icon == "" && channel.Provider == "bepusdt" {
				icon = "SiTether"
			}
			// The wallet needs the local-currency estimate and the surcharge to
			// show the same breakdown the checkout will charge.
			fxRate, err := channelFxRate(channel.Currency)
			if err != nil {
				fxRate = decimal.NewFromInt(1)
			}
			feePercent, feeFixed, err := model.ChannelMethodFees(&method)
			if err != nil {
				feePercent, feeFixed = decimal.Zero, decimal.Zero
			}
			localPrice := price.Mul(fxRate)
			methods = append(methods, map[string]string{"name": method.Name, "type": channelPaymentKey(channel.ID, method.ID), "icon": icon,
				"provider": channel.Provider, "channel_name": channel.Name, "currency": channel.Currency, "interaction": method.Interaction,
				"min_topup": min.String(), "fixed_amount": fixed, "unit_price": price.String(), "unit_price_local": localPrice.String(),
				"fx_rate": fxRate.StringFixed(6), "fee_percent": feePercent.String(), "fee_fixed": feeFixed.String()})
		}
	}
	return methods, migrated, nil
}

func ImportLegacyPaymentChannels() error {
	channels := []model.PaymentChannel{}
	method := func(id, name, kind string, price float64, minimum int) model.PaymentChannelMethod {
		return model.PaymentChannelMethod{ID: id, Name: name, Type: kind, Interaction: "redirect", UnitPrice: strconv.FormatFloat(price, 'f', -1, 64), MinTopup: max(1, int64(minimum)), Enabled: true}
	}
	if isBepusdtConfigured() {
		channels = append(channels, model.PaymentChannel{Name: "BEpusdt", Provider: "bepusdt", LegacyProvider: "bepusdt", Currency: "USD", Enabled: true,
			Config:  model.PaymentChannelConfig{GatewayURL: setting.BepusdtApiURL, APIKey: setting.BepusdtApiToken},
			Methods: []model.PaymentChannelMethod{method("usdt", "USDT ("+setting.BepusdtTradeType+")", setting.BepusdtTradeType, setting.BepusdtUnitPrice, setting.BepusdtMinTopUp)}})
	}
	if operation_setting.PayAddress != "" && operation_setting.EpayId != "" && operation_setting.EpayKey != "" {
		methods := []model.PaymentChannelMethod{}
		for i, entry := range operation_setting.PayMethods {
			if entry["type"] == "stripe" || entry["type"] == "creem" || entry["type"] == "waffo" || entry["type"] == "waffo_pancake" || entry["type"] == "bepusdt" {
				continue
			}
			m := method(fmt.Sprintf("method%d", i), entry["name"], entry["type"], operation_setting.Price, operation_setting.MinTopUp)
			if minimum, err := strconv.ParseInt(entry["min_topup"], 10, 64); err == nil {
				m.MinTopup = max(m.MinTopup, minimum)
			}
			methods = append(methods, m)
		}
		if len(methods) > 0 {
			channels = append(channels, model.PaymentChannel{Name: "Epay", Provider: "epay", LegacyProvider: "epay", Currency: "CNY", Enabled: true,
				Config: model.PaymentChannelConfig{GatewayURL: strings.TrimRight(operation_setting.PayAddress, "/"), MerchantID: operation_setting.EpayId, APIKey: operation_setting.EpayKey}, Methods: methods})
		}
	}
	if setting.StripeApiSecret != "" && setting.StripeWebhookSecret != "" {
		channels = append(channels, model.PaymentChannel{Name: "Stripe", Provider: "stripe", LegacyProvider: "stripe", Currency: "USD", Enabled: true,
			Config:  model.PaymentChannelConfig{APIKey: setting.StripeApiSecret, WebhookSecret: setting.StripeWebhookSecret},
			Methods: []model.PaymentChannelMethod{method("card", "Stripe", "card", setting.StripeUnitPrice, setting.StripeMinTopUp)}})
	}
	var products []CreemProduct
	if setting.CreemApiKey != "" && setting.CreemWebhookSecret != "" && common.UnmarshalJsonStr(setting.CreemProducts, &products) == nil && common.QuotaPerUnit > 0 {
		for _, currency := range []string{"USD", "EUR"} {
			methods := []model.PaymentChannelMethod{}
			for i, product := range products {
				if product.Currency != currency {
					continue
				}
				m := method(fmt.Sprintf("product%d", i), product.Name, "creem", product.Price, 1)
				m.ProductID, m.CreditAmount = product.ProductId, decimal.NewFromInt(product.Quota).Div(decimal.NewFromFloat(common.QuotaPerUnit)).String()
				methods = append(methods, m)
			}
			if len(methods) > 0 {
				channels = append(channels, model.PaymentChannel{Name: "Creem " + currency, Provider: "creem", LegacyProvider: "creem", Currency: currency, Enabled: true,
					Config: model.PaymentChannelConfig{APIKey: setting.CreemApiKey, WebhookSecret: setting.CreemWebhookSecret, TestMode: setting.CreemTestMode}, Methods: methods})
			}
		}
	}
	return model.ImportLegacyPaymentChannels(channels)
}
