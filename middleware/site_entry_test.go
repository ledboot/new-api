package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type siteEntryTestTransport func(*http.Request) (*http.Response, error)

func (transport siteEntryTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return transport(req)
}

func TestSiteEntryChallenge(t *testing.T) {
	require.NoError(t, i18n.Init())
	t.Setenv("TURNSTILE_SITE_ENTRY_ENABLED", "true")
	previousEnabled, previousSiteKey, previousSecretKey := common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey
	previousAddress, previousClient := system_setting.ServerAddress, turnstileClient
	t.Cleanup(func() {
		common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = previousEnabled, previousSiteKey, previousSecretKey
		system_setting.ServerAddress, turnstileClient = previousAddress, previousClient
	})
	common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = true, "public-key", "private-key"
	system_setting.ServerAddress = "https://example.com"
	redeemed := false
	turnstileClient = &http.Client{Transport: siteEntryTestTransport(func(req *http.Request) (*http.Response, error) {
		assert.Equal(t, "https://challenges.cloudflare.com/turnstile/v0/siteverify", req.URL.String())
		require.NoError(t, req.ParseForm())
		assert.Equal(t, "private-key", req.PostForm.Get("secret"))
		status, result := 200, `{"success":false}`
		switch req.PostForm.Get("response") {
		case "valid":
			if !redeemed {
				redeemed = true
				result = `{"success":true,"action":"site_entry","hostname":"example.com"}`
			}
		case "wrong-action":
			result = `{"success":true,"action":"login","hostname":"example.com"}`
		case "wrong-host":
			result = `{"success":true,"action":"site_entry","hostname":"attacker.com"}`
		case "upstream-error":
			status, result = 503, `{"success":true,"action":"site_entry","hostname":"example.com"}`
		case "bad-json":
			result = "{"
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(result))}, nil
	})}

	router := gin.New()
	router.POST("/api/site-entry/verify", VerifySiteEntry)
	router.GET("/api/status", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.NoRoute(func(c *gin.Context) {
		if !SiteEntryChallenge(c) {
			c.String(http.StatusOK, "website")
		}
	})
	request := func(method, target, origin, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, strings.NewReader(body))
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	page := "https://example.com/pricing?ref=test"
	verify := "https://example.com/api/site-entry/verify"
	origin := "https://example.com"
	challenge := request(http.MethodGet, page, "", "", nil)
	assert.Equal(t, http.StatusForbidden, challenge.Code)
	assert.Equal(t, "private, no-store", challenge.Header().Get("Cache-Control"))
	assert.Contains(t, challenge.Body.String(), `data-action="site_entry"`)
	assert.Contains(t, challenge.Body.String(), `data-sitekey="public-key"`)
	assert.NotContains(t, challenge.Body.String(), "private-key")
	assert.Equal(t, http.StatusMethodNotAllowed, request(http.MethodPost, page, "", "", nil).Code)
	assert.Equal(t, http.StatusOK, request(http.MethodGet, origin+"/api/status", "", "", nil).Code)
	assert.Equal(t, http.StatusServiceUnavailable, request(http.MethodGet, "https://attacker.com/", "", "", nil).Code)

	for _, tc := range []struct {
		name, origin, token string
		status              int
	}{
		{"cross-origin", "https://attacker.com", "valid", 403},
		{"missing origin", "", "valid", 403},
		{"missing token", origin, "", 400},
		{"long token", origin, strings.Repeat("x", 2049), 400},
		{"wrong action", origin, "wrong-action", 403},
		{"wrong host", origin, "wrong-host", 403},
		{"upstream error", origin, "upstream-error", 403},
		{"malformed upstream response", origin, "bad-json", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := request(http.MethodPost, verify, tc.origin, `{"token":"`+tc.token+`"}`, nil)
			assert.Equal(t, tc.status, result.Code)
			assert.Empty(t, result.Result().Cookies())
		})
	}

	verified := request(http.MethodPost, verify, origin, `{"token":"valid"}`, nil)
	require.Equal(t, http.StatusNoContent, verified.Code)
	cookies := verified.Result().Cookies()
	require.Len(t, cookies, 1)
	cookie := cookies[0]
	assert.True(t, cookie.Secure)
	assert.True(t, cookie.HttpOnly)
	assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	assert.Empty(t, cookie.Domain)
	assert.Zero(t, cookie.MaxAge)

	allowed := request(http.MethodGet, page, "", "", cookie)
	assert.Equal(t, http.StatusOK, allowed.Code)
	assert.Equal(t, "website", allowed.Body.String())
	assert.Equal(t, "private, no-store", allowed.Header().Get("Cache-Control"))
	assert.Equal(t, http.StatusForbidden, request(http.MethodGet, "https://www.example.com/pricing", "", "", cookie).Code)
	assert.Equal(t, http.StatusForbidden, request(http.MethodPost, verify, origin, `{"token":"valid"}`, nil).Code)

	expired := strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10)
	cookie.Value = expired + "." + signSiteEntry(origin, "private-key", expired)
	assert.Equal(t, http.StatusForbidden, request(http.MethodGet, page, "", "", cookie).Code)
	cookie.Value = strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10) + ".forged"
	assert.Equal(t, http.StatusForbidden, request(http.MethodGet, page, "", "", cookie).Code)

	t.Setenv("TURNSTILE_SITE_ENTRY_ENABLED", "false")
	assert.Equal(t, http.StatusOK, request(http.MethodGet, page, "", "", nil).Code)
	assert.Equal(t, http.StatusNotFound, request(http.MethodPost, verify, origin, `{"token":"valid"}`, nil).Code)
}
