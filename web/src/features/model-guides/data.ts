/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'

export type ModelGuideSlug = 'claude-code' | 'gpt' | 'gemini'

export interface CodeSnippetTab {
  id: string
  label: string
  filename: string
  code: (origin: string) => string
}

export interface FlagshipModelSpec {
  id: string
  name: string
  tier: string
  contextWindow: string
  maxOutput: string
  summary: string
  highlights: string[]
}

export interface GuideCapabilityItem {
  code: string
  tag: string
  title: string
  description: string
}

export interface GuideFaqItem {
  question: string
  answer: string
}

export interface ModelGuideConfig {
  slug: ModelGuideSlug
  href: '/claude-code' | '/gpt' | '/gemini'
  shortLabel: string
  navBadge: string
  breadcrumbLabel: string
  protocolTag: string
  endpointPath: string
  baseUrlSuffix: '' | '/v1'
  baseUrlHint: string
  accentTone: 'amber' | 'emerald' | 'indigo'
  heroEyebrow: string
  heroTitle: string
  heroHighlight: string
  heroDescription: string
  homeCardTitle: string
  homeCardSummary: string
  homeQuickCommand: (origin: string) => string
  specs: {
    label: string
    value: string
    detail: string
  }[]
  snippets: CodeSnippetTab[]
  modelsSectionTitle: string
  modelsSectionSubtitle: string
  models: FlagshipModelSpec[]
  compatibleAliases: string[]
  capabilitiesTitle: string
  capabilitiesSubtitle: string
  capabilities: GuideCapabilityItem[]
  faqTitle: string
  faqSubtitle: string
  faqs: GuideFaqItem[]
}

export const MODEL_GUIDE_ORDER: readonly ModelGuideSlug[] = [
  'claude-code',
  'gpt',
  'gemini',
]

export function getModelGuides(
  t: TFunction
): Record<ModelGuideSlug, ModelGuideConfig> {
  return {
    'claude-code': {
      slug: 'claude-code',
      href: '/claude-code',
      shortLabel: 'Claude Code',
      navBadge: 'Claude 5.5 · Fable 5.2',
      breadcrumbLabel: 'Claude Code',
      protocolTag: 'ANTHROPIC MESSAGES · /V1/MESSAGES',
      endpointPath: 'POST /v1/messages',
      baseUrlSuffix: '',
      baseUrlHint: t(
        'Use root origin without /v1 — Claude Code appends /v1/messages automatically'
      ),
      accentTone: 'amber',
      heroEyebrow: t('Anthropic Messages & Terminal Coding Agent'),
      heroTitle: t('Claude Code & Claude 5.5'),
      heroHighlight: t('native coding gateway'),
      heroDescription: t(
        'Connect Claude Code CLI, CC Switch, and Anthropic SDKs directly to Claude Fable 5.2, Opus 5.5, Sonnet 5.5, and Haiku 5.5 over native /v1/messages with 1M context, prompt caching, and per-token billing.'
      ),
      homeCardTitle: t('Claude Code & Claude 5.5'),
      homeCardSummary: t(
        'Native /v1/messages gateway for Claude Code CLI with Fable 5.2 & Opus 5.5, 1M context, and prompt caching.'
      ),
      homeQuickCommand: (origin) => `export ANTHROPIC_BASE_URL="${origin}"`,
      specs: [
        {
          label: t('Context Window'),
          value: '1M Tokens',
          detail: t('Full-repository multi-file indexing'),
        },
        {
          label: t('Max Output'),
          value: '128K Tokens',
          detail: t('Long-horizon diffs & code generation'),
        },
        {
          label: t('Wire Protocol'),
          value: '/v1/messages',
          detail: t('Native Anthropic SSE & tool use'),
        },
        {
          label: t('Cache Billing'),
          value: 'Prompt Cache',
          detail: t('Separate cache write & hit rates'),
        },
      ],
      snippets: [
        {
          id: 'cli-env',
          label: 'Claude Code CLI',
          filename: 'terminal · zsh / bash',
          code: (origin) =>
            [
              `export ANTHROPIC_BASE_URL="${origin}"`,
              'export ANTHROPIC_AUTH_TOKEN="sk-your-tokara-key"',
              'export ANTHROPIC_MODEL="claude-opus-5-5"',
              'export ANTHROPIC_SMALL_FAST_MODEL="claude-haiku-5-5"',
              'claude',
            ].join('\n'),
        },
        {
          id: 'settings-json',
          label: 'settings.json',
          filename: '~/.claude/settings.json',
          code: (origin) =>
            JSON.stringify(
              {
                env: {
                  ANTHROPIC_BASE_URL: origin,
                  ANTHROPIC_AUTH_TOKEN: 'sk-your-tokara-key',
                  ANTHROPIC_MODEL: 'claude-opus-5-5',
                  ANTHROPIC_SMALL_FAST_MODEL: 'claude-haiku-5-5',
                },
              },
              null,
              2
            ),
        },
        {
          id: 'messages-curl',
          label: 'Messages API',
          filename: 'POST /v1/messages',
          code: (origin) =>
            [
              `curl ${origin}/v1/messages \\`,
              '  -H "x-api-key: sk-your-tokara-key" \\',
              '  -H "anthropic-version: 2023-06-01" \\',
              '  -H "content-type: application/json" \\',
              "  -d '{",
              '    "model": "claude-fable-5-2",',
              '    "max_tokens": 4096,',
              '    "messages": [{"role": "user", "content": "Review this module"}]',
              "  }'",
            ].join('\n'),
        },
      ],
      modelsSectionTitle: t('Latest Claude 5.5 & Fable 5.2 model lineup'),
      modelsSectionSubtitle: t(
        'Pair deep architectural reasoning models with fast sub-agent models inside the same Claude Code session.'
      ),
      models: [
        {
          id: 'claude-fable-5-2',
          name: 'Claude Fable 5.2',
          tier: 'FRONTIER',
          contextWindow: '1M ctx',
          maxOutput: '128K out',
          summary: t(
            'Highest-ceiling reasoning tier built for complex architecture design, root-cause debugging, and long-horizon autonomous agent loops.'
          ),
          highlights: [
            t('Adaptive deep thinking'),
            t('Multi-step repo planning'),
            t('1M context precision'),
          ],
        },
        {
          id: 'claude-opus-5-5',
          name: 'Claude Opus 5.5',
          tier: 'FLAGSHIP',
          contextWindow: '1M ctx',
          maxOutput: '128K out',
          summary: t(
            'Recommended primary model for Claude Code across multi-file refactoring, test generation, and production software engineering.'
          ),
          highlights: [
            t('Default primary agent model'),
            t('Reliable tool & bash execution'),
            t('Prompt cache optimized'),
          ],
        },
        {
          id: 'claude-sonnet-5-5',
          name: 'Claude Sonnet 5.5',
          tier: 'BALANCED',
          contextWindow: '1M ctx',
          maxOutput: '128K out',
          summary: t(
            'High-velocity everyday coding and interactive pair-programming tier balancing strong intelligence with low TTFT.'
          ),
          highlights: [
            t('Fast interactive streaming'),
            t('Strong price-to-performance'),
            t('Frontend & API iteration'),
          ],
        },
        {
          id: 'claude-haiku-5-5',
          name: 'Claude Haiku 5.5',
          tier: 'FAST SUB-AGENT',
          contextWindow: '1M ctx',
          maxOutput: '128K out',
          summary: t(
            'Ultra-low-latency model ideal for ANTHROPIC_SMALL_FAST_MODEL, file search, context compaction, and high-volume routing.'
          ),
          highlights: [
            t('Sub-agent & compaction tier'),
            t('Minimal latency overhead'),
            t('Economical token rate'),
          ],
        },
      ],
      compatibleAliases: [
        'claude-fable-5-1',
        'claude-fable-5',
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-opus-4-8',
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-sonnet-4-5-20250929',
        'claude-haiku-4-5-20251001',
      ],
      capabilitiesTitle: t('Built for uninterrupted Claude Code sessions'),
      capabilitiesSubtitle: t(
        'Native Anthropic protocol fidelity combined with multi-provider resilience and explainable token accounting.'
      ),
      capabilities: [
        {
          code: 'C1',
          tag: 'NATIVE /V1/MESSAGES',
          title: t('Zero-translation Anthropic protocol'),
          description: t(
            'Preserves tool_use blocks, thinking blocks, system arrays, and streaming SSE events expected by Claude Code CLI and CC Switch.'
          ),
        },
        {
          code: 'C2',
          tag: 'PROMPT CACHE',
          title: t('Prompt caching cost reduction'),
          description: t(
            'Tracks cache_creation_input_tokens and cache_read_input_tokens separately so repeated codebase turns bill at discounted cache rates.'
          ),
        },
        {
          code: 'C3',
          tag: 'MULTI-UPSTREAM POOL',
          title: t('Automatic multi-channel failover'),
          description: t(
            'Distributes traffic across healthy Anthropic, Bedrock, and Vertex pools with automatic retry when an upstream saturates.'
          ),
        },
        {
          code: 'C4',
          tag: 'KEY GOVERNANCE',
          title: t('Scoped keys & live audit logs'),
          description: t(
            'Issue dedicated keys per developer or workstation with quota caps, model allowlists, and per-request latency and token logs.'
          ),
        },
      ],
      faqTitle: t('Claude Code setup & billing FAQ'),
      faqSubtitle: t(
        'Common configuration details when connecting Claude Code CLI, CC Switch, or Anthropic SDKs.'
      ),
      faqs: [
        {
          question: t(
            'Why does Claude Code return 404 after setting ANTHROPIC_BASE_URL?'
          ),
          answer: t(
            'Claude Code and the Anthropic SDK automatically append /v1/messages to ANTHROPIC_BASE_URL. Always set ANTHROPIC_BASE_URL to the root site URL without a trailing /v1.'
          ),
        },
        {
          question: t(
            'Which models should I assign to ANTHROPIC_MODEL and ANTHROPIC_SMALL_FAST_MODEL?'
          ),
          answer: t(
            'Set ANTHROPIC_MODEL to claude-opus-5-5 or claude-fable-5-2 for complex multi-file tasks (or claude-sonnet-5-5 for rapid daily iteration), and set ANTHROPIC_SMALL_FAST_MODEL to claude-haiku-5-5 so background indexing stays fast and inexpensive.'
          ),
        },
        {
          question: t(
            'Does Tokara support CC Switch for multi-profile switching?'
          ),
          answer: t(
            'Yes. Add a Claude provider in CC Switch with the root URL as Base URL and your sk- token as API Key to switch ~/.claude/settings.json profiles in one click.'
          ),
        },
        {
          question: t('How are Prompt Caching tokens billed in Claude Code?'),
          answer: t(
            'Cache writes and cache hits are metered with dedicated multipliers rather than full input price, and every request in Usage Logs displays exact input, output, and cached token counts.'
          ),
        },
      ],
    },
    gpt: {
      slug: 'gpt',
      href: '/gpt',
      shortLabel: 'OpenAI GPT & Codex',
      navBadge: 'GPT-6.2 / 6.1 · Codex',
      breadcrumbLabel: 'OpenAI GPT & Codex',
      protocolTag: 'OPENAI RESPONSES & CHAT · /V1',
      endpointPath: 'POST /v1/responses',
      baseUrlSuffix: '/v1',
      baseUrlHint: t(
        'Use standard /v1 Base URL for Codex CLI, OpenAI SDKs, and compatible tools'
      ),
      accentTone: 'emerald',
      heroEyebrow: t('OpenAI Responses API & Agentic Coding'),
      heroTitle: t('OpenAI GPT-6.2, 6.1 & Codex'),
      heroHighlight: t('unified inference hub'),
      heroDescription: t(
        'Run the latest GPT-6 family — Astra, Sol, Terra, and Luna — across Codex CLI and OpenAI SDKs with native /v1/responses and /v1/chat/completions endpoints, 1.05M context, configurable reasoning effort, and transparent token billing.'
      ),
      homeCardTitle: t('OpenAI GPT-6.2 / 6.1 & Codex'),
      homeCardSummary: t(
        'Dual /v1/responses and /v1/chat/completions support for GPT-6 Astra, 6.1 Sol, 6.1 Terra, Luna, and Codex CLI.'
      ),
      homeQuickCommand: (origin) => `base_url = "${origin}/v1"`,
      specs: [
        {
          label: t('Flagship Generation'),
          value: 'GPT-6.2 / 6.1',
          detail: t('Astra, Sol, Terra & Luna lineup'),
        },
        {
          label: t('Context Window'),
          value: '1.05M Tokens',
          detail: t('Long-horizon repo & tool state'),
        },
        {
          label: t('Wire Protocols'),
          value: 'Responses + Chat',
          detail: t('/v1/responses & /v1/chat/completions'),
        },
        {
          label: t('CLI & Ecosystem'),
          value: 'Codex + SDKs',
          detail: t('Drop-in for Codex, OpenCode & Cursor'),
        },
      ],
      snippets: [
        {
          id: 'codex-toml',
          label: 'Codex CLI',
          filename: '~/.codex/config.toml',
          code: (origin) =>
            [
              'model = "gpt-6.1-sol"',
              'model_provider = "tokara"',
              '',
              '[model_providers.tokara]',
              'name = "Tokara"',
              `base_url = "${origin}/v1"`,
              'env_key = "NEW_API_KEY"',
              'wire_api = "responses"',
            ].join('\n'),
        },
        {
          id: 'responses-curl',
          label: 'Responses API',
          filename: 'POST /v1/responses',
          code: (origin) =>
            [
              `curl ${origin}/v1/responses \\`,
              '  -H "Authorization: Bearer sk-your-tokara-key" \\',
              '  -H "Content-Type: application/json" \\',
              "  -d '{",
              '    "model": "gpt-6-astra",',
              '    "reasoning": { "effort": "high" },',
              '    "input": "Design an idempotent webhook retry queue in Go"',
              "  }'",
            ].join('\n'),
        },
        {
          id: 'openai-sdk',
          label: 'OpenAI SDK',
          filename: 'client.ts · TypeScript',
          code: (origin) =>
            [
              "import OpenAI from 'openai'",
              '',
              'const client = new OpenAI({',
              '  apiKey: process.env.TOKARA_API_KEY,',
              `  baseURL: '${origin}/v1',`,
              '})',
              '',
              'const res = await client.responses.create({',
              "  model: 'gpt-6.1-sol',",
              "  input: 'Summarize key API contract changes',",
              '})',
            ].join('\n'),
        },
      ],
      modelsSectionTitle: t('Latest OpenAI GPT-6.2 & GPT-6.1 model lineup'),
      modelsSectionSubtitle: t(
        'Match reasoning depth, visual computer-use capability, latency, and token cost to each stage of your pipeline.'
      ),
      models: [
        {
          id: 'gpt-6-astra',
          name: 'GPT-6.2 / GPT-6 Astra',
          tier: 'FRONTIER',
          contextWindow: '1.05M ctx',
          maxOutput: '128K out',
          summary: t(
            'OpenAI flagship frontier tier (`gpt-6.2-astra` / `gpt-6-astra`) built for hard architectural reasoning, deep research, security auditing, and complex multi-step workflows.'
          ),
          highlights: [
            t('Maximum reasoning depth'),
            t('Complex systems & security'),
            t('Stateful tool orchestration'),
          ],
        },
        {
          id: 'gpt-6.1-sol',
          name: 'GPT-6.2 / GPT-6.1 Sol',
          tier: 'CODEX FLAGSHIP',
          contextWindow: '1.05M ctx',
          maxOutput: '128K out',
          summary: t(
            'Go-to coding and agent model (`gpt-6.2-sol` / `gpt-6.1-sol`) delivering near-Astra software engineering performance at a fraction of the latency and cost.'
          ),
          highlights: [
            t('Recommended Codex CLI default'),
            t('Fast diff & test iteration'),
            t('Balanced token efficiency'),
          ],
        },
        {
          id: 'gpt-6.1-terra',
          name: 'GPT-6.1 Terra',
          tier: 'VISION & COMPUTER USE',
          contextWindow: '1.05M ctx',
          maxOutput: '128K out',
          summary: t(
            'Efficient mid-tier model optimized for visual reasoning, UI screenshot comprehension, precise computer use, and natural technical writing.'
          ),
          highlights: [
            t('Visual & UI grounding'),
            t('Computer-use precision'),
            t('Crisp technical writing'),
          ],
        },
        {
          id: 'gpt-6-luna',
          name: 'GPT-6 Luna',
          tier: 'HIGH-THROUGHPUT',
          contextWindow: '1M ctx',
          maxOutput: '64K out',
          summary: t(
            'Fastest, most cost-effective GPT-6 tier engineered for structured JSON extraction, routing, classification, and high-concurrency production apps.'
          ),
          highlights: [
            t('Sub-second streaming start'),
            t('Structured output schemas'),
            t('High-volume batch friendly'),
          ],
        },
      ],
      compatibleAliases: [
        'gpt-6.2-astra',
        'gpt-6.2-sol',
        'gpt-6-sol',
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.5-pro',
        'gpt-5.4-pro',
        'gpt-5.4',
        'gpt-4.1',
        'gpt-4o',
        'gpt-image-2.6-sunburst',
      ],
      capabilitiesTitle: t('Engineered for Codex CLI and OpenAI SDK workloads'),
      capabilitiesSubtitle: t(
        'Switch models without rewriting client code while keeping full visibility over reasoning and cached tokens.'
      ),
      capabilities: [
        {
          code: 'G1',
          tag: 'RESPONSES + CHAT',
          title: t('Dual Responses & Chat Completions wire support'),
          description: t(
            'Run stateful agentic workflows over POST /v1/responses alongside classic POST /v1/chat/completions, embeddings, and GPT Image 2.6 routes.'
          ),
        },
        {
          code: 'G2',
          tag: 'REASONING EFFORT',
          title: t('Configurable reasoning effort passthrough'),
          description: t(
            'Forwards reasoning effort controls cleanly so Codex CLI and SDK callers can dial between instant replies and deep verification.'
          ),
        },
        {
          code: 'G3',
          tag: 'SMART SCHEDULER',
          title: t('Multi-region OpenAI & Azure load balancing'),
          description: t(
            'Aggregates official OpenAI and enterprise channels behind priority weights and automatic health checks for consistent throughput.'
          ),
        },
        {
          code: 'G4',
          tag: 'EXACT METERING',
          title: t('Transparent reasoning & cache token logs'),
          description: t(
            'Every completion records prompt, cached input, reasoning, and output tokens against published model and group multipliers.'
          ),
        },
      ],
      faqTitle: t('OpenAI GPT-6 & Codex CLI FAQ'),
      faqSubtitle: t(
        'Answers on connecting Codex CLI, choosing Astra / Sol / Terra / Luna variants, and migrating SDKs.'
      ),
      faqs: [
        {
          question: t('How do I connect OpenAI Codex CLI to Tokara?'),
          answer: t(
            'Add a [model_providers.tokara] section in ~/.codex/config.toml with base_url set to the /v1 endpoint and wire_api = "responses", then export NEW_API_KEY with your sk- token.'
          ),
        },
        {
          question: t(
            'How should I choose between GPT-6 Astra, Sol, Terra, and Luna?'
          ),
          answer: t(
            'Use Astra (gpt-6.2-astra / gpt-6-astra) for hard architectural reasoning, Sol (gpt-6.2-sol / gpt-6.1-sol) as your daily Codex CLI flagship, gpt-6.1-terra for visual and computer-use tasks, and gpt-6-luna for high-volume chat or extraction.'
          ),
        },
        {
          question: t(
            'Should new applications target /v1/responses or /v1/chat/completions?'
          ),
          answer: t(
            'Use /v1/responses for Codex CLI, reasoning-effort controls, and agentic tool loops; keep /v1/chat/completions when integrating third-party OpenAI-compatible apps such as Cherry Studio, Dify, or Cursor.'
          ),
        },
        {
          question: t(
            'Can one Tokara API key call both GPT and Claude/Gemini?'
          ),
          answer: t(
            'Yes. Unless you restrict a key with a custom model allowlist, the same sk- key can call OpenAI GPT, Anthropic Claude, Google Gemini, and DeepSeek models.'
          ),
        },
      ],
    },
    gemini: {
      slug: 'gemini',
      href: '/gemini',
      shortLabel: 'Google Gemini',
      navBadge: 'Gemini 4 · 1M',
      breadcrumbLabel: 'Google Gemini',
      protocolTag: 'GOOGLE GENAI · /V1BETA & /V1',
      endpointPath: 'POST /v1beta/models/{model}:generateContent',
      baseUrlSuffix: '/v1',
      baseUrlHint: t(
        'Supports both OpenAI-compatible /v1 SDKs and native Google GenAI /v1beta routes'
      ),
      accentTone: 'indigo',
      heroEyebrow: t('Gemini 4 Element Series & 1M+ Multimodal AI'),
      heroTitle: t('Google Gemini 4 & 3.8 Flash'),
      heroHighlight: t('multimodal API gateway'),
      heroDescription: t(
        'Access Google’s latest Gemini 4 Carbon, Gemini 4 Argon, Gemini 4 Hydrogen, and Gemini 3.8 Flash over native /v1beta endpoints or standard OpenAI SDKs — built for 1M-token codebases, multimodal reasoning, and high-speed agent orchestration.'
      ),
      homeCardTitle: t('Google Gemini 4 & 3.8 Flash'),
      homeCardSummary: t(
        'Frontier Gemini 4 Carbon, Argon & Hydrogen plus ultra-fast 3.8 Flash via native /v1beta or OpenAI-compatible /v1.'
      ),
      homeQuickCommand: (origin) =>
        `POST ${origin}/v1beta/models/gemini-4-carbon:generateContent`,
      specs: [
        {
          label: t('Flagship Generation'),
          value: 'Gemini 4',
          detail: t('Carbon, Argon & Hydrogen elements'),
        },
        {
          label: t('Context Window'),
          value: '1M+ Tokens',
          detail: t('Whole codebases, PDFs, audio & video'),
        },
        {
          label: t('Dual Endpoints'),
          value: '/v1beta + /v1',
          detail: t('Google GenAI SDK & OpenAI SDK'),
        },
        {
          label: t('Dynamic Thinking'),
          value: 'Thinking Levels',
          detail: t('Minimal to high reasoning depth'),
        },
      ],
      snippets: [
        {
          id: 'openai-compat',
          label: 'OpenAI SDK (/v1)',
          filename: 'gemini-openai.ts',
          code: (origin) =>
            [
              "import OpenAI from 'openai'",
              '',
              'const client = new OpenAI({',
              '  apiKey: process.env.TOKARA_API_KEY,',
              `  baseURL: '${origin}/v1',`,
              '})',
              '',
              'const completion = await client.chat.completions.create({',
              "  model: 'gemini-4-hydrogen',",
              "  messages: [{ role: 'user', content: 'Extract action items from transcript' }],",
              '})',
            ].join('\n'),
        },
        {
          id: 'native-v1beta',
          label: 'Native /v1beta',
          filename: 'POST /v1beta/models',
          code: (origin) =>
            [
              `curl "${origin}/v1beta/models/gemini-4-carbon:generateContent" \\`,
              '  -H "x-goog-api-key: sk-your-tokara-key" \\',
              '  -H "Content-Type: application/json" \\',
              "  -d '{",
              '    "contents": [{',
              '      "role": "user",',
              '      "parts": [{ "text": "Audit cross-service auth flow across these specs" }]',
              '    }]',
              "  }'",
            ].join('\n'),
        },
        {
          id: 'python-sdk',
          label: 'Python Quickstart',
          filename: 'main.py · Python',
          code: (origin) =>
            [
              'from openai import OpenAI',
              '',
              'client = OpenAI(',
              '    api_key="sk-your-tokara-key",',
              `    base_url="${origin}/v1",`,
              ')',
              '',
              'stream = client.chat.completions.create(',
              '    model="gemini-3.8-flash",',
              '    messages=[{"role": "user", "content": "Write Vitest table tests"}],',
              '    stream=True,',
              ')',
            ].join('\n'),
        },
      ],
      modelsSectionTitle: t('Latest Google Gemini 4 & 3.8 model lineup'),
      modelsSectionSubtitle: t(
        'Combine frontier Gemini 4 Carbon & Argon reasoning with high-speed Hydrogen and 3.8 Flash execution under one key.'
      ),
      models: [
        {
          id: 'gemini-4-carbon',
          name: 'Gemini 4 Carbon',
          tier: 'FRONTIER REASONING',
          contextWindow: '1M+ ctx',
          maxOutput: '65K out',
          summary: t(
            'Google frontier reasoning flagship optimized for deep software engineering, scientific computing, and complex 1M-token agent systems.'
          ),
          highlights: [
            t('1M+ token deep retrieval'),
            t('Complex multimodal synthesis'),
            t('High structural accuracy'),
          ],
        },
        {
          id: 'gemini-4-argon',
          name: 'Gemini 4 Argon',
          tier: 'EFFICIENT FRONTIER',
          contextWindow: '1M ctx',
          maxOutput: '65K out',
          summary: t(
            'Efficient frontier reasoning model engineered for faster turn-around times and lower token consumption across multi-step agent loops.'
          ),
          highlights: [
            t('Fast reasoning turn latency'),
            t('Lower token consumption'),
            t('Built-in dynamic thinking'),
          ],
        },
        {
          id: 'gemini-4-hydrogen',
          name: 'Gemini 4 Hydrogen',
          tier: 'EVERYDAY WORKHORSE',
          contextWindow: '1M ctx',
          maxOutput: '65K out',
          summary: t(
            'Default general-purpose Gemini 4 workhorse bridging strong coding intelligence, reliable tool calling, and native multimodal understanding.'
          ),
          highlights: [
            t('Best default for agent loops'),
            t('PDF, audio, image & video'),
            t('Strong price-to-performance'),
          ],
        },
        {
          id: 'gemini-3.8-flash',
          name: 'Gemini 3.8 Flash',
          tier: 'ULTRA-FAST FLASH',
          contextWindow: '1M ctx',
          maxOutput: '65K out',
          summary: t(
            'High-intelligence Flash tier built for ultra-high-throughput agent orchestration, real-time streaming chat, and large-scale extraction.'
          ),
          highlights: [
            t('Hundreds of tok/s throughput'),
            t('High QPS concurrency'),
            t('Minimal per-million token cost'),
          ],
        },
      ],
      compatibleAliases: [
        'gemini-4-neon',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
      ],
      capabilitiesTitle: t(
        'Native Google GenAI power with unified gateway ergonomics'
      ),
      capabilitiesSubtitle: t(
        'Call Gemini natively or through your existing OpenAI client without managing separate GCP credentials.'
      ),
      capabilities: [
        {
          code: 'M1',
          tag: 'DUAL PROTOCOL',
          title: t('Native /v1beta and OpenAI /v1 compatibility'),
          description: t(
            'Use official Google GenAI SDKs against /v1beta or keep a single OpenAI SDK codebase across GPT, Claude, and Gemini.'
          ),
        },
        {
          code: 'M2',
          tag: '1M+ MULTIMODAL',
          title: t('Massive context across text, code, PDF, and media'),
          description: t(
            'Feed entire repositories, long contracts, screenshots, and audio/video transcripts in a single request without chunking.'
          ),
        },
        {
          code: 'M3',
          tag: 'VERTEX + AI STUDIO',
          title: t('Aggregated Vertex AI & AI Studio upstream routing'),
          description: t(
            'Balances traffic across global Vertex AI and Google AI Studio channels to avoid regional quota bottlenecks.'
          ),
        },
        {
          code: 'M4',
          tag: 'UNIFIED BILLING',
          title: t('Single USD balance without separate cloud billing'),
          description: t(
            'Skip GCP project setup and IAM service accounts — pay per token from one Tokara wallet with granular usage analytics.'
          ),
        },
      ],
      faqTitle: t('Google Gemini 4 & 3.8 API FAQ'),
      faqSubtitle: t(
        'Guidance on /v1beta vs /v1 endpoints, choosing between Gemini 4 Carbon / Argon / Hydrogen and 3.8 Flash, and multimodal billing.'
      ),
      faqs: [
        {
          question: t(
            'Can I call Gemini 4 models and Gemini 3.8 Flash using the standard OpenAI SDK?'
          ),
          answer: t(
            'Yes. Point any OpenAI SDK at the /v1 Base URL and pass model="gemini-4-carbon", "gemini-4-hydrogen", or "gemini-3.8-flash". For Google-native multimodal fields, call /v1beta directly with the same API key.'
          ),
        },
        {
          question: t(
            'How do Gemini 4 Carbon, Argon, Hydrogen, and Gemini 3.8 Flash differ?'
          ),
          answer: t(
            'Use gemini-4-carbon for frontier coding and deep 1M-context reasoning, gemini-4-argon for faster token-efficient reasoning, gemini-4-hydrogen as your everyday multimodal coding workhorse, and gemini-3.8-flash for high-QPS real-time agent loops.'
          ),
        },
        {
          question: t('How do I authenticate against native /v1beta routes?'),
          answer: t(
            'Pass your Tokara sk- key either in the x-goog-api-key request header or via Authorization: Bearer sk-..., targeting /v1beta/models/{model}:generateContent or :streamGenerateContent.'
          ),
        },
        {
          question: t('How are multimodal and thinking tokens metered?'),
          answer: t(
            'Input modalities (text, image, PDF, audio, video) and dynamic thinking/output tokens are converted according to the published model rate on the Model Square page and itemized in Usage Logs.'
          ),
        },
      ],
    },
  }
}
