package controller

import (
	"context"
	"crypto/sha256"
	"fmt"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type openLuxSyncHandler struct{}

func (openLuxSyncHandler) Type() string { return model.SystemTaskTypeOpenLuxSync }
func (openLuxSyncHandler) Enabled() bool {
	return common.GetEnvOrDefaultBool("OPENLUX_SYNC_ENABLED", true)
}
func (openLuxSyncHandler) Interval() time.Duration {
	minutes := common.GetEnvOrDefault("OPENLUX_SYNC_INTERVAL_MINUTES", 60)
	if minutes < 1 || minutes > 10080 {
		minutes = 60
	}
	return time.Duration(minutes) * time.Minute
}
func (openLuxSyncHandler) NewPayload() any { return nil }

type openLuxSyncSnapshot struct {
	Version      string          `json:"version"`
	FetchedAt    int64           `json:"fetched_at"`
	AccountRates bool            `json:"account_rates"`
	Catalog      *openLuxCatalog `json:"catalog"`
}

type openLuxSyncChanges struct {
	Added   int      `json:"added"`
	Removed int      `json:"removed"`
	Updated int      `json:"updated"`
	Names   []string `json:"names,omitempty"`
}

type openLuxSyncResult struct {
	Version      string             `json:"version"`
	FetchedAt    int64              `json:"fetched_at"`
	Baseline     bool               `json:"baseline"`
	Changed      bool               `json:"changed"`
	AccountRates bool               `json:"account_rates"`
	Models       openLuxSyncChanges `json:"models"`
	Groups       openLuxSyncChanges `json:"groups"`
	Vendors      openLuxSyncChanges `json:"vendors"`
}

// Model and usable-group fingerprints ignore catalog ordering and live
// usage/uptime statistics that are not source changes.
func openLuxCatalogEntries(catalog *openLuxCatalog) [3]map[string]string {
	entries := [3]map[string]string{{}, {}, {}}
	if catalog == nil {
		return entries
	}
	for _, item := range catalog.Models {
		encoded, _ := common.Marshal(item) // typed upstream data has already decoded finite JSON numbers
		entries[0][item.Name] = fmt.Sprintf("%x", sha256.Sum256(encoded))
	}
	for name, label := range catalog.Groups {
		// Track missing rates separately from an explicitly free rate.
		ratio, hasRatio := catalog.Ratios[name]
		encoded, _ := common.Marshal([]any{label, hasRatio, ratio, catalog.ModelRatios[name]})
		entries[1][name] = fmt.Sprintf("%x", sha256.Sum256(encoded))
	}
	for _, item := range catalog.Vendors {
		encoded, _ := common.Marshal(item)
		entries[2][item.Name] = fmt.Sprintf("%x", sha256.Sum256(encoded))
	}
	return entries
}

func openLuxCatalogChanges(before, after *openLuxCatalog) [3]openLuxSyncChanges {
	previous, current := openLuxCatalogEntries(before), openLuxCatalogEntries(after)
	var changes [3]openLuxSyncChanges
	for i := range changes {
		var names []string
		for name, value := range current[i] {
			old, exists := previous[i][name]
			if !exists {
				changes[i].Added++
			} else if old != value {
				changes[i].Updated++
			} else {
				continue
			}
			names = append(names, name)
		}
		for name := range previous[i] {
			if _, exists := current[i][name]; !exists {
				changes[i].Removed++
				names = append(names, name)
			}
		}
		slices.Sort(names)
		// History is a bounded summary. The full successful source stays in the
		// checkpoint; long/untrusted names cannot overflow MySQL's TEXT result.
		for _, name := range names[:min(len(names), 20)] {
			if len(name) <= 256 {
				changes[i].Names = append(changes[i].Names, name)
			}
		}
	}
	return changes
}

func (openLuxSyncHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	var previous openLuxSyncSnapshot
	saved, err := model.LoadOpenLuxSnapshot()
	if err == nil && saved != "" {
		err = common.UnmarshalJsonStr(saved, &previous)
		if err == nil && (previous.Catalog == nil || previous.Version == "") {
			err = common.NewMessage("OpenLux response is invalid JSON")
		}
	}
	var result *openLuxSyncResult
	var checkpoint []byte
	if err == nil {
		var catalog *openLuxCatalog
		var account *openLuxAccount
		var version string
		catalog, account, version, err = fetchOpenLuxCatalog(ctx)
		if err == nil {
			now := time.Now().Unix()
			changes := openLuxCatalogChanges(previous.Catalog, catalog)
			changed := previous.Catalog == nil || previous.AccountRates != (account != nil)
			for _, change := range changes {
				changed = changed || change.Added > 0 || change.Removed > 0 || change.Updated > 0
			}
			result = &openLuxSyncResult{Version: version, FetchedAt: now, Baseline: previous.Catalog == nil, Changed: changed, AccountRates: account != nil, Models: changes[0], Groups: changes[1], Vendors: changes[2]}
			checkpoint, err = common.Marshal(openLuxSyncSnapshot{Version: version, FetchedAt: now, AccountRates: account != nil, Catalog: catalog})
		}
	}
	if ctx.Err() != nil {
		err = common.NewMessage("OpenLux request failed; check connectivity and server credentials")
	}
	// Never mutate model metadata, gateway channel models, or selling prices.
	if finishErr := model.FinishOpenLuxSync(task.TaskID, runnerID, string(checkpoint), result, err); finishErr != nil {
		common.SysLog(common.LogText("system task %s failed to persist result: %v", task.TaskID, finishErr))
	}
}
