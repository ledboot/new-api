package observability

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestObserveResponsePreservesStreamAndRecordsVisibleOutput(t *testing.T) {
	c, _ := gin.CreateTestContext(nil)
	c.Request, _ = http.NewRequest(http.MethodPost, "/v1/messages", nil)
	attempt := Start(c, "claude-sonnet-5-5", 7, 0, 0)
	require.NotNil(t, attempt)

	body := "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hidden\"}}\r\n\r\n" +
		"data: {\"type\":\"content_block_delta\",\r\ndata: \"delta\":{\"type\":\"text_delta\",\"text\":\"visible\"}}\r\n\r\n" +
		"data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n" +
		"data: {\"type\":\"message_stop\"}\n\n"
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": {"text/event-stream; charset=utf-8"},
			"Request-Id":   {"req_provider"},
		},
		Body: io.NopCloser(iotest.OneByteReader(strings.NewReader(body))),
	}
	ObserveResponse(c, response)
	raw, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	assert.Equal(t, body, string(raw))
	assert.Equal(t, "req_provider", attempt.record.UpstreamID)
	assert.Equal(t, "Request-Id", attempt.record.UpstreamHead)
	assert.Equal(t, "end_turn", attempt.record.Stop)
	assert.True(t, attempt.visible)
	assert.True(t, attempt.terminal)
}

func TestThinkingOnlyStreamHasNoVisibleOutput(t *testing.T) {
	attempt := &Attempt{}
	attempt.consume([]byte("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"hidden\"},\"finish_reason\":\"length\"}]}\n\n" +
		"data: [DONE]\n\n"))
	assert.True(t, attempt.terminal)
	assert.False(t, attempt.visible)
	assert.False(t, attempt.tool)
	assert.Equal(t, "length", attempt.record.Stop)
}
