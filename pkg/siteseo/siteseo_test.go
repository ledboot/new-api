package siteseo

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testIndexPage = `<!doctype html>
<html lang="en"><head><!--seo-->
<title>fallback</title>
<!--/seo--></head><body></body></html>`

func TestDocumentRendersPageMetadata(t *testing.T) {
	common.SystemName = "Tokara"

	home := string(Document([]byte(testIndexPage), "/", "https://tokara.top", "zh-CN,zh;q=0.9"))
	assert.Contains(t, home, `<html lang="zh-CN"`)
	assert.Contains(t, home, "<title>Tokara — 一站式 AI API 平台｜统一接入 OpenAI、Claude、Gemini</title>")
	assert.Contains(t, home, `<link rel="canonical" href="https://tokara.top/" />`)
	assert.Contains(t, home, `content="index, follow`)
	assert.Contains(t, home, `"@type":"Organization"`)
	assert.Contains(t, home, `"@type":"WebSite"`)
	assert.Contains(t, home, `"@type":"SoftwareApplication"`)
	assert.Contains(t, home, `<script type="application/json" id="site-seo-data">`)
	assert.NotContains(t, home, "<title>fallback</title>")

	english := string(Document([]byte(testIndexPage), "/pricing", "https://tokara.top", "en-US,en;q=0.9"))
	assert.Contains(t, english, `<html lang="en"`)
	assert.Contains(t, english, "<title>Tokara Pricing — Pay-as-you-go AI API model prices</title>")
	assert.Contains(t, english, `<link rel="canonical" href="https://tokara.top/pricing" />`)
	assert.Contains(t, english, `"@type":"BreadcrumbList"`)
	assert.NotContains(t, english, `"@type":"SoftwareApplication"`)
}

func TestDocumentIncludesSearchConsoleVerification(t *testing.T) {
	t.Setenv("GOOGLE_SITE_VERIFICATION", "verification-token")
	page := string(Document([]byte(testIndexPage), "/", "https://tokara.top", "en"))
	assert.Contains(t, page, `<meta name="google-site-verification" content="verification-token" />`)
}

func TestDocumentMarksUnknownPathsNoIndex(t *testing.T) {
	unknown := string(Document([]byte(testIndexPage), "/console/dashboard", "https://tokara.top", "en"))
	assert.Contains(t, unknown, `content="noindex, follow"`)
	assert.NotContains(t, unknown, `rel="canonical"`)
	assert.NotContains(t, unknown, `application/ld+json`)
	assert.Contains(t, unknown, "<title>Tokara — One AI API for OpenAI, Claude, Gemini and DeepSeek</title>")

	// API paths are never documents, whatever the request line says.
	assert.Equal(t, "/", cleanPath("/api/status"))
	assert.Equal(t, "/", cleanPath("/v1/chat/completions"))
}

func TestDocumentEscapesModelIdentifier(t *testing.T) {
	model := string(Document([]byte(testIndexPage), `/pricing/a"><b>x`, "https://tokara.top", "en"))
	assert.NotContains(t, model, `<b>x</title>`)
	assert.Contains(t, model, "a&#34;&gt;&lt;b&gt;x")
	assert.Contains(t, model, "pricing and billing")
}

func TestDocumentIndexesModelPagesByIdentifier(t *testing.T) {
	vendorPrefixed := string(Document([]byte(testIndexPage), "/pricing/openai%2Fgpt-4o", "https://tokara.top", "en"))
	assert.Contains(t, vendorPrefixed, "<title>openai/gpt-4o pricing and billing — Tokara</title>")
	assert.Contains(t, vendorPrefixed, `<link rel="canonical" href="https://tokara.top/pricing/openai%2Fgpt-4o" />`)
	assert.Contains(t, vendorPrefixed, `content="index, follow`)

	spaced := string(Document([]byte(testIndexPage), "/pricing/gpt%204o", "https://tokara.top", "zh-CN"))
	assert.Contains(t, spaced, "<title>gpt 4o 模型价格与计费 — Tokara</title>")
}

func TestBreadcrumbListsEachStepOnce(t *testing.T) {
	jsonLDOf := func(page string) string {
		start := strings.Index(page, `"@type":"BreadcrumbList"`)
		require.GreaterOrEqual(t, start, 0)
		end := strings.Index(page[start:], "</script>")
		require.GreaterOrEqual(t, end, 0)
		return page[start : start+end]
	}

	pricing := jsonLDOf(string(Document([]byte(testIndexPage), "/pricing", "https://tokara.top", "en")))
	assert.Equal(t, 1, strings.Count(pricing, `"name":"Pricing"`))

	model := jsonLDOf(string(Document([]byte(testIndexPage), "/pricing/gpt-4o", "https://tokara.top", "en")))
	assert.Equal(t, 1, strings.Count(model, `"name":"Pricing"`))
	assert.Equal(t, 1, strings.Count(model, `"name":"gpt-4o"`))
	assert.Contains(t, model, `"position":3`)
	assert.NotContains(t, model, `"position":4`)

	docs := jsonLDOf(string(Document([]byte(testIndexPage), "/docs", "https://tokara.top", "en")))
	assert.Contains(t, docs, `"name":"Docs"`)
	assert.Contains(t, docs, `"position":2`)
}

func TestFeeds(t *testing.T) {
	robots := RobotsTxt("https://tokara.top")
	assert.Contains(t, robots, "Sitemap: https://tokara.top/sitemap.xml")
	assert.Contains(t, robots, "Disallow: /v1/")
	assert.Contains(t, robots, "User-agent: GPTBot")

	sitemap := Sitemap("https://tokara.top", []string{"/pricing/claude-sonnet-4", "/pricing", "/"})
	assert.Contains(t, sitemap, "<loc>https://tokara.top/pricing</loc>")
	assert.Contains(t, sitemap, "<loc>https://tokara.top/pricing/claude-sonnet-4</loc>")
	assert.Equal(t, 1, strings.Count(sitemap, "<loc>https://tokara.top/</loc>"))

	llms := LLMsTxt("https://tokara.top")
	assert.True(t, strings.HasPrefix(llms, "# Tokara"))
	assert.Contains(t, llms, "(https://tokara.top/docs)")
}

func TestOriginPrefersConfiguredServerAddress(t *testing.T) {
	require.Equal(t, "https://tokara.top", Origin("https://www.tokara.top/", "panel.internal"))
	assert.Equal(t, "https://example.com:3000", Origin("", "www.example.com:3000"))
	assert.Equal(t, "", Origin("not a url", ""))
}

func TestCanonicalRedirectSendsWwwToApex(t *testing.T) {
	target, ok := CanonicalRedirect("https://tokara.top", "www.tokara.top", "/pricing?group=default")
	require.True(t, ok)
	assert.Equal(t, "https://tokara.top/pricing?group=default", target)

	_, ok = CanonicalRedirect("https://tokara.top", "tokara.top", "/pricing")
	assert.False(t, ok)

	// Nothing to canonicalize when no public address is configured.
	_, ok = CanonicalRedirect("", "www.tokara.top", "/")
	assert.False(t, ok)
}
