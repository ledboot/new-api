package middleware

import (
	"context"
	"net"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCrawlerHostSuffixes(t *testing.T) {
	assert.Equal(t, []string{".googlebot.com", ".google.com"}, crawlerHostSuffixes("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"))
	assert.Equal(t, []string{".openai.com"}, crawlerHostSuffixes("GPTBot/1.2"))
	assert.Empty(t, crawlerHostSuffixes("curl/8.4.0"))
	assert.Empty(t, crawlerHostSuffixes(""))
}

func TestCrawlerClientIPOnlyTrustsCloudflareHeaderFromEdge(t *testing.T) {
	gin.SetMode(gin.TestMode)

	requestWith := func(remoteAddr, forwardedFor, connectingIP string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = remoteAddr
		if forwardedFor != "" {
			req.Header.Set("X-Forwarded-For", forwardedFor)
		}
		if connectingIP != "" {
			req.Header.Set("CF-Connecting-IP", connectingIP)
		}
		c.Request = req
		return c
	}

	// Direct connection: the header is client-controlled and must be ignored.
	assert.Equal(t, "203.0.113.9", crawlerClientIP(requestWith("203.0.113.9:1234", "", "66.249.66.1")))

	// Cloudflare edge (trusted proxy): the real client comes from the edge.
	assert.Equal(t, "66.249.66.1", crawlerClientIP(requestWith("172.64.0.5:443", "66.249.66.1", "66.249.66.1")))

	// Cloudflare edge without a usable header: nothing to verify.
	assert.Equal(t, "", crawlerClientIP(requestWith("172.64.0.5:443", "", "not-an-ip")))
}

func TestConfirmCrawlerHostRequiresForwardConfirmedReverseDNS(t *testing.T) {
	originalAddr, originalIP := crawlerLookupAddr, crawlerLookupIP
	t.Cleanup(func() { crawlerLookupAddr, crawlerLookupIP = originalAddr, originalIP })

	crawlerLookupAddr = func(_ context.Context, addr string) ([]string, error) {
		switch addr {
		case "66.249.66.1":
			return []string{"crawl-66-249-66-1.googlebot.com."}, nil
		case "198.51.100.7":
			// The PTR record claims Google, but this name resolves elsewhere.
			return []string{"crawl-66-249-66-1.googlebot.com."}, nil
		}
		return []string{"host.example.net."}, nil
	}
	crawlerLookupIP = func(_ context.Context, host string) ([]net.IP, error) {
		if host == "crawl-66-249-66-1.googlebot.com" {
			return []net.IP{net.ParseIP("66.249.66.1")}, nil
		}
		return nil, &net.DNSError{Err: "no such host", Name: host}
	}

	google := crawlerHostSuffixes("Googlebot/2.1")
	require.True(t, confirmCrawlerHost("66.249.66.1", google))
	assert.False(t, confirmCrawlerHost("198.51.100.7", google))
	assert.False(t, confirmCrawlerHost("203.0.113.9", google))
	assert.False(t, confirmCrawlerHost("66.249.66.1", nil))
}

func TestVerifiedCrawlerHonoursTheOperatorSwitch(t *testing.T) {
	originalAddr, originalIP := crawlerLookupAddr, crawlerLookupIP
	t.Cleanup(func() { crawlerLookupAddr, crawlerLookupIP = originalAddr, originalIP })
	crawlerLookupAddr = func(_ context.Context, addr string) ([]string, error) {
		return []string{"crawl-66-249-66-1.googlebot.com."}, nil
	}
	crawlerLookupIP = func(_ context.Context, host string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("66.249.66.1")}, nil
	}

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "66.249.66.1:1234"
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)")
	c.Request = req

	verifiedCrawlerResults.Clear()
	assert.True(t, verifiedCrawler(c))

	verifiedCrawlerResults.Clear()
	t.Setenv("SITE_ENTRY_ALLOW_CRAWLERS", "false")
	assert.False(t, verifiedCrawler(c))

	verifiedCrawlerResults.Clear()
	t.Setenv("SITE_ENTRY_ALLOW_CRAWLERS", "true")
	req.Header.Set("User-Agent", "curl/8.4.0")
	assert.False(t, verifiedCrawler(c))
}

func TestSiteEntryChallengeLetsVerifiedCrawlersReadTheWebsite(t *testing.T) {
	require.NoError(t, i18n.Init())
	originalAddr, originalIP := crawlerLookupAddr, crawlerLookupIP
	t.Cleanup(func() { crawlerLookupAddr, crawlerLookupIP = originalAddr, originalIP })
	verifiedCrawlerResults.Clear()
	crawlerLookupAddr = func(_ context.Context, addr string) ([]string, error) {
		return []string{"crawl-66-249-66-1.googlebot.com."}, nil
	}
	crawlerLookupIP = func(_ context.Context, host string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("66.249.66.1")}, nil
	}

	t.Setenv("TURNSTILE_SITE_ENTRY_ENABLED", "true")
	previousEnabled, previousSiteKey, previousSecretKey := common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey
	previousAddress := system_setting.ServerAddress
	t.Cleanup(func() {
		common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = previousEnabled, previousSiteKey, previousSecretKey
		system_setting.ServerAddress = previousAddress
	})
	common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = true, "public-key", "private-key"
	system_setting.ServerAddress = "https://example.com"

	contextFor := func(remoteAddr, userAgent string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest("GET", "https://example.com/", nil)
		req.Host = "example.com"
		req.RemoteAddr = remoteAddr
		req.Header.Set("User-Agent", userAgent)
		c.Request = req
		return c
	}

	assert.False(t, SiteEntryChallenge(contextFor("66.249.66.1:443", "Mozilla/5.0 (compatible; Googlebot/2.1)")))
	assert.True(t, SiteEntryChallenge(contextFor("203.0.113.9:443", "Mozilla/5.0 (compatible; Googlebot/2.1)")))
	assert.True(t, SiteEntryChallenge(contextFor("203.0.113.9:443", "Mozilla/5.0")))
}
