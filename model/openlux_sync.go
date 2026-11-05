package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// OpenLuxSnapshotOption is an internal source checkpoint, never a runtime setting.
const OpenLuxSnapshotOption = "OpenLuxCatalogSnapshot"

type openLuxModelEndpoints struct {
	Types     []constant.EndpointType
	Endpoints map[string]common.EndpointInfo
}

// Endpoint declarations are display data from the last successful source sync.
// They never configure relay routes or overwrite administrator model metadata.
func loadOpenLuxModelEndpoints() (map[string]openLuxModelEndpoints, error) {
	saved, err := LoadOpenLuxSnapshot()
	if err != nil || saved == "" {
		return nil, err
	}
	var snapshot struct {
		Catalog struct {
			Models []struct {
				Name  string                  `json:"model_name"`
				Types []constant.EndpointType `json:"supported_endpoint_types"`
			} `json:"data"`
			Endpoints map[string]common.EndpointInfo `json:"supported_endpoint"`
		} `json:"catalog"`
	}
	if err := common.UnmarshalJsonStr(saved, &snapshot); err != nil {
		return nil, err
	}
	result := make(map[string]openLuxModelEndpoints, len(snapshot.Catalog.Models))
	for _, item := range snapshot.Catalog.Models {
		if item.Types == nil {
			continue
		}
		declaration := openLuxModelEndpoints{Types: item.Types}
		if snapshot.Catalog.Endpoints != nil {
			declaration.Endpoints = make(map[string]common.EndpointInfo, len(item.Types))
			for _, endpoint := range item.Types {
				if info, ok := snapshot.Catalog.Endpoints[string(endpoint)]; ok {
					declaration.Endpoints[string(endpoint)] = info
				}
			}
		}
		result[item.Name] = declaration
	}
	return result, nil
}

func LoadOpenLuxSnapshot() (string, error) {
	var option Option
	err := DB.Where(&Option{Key: OpenLuxSnapshotOption}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	return option.Value, err
}

// FinishOpenLuxSync atomically advances the source checkpoint and task history.
// A failed fetch passes an empty snapshot, preserving the last successful data.
// The existing options value column stores large source documents on all dialects.
func FinishOpenLuxSync(taskID, runnerID, snapshot string, result any, runErr error) error {
	encoded, err := marshalSystemTaskJSON(result)
	if err != nil {
		return err
	}
	status, message := SystemTaskStatusSucceeded, ""
	if runErr != nil {
		status, message = SystemTaskStatusFailed, runErr.Error()
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		now := common.GetTimestamp()
		updated := tx.Model(&SystemTask{}).
			Where("task_id = ? AND status = ? AND locked_by = ?", taskID, SystemTaskStatusRunning, runnerID).
			Where("EXISTS (SELECT 1 FROM system_task_locks WHERE system_task_locks.task_id = system_tasks.task_id AND system_task_locks.locked_by = ? AND system_task_locks.locked_until >= ?)", runnerID, now).
			Updates(map[string]any{"status": status, "active_key": nil, "result": encoded, "error": message, "updated_at": now})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrSystemTaskLockLost
		}
		if runErr == nil && snapshot != "" {
			option := Option{Key: OpenLuxSnapshotOption, Value: snapshot}
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value"})}).Create(&option).Error; err != nil {
				return err
			}
		}
		return tx.Where("task_id = ? AND locked_by = ?", taskID, runnerID).Delete(&SystemTaskLock{}).Error
	})
}
