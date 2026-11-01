package controller

import (
	"context"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type channelStatusItem struct {
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	Uptime     float64 `json:"uptime"`
	HasSamples bool    `json:"has_samples"`
	Slots      string  `json:"slots"`
	OldestSlot int64   `json:"oldest_slot"`
}

type openLuxUptimeAccount struct {
	Success bool `json:"success"`
	Data    struct {
		IDs    map[string]int `json:"group_ids"`
		Uptime map[string]struct {
			Status     string  `json:"status"`
			Uptime     float64 `json:"uptime"`
			HasSamples bool    `json:"has_samples"`
			Slots      string  `json:"slots"`
			OldestSlot int64   `json:"oldest_slot"`
		} `json:"uptime"`
	} `json:"data"`
}

func fetchChannelStatus(ctx context.Context) ([]channelStatusItem, error) {
	token := strings.TrimSpace(os.Getenv("OPENLUX_ACCOUNT_TOKEN"))
	if token == "" {
		return nil, common.NewMessage("OpenLux account credentials are not configured")
	}
	var account openLuxUptimeAccount
	if err := fetchOpenLuxJSON(ctx, "/api/user/self/groups", token, &account); err != nil {
		return nil, err
	}
	if !account.Success {
		return nil, common.NewMessage("OpenLux account groups are unavailable")
	}
	names := make(map[string]string, len(account.Data.IDs))
	for name, id := range account.Data.IDs {
		names[strconv.Itoa(id)] = name
	}
	items := make([]channelStatusItem, 0, len(account.Data.Uptime))
	for id, u := range account.Data.Uptime {
		name, ok := names[id]
		if !ok {
			continue
		}
		items = append(items, channelStatusItem{Name: name, Status: u.Status, Uptime: u.Uptime, HasSamples: u.HasSamples, Slots: u.Slots, OldestSlot: u.OldestSlot})
	}
	slices.SortFunc(items, func(a, b channelStatusItem) int { return strings.Compare(a.Name, b.Name) })
	return items, nil
}

// GetChannelStatus returns upstream channel uptime keyed by channel name instead of id.
func GetChannelStatus(c *gin.Context) {
	items, err := fetchChannelStatus(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}
