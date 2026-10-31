package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useTopUpDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&TopUp{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})
	return db
}

func TestRecordAdminQuotaGrantStoresACompletedOrder(t *testing.T) {
	db := useTopUpDB(t)

	require.NoError(t, RecordAdminQuotaGrant(7, 500000))

	var topUp TopUp
	require.NoError(t, db.Where("user_id = ?", 7).First(&topUp).Error)
	assert.Equal(t, int64(500000), topUp.Amount)
	assert.Equal(t, 0.0, topUp.Money)
	assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
	assert.Equal(t, PaymentMethodAdminGrant, topUp.PaymentMethod)
	assert.Equal(t, PaymentProviderAdminGrant, topUp.PaymentProvider)
	assert.NotEmpty(t, topUp.TradeNo)
	assert.NotZero(t, topUp.CreateTime)
	assert.Equal(t, topUp.CreateTime, topUp.CompleteTime)

	// A zero or negative credit is not an order.
	assert.ErrorIs(t, RecordAdminQuotaGrant(7, 0), ErrInvalidTopUpQuota)
	assert.ErrorIs(t, RecordAdminQuotaGrant(0, 100), ErrInvalidTopUpQuota)

	// Concurrent grants must not collide on the unique trade number.
	require.NoError(t, RecordAdminQuotaGrant(7, 100))
	var count int64
	require.NoError(t, db.Model(&TopUp{}).Where("user_id = ?", 7).Count(&count).Error)
	assert.Equal(t, int64(2), count)
}

func TestUserOrderListHidesAdminGrants(t *testing.T) {
	db := useTopUpDB(t)

	now := common.GetTimestamp()
	require.NoError(t, db.Create(&TopUp{UserId: 9, Amount: 100, TradeNo: "paid-order", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, CreateTime: now, Status: common.TopUpStatusSuccess}).Error)
	require.NoError(t, RecordAdminQuotaGrant(9, 500000))

	topups, total, err := GetUserTopUps(9, &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, topups, 1)
	assert.Equal(t, "paid-order", topups[0].TradeNo)

	// Searching the self view must apply the same exclusion.
	searched, searchTotal, err := SearchUserTopUps(9, "", &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(1), searchTotal)
	require.Len(t, searched, 1)
	assert.Equal(t, "paid-order", searched[0].TradeNo)

	// The administrator view keeps every record, including grants.
	all, allTotal, err := GetAllTopUps(&common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(2), allTotal)
	assert.Len(t, all, 2)
}
