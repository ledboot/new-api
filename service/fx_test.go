package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAggregateRatesUsesMedianAndDropsOutliers(t *testing.T) {
	quotes := []FxQuote{
		{Source: "ecb", Rate: 6.6529},
		{Source: "er-api", Rate: 6.660856},
		{Source: "fawazahmed", Rate: 6.656445},
	}
	aggregate, err := aggregateRates(quotes, 1)
	require.NoError(t, err)
	assert.InDelta(t, 6.656445, aggregate, 0.000001)

	quotes = append(quotes, FxQuote{Source: "broken", Rate: 9.9})
	aggregate, err = aggregateRates(quotes, 1)
	require.NoError(t, err)
	assert.InDelta(t, 6.656445, aggregate, 0.000001)

	aggregate, err = aggregateRates([]FxQuote{{Source: "ecb", Error: "http 500"}}, 1)
	assert.Error(t, err)
	assert.Zero(t, aggregate)
}

func TestAggregateRatesRejectsWhenEverySourceDisagrees(t *testing.T) {
	quotes := []FxQuote{
		{Source: "a", Rate: 6.6},
		{Source: "b", Rate: 1},
	}
	_, err := aggregateRates(quotes, 0.1)
	assert.Error(t, err, "quoting a wild rate is worse than refusing the refresh")
}

func TestLimitFxMoveHoldsLargeMovesUntilConfirmed(t *testing.T) {
	rate, pending, clamped := limitFxMove(6.6, 6.65, 1, 0)
	assert.False(t, clamped)
	assert.InDelta(t, 6.65, rate, 0.000001)
	assert.Zero(t, pending)

	rate, pending, clamped = limitFxMove(6.6, 8.0, 1, 0)
	assert.True(t, clamped)
	assert.InDelta(t, 6.6, rate, 0.000001)
	assert.InDelta(t, 8.0, pending, 0.000001)

	// A second refresh that repeats the move releases it.
	rate, pending, clamped = limitFxMove(6.6, 8.0, 1, 8.0)
	assert.False(t, clamped)
	assert.InDelta(t, 8.0, rate, 0.000001)
	assert.Zero(t, pending)

	// A different large move replaces the pending candidate without applying.
	rate, pending, clamped = limitFxMove(6.6, 7.4, 1, 8.0)
	assert.True(t, clamped)
	assert.InDelta(t, 6.6, rate, 0.000001)
	assert.InDelta(t, 7.4, pending, 0.000001)
}

func TestLimitFxMoveWithoutBaselineAcceptsAnyRate(t *testing.T) {
	rate, pending, clamped := limitFxMove(0, 6.66, 1, 0)
	assert.False(t, clamped)
	assert.InDelta(t, 6.66, rate, 0.000001)
	assert.Zero(t, pending)
}

func TestRoundRateKeepsSixDecimals(t *testing.T) {
	assert.InDelta(t, 6.723745, roundRate(6.7237449999), 0.0000001)
	assert.Zero(t, roundRate(-1))
}
