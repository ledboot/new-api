package siteseo

import (
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// indexablePaths are the public documents listed in the sitemap and llms.txt.
// They are the pages the embedded frontend renders without authentication.
var indexablePaths = []string{
	"/",
	"/claude-code",
	"/gpt",
	"/gemini",
	"/pricing",
	"/docs",
	"/about",
	"/rankings",
	"/privacy-policy",
	"/user-agreement",
}

// RobotsTxt keeps relay and console endpoints out of the index while letting
// search engines and AI assistants read the public website.
func RobotsTxt(origin string) string {
	var builder strings.Builder
	builder.WriteString("# " + common.SystemName + "\n")
	builder.WriteString("User-agent: *\n")
	builder.WriteString("Allow: /\n")
	for _, disallowed := range []string{
		"/api/", "/v1/", "/mj/", "/pg/", "/assets/",
		"/sign-in", "/sign-up", "/register", "/reset", "/otp", "/oauth",
		"/console", "/dashboard", "/keys", "/usage-logs", "/users", "/channels",
		"/models", "/profile", "/wallet", "/setup", "/system-settings", "/playground",
	} {
		builder.WriteString("Disallow: " + disallowed + "\n")
	}
	for _, agent := range []string{"Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot"} {
		builder.WriteString("\nUser-agent: " + agent + "\n")
		builder.WriteString("Allow: /\n")
	}
	if origin != "" {
		builder.WriteString("\nSitemap: " + origin + "/sitemap.xml\n")
	}
	return builder.String()
}

// Sitemap lists the public documents. Dynamic model pages are added by the
// caller through extraPaths.
func Sitemap(origin string, extraPaths []string) string {
	paths := append(append([]string{}, indexablePaths...), extraPaths...)
	seen := make(map[string]struct{}, len(paths))
	unique := make([]string, 0, len(paths))
	for _, documentPath := range paths {
		if _, ok := seen[documentPath]; ok {
			continue
		}
		seen[documentPath] = struct{}{}
		unique = append(unique, documentPath)
	}
	sort.Strings(unique)

	var builder strings.Builder
	builder.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	builder.WriteString("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
	for _, documentPath := range unique {
		builder.WriteString("  <url><loc>" + xmlEscape(origin+documentPath) + "</loc></url>\n")
	}
	builder.WriteString("</urlset>\n")
	return builder.String()
}

// LLMsTxt gives assistants a short, factual description of the site and the
// pages worth reading. It follows the llms.txt convention: a Markdown summary
// first, then a curated link list.
func LLMsTxt(origin string) string {
	var builder strings.Builder
	builder.WriteString("# " + common.SystemName + "\n\n")
	builder.WriteString("> " + organizationDescription(langEn) + "\n\n")
	builder.WriteString("## What this site offers\n\n")
	builder.WriteString("- One OpenAI-compatible endpoint (`" + origin + "/v1`) for OpenAI, Claude, Gemini, DeepSeek and other leading models.\n")
	builder.WriteString("- API keys, quotas and usage logs managed from a web console.\n")
	builder.WriteString("- Per-model pricing with pay-as-you-go billing and group rate multipliers.\n")
	builder.WriteString("- Model rankings and performance data for choosing a model per workload.\n\n")
	builder.WriteString("## Model & CLI Guides\n\n")
	builder.WriteString("- [Claude Code & Claude 5.5 / Fable 5.2 API](" + origin + "/claude-code): Native `/v1/messages` endpoint for Claude Code CLI, Claude Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 with prompt caching.\n")
	builder.WriteString("- [OpenAI GPT-6.2 / 6.1 & Codex CLI](" + origin + "/gpt): Native `/v1/responses` and `/v1/chat/completions` endpoints for GPT-6.2 / GPT-6 Astra, GPT-6.2 / 6.1 Sol, GPT-6.1 Terra, GPT-6 Luna and Codex CLI.\n")
	builder.WriteString("- [Google Gemini 4 & 3.8 Flash API](" + origin + "/gemini): Native `/v1beta` and OpenAI-compatible `/v1` endpoints for Gemini 4 Carbon, Argon, Hydrogen and Gemini 3.8 Flash with 1M+ token multimodal context.\n\n")
	builder.WriteString("## Pages\n\n")
	for _, documentPath := range indexablePaths {
		builder.WriteString("- [" + documentPath + "](" + origin + documentPath + ")\n")
	}
	builder.WriteString("\n## Notes\n\n")
	builder.WriteString("- The website requires a short browser verification for human visitors; search engines and AI crawlers are served directly.\n")
	builder.WriteString("- Documentation: " + origin + "/docs\n")
	return builder.String()
}

func xmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return replacer.Replace(value)
}
