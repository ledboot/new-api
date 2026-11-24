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

type faqItem struct {
	question string
	answer   string
}

type pageMeta struct {
	zh     copywriting
	en     copywriting
	trail  []crumb
	zhFAQs []faqItem
	enFAQs []faqItem
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
			description: "Tokara 是面向开发者与创作者的一站式 AI 大模型 API 平台：一个密钥即可接入 Claude Code（Claude 5.5 / Fable 5.2）、OpenAI GPT-6.2 / 6.1 与 Codex、Google Gemini 4 与 DeepSeek V4 等最新主流模型，原生支持多协议路由与按量计费。",
		},
		en: copywriting{
			title:       "Tokara — One AI API for OpenAI, Claude, Gemini and DeepSeek",
			description: "Tokara is an AI API gateway for developers and creators: connect Claude Code (Claude 5.5 & Fable 5.2), OpenAI GPT-6.2 / 6.1 & Codex, Google Gemini 4 and DeepSeek V4 with one key across OpenAI, Anthropic and Gemini endpoints with pay-as-you-go billing.",
		},
		trail: nil,
		zhFAQs: []faqItem{
			{
				question: "Tokara 可以调用哪些最新主流 AI 模型与编程工具？",
				answer:   "一个 Tokara API 密钥即可调用 Anthropic Claude 5.5 / Fable 5.2（原生适配 Claude Code CLI）、OpenAI GPT-6.2 / GPT-6.1（原生适配 Codex CLI Responses 接口）、Google Gemini 4（Carbon / Argon / Hydrogen）与 Gemini 3.8 Flash，以及 DeepSeek V4.1 / V4 Pro 等最新主流模型。",
			},
			{
				question: "Claude Code 如何接入 Tokara？",
				answer:   "Claude Code 使用 Anthropic Messages 协议（/v1/messages），只需将环境变量 ANTHROPIC_BASE_URL 设为站点根地址（不带 /v1），并将 ANTHROPIC_AUTH_TOKEN 设为 Tokara 的 sk- 令牌即可直接使用。",
			},
			{
				question: "Tokara 是否兼容 OpenAI SDK 与 Responses 接口？",
				answer:   "完全兼容。支持 POST /v1/chat/completions、POST /v1/responses、POST /v1/messages 与 POST /v1beta/models 等原生入口，现有 SDK 与客户端无需改代码即可迁移。",
			},
			{
				question: "Tokara 如何计费？",
				answer:   "按实际消耗的输入、输出与缓存命中 token 精细计费，每次调用的模型、分组倍率、耗时和费用都会实时记录在控制台日志中。",
			},
		},
		enFAQs: []faqItem{
			{
				question: "Which latest AI models and coding tools work with Tokara?",
				answer:   "A single Tokara API key connects Anthropic Claude 5.5 and Fable 5.2 (native Claude Code CLI support), OpenAI GPT-6.2 and GPT-6.1 (native Codex CLI Responses API), Google Gemini 4 (Carbon, Argon, Hydrogen) and Gemini 3.8 Flash, DeepSeek V4.1 and more.",
			},
			{
				question: "How do I connect Claude Code to Tokara?",
				answer:   "Set ANTHROPIC_BASE_URL to the Tokara root origin (without /v1, since Claude Code appends /v1/messages automatically) and set ANTHROPIC_AUTH_TOKEN to your sk- API key.",
			},
			{
				question: "Is Tokara compatible with the OpenAI SDK and Responses API?",
				answer:   "Yes. Tokara natively serves POST /v1/chat/completions, POST /v1/responses, POST /v1/messages and POST /v1beta/models so existing SDKs and CLI agents work without code changes.",
			},
			{
				question: "How is usage billed on Tokara?",
				answer:   "Usage is billed per token with separate input, output and prompt-cache rates. Every request logs token counts, latency and exact cost in real time.",
			},
		},
	},
	"/claude-code": {
		zh: copywriting{
			title:       "Claude Code 与 Claude 5.5 / Fable 5.2 API 接入指南｜Tokara",
			description: "通过 Tokara 原生 Anthropic Messages 接口（/v1/messages）接入 Claude Code CLI 与最新 Claude Fable 5.2、Opus 5.5、Sonnet 5.5、Haiku 5.5，支持百万上下文、提示词缓存与按量计费。",
		},
		en: copywriting{
			title:       "Claude Code & Claude 5.5 / Fable 5.2 API Guide — Tokara",
			description: "Connect Claude Code CLI and Claude Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 through Tokara's native Anthropic Messages API (/v1/messages) with 1M context, prompt caching and per-token billing.",
		},
		trail: []crumb{{name: "Claude Code", path: "/claude-code"}},
		zhFAQs: []faqItem{
			{
				question: "为什么 Claude Code 配置 ANTHROPIC_BASE_URL 后返回 404？",
				answer:   "Anthropic SDK 与 Claude Code 会自动在地址后拼接 /v1/messages，因此 ANTHROPIC_BASE_URL 必须填写站点根域名（如 https://tokara.top），不要在末尾加 /v1。",
			},
			{
				question: "Claude Code 推荐搭配哪些最新 Claude 模型？",
				answer:   "复杂多文件重构与深度架构推理推荐 claude-fable-5-2 或 claude-opus-5-5，高频日常编码推荐 claude-sonnet-5-5，小模型后台任务（ANTHROPIC_SMALL_FAST_MODEL）推荐 claude-haiku-5-5。",
			},
			{
				question: "Tokara 支持 Claude Code 的 Prompt Caching（提示词缓存）吗？",
				answer:   "支持。原生 /v1/messages 通道保留缓存写入与命中计费字段，长代码库多轮对话命中缓存时可大幅降低输入 token 成本。",
			},
		},
		enFAQs: []faqItem{
			{
				question: "Why does Claude Code return 404 after setting ANTHROPIC_BASE_URL?",
				answer:   "Claude Code automatically appends /v1/messages to ANTHROPIC_BASE_URL. Set ANTHROPIC_BASE_URL to the root origin (for example https://tokara.top) without a trailing /v1.",
			},
			{
				question: "Which latest Claude models are recommended for Claude Code?",
				answer:   "Use claude-fable-5-2 or claude-opus-5-5 for complex multi-file architecture work, claude-sonnet-5-5 for fast everyday coding, and claude-haiku-5-5 for ANTHROPIC_SMALL_FAST_MODEL background tasks.",
			},
			{
				question: "Does Tokara support Anthropic Prompt Caching in Claude Code?",
				answer:   "Yes. Native /v1/messages routing preserves cache creation and cache read tokens, cutting repeated repository context input costs significantly.",
			},
		},
	},
	"/gpt": {
		zh: copywriting{
			title:       "OpenAI GPT-6.2 / GPT-6.1 与 Codex CLI API 接入指南｜Tokara",
			description: "通过 Tokara 统一接入最新 OpenAI GPT-6.2 / GPT-6 Astra、GPT-6.2 / 6.1 Sol、GPT-6.1 Terra、GPT-6 Luna 与 Codex CLI，原生支持 /v1/responses 与 /v1/chat/completions 协议，按 token 透明计费。",
		},
		en: copywriting{
			title:       "OpenAI GPT-6.2, GPT-6.1 & Codex CLI API Guide — Tokara",
			description: "Access OpenAI GPT-6.2 / GPT-6 Astra, GPT-6.2 / 6.1 Sol, GPT-6.1 Terra, GPT-6 Luna and Codex CLI through Tokara with native /v1/responses and /v1/chat/completions endpoints and pay-as-you-go token billing.",
		},
		trail: []crumb{{name: "OpenAI GPT & Codex", path: "/gpt"}},
		zhFAQs: []faqItem{
			{
				question: "Codex CLI 如何配置接入 Tokara？",
				answer:   "在 ~/.codex/config.toml 中新增 model_providers.tokara，将 base_url 设为 https://tokara.top/v1，wire_api 设为 responses，并通过环境变量传入 Tokara 的 sk- 令牌即可。",
			},
			{
				question: "GPT-6 Astra、Sol、Terra 与 Luna 系列该如何选择？",
				answer:   "Astra（gpt-6.2-astra / gpt-6-astra）适合高难度系统设计与深度推理；Sol（gpt-6.2-sol / gpt-6.1-sol）兼顾编码智商与响应速度，适合作为 Codex CLI 主力；gpt-6.1-terra 擅长视觉推理与 Computer Use；gpt-6-luna 适合高并发低成本任务。",
			},
			{
				question: "/v1/responses 和 /v1/chat/completions 有什么区别？",
				answer:   "Responses API（/v1/responses）原生面向多步工具调用、可控推理强度（reasoning effort）与 Agent 状态流式传输；传统应用仍可继续使用 /v1/chat/completions，两者共用同一个密钥。",
			},
		},
		enFAQs: []faqItem{
			{
				question: "How do I connect OpenAI Codex CLI to Tokara?",
				answer:   "Add a model_providers.tokara block in ~/.codex/config.toml with base_url set to https://tokara.top/v1, wire_api = \"responses\", and export your Tokara sk- key.",
			},
			{
				question: "How do GPT-6 Astra, Sol, Terra and Luna differ?",
				answer:   "Astra (gpt-6.2-astra / gpt-6-astra) targets frontier reasoning and architecture, Sol (gpt-6.2-sol / gpt-6.1-sol) balances coding intelligence and speed for Codex CLI, gpt-6.1-terra excels at visual reasoning and computer use, and gpt-6-luna handles high-volume low-cost workloads.",
			},
			{
				question: "Should I use /v1/responses or /v1/chat/completions?",
				answer:   "Use /v1/responses for Codex CLI, configurable reasoning effort and multi-step tool workflows; keep /v1/chat/completions for drop-in OpenAI SDK compatibility. Both share the same API key.",
			},
		},
	},
	"/gemini": {
		zh: copywriting{
			title:       "Google Gemini 4（Carbon / Argon / Hydrogen）与 3.8 Flash API 接入指南｜Tokara",
			description: "通过 Tokara 调用最新 Google Gemini 4 Carbon、Gemini 4 Argon、Gemini 4 Hydrogen 与 Gemini 3.8 Flash，同时兼容原生 /v1beta 接口与 OpenAI SDK，支持百万级上下文、动态思考与多模态按量计费。",
		},
		en: copywriting{
			title:       "Google Gemini 4 (Carbon, Argon, Hydrogen) & 3.8 Flash API Guide — Tokara",
			description: "Call Google Gemini 4 Carbon, Gemini 4 Argon, Gemini 4 Hydrogen and Gemini 3.8 Flash on Tokara over native /v1beta endpoints or an OpenAI-compatible SDK, with 1M+ token context and per-token billing.",
		},
		trail: []crumb{{name: "Google Gemini", path: "/gemini"}},
		zhFAQs: []faqItem{
			{
				question: "可以用 OpenAI SDK 直接调用 Gemini 4 系列和 Gemini 3.8 Flash 吗？",
				answer:   "可以。Tokara 同时提供 OpenAI 兼容入口（/v1/chat/completions）与 Google GenAI 原生入口（/v1beta/models/{model}:generateContent），两种方式共用同一个 API Key。",
			},
			{
				question: "Gemini 4 Carbon、Argon、Hydrogen 与 Gemini 3.8 Flash 分别适合什么场景？",
				answer:   "gemini-4-carbon 面向高难度编码、科学推理与百万上下文深度分析；gemini-4-argon 兼顾前沿推理与更高 Token 效率；gemini-4-hydrogen 是日常全能编码与多模态主力；gemini-3.8-flash 提供极高吞吐的实时 Agent 编排。",
			},
			{
				question: "Gemini 4 的多模态与百万上下文如何计费？",
				answer:   "按实际输入（文本、图像、PDF、音视频折算 token）、动态思考与输出 token 结算，所有明细均可在控制台用量日志中逐笔核对。",
			},
		},
		enFAQs: []faqItem{
			{
				question: "Can I call Gemini 4 models and Gemini 3.8 Flash with the OpenAI SDK?",
				answer:   "Yes. Tokara exposes both the OpenAI-compatible /v1/chat/completions route and native Google GenAI /v1beta/models/{model}:generateContent endpoints under one API key.",
			},
			{
				question: "When should I choose Gemini 4 Carbon, Argon, Hydrogen or Gemini 3.8 Flash?",
				answer:   "Choose gemini-4-carbon for frontier coding and deep 1M-context reasoning, gemini-4-argon for fast token-efficient reasoning, gemini-4-hydrogen for everyday coding and multimodal tasks, and gemini-3.8-flash for high-throughput agent orchestration.",
			},
			{
				question: "How is Gemini 4 multimodal and 1M-context usage billed?",
				answer:   "Text, image, PDF, audio and video inputs plus thinking and output tokens are metered transparently per request and recorded in your console usage log.",
			},
		},
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
	for part := range strings.SplitSeq(acceptLanguage, ",") {
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
	Context         string        `json:"@context"`
	Type            string        `json:"@type"`
	ID              string        `json:"@id,omitempty"`
	Name            string        `json:"name,omitempty"`
	URL             string        `json:"url,omitempty"`
	Description     string        `json:"description,omitempty"`
	InLanguage      string        `json:"inLanguage,omitempty"`
	Logo            *imageObject  `json:"logo,omitempty"`
	Publisher       *reference    `json:"publisher,omitempty"`
	ItemListElement []listItem    `json:"itemListElement,omitempty"`
	MainEntity      []faqQuestion `json:"mainEntity,omitempty"`
}

type faqQuestion struct {
	Type           string    `json:"@type"`
	Name           string    `json:"name"`
	AcceptedAnswer faqAnswer `json:"acceptedAnswer"`
}

type faqAnswer struct {
	Type string `json:"@type"`
	Text string `json:"text"`
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
		faqs := meta.zhFAQs
		if lang == langEn {
			faqs = meta.enFAQs
		}
		head.WriteString(structuredData(base, documentPath, lang, meta.trail, faqs))
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

func structuredData(base, documentPath, lang string, trail []crumb, faqs []faqItem) string {
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
	if len(faqs) > 0 {
		questions := make([]faqQuestion, 0, len(faqs))
		for _, item := range faqs {
			questions = append(questions, faqQuestion{
				Type: "Question",
				Name: item.question,
				AcceptedAnswer: faqAnswer{
					Type: "Answer",
					Text: item.answer,
				},
			})
		}
		graph = append(graph, jsonLD{
			Context: "https://schema.org", Type: "FAQPage", MainEntity: questions,
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
