package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func floatPtr(value float64) *float64 { return &value }
func intPtr(value int) *int           { return &value }

func videoModel() openLuxModel {
	return openLuxModel{
		Name:      "veo_3_1",
		QuotaType: intPtr(1),
		Price:     floatPtr(0.768),
		Endpoints: []string{"OpenAI video format"},
	}
}

func TestOpenLuxVideoPricesBillPerRequestWithMarkup(t *testing.T) {
	// 0.768 upstream × 0.14361 group discount × 1.2 markup.
	expression, err := openLuxPriceExpression(videoModel(), 2, 0.14361, 1.2)
	require.NoError(t, err)
	assert.Regexp(t, `^tier\("request", fixed\([0-9.]+\)\)$`, expression)

	base, err := openLuxPriceExpression(videoModel(), 2, 1, 1)
	require.NoError(t, err)
	marked, err := openLuxPriceExpression(videoModel(), 2, 1, 1.5)
	require.NoError(t, err)
	assert.NotEqual(t, base, marked, "markup must change the frozen price")
}

func TestOpenLuxVideoPricesRejectUnverifiedShapes(t *testing.T) {
	withSteps := videoModel()
	withSteps.Steps = []openLuxStep{{Size: 10}}
	_, err := openLuxPriceExpression(withSteps, 2, 1, 1)
	require.Error(t, err)

	withCache := videoModel()
	withCache.Cache = floatPtr(0.1)
	_, err = openLuxPriceExpression(withCache, 2, 1, 1)
	require.Error(t, err)

	noPrice := videoModel()
	noPrice.Price = nil
	_, err = openLuxPriceExpression(noPrice, 2, 1, 1)
	require.Error(t, err)

	resolution := videoModel()
	resolution.VideoResolutionRatios = map[string]float64{"1080p": 2}
	_, err = openLuxPriceExpression(resolution, 2, 1, 1)
	require.Error(t, err)
}

func TestOpenLuxVideoEndpointsMapToTheLocalVideoRoute(t *testing.T) {
	endpoints := openLuxVideoEndpoints([]string{"OpenAI video format"})
	require.NotNil(t, endpoints)
	assert.Equal(t, "/v1/videos", endpoints["openai-video"].Path)
	assert.Nil(t, openLuxVideoEndpoints([]string{"openai"}))
	assert.Nil(t, openLuxVideoEndpoints([]string{"OpenAI video format", "openai"}))
}
