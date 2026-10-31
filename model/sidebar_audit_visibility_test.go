package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useSidebarAuditDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &Option{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})
	return db
}

func parseSidebarConfig(t *testing.T, raw string) map[string]any {
	t.Helper()
	config := map[string]any{}
	require.NoError(t, common.Unmarshal([]byte(raw), &config))
	return config
}

func consoleAuditValue(t *testing.T, raw string) (any, bool) {
	t.Helper()
	console, ok := parseSidebarConfig(t, raw)["console"].(map[string]any)
	require.True(t, ok, "console section is missing from %s", raw)
	audit, ok := console["audit"]
	return audit, ok
}

func TestDefaultSidebarConfigHidesAuditForNonAdminRoles(t *testing.T) {
	for _, role := range []int{common.RoleGuestUser, common.RoleCommonUser} {
		audit, ok := consoleAuditValue(t, generateDefaultSidebarConfigForRole(role))
		require.True(t, ok, "role %d must record the audit flag", role)
		assert.Equal(t, false, audit, "role %d must hide the audit menu", role)
	}
	for _, role := range []int{common.RoleAdminUser, common.RoleRootUser} {
		audit, ok := consoleAuditValue(t, generateDefaultSidebarConfigForRole(role))
		require.True(t, ok, "role %d must record the audit flag", role)
		assert.Equal(t, true, audit, "role %d must keep the audit menu", role)
	}
}

func TestMigrateSidebarAuditMenuVisibilityBackfillsExistingUsers(t *testing.T) {
	db := useSidebarAuditDB(t)

	insertUser := func(username string, role int, sidebarModules string) {
		t.Helper()
		setting := dto.UserSetting{SidebarModules: sidebarModules}
		user := User{Username: username, Role: role, Setting: "", AffCode: username}
		user.SetSetting(setting)
		require.NoError(t, db.Create(&user).Error)
	}

	// Missing key: the backfill must add the flag.
	insertUser("legacy-plain", common.RoleCommonUser, `{"console":{"enabled":true,"log":true}}`)
	// No sidebar config at all: nothing narrows today, so seed the flag.
	insertUser("legacy-empty", common.RoleCommonUser, "")
	// Explicit grant: an administrator already allowed it; do not override.
	insertUser("explicit-allow", common.RoleCommonUser, `{"console":{"enabled":true,"audit":true}}`)
	// Admin roles keep their access.
	insertUser("admin", common.RoleAdminUser, `{"console":{"enabled":true}}`)
	insertUser("root", common.RoleRootUser, `{"console":{"enabled":true}}`)

	require.NoError(t, migrateSidebarAuditMenuVisibility(db))

	readModules := func(username string) string {
		t.Helper()
		var user User
		require.NoError(t, db.Where("username = ?", username).First(&user).Error)
		return user.GetSetting().SidebarModules
	}

	audit, ok := consoleAuditValue(t, readModules("legacy-plain"))
	require.True(t, ok)
	assert.Equal(t, false, audit)
	// Other console modules must stay untouched.
	console := parseSidebarConfig(t, readModules("legacy-plain"))["console"].(map[string]any)
	assert.Equal(t, true, console["log"])

	audit, ok = consoleAuditValue(t, readModules("legacy-empty"))
	require.True(t, ok)
	assert.Equal(t, false, audit)

	audit, ok = consoleAuditValue(t, readModules("explicit-allow"))
	require.True(t, ok)
	assert.Equal(t, true, audit, "an explicit grant must be preserved")

	for _, username := range []string{"admin", "root"} {
		_, ok := consoleAuditValue(t, readModules(username))
		assert.False(t, ok, "%s must not receive a narrowing audit flag", username)
	}

	// Idempotent: a second run changes nothing.
	before := readModules("legacy-plain")
	require.NoError(t, migrateSidebarAuditMenuVisibility(db))
	assert.Equal(t, before, readModules("legacy-plain"))
}

func TestMigrateOpenLuxTierLabelsStripsTheProviderName(t *testing.T) {
	db := useSidebarAuditDB(t)

	stored := billing_setting.OpenLuxSales{
		"AWS-Bedrock-1": {
			NormalizedPrices: true,
			ChannelID:        1,
			Multiplier:       1,
			SourceVersion:    "abc",
			Models: map[string]billing_setting.OpenLuxSalePrice{
				"claude-opus-5": {
					Cost:       `tier("openlux_1", p * 1 + c * 5)`,
					Expression: `len <= 100000 ? tier("openlux_1", p * 1) : tier("openlux_2", p * 5)`,
				},
			},
		},
	}
	encoded, err := common.Marshal(stored)
	require.NoError(t, err)
	require.NoError(t, db.Create(&Option{Key: "OpenLuxSales", Value: string(encoded)}).Error)

	require.NoError(t, MigrateOpenLuxTierLabels(db))

	var option Option
	require.NoError(t, db.Where("key = ?", "OpenLuxSales").First(&option).Error)
	assert.NotContains(t, option.Value, "openlux_")
	assert.Contains(t, option.Value, `tier(\"tier_1\"`)
	assert.Contains(t, option.Value, `tier(\"tier_2\"`)
	// The rewritten contract must still be a valid stored configuration.
	_, err = billing_setting.ParseOpenLuxSales(option.Value)
	require.NoError(t, err)

	// Idempotent: a second run leaves the neutral value untouched.
	before := option.Value
	require.NoError(t, MigrateOpenLuxTierLabels(db))
	require.NoError(t, db.Where("key = ?", "OpenLuxSales").First(&option).Error)
	assert.Equal(t, before, option.Value)
}
