package observability

import (
	"bytes"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

const attemptKey = "relay_stream_observation"
const maxEventBytes = 256 * 1024

var modelIdentifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$`)
var requestIdentifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

type Attempt struct {
	mu       sync.Mutex
	record   attemptRecord
	observed bool
	visible  bool
	tool     bool
	unknown  bool
	terminal bool
	failed   bool
	line     []byte
	event    []byte
}

type attemptRecord struct {
	RequestID    string `json:"request_id"`
	UpstreamID   string `json:"upstream_request_id,omitempty"`
	UpstreamHead string `json:"upstream_request_id_header,omitempty"`
	Route        string `json:"route"`
	Model        string `json:"model"`
	Channel      int    `json:"channel"`
	Previous     int    `json:"previous_channel,omitempty"`
	Index        int    `json:"attempt"`
	Status       int    `json:"status"`
	UpstreamHTTP int    `json:"upstream_http,omitempty"`
	End          string `json:"end,omitempty"`
	Outcome      string `json:"outcome,omitempty"`
	Stop         string `json:"stop,omitempty"`
	UpstreamBody string `json:"upstream_output"`
	Final        bool   `json:"final"`
}

func Start(c *gin.Context, model string, channel, previous, index int) *Attempt {
	route := c.Request.URL.Path
	switch route {
	case "/v1/messages", "/v1/chat/completions", "/v1/responses":
	default:
		return nil
	}
	if !modelIdentifier.MatchString(model) {
		model = "other"
	}
	a := &Attempt{record: attemptRecord{
		RequestID: c.GetString(common.RequestIdKey), Route: route, Model: model,
		Channel: channel, Previous: previous, Index: index,
	}}
	c.Set(attemptKey, a)
	return a
}

func ObserveResponse(c *gin.Context, response *http.Response) {
	value, ok := c.Get(attemptKey)
	if !ok {
		return
	}
	a, ok := value.(*Attempt)
	if !ok || a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.record.UpstreamHTTP = response.StatusCode
	for _, header := range []string{common.RequestIdKey, "Request-Id", "X-Request-Id", "X-Upstream-Request-Id", "X-Amzn-RequestId", "X-Goog-Request-Id"} {
		if id := response.Header.Get(header); requestIdentifier.MatchString(id) {
			a.record.UpstreamID = id
			a.record.UpstreamHead = header
			break
		}
	}
	contentType, _, _ := strings.Cut(response.Header.Get("Content-Type"), ";")
	if response.Body != nil && strings.EqualFold(strings.TrimSpace(contentType), "text/event-stream") {
		a.observed = true
		response.Body = &observedBody{ReadCloser: response.Body, attempt: a}
	}
}

func (a *Attempt) Finish(c *gin.Context, status int, stream *relaycommon.StreamStatus, final bool) {
	if a == nil {
		return
	}
	a.mu.Lock()
	if len(a.line) != 0 {
		a.consumeLine(a.line)
		a.line = nil
	}
	a.dispatch()
	record := a.record
	switch {
	case !a.observed:
		record.UpstreamBody = "unobserved"
	case a.visible:
		record.UpstreamBody = "visible"
	case a.failed:
		record.UpstreamBody = "stream_error"
	case a.unknown:
		record.UpstreamBody = "unclassified"
	case a.tool:
		record.UpstreamBody = "tool_only"
	case a.terminal:
		record.UpstreamBody = "empty"
	default:
		record.UpstreamBody = "incomplete"
	}
	a.mu.Unlock()
	outcome := stream.OutcomeSnapshot()
	record.Status = status
	record.End = string(outcome.EndReason)
	record.Outcome = string(outcome.Response)
	record.Final = final
	if data, err := common.Marshal(record); err == nil {
		logger.LogInfo(c, "tokara_relay_attempt "+string(data))
	}
}

type observedBody struct {
	io.ReadCloser
	attempt *Attempt
}

func (b *observedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if n > 0 {
		a := b.attempt
		a.mu.Lock()
		a.consume(p[:n])
		a.mu.Unlock()
	}
	return n, err
}

func (a *Attempt) consume(p []byte) {
	for len(p) > 0 && !a.unknown {
		line, rest, end := bytes.Cut(p, []byte("\n"))
		if len(a.line)+len(line) > maxEventBytes {
			a.unknown = true
			a.line = nil
			a.event = nil
			return
		}
		if !end || len(a.line) > 0 {
			a.line = append(a.line, line...)
			line = a.line
		}
		if end {
			a.consumeLine(line)
			a.line = a.line[:0]
		}
		p = rest
	}
}

func (a *Attempt) consumeLine(line []byte) {
	line = bytes.TrimSuffix(line, []byte("\r"))
	if len(line) == 0 {
		a.dispatch()
		return
	}
	data, ok := bytes.CutPrefix(line, []byte("data:"))
	if !ok {
		return
	}
	data = bytes.TrimPrefix(data, []byte(" "))
	if len(a.event)+len(data)+1 > maxEventBytes {
		a.unknown = true
		a.event = nil
		return
	}
	a.event = append(a.event, data...)
	a.event = append(a.event, '\n')
}

func (a *Attempt) dispatch() {
	if len(a.event) == 0 || a.unknown {
		return
	}
	data := bytes.TrimSpace(a.event)
	a.event = a.event[:0]
	if bytes.Equal(data, []byte("[DONE]")) {
		a.terminal = true
		return
	}
	var event map[string]any
	if err := common.Unmarshal(data, &event); err != nil || event == nil {
		a.unknown = true
		return
	}
	kind, _ := event["type"].(string)
	a.failed = a.failed || kind == "error" || kind == "response.failed" || event["error"] != nil
	delta, _ := event["delta"].(map[string]any)
	switch kind {
	case "message_stop", "response.completed", "response.incomplete", "response.failed":
		a.terminal = true
		if response, _ := event["response"].(map[string]any); response != nil {
			a.setStop(response["status"])
			if detail, _ := response["incomplete_details"].(map[string]any); detail != nil {
				a.setStop(detail["reason"])
			}
			for _, item := range array(response["output"]) {
				a.observeItem(item)
			}
		}
	case "message_delta":
		a.setStop(delta["stop_reason"])
	case "content_block_start":
		a.observeItem(event["content_block"])
	case "content_block_delta":
		a.visible = a.visible || delta["type"] == "text_delta" && nonblank(delta["text"])
		a.tool = a.tool || delta["type"] == "input_json_delta"
	case "response.output_text.delta", "response.refusal.delta", "response.audio.delta", "response.output_audio.delta":
		a.visible = a.visible || nonblank(event["delta"])
	case "response.output_item.added", "response.output_item.done":
		a.observeItem(event["item"])
	}
	for _, raw := range array(event["choices"]) {
		choice, _ := raw.(map[string]any)
		value, _ := choice["delta"].(map[string]any)
		a.visible = a.visible || visibleOutput(value)
		a.tool = a.tool || len(array(value["tool_calls"])) > 0 || value["function_call"] != nil
		if nonblank(choice["finish_reason"]) {
			a.terminal = true
			a.setStop(choice["finish_reason"])
		}
	}
}

func (a *Attempt) observeItem(raw any) {
	item, _ := raw.(map[string]any)
	switch item["type"] {
	case "text", "message":
		a.visible = a.visible || visibleOutput(item)
	case "tool_use", "server_tool_use", "function_call", "custom_tool_call",
		"web_search_call", "computer_call", "file_search_call", "code_interpreter_call", "mcp_call":
		a.tool = true
	}
}

func (a *Attempt) setStop(raw any) {
	reason, _ := raw.(string)
	switch reason {
	case "":
	case "stop", "length", "end_turn", "stop_sequence", "max_tokens", "tool_use", "tool_calls",
		"function_call", "content_filter", "refusal", "pause_turn", "completed", "incomplete", "failed",
		"max_output_tokens", "model_context_window_exceeded":
		a.record.Stop = reason
	default:
		a.record.Stop = "other"
	}
}

func array(value any) []any {
	items, _ := value.([]any)
	return items
}

func nonblank(value any) bool {
	text, _ := value.(string)
	return strings.TrimSpace(text) != ""
}

func visibleOutput(value map[string]any) bool {
	audio, _ := value["audio"].(map[string]any)
	if nonblank(value["text"]) || nonblank(value["content"]) || nonblank(value["refusal"]) ||
		nonblank(audio["data"]) || nonblank(audio["transcript"]) {
		return true
	}
	for _, item := range array(value["content"]) {
		part, _ := item.(map[string]any)
		if nonblank(part["text"]) || nonblank(part["refusal"]) || nonblank(part["transcript"]) {
			return true
		}
	}
	return false
}
