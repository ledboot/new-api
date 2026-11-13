package siteseo

import (
	"fmt"
	"html"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// Bilingual metadata for one website path. Chinese is the default because the
// site ships with DEFAULT_LANGUAGE=zh-CN; English is served when the reader asks
// for it. Both variants keep the brand name in the title, which is what lets a
// bare brand query match this site.
type copywriting struct {
	title       string
	description string
}

type pageMeta struct {
	zh    copywriting
	en    copywriting
	trail []crumb
}

// crumb is one step of the breadcrumb trail below the home page.
type crumb struct {
	name string
	path string
}

const (
	langZhCN = "zh-CN"
	langEn   = "en"
)

var staticPages = map[string]pageMeta{
	"/": {
		zh: copywriting{
			title:       "Tokara — 一站式 AI API 平台｜统一接入 OpenAI、Claude、Gemini",
			description: "Tokara 是面向开发者与创作者的一站式 AI 大模型 API 平台：一个密钥即可调用 OpenAI、Claude、Gemini、DeepSeek 等主流模型，兼容 OpenAI 接口，按量计费并提供实时用量统计。",
		},
		en: copywriting{
			title:       "Tokara — One AI API for OpenAI, Claude, Gemini and DeepSeek",
			description: "Tokara is an AI API platform for developers and creators: call OpenAI, Claude, Gemini and DeepSeek models with a single key over an OpenAI-compatible API, with pay-as-you-go billing and real-time usage analytics.",
		},
		trail: nil,
	},
	"/pricing": {
		zh: copywriting{
			title:       "Tokara 模型价格｜AI API 按量计费价格表",
			description: "查看 Tokara 支持的 AI 模型价格与计费规则：按 token 用量计费，输入与输出分别标价，支持分组倍率与模型对比，方便估算实际调用成本。",
		},
		en: copywriting{
			title:       "Tokara Pricing — Pay-as-you-go AI API model prices",
			description: "Compare Tokara model prices and billing rules: per-token pricing for input and output, group rate multipliers and side-by-side model comparison for accurate cost estimates.",
		},
		trail: []crumb{{name: "Pricing", path: "/pricing"}},
	},
	"/docs": {
		zh: copywriting{
			title:       "Tokara 文档｜AI API 接入与使用指南",
			description: "Tokara 文档：创建 API 密钥、把 OpenAI 兼容客户端指向 Tokara、查看模型列表与用量，以及常见问题排查。",
		},
		en: copywriting{
			title:       "Tokara Docs — AI API setup and usage guide",
			description: "Tokara documentation: create API keys, point OpenAI-compatible clients at Tokara, browse models and usage, and troubleshoot common issues.",
		},
		trail: []crumb{{name: "Docs", path: "/docs"}},
	},
	"/about": {
		zh: copywriting{
			title:       "关于 Tokara｜AI 模型 API 平台",
			description: "了解 Tokara：面向开发者与创作者的 AI 模型 API 平台，聚合 OpenAI、Claude、Gemini 等主流模型，提供统一的接入方式与透明的计费。",
		},
		en: copywriting{
			title:       "About Tokara — the AI model API platform",
			description: "Learn about Tokara: an AI model API platform for developers and creators that unifies OpenAI, Claude, Gemini and other leading models behind one endpoint with transparent billing.",
		},
		trail: []crumb{{name: "About", path: "/about"}},
	},
	"/rankings": {
		zh: copywriting{
			title:       "Tokara 模型排行｜AI 模型性能与性价比榜",
			description: "查看 Tokara 上各 AI 模型的调用量、速度与价格排行，帮助你在不同场景中选择更合适的模型。",
		},
		en: copywriting{
			title:       "Tokara Rankings — AI model performance and value leaderboard",
			description: "See how AI models on Tokara compare by usage, speed and price, and pick the right model for each workload.",
		},
		trail: []crumb{{name: "Rankings", path: "/rankings"}},
	},
	"/privacy-policy": {
		zh:    copywriting{title: "Tokara 隐私政策", description: "Tokara 如何收集、使用与保护你的个人信息。"},
		en:    copywriting{title: "Tokara Privacy Policy", description: "How Tokara collects, uses and protects your personal information."},
		trail: []crumb{{name: "Privacy Policy", path: "/privacy-policy"}},
	},
	"/user-agreement": {
		zh:    copywriting{title: "Tokara 用户协议", description: "使用 Tokara 服务时适用的条款与条件。"},
		en:    copywriting{title: "Tokara Terms of Service", description: "The terms and conditions that apply when you use Tokara services."},
		trail: []crumb{{name: "Terms of Service", path: "/user-agreement"}},
	},
}

// organizationDescription is the factual business description search engines
// and assistants read from the Organization entity.
func organizationDescription(lang string) string {
	if lang == langEn {
		return "Tokara is an AI model API platform that gives developers and creators one OpenAI-compatible endpoint for leading models such as OpenAI, Claude and Gemini."
	}
	return "Tokara 是 AI 大模型 API 平台，为开发者与创作者提供统一的 OpenAI 兼容接口，可调用 OpenAI、Claude、Gemini 等主流模型。"
}

// preferredLanguage maps an Accept-Language header onto one of the two
// metadata languages the site ships with.
func preferredLanguage(acceptLanguage string) string {
	for _, part := range strings.Split(acceptLanguage, ",") {
		tag, _, _ := strings.Cut(strings.TrimSpace(part), ";")
		tag = strings.ToLower(strings.TrimSpace(tag))
		if tag == "" || tag == "*" {
			continue
		}
		if strings.HasPrefix(tag, "zh") {
			return langZhCN
		}
		if strings.HasPrefix(tag, "en") {
			return langEn
		}
	}
	return langZhCN
}

// cleanPath reduces a request path to a canonical document path: no query, no
// duplicate separators, no trailing slash except for the root document.
func cleanPath(requestPath string) string {
	trimmed := strings.TrimSpace(requestPath)
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") {
		return "/"
	}
	cleaned := path.Clean(trimmed)
	if cleaned == "." || cleaned == "/" {
		return "/"
	}
	for _, prefix := range []string{"/api", "/v1", "/mj", "/pg", "/assets", "/static"} {
		if cleaned == prefix || strings.HasPrefix(cleaned, prefix+"/") {
			return "/"
		}
	}
	return cleaned
}

// metadataFor returns the copy and indexability of a document path. Unknown
// paths are not indexed: the embedded frontend answers them with a client-side
// not-found page, and indexable duplicates would only compete with real pages.
func metadataFor(documentPath, lang string) (pageMeta, bool) {
	if meta, ok := staticPages[documentPath]; ok {
		return meta, true
	}
	escapedModelID, ok := strings.CutPrefix(documentPath, "/pricing/")
	// The model identifier is one path segment, so a vendor-prefixed name such
	// as openai/gpt-4o arrives percent-encoded.
	modelID, err := url.PathUnescape(escapedModelID)
	if ok && err == nil && modelID != "" && !strings.Contains(escapedModelID, "/") && len(modelID) <= 120 && isPrintableModelName(modelID) {
		if lang == langEn {
			return pageMeta{
				en: copywriting{
					title:       fmt.Sprintf("%s pricing and billing — Tokara", modelID),
					description: fmt.Sprintf("Tokara price sheet for the %s model: input and output token prices, billing rules and how to call it through an OpenAI-compatible API.", modelID),
				},
				trail: []crumb{
					{name: "Pricing", path: "/pricing"},
					{name: modelID, path: documentPath},
				},
			}, true
		}
		return pageMeta{
			zh: copywriting{
				title:       fmt.Sprintf("%s 模型价格与计费 — Tokara", modelID),
				description: fmt.Sprintf("Tokara 上 %s 模型的输入与输出 token 价格、计费规则，以及如何通过 OpenAI 兼容接口调用。", modelID),
			},
			trail: []crumb{
				{name: "Pricing", path: "/pricing"},
				{name: modelID, path: documentPath},
			},
		}, true
	}
	return pageMeta{}, false
}

// isPrintableModelName rejects control characters, which would end up in the
// document title.
func isPrintableModelName(name string) bool {
	for _, char := range name {
		if char < 0x20 || char == 0x7f {
			return false
		}
	}
	return true
}

type jsonLD struct {
	Context         string       `json:"@context"`
	Type            string       `json:"@type"`
	ID              string       `json:"@id,omitempty"`
	Name            string       `json:"name,omitempty"`
	URL             string       `json:"url,omitempty"`
	Description     string       `json:"description,omitempty"`
	InLanguage      string       `json:"inLanguage,omitempty"`
	Logo            *imageObject `json:"logo,omitempty"`
	Publisher       *reference   `json:"publisher,omitempty"`
	ItemListElement []listItem   `json:"itemListElement,omitempty"`
}

type imageObject struct {
	Type string `json:"@type"`
	URL  string `json:"url"`
}

type reference struct {
	ID string `json:"@id"`
}

type listItem struct {
	Type     string `json:"@type"`
	Position int    `json:"position"`
	Name     string `json:"name"`
	Item     string `json:"item,omitempty"`
}

// Document renders the embedded index page with the metadata of one path.
func Document(indexPage []byte, requestPath, origin, acceptLanguage string) []byte {
	documentPath := cleanPath(requestPath)
	lang := preferredLanguage(acceptLanguage)
	base := strings.TrimSuffix(origin, "/")
	meta, indexable := metadataFor(documentPath, lang)
	if !indexable {
		// The frontend answers unknown paths with a client-side not-found page;
		// reuse the home copy so the tab still names the brand.
		meta = staticPages["/"]
	}
	text := meta.zh
	if lang == langEn {
		text = meta.en
	}
	canonical := base + documentPath
	if documentPath == "/" {
		canonical = base + "/"
	}

	var head strings.Builder
	head.WriteString("<title>")
	head.WriteString(html.EscapeString(text.title))
	head.WriteString("</title>\n")
	writeMeta(&head, "name", "description", text.description)
	if indexable {
		writeMeta(&head, "name", "robots", "index, follow, max-image-preview:large, max-snippet:-1")
	} else {
		writeMeta(&head, "name", "robots", "noindex, follow")
	}
	if indexable {
		writeLink(&head, "canonical", canonical)
	}
	writeMeta(&head, "property", "og:type", "website")
	writeMeta(&head, "property", "og:site_name", common.SystemName)
	writeMeta(&head, "property", "og:title", text.title)
	writeMeta(&head, "property", "og:description", text.description)
	if indexable {
		writeMeta(&head, "property", "og:url", canonical)
	}
	writeMeta(&head, "property", "og:image", base+"/tokara-logo.webp")
	if lang == langEn {
		writeMeta(&head, "property", "og:locale", "en_US")
	} else {
		writeMeta(&head, "property", "og:locale", "zh_CN")
	}
	writeMeta(&head, "name", "twitter:card", "summary_large_image")
	writeMeta(&head, "name", "twitter:title", text.title)
	writeMeta(&head, "name", "twitter:description", text.description)
	writeMeta(&head, "name", "twitter:image", base+"/tokara-logo.webp")
	// Search Console HTML-tag verification, when the operator sets it.
	writeMeta(&head, "name", "google-site-verification", os.Getenv("GOOGLE_SITE_VERIFICATION"))
	if indexable {
		head.WriteString(structuredData(base, documentPath, lang, meta.trail))
	}
	// The document title of a single-page app must change on client-side
	// navigation. Shipping the copy once, in the page, keeps the browser tab and
	// the crawlable metadata from drifting apart.
	head.WriteString(pageDataScript())

	document := string(indexPage)
	document = strings.Replace(document, `<html lang="en"`, `<html lang="`+lang+`"`, 1)
	document = replaceBetween(document, "<!--seo-->", "<!--/seo-->", head.String())
	return []byte(document)
}

func structuredData(base, documentPath, lang string, trail []crumb) string {
	organizationID := base + "/#organization"
	graph := []any{
		jsonLD{
			Context: "https://schema.org", Type: "Organization", ID: organizationID,
			Name: common.SystemName, URL: base, Description: organizationDescription(lang),
			Logo: &imageObject{Type: "ImageObject", URL: base + "/tokara-logo.webp"},
		},
		jsonLD{
			Context: "https://schema.org", Type: "WebSite", ID: base + "/#website",
			Name: common.SystemName, URL: base, InLanguage: lang,
			Publisher: &reference{ID: organizationID},
		},
	}
	if documentPath == "/" {
		graph = append(graph, jsonLD{
			Context: "https://schema.org", Type: "SoftwareApplication",
			Name: common.SystemName, URL: base, Description: organizationDescription(lang),
		})
	}
	if len(trail) > 0 {
		items := []listItem{
			{Type: "ListItem", Position: 1, Name: common.SystemName, Item: base + "/"},
		}
		for _, step := range trail {
			items = append(items, listItem{
				Type: "ListItem", Position: len(items) + 1, Name: step.name, Item: base + step.path,
			})
		}
		graph = append(graph, jsonLD{
			Context: "https://schema.org", Type: "BreadcrumbList", ItemListElement: items,
		})
	}
	encoded, err := common.Marshal(graph)
	if err != nil {
		return ""
	}
	return "<script type=\"application/ld+json\">" + string(encoded) + "</script>\n"
}

// pageDataScript embeds the per-path copy in both languages so the frontend can
// update the document title without a second copy of the text.
func pageDataScript() string {
	pages := make(map[string]map[string]pageCopy, len(staticPages))
	for documentPath, meta := range staticPages {
		pages[documentPath] = map[string]pageCopy{
			"zh": {Title: meta.zh.title, Description: meta.zh.description},
			"en": {Title: meta.en.title, Description: meta.en.description},
		}
	}
	encoded, err := common.Marshal(map[string]any{"brand": common.SystemName, "pages": pages})
	if err != nil {
		return ""
	}
	return "<script type=\"application/json\" id=\"site-seo-data\">" + string(encoded) + "</script>\n"
}

type pageCopy struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

func writeMeta(builder *strings.Builder, attribute, key, value string) {
	if value == "" {
		return
	}
	builder.WriteString("<meta ")
	builder.WriteString(attribute)
	builder.WriteString("=\"")
	builder.WriteString(html.EscapeString(key))
	builder.WriteString("\" content=\"")
	builder.WriteString(html.EscapeString(value))
	builder.WriteString("\" />\n")
}

func writeLink(builder *strings.Builder, relation, href string) {
	if href == "" {
		return
	}
	builder.WriteString("<link rel=\"")
	builder.WriteString(html.EscapeString(relation))
	builder.WriteString("\" href=\"")
	builder.WriteString(html.EscapeString(href))
	builder.WriteString("\" />\n")
}

// replaceBetween swaps the content between two markers, keeping the markers.
func replaceBetween(document, start, end, replacement string) string {
	startIndex := strings.Index(document, start)
	if startIndex < 0 {
		return document
	}
	bodyStart := startIndex + len(start)
	endIndex := strings.Index(document[bodyStart:], end)
	if endIndex < 0 {
		return document
	}
	return document[:bodyStart] + "\n    " + replacement + "    " + document[bodyStart+endIndex:]
}

// Origin returns the public origin used for canonical URLs.
func Origin(serverAddress, requestHost string) string {
	parsed, err := url.Parse(strings.TrimSpace(serverAddress))
	if err == nil && parsed.Scheme == "https" && parsed.Host != "" {
		return "https://" + strings.TrimPrefix(strings.ToLower(parsed.Host), "www.")
	}
	host := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(requestHost)), "www.")
	if host == "" {
		return ""
	}
	return "https://" + host
}

// CanonicalRedirect returns the apex URL when the site is served from the
// conventional www alias of its configured address. Search engines otherwise
// see two copies of every page.
func CanonicalRedirect(serverAddress, requestHost, requestURI string) (string, bool) {
	origin := Origin(serverAddress, requestHost)
	if origin == "" {
		return "", false
	}
	host := strings.ToLower(strings.TrimSpace(requestHost))
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	configured, err := url.Parse(strings.TrimSpace(serverAddress))
	if err != nil || configured.Host == "" {
		return "", false
	}
	apex := strings.TrimPrefix(strings.ToLower(configured.Host), "www.")
	if host != "www."+apex {
		return "", false
	}
	if !strings.HasPrefix(requestURI, "/") || strings.HasPrefix(requestURI, "//") {
		return "", false
	}
	return "https://" + apex + requestURI, true
}
