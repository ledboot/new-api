package model

import (
	"errors"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelCacheTest(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM abilities").Error)
	require.NoError(t, DB.Exec("DELETE FROM channels").Error)

	previousMemoryCache := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DELETE FROM abilities").Error)
		require.NoError(t, DB.Exec("DELETE FROM channels").Error)
		common.MemoryCacheEnabled = previousMemoryCache
		InitChannelCache()
	})
}

func TestLoadChannelCachePreservesCacheOnDatabaseError(t *testing.T) {
	setupChannelCacheTest(t)

	priority := int64(10)
	weight := uint(1)
	seeded := Channel{
		Id:       930001,
		Type:     constant.ChannelTypeOpenAI,
		Status:   common.ChannelStatusEnabled,
		Name:     "seeded-kiro",
		Models:   "claude-opus-4-6",
		Group:    "Kiro-Claude-1",
		Priority: &priority,
		Weight:   &weight,
	}
	require.NoError(t, seeded.Insert())
	require.NoError(t, LoadChannelCache())

	selected, err := GetRandomSatisfiedChannel("Kiro-Claude-1", "claude-opus-4-6", 0, nil)
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, seeded.Id, selected.Id)

	dnsErr := errors.New("lookup new-api-postgres on 127.0.0.11:53: i/o timeout")
	for _, tc := range []struct {
		name      string
		failTable string
		wantErr   string
	}{
		{
			name:      "channels query fails",
			failTable: "channels",
			wantErr:   "query channels",
		},
		{
			name:      "abilities query fails after channels load",
			failTable: "abilities",
			wantErr:   "query abilities",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			callbackName := "test:fail_" + tc.failTable
			require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
				if tx.Statement != nil && strings.HasSuffix(tx.Statement.Table, tc.failTable) {
					_ = tx.AddError(dnsErr)
				}
			}))
			defer func() {
				_ = DB.Callback().Query().Remove(callbackName)
			}()

			err := LoadChannelCache()
			require.Error(t, err)
			assert.ErrorIs(t, err, dnsErr)
			assert.ErrorContains(t, err, tc.wantErr)
			require.NotPanics(t, func() {
				InitChannelCache()
			})

			cached, err := CacheGetChannel(seeded.Id)
			require.NoError(t, err)
			assert.Equal(t, seeded.Name, cached.Name)

			routed, err := GetRandomSatisfiedChannel("Kiro-Claude-1", "claude-opus-4-6", 0, nil)
			require.NoError(t, err)
			require.NotNil(t, routed)
			assert.Equal(t, seeded.Id, routed.Id)
		})
	}
}

func TestLoadChannelCacheHandlesGroupsMissingFromAbilities(t *testing.T) {
	setupChannelCacheTest(t)

	priority := int64(5)
	weight := uint(1)
	channel := Channel{
		Id:       930002,
		Type:     constant.ChannelTypeAnthropic,
		Status:   common.ChannelStatusEnabled,
		Name:     "unindexed-groups",
		Models:   "claude-fable-5-2",
		Group:    "Claude-Code-1,Fallback-Group",
		Priority: &priority,
		Weight:   &weight,
	}
	require.NoError(t, DB.Create(&channel).Error)
	require.NoError(t, DB.Exec("DELETE FROM abilities").Error)

	require.NoError(t, LoadChannelCache())

	for _, group := range []string{"Claude-Code-1", "Fallback-Group"} {
		routed, err := GetRandomSatisfiedChannel(group, "claude-fable-5-2", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, routed, "group %s should route even when abilities has no row for it", group)
		assert.Equal(t, channel.Id, routed.Id)
	}
}
