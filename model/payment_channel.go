package model

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Credentials are never included in wallet responses. Order snapshots retain the
// credentials used at checkout so key rotation and channel deletion cannot break
// verification of payments already in flight.
type PaymentChannelConfig struct {
	GatewayURL    string `json:"gateway_url"`
	MerchantID    string `json:"merchant_id"`
	APIKey        string `json:"api_key"`
	WebhookSecret string `json:"webhook_secret"`
	TestMode      bool   `json:"test_mode"`
}

type PaymentChannelMethod struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Interaction  string `json:"interaction"`
	UnitPrice    string `json:"unit_price"`
	MinTopup     int64  `json:"min_topup"`
	MaxTopup     int64  `json:"max_topup"`
	ProductID    string `json:"product_id"`
	CreditAmount string `json:"credit_amount"`
	FeePercent   string `json:"fee_percent"` // percentage of the charge, "0" or empty for none
	FeeFixed     string `json:"fee_fixed"`   // fixed amount in the channel currency, "0" or empty for none
	Enabled      bool   `json:"enabled"`
}

// ChannelMethodFees reads the configured surcharge. Empty values mean no fee,
// so channel methods saved before fees existed keep working unchanged.
func ChannelMethodFees(method *PaymentChannelMethod) (decimal.Decimal, decimal.Decimal, error) {
	percent, err := parseChannelFee(method.FeePercent, decimal.NewFromInt(100))
	if err != nil {
		return decimal.Zero, decimal.Zero, err
	}
	fixed, err := parseChannelFee(method.FeeFixed, decimal.NewFromInt(1000000))
	if err != nil {
		return decimal.Zero, decimal.Zero, err
	}
	return percent, fixed, nil
}

func parseChannelFee(value string, max decimal.Decimal) (decimal.Decimal, error) {
	if strings.TrimSpace(value) == "" {
		return decimal.Zero, nil
	}
	fee, err := decimal.NewFromString(value)
	if err != nil || fee.IsNegative() || fee.GreaterThan(max) {
		return decimal.Zero, common.NewMessage("Invalid payment fee")
	}
	return fee, nil
}

type PaymentChannel struct {
	ID             int                    `json:"id" gorm:"primaryKey"`
	Name           string                 `json:"name" gorm:"type:varchar(120)"`
	Provider       string                 `json:"provider" gorm:"type:varchar(30)"`
	Currency       string                 `json:"currency" gorm:"type:varchar(3)"`
	Icon           string                 `json:"icon" gorm:"type:varchar(120)"`
	Enabled        bool                   `json:"enabled"`
	Archived       bool                   `json:"-"`
	SortOrder      int                    `json:"sort_order"`
	Version        int                    `json:"version"`
	LegacyProvider string                 `json:"-" gorm:"type:varchar(30)"`
	Config         PaymentChannelConfig   `json:"config" gorm:"serializer:json;type:text"`
	Methods        []PaymentChannelMethod `json:"methods" gorm:"serializer:json;type:text"`
}

type PaymentChannelOrder struct {
	WalletAmount  string               `json:"wallet_amount" gorm:"type:varchar(40)"`
	TradeNo       string               `json:"trade_no" gorm:"primaryKey;type:varchar(100)"`
	ChannelID     int                  `json:"channel_id" gorm:"index"`
	UserID        int                  `json:"user_id" gorm:"index"`
	Provider      string               `json:"provider" gorm:"type:varchar(30)"`
	Currency      string               `json:"currency" gorm:"type:varchar(3)"`
	Money         string               `json:"money" gorm:"type:varchar(40)"`
	CreditedQuota int                  `json:"credited_quota"`
	ProviderRef   string               `json:"-" gorm:"type:varchar(255)"`
	Config        PaymentChannelConfig `json:"-" gorm:"serializer:json;type:text"`
	Method        PaymentChannelMethod `json:"method" gorm:"serializer:json;type:text"`
}

const PaymentProviderChannel = "payment_channel"

var paymentMethodIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func ValidatePaymentChannel(channel *PaymentChannel) error {
	if strings.TrimSpace(channel.Name) == "" || len(channel.Name) > 120 || len(channel.Icon) > 120 || channel.SortOrder < 0 || channel.SortOrder > 1000000 {
		return common.NewMessage("Invalid payment channel name or sort order")
	}
	if channel.Currency != "USD" && channel.Currency != "CNY" && channel.Currency != "EUR" {
		return common.NewMessage("Unsupported payment currency")
	}
	switch channel.Provider {
	case "epay", "502", "bepusdt":
		u, err := url.Parse(channel.Config.GatewayURL)
		if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || u.RawQuery != "" || u.Fragment != "" {
			return common.NewMessage("Invalid payment gateway URL")
		}
	case "stripe", "creem":
	default:
		return common.NewMessage("Unsupported payment provider")
	}
	if channel.Config.APIKey == "" {
		return common.NewMessage("Payment API key is required")
	}
	if (channel.Provider == "stripe" || channel.Provider == "creem") && channel.Config.WebhookSecret == "" {
		return common.NewMessage("Payment webhook secret is required")
	}
	if (channel.Provider == "epay" || channel.Provider == "502") && (channel.Config.MerchantID == "" || channel.Currency != "CNY") {
		return common.NewMessage("Epay requires a merchant ID and CNY currency")
	}
	if channel.Provider == "bepusdt" && channel.Currency != "USD" {
		return common.NewMessage("BEpusdt requires USD currency")
	}
	if len(channel.Methods) == 0 || len(channel.Methods) > 50 {
		return common.NewMessage("Configure between 1 and 50 payment methods")
	}
	seen := map[string]bool{}
	for _, method := range channel.Methods {
		if !paymentMethodIDPattern.MatchString(method.ID) || seen[method.ID] || strings.TrimSpace(method.Name) == "" || len(method.Name) > 120 || strings.TrimSpace(method.Type) == "" || len(method.Type) > 50 {
			return common.NewMessage("Invalid or duplicate payment method")
		}
		seen[method.ID] = true
		if method.Interaction != "qr" && method.Interaction != "redirect" {
			return common.NewMessage("Unsupported payment interaction mode")
		}
		if (channel.Provider == "stripe" || channel.Provider == "creem") && method.Interaction != "redirect" {
			return common.NewMessage("This provider requires hosted checkout")
		}
		if channel.Provider == "502" && method.Type != "alipay" && method.Type != "wxpay" {
			return common.NewMessage("502 supports Alipay and WeChat Pay")
		}
		if method.MinTopup < 1 || method.MinTopup > 1000000 || method.MaxTopup < 0 || method.MaxTopup > 1000000 || (method.MaxTopup != 0 && method.MaxTopup < method.MinTopup) {
			return common.NewMessage("Invalid payment amount limits")
		}
		price, err := decimal.NewFromString(method.UnitPrice)
		if err != nil || !price.IsPositive() || price.GreaterThan(decimal.NewFromInt(1000000)) {
			return common.NewMessage("Invalid payment unit price")
		}
		if channel.Provider != "creem" {
			if _, _, err := ChannelMethodFees(&method); err != nil {
				return err
			}
		}
		if channel.Provider == "creem" {
			if !price.Equal(price.Round(2)) {
				return common.NewMessage("Creem product price supports at most two decimal places")
			}
			credit, err := decimal.NewFromString(method.CreditAmount)
			if method.ProductID == "" || err != nil || !credit.IsPositive() || credit.GreaterThan(decimal.NewFromInt(1000000)) {
				return common.NewMessage("Creem requires a product ID and wallet credit amount")
			}
		}
	}
	return nil
}

func ListPaymentChannels(includeArchived bool) ([]PaymentChannel, error) {
	channels := []PaymentChannel{}
	query := DB.Order("sort_order ASC, id ASC")
	if !includeArchived {
		query = query.Where("archived = ?", false)
	}
	err := query.Find(&channels).Error
	return channels, err
}

func GetPaymentChannel(id int) (*PaymentChannel, error) {
	var channel PaymentChannel
	err := DB.Where("id = ? AND archived = ?", id, false).First(&channel).Error
	return &channel, err
}

func SavePaymentChannel(channel *PaymentChannel) error {
	if err := ValidatePaymentChannel(channel); err != nil {
		return err
	}
	if channel.ID == 0 {
		channel.Version = 1
		return DB.Create(channel).Error
	}
	version := channel.Version
	channel.Version++
	result := DB.Model(&PaymentChannel{}).Where("id = ? AND version = ? AND archived = ?", channel.ID, version, false).
		Select("name", "provider", "currency", "icon", "enabled", "sort_order", "version", "config", "methods").Updates(channel)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return common.NewMessage("Payment channel changed. Reload before saving")
	}
	return nil
}

func CreatePaymentChannelOrder(order *PaymentChannelOrder, topup *TopUp) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		return tx.Create(topup).Error
	})
}

func GetPaymentChannelOrder(tradeNo string) (*PaymentChannelOrder, error) {
	var order PaymentChannelOrder
	err := DB.Where("trade_no = ?", tradeNo).First(&order).Error
	return &order, err
}

// CompletePaymentChannelOrder verifies the immutable quote and credits at most
// once, in the same transaction as the order status change. No current pricing
// or gateway settings are used for settlement.
func CompletePaymentChannelOrder(tradeNo string, channelID int, provider, currency string, paid decimal.Decimal, callerIP string) error {
	var topup TopUp
	var order PaymentChannelOrder
	credited := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&topup).Error; err != nil {
			return ErrTopUpNotFound
		}
		if err := tx.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
			return err
		}
		expected, err := decimal.NewFromString(order.Money)
		if err != nil || topup.PaymentProvider != PaymentProviderChannel || order.ChannelID != channelID || order.Provider != provider || currency != order.Currency || !paid.IsPositive() || !paid.Equal(expected) {
			return ErrPaymentMethodMismatch
		}
		if topup.Status == common.TopUpStatusSuccess {
			return nil
		}
		if topup.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}
		if order.CreditedQuota <= 0 || order.CreditedQuota > common.MaxWalletQuota {
			return ErrInvalidTopUpQuota
		}
		result := tx.Model(&TopUp{}).Where("id = ? AND status = ?", topup.Id, common.TopUpStatusPending).
			Updates(map[string]any{"status": common.TopUpStatusSuccess, "complete_time": common.GetTimestamp()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrTopUpStatusInvalid
		}
		if err := creditTopUpQuota(tx, topup.UserId, order.CreditedQuota, nil); err != nil {
			return err
		}
		credited = order.CreditedQuota
		return nil
	})
	if err != nil || credited == 0 {
		return err
	}
	syncCreditUserQuotaCache(topup.UserId, credited, common.LogText("payment channel topup"))
	RecordTopupLog(topup.UserId, common.NewMessage("{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{
		"provider": order.Provider, "quota": logger.FormatQuota(credited), "amount": fmt.Sprintf("%s %s", order.Money, order.Currency),
	}), callerIP, topup.PaymentMethod, PaymentProviderChannel)
	return nil
}

// ImportLegacyPaymentChannels runs once after options have been loaded. Keep
// old options and adapters for in-flight payments and existing subscriptions.
func ImportLegacyPaymentChannels(channels []PaymentChannel) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		marker := Option{Key: "payment_channels_imported_v1", Value: "true"}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&marker)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		for i := range channels {
			if err := ValidatePaymentChannel(&channels[i]); err != nil {
				continue
			}
			channels[i].Version = 1
			if err := tx.Create(&channels[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func AttachPaymentChannelDetails(topups []*TopUp) error {
	references := []string{}
	for _, topup := range topups {
		if topup.PaymentProvider == PaymentProviderChannel {
			references = append(references, topup.TradeNo)
		}
	}
	if len(references) == 0 {
		return nil
	}
	var snapshots []PaymentChannelOrder
	if err := DB.Select("trade_no", "wallet_amount", "currency", "method").Where("trade_no IN ?", references).Find(&snapshots).Error; err != nil {
		return err
	}
	byReference := map[string]PaymentChannelOrder{}
	for _, snapshot := range snapshots {
		byReference[snapshot.TradeNo] = snapshot
	}
	for _, topup := range topups {
		if snapshot, ok := byReference[topup.TradeNo]; ok {
			topup.WalletAmount, topup.PaymentCurrency, topup.PaymentName = snapshot.WalletAmount, snapshot.Currency, snapshot.Method.Name
		}
	}
	return nil
}
