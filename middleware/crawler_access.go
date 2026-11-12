package middleware

import (
	"context"
	"net"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// Search engine and AI crawler access.
//
// The site-entry challenge answers every anonymous document request with 403,
// which also stops search engines from indexing the website: a crawler can
// never solve a Turnstile challenge. Verified crawlers are therefore admitted
// without a challenge, and only after a forward-confirmed reverse DNS lookup
// proves the connecting IP belongs to the operator named by its User-Agent.
// Cloudflare overwrites CF-Connecting-IP for every proxied request, so that
// header is read only when the connection itself comes from a Cloudflare edge.

type crawlerIdentity struct {
	// userAgentToken is matched case-insensitively against the User-Agent.
	userAgentToken string
	// reverseSuffixes are the host suffixes the PTR record must end with.
	reverseSuffixes []string
}

var crawlerIdentities = []crawlerIdentity{
	{"googlebot", []string{".googlebot.com", ".google.com"}},
	{"adsbot-google", []string{".googlebot.com", ".google.com"}},
	{"google-inspectiontool", []string{".googlebot.com", ".google.com"}},
	{"storebot-google", []string{".googlebot.com", ".google.com"}},
	{"bingbot", []string{".search.msn.com"}},
	{"duckduckbot", []string{".duckduckgo.com"}},
	{"applebot", []string{".applebot.apple.com"}},
	{"baiduspider", []string{".baidu.com", ".baidu.jp"}},
	{"yandexbot", []string{".yandex.com", ".yandex.ru", ".yandex.net"}},
	{"gptbot", []string{".openai.com"}},
	{"oai-searchbot", []string{".openai.com"}},
	{"chatgpt-user", []string{".openai.com"}},
	{"claudebot", []string{".anthropic.com"}},
	{"claude-searchbot", []string{".anthropic.com"}},
	{"claude-user", []string{".anthropic.com"}},
	{"perplexitybot", []string{".perplexity.ai"}},
	{"perplexity-user", []string{".perplexity.ai"}},
}

// Cloudflare's published edge ranges. Only a connection from one of these
// addresses may name the real client through CF-Connecting-IP.
var cloudflareEdgeNets = mustParseCIDRs(
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)

const (
	verifiedCrawlerCacheTTL = 10 * time.Minute
	// verifiedCrawlerCacheLimit bounds the cache, because the key is a
	// client-controlled address and a forged crawler User-Agent may come from
	// any number of them.
	verifiedCrawlerCacheLimit = 4096
)

type verifiedCrawlerEntry struct {
	verified bool
	expires  time.Time
}

var (
	verifiedCrawlerResults     sync.Map // client IP -> verifiedCrawlerEntry
	verifiedCrawlerResultCount atomic.Int64

	// Indirections keep the DNS boundary replaceable in tests.
	crawlerLookupAddr = func(ctx context.Context, addr string) ([]string, error) {
		return net.DefaultResolver.LookupAddr(ctx, addr)
	}
	crawlerLookupIP = func(ctx context.Context, host string) ([]net.IP, error) {
		return net.DefaultResolver.LookupIP(ctx, "ip", host)
	}
)

func mustParseCIDRs(values ...string) []*net.IPNet {
	nets := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			panic("invalid CIDR: " + value)
		}
		nets = append(nets, network)
	}
	return nets
}

// verifiedCrawler reports whether the request is a search engine or AI crawler
// whose address was confirmed by DNS. Challenging such a request only prevents
// the site from being indexed.
func verifiedCrawler(c *gin.Context) bool {
	if os.Getenv("SITE_ENTRY_ALLOW_CRAWLERS") == "false" {
		return false
	}
	suffixes := crawlerHostSuffixes(c.Request.UserAgent())
	if len(suffixes) == 0 {
		return false
	}
	clientIP := crawlerClientIP(c)
	if clientIP == "" {
		return false
	}
	now := time.Now()
	if cached, ok := verifiedCrawlerResults.Load(clientIP); ok {
		entry := cached.(verifiedCrawlerEntry)
		if now.Before(entry.expires) {
			return entry.verified
		}
	}
	verified := confirmCrawlerHost(clientIP, suffixes)
	if verifiedCrawlerResultCount.Load() >= verifiedCrawlerCacheLimit {
		verifiedCrawlerResults.Clear()
		verifiedCrawlerResultCount.Store(0)
	}
	if _, loaded := verifiedCrawlerResults.LoadOrStore(clientIP, verifiedCrawlerEntry{
		verified: verified,
		expires:  now.Add(verifiedCrawlerCacheTTL),
	}); !loaded {
		verifiedCrawlerResultCount.Add(1)
	}
	return verified
}

func crawlerHostSuffixes(userAgent string) []string {
	lowerAgent := strings.ToLower(userAgent)
	if lowerAgent == "" {
		return nil
	}
	for _, identity := range crawlerIdentities {
		if strings.Contains(lowerAgent, identity.userAgentToken) {
			return identity.reverseSuffixes
		}
	}
	return nil
}

// crawlerClientIP returns the address to verify. Behind Cloudflare the
// connection ends at an edge node, so the real client comes from the
// CF-Connecting-IP header that Cloudflare writes itself.
func crawlerClientIP(c *gin.Context) string {
	clientIP := c.ClientIP()
	if net.ParseIP(clientIP) == nil {
		return ""
	}
	edgeIP := net.ParseIP(clientIP)
	if edgeIP == nil || !inAnyNetwork(edgeIP, cloudflareEdgeNets) {
		return clientIP
	}
	forwarded := strings.TrimSpace(c.GetHeader("CF-Connecting-IP"))
	if net.ParseIP(forwarded) == nil {
		return ""
	}
	return forwarded
}

func inAnyNetwork(ip net.IP, networks []*net.IPNet) bool {
	for _, network := range networks {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// confirmCrawlerHost requires both directions of the DNS lookup: the PTR record
// of the address must name a host under the operator's domain, and that name
// must resolve back to the same address.
func confirmCrawlerHost(clientIP string, suffixes []string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	names, err := crawlerLookupAddr(ctx, clientIP)
	if err != nil {
		return false
	}
	address := net.ParseIP(clientIP)
	for _, name := range names {
		host := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(name)), ".")
		if !hasHostSuffix(host, suffixes) {
			continue
		}
		resolved, err := crawlerLookupIP(ctx, host)
		if err != nil {
			continue
		}
		for _, candidate := range resolved {
			if candidate.Equal(address) {
				return true
			}
		}
	}
	return false
}

func hasHostSuffix(host string, suffixes []string) bool {
	for _, suffix := range suffixes {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return false
}
