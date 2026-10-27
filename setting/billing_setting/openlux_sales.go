package billing_setting

import (
	"fmt"
	"maps"
	"math"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
)

// OpenLuxSalesOption is private to the preview/publish workflow. It contains
// prices and channel ownership only; credentials stay in the channels table.
const OpenLuxSalesOption = "OpenLuxSales"

type OpenLuxSalePrice struct {
	// Display-only source context limit; it does not change the frozen billing expression.
	InputTokenLimit int64  `json:"input_token_limit,omitempty"`
	Cost            string `json:"cost"`
	Expression      string `json:"expression"`
}

type OpenLuxSaleGroup struct {
	NormalizedPrices bool                        `json:"normalized_prices,omitempty"`
	ChannelID        int                         `json:"channel_id"`
	Multiplier       float64                     `json:"multiplier"`
	SourceVersion    string                      `json:"source_version"`
	Models           map[string]OpenLuxSalePrice `json:"models"`
}

type OpenLuxSales map[string]OpenLuxSaleGroup

// OpenLuxSalesConfigMu keeps a request snapshot from mixing new expressions
// with old group multipliers while a publication refreshes the process cache.
var OpenLuxSalesConfigMu sync.RWMutex

var openLuxSales atomic.Pointer[OpenLuxSales]
var openLuxSalesInvalid atomic.Bool

func ParseOpenLuxSales(raw string) (OpenLuxSales, error) {
	var sales OpenLuxSales
	if err := common.UnmarshalJsonStr(raw, &sales); err != nil {
		return nil, err
	}
	if sales == nil {
		return nil, fmt.Errorf("invalid OpenLux sales configuration")
	}
	for group, sale := range sales {
		if strings.TrimSpace(group) == "" || len(group) > 64 || sale.ChannelID <= 0 || len(sale.Models) == 0 || math.IsNaN(sale.Multiplier) || math.IsInf(sale.Multiplier, 0) || sale.Multiplier < 1 || sale.Multiplier > 1000 {
			return nil, fmt.Errorf("invalid OpenLux sales configuration")
		}
		for name, price := range sale.Models {
			if price.InputTokenLimit < 0 || price.InputTokenLimit > 1<<53-1 || name == "" || strings.TrimSpace(price.Expression) == "" || strings.TrimSpace(price.Cost) == "" {
				return nil, fmt.Errorf("invalid OpenLux model price")
			}
			for _, expression := range []string{price.Cost, price.Expression} {
				if err := SmokeTestExpr(expression); err != nil {
					return nil, fmt.Errorf("invalid OpenLux model price")
				}
			}
		}
	}
	return sales, nil
}

func LoadOpenLuxSales(raw string) error {
	sales, err := ParseOpenLuxSales(raw)
	if err != nil {
		openLuxSalesInvalid.Store(true)
		return err
	}
	openLuxSales.Store(&sales)
	openLuxSalesInvalid.Store(false)
	return nil
}

func GetOpenLuxSales() OpenLuxSales {
	result := make(OpenLuxSales)
	if saved := openLuxSales.Load(); saved != nil {
		for group, sale := range *saved {
			sale.Models = maps.Clone(sale.Models)
			result[group] = sale
		}
	}
	return result
}

// Managed groups never silently fall back to global model prices.
func GetOpenLuxSalePrice(group, model string) (OpenLuxSalePrice, int, bool) {
	if openLuxSalesInvalid.Load() {
		return OpenLuxSalePrice{}, 0, true
	}
	saved := openLuxSales.Load()
	if saved == nil {
		return OpenLuxSalePrice{}, 0, false
	}
	sale, ok := (*saved)[group]
	return sale.Models[model], sale.ChannelID, ok
}

func GetOpenLuxModelPrices(model string) map[string]string {
	result := map[string]string{}
	if saved := openLuxSales.Load(); saved != nil {
		for group, sale := range *saved {
			if price, ok := sale.Models[model]; ok {
				result[group] = price.Expression
			}
		}
	}
	return result
}

func GetOpenLuxModelInputLimits(model string) map[string]int64 {
	result := map[string]int64{}
	if saved := openLuxSales.Load(); saved != nil {
		for group, sale := range *saved {
			if price, ok := sale.Models[model]; ok && price.InputTokenLimit > 0 {
				result[group] = price.InputTokenLimit
			}
		}
	}
	return result
}
