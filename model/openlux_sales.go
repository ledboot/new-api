package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Plans deliberately contain no API keys and no caller-supplied billing code.
type OpenLuxSalePlanGroup struct {
	SourceGroupRatio float64                                     `json:"source_group_ratio"`
	GroupRatio       float64                                     `json:"group_ratio"`
	TopupRatio       float64                                     `json:"topup_ratio"`
	SellingPrices    map[string]string                           `json:"selling_prices"`
	Group            string                                      `json:"group"`
	Multiplier       float64                                     `json:"multiplier"`
	SourceVersion    string                                      `json:"source_version"`
	Models           map[string]billing_setting.OpenLuxSalePrice `json:"models"`
	Excluded         map[string]string                           `json:"excluded"`
}

type OpenLuxSalesPlan struct {
	Groups       []OpenLuxSalePlanGroup `json:"groups"`
	LocalVersion string                 `json:"local_version"`
}

var openLuxSalesMu sync.Mutex
var ErrOpenLuxSalesGroupConflict = errors.New("A local group or channel already uses a selected OpenLux group name")

var ErrOpenLuxSalesConflict = errors.New("OpenLux sales configuration changed; preview again")

func openLuxSalesOptions(tx *gorm.DB, lock bool) (map[string]string, error) {
	defaults := map[string]string{billing_setting.OpenLuxSalesOption: "{}", "GroupRatio": ratio_setting.GroupRatio2JSONString(), "TopupGroupRatio": common.TopupGroupRatio2JSONString(), "GroupGroupRatio": ratio_setting.GroupGroupRatio2JSONString(), "UserUsableGroups": setting.UserUsableGroups2JSONString()}
	keys := []string{billing_setting.OpenLuxSalesOption, "GroupRatio", "TopupGroupRatio", "GroupGroupRatio", "UserUsableGroups"}
	slices.Sort(keys)
	if lock {
		for _, key := range keys {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: defaults[key]}).Error; err != nil {
				return nil, err
			}
		}
		tx = lockForUpdate(tx)
	}
	var options []Option
	if err := tx.Where(commonKeyCol+" IN ?", keys).Order(commonKeyCol).Find(&options).Error; err != nil {
		return nil, err
	}
	for _, option := range options {
		defaults[option.Key] = option.Value
	}
	return defaults, nil
}

func PreviewOpenLuxSalesGroups(groups []OpenLuxSalePlanGroup) (string, error) {
	options, err := openLuxSalesOptions(DB, false)
	if err != nil {
		return "", err
	}
	sales, err := billing_setting.ParseOpenLuxSales(options[billing_setting.OpenLuxSalesOption])
	if err != nil {
		return "", err
	}
	ratios := map[string]float64{}
	usable := map[string]string{}
	if err := common.UnmarshalJsonStr(options["GroupRatio"], &ratios); err != nil {
		return "", err
	}
	if err := common.UnmarshalJsonStr(options["UserUsableGroups"], &usable); err != nil {
		return "", err
	}
	for _, group := range groups {
		previous, managed := sales[group.Group]
		if _, exists := ratios[group.Group]; exists && !managed {
			return "", ErrOpenLuxSalesGroupConflict
		}
		if _, exists := usable[group.Group]; exists && !managed {
			return "", ErrOpenLuxSalesGroupConflict
		}
		var channels []Channel
		if err := ApplyChannelGroupFilter(DB.Model(&Channel{}), group.Group).Find(&channels).Error; err != nil {
			return "", err
		}
		for _, channel := range channels {
			if !managed || channel.Id != previous.ChannelID {
				return "", ErrOpenLuxSalesGroupConflict
			}
		}
	}
	encoded, err := common.Marshal(options)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", sha256.Sum256(encoded)), nil
}

// PublishOpenLuxSales commits the entire batch, abilities and metadata together.
// Existing unrelated groups/channels and administrator metadata are preserved.
func PublishOpenLuxSales(plan OpenLuxSalesPlan, keys map[string]string, metadata map[string]MetadataValues, vendors map[string]Vendor) (map[string]int, error) {
	if len(plan.Groups) == 0 || len(plan.Groups) > 100 {
		return nil, fmt.Errorf("invalid OpenLux sales plan")
	}
	openLuxSalesMu.Lock()
	defer openLuxSalesMu.Unlock()
	channelIDs := map[string]int{}
	var committed map[string]string
	err := DB.Transaction(func(tx *gorm.DB) error {
		options, err := openLuxSalesOptions(tx, true)
		if err != nil {
			return err
		}
		encoded, err := common.Marshal(options)
		if err != nil {
			return err
		}
		if fmt.Sprintf("%x", sha256.Sum256(encoded)) != plan.LocalVersion {
			return ErrOpenLuxSalesConflict
		}
		sales, err := billing_setting.ParseOpenLuxSales(options[billing_setting.OpenLuxSalesOption])
		if err != nil {
			return err
		}
		ratios := map[string]float64{}
		topups := map[string]float64{}
		special := map[string]map[string]float64{}
		if err := common.UnmarshalJsonStr(options["TopupGroupRatio"], &topups); err != nil {
			return err
		}
		if err := common.UnmarshalJsonStr(options["GroupGroupRatio"], &special); err != nil {
			return err
		}
		if topups == nil || special == nil {
			return fmt.Errorf("invalid group configuration")
		}
		usable := map[string]string{}
		if err := common.UnmarshalJsonStr(options["GroupRatio"], &ratios); err != nil {
			return err
		}
		if err := common.UnmarshalJsonStr(options["UserUsableGroups"], &usable); err != nil {
			return err
		}
		if ratios == nil || usable == nil {
			return fmt.Errorf("invalid group configuration")
		}
		for _, group := range plan.Groups {
			previous, managed := sales[group.Group]
			for _, ratio := range []float64{group.SourceGroupRatio, group.GroupRatio, group.TopupRatio} {
				if ratio < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
					return fmt.Errorf("invalid group multiplier")
				}
			}
			// Legacy expressions embedded the upstream ratio. Rebase absolute user-group
			// overrides exactly once alongside the expressions so their effective prices survive.
			if managed && !previous.NormalizedPrices {
				for _, overrides := range special {
					if value, exists := overrides[group.Group]; exists {
						rebased := value * group.SourceGroupRatio
						if rebased < 0 || math.IsNaN(rebased) || math.IsInf(rebased, 0) {
							return fmt.Errorf("invalid group multiplier")
						}
						overrides[group.Group] = rebased
					}
				}
			}
			if _, exists := ratios[group.Group]; exists && !managed {
				return ErrOpenLuxSalesConflict
			}
			if _, exists := usable[group.Group]; exists && !managed {
				return ErrOpenLuxSalesConflict
			}
			var competing []Channel
			if err := ApplyChannelGroupFilter(tx.Model(&Channel{}), group.Group).Find(&competing).Error; err != nil {
				return err
			}
			for _, channel := range competing {
				if !managed || channel.Id != previous.ChannelID {
					return ErrOpenLuxSalesConflict
				}
			}
			channel := Channel{Type: 1, Status: 1, Name: "OpenLux / " + group.Group, Group: group.Group, BaseURL: new("https://www.openlux.ai"), CreatedTime: common.GetTimestamp()}
			if managed {
				if err := lockForUpdate(tx).First(&channel, previous.ChannelID).Error; err != nil {
					return ErrOpenLuxSalesConflict
				}
				if channel.Group != group.Group || strings.TrimRight(channel.GetBaseURL(), "/") != "https://www.openlux.ai" || channel.Type != 1 || channel.GetModelMapping() != "" || len(channel.GetParamOverride()) != 0 || len(channel.GetHeaderOverride()) != 0 {
					return ErrOpenLuxSalesConflict
				}
			}
			key := strings.TrimSpace(keys[group.Group])
			if key == "" && !managed {
				return fmt.Errorf("an upstream API key is required for every new group")
			}
			if key != "" {
				channel.Key = key
				channel.Keys = nil
				channel.ChannelInfo = ChannelInfo{}
			}
			names := make([]string, 0, len(group.Models))
			for name := range group.Models {
				names = append(names, name)
			}
			slices.Sort(names)
			channel.Models = strings.Join(names, ",")
			channel.Status = 1
			if err := tx.Save(&channel).Error; err != nil {
				return err
			}
			if err := channel.UpdateAbilities(tx); err != nil {
				return err
			}
			for _, name := range names {
				values, exists := metadata[name]
				if !exists {
					return fmt.Errorf("missing model metadata")
				}
				var saved Model
				err := tx.Where("model_name = ?", name).First(&saved).Error
				if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
				if err == nil {
					if saved.Endpoints == "" && values.Endpoints != "" {
						if err := tx.Model(&saved).Update("endpoints", values.Endpoints).Error; err != nil {
							return err
						}
					}
					continue
				}
				vendorID := 0
				if values.Vendor != "" {
					var vendor Vendor
					err := tx.Where("name = ?", values.Vendor).First(&vendor).Error
					if errors.Is(err, gorm.ErrRecordNotFound) {
						vendor = vendors[values.Vendor]
						vendor.Id = 0
						vendor.Status = 1
						vendor.CreatedTime = common.GetTimestamp()
						vendor.UpdatedTime = vendor.CreatedTime
						if err := tx.Create(&vendor).Error; err != nil {
							return err
						}
					} else if err != nil {
						return err
					}
					vendorID = vendor.Id
				}
				saved = Model{ModelName: name, Description: values.Description, Icon: values.Icon, Tags: values.Tags, Endpoints: values.Endpoints, VendorID: vendorID, Status: 1, NameRule: NameRuleExact, SyncOfficial: 0, CreatedTime: common.GetTimestamp(), UpdatedTime: common.GetTimestamp()}
				if err := tx.Create(&saved).Error; err != nil {
					return err
				}
			}
			sales[group.Group] = billing_setting.OpenLuxSaleGroup{NormalizedPrices: true, ChannelID: channel.Id, Multiplier: group.Multiplier, SourceVersion: group.SourceVersion, Models: group.Models}
			ratios[group.Group] = group.GroupRatio
			topups[group.Group] = group.TopupRatio
			usable[group.Group] = group.Group
			channelIDs[group.Group] = channel.Id
		}
		committed = map[string]string{}
		for key, value := range map[string]any{billing_setting.OpenLuxSalesOption: sales, "GroupRatio": ratios, "TopupGroupRatio": topups, "GroupGroupRatio": special, "UserUsableGroups": usable} {
			encoded, err := common.Marshal(value)
			if err != nil {
				return err
			}
			if key == billing_setting.OpenLuxSalesOption {
				if _, err := billing_setting.ParseOpenLuxSales(string(encoded)); err != nil {
					return err
				}
			}
			committed[key] = string(encoded)
			if err := tx.Model(&Option{}).Where(commonKeyCol+" = ?", key).Update("value", string(encoded)).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	billing_setting.OpenLuxSalesConfigMu.Lock()
	defer billing_setting.OpenLuxSalesConfigMu.Unlock()
	for _, key := range []string{billing_setting.OpenLuxSalesOption, "GroupRatio", "TopupGroupRatio", "GroupGroupRatio", "UserUsableGroups"} {
		if err := updateOptionMap(key, committed[key]); err != nil {
			return nil, err
		}
	}
	InitChannelCache()
	RefreshPricing()
	ratio_setting.InvalidateExposedDataCache()
	return channelIDs, nil
}
