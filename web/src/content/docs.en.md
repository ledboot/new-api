# Tokara Documentation

One gateway for every model: **a single endpoint and a single key for all major providers, and one console to manage channels, quotas and billing.**

## Overview {#overview}

Tokara is an open-source AI model API gateway. It receives requests from your clients, forwards them to the real model providers, and handles authentication, channel selection, rate limiting, retries, billing and logging in between.

A request goes through four steps:

1. A client (Claude Code, Codex, Cherry Studio or your own code) sends a request over the OpenAI / Anthropic / Gemini protocol;
2. Tokara authenticates the key, applies rate limits and picks an available channel;
3. The request is forwarded to the upstream provider (OpenAI, Anthropic, Gemini, DeepSeek, or a relay you host yourself);
4. The response goes back to the client while usage is recorded and quota is deducted.

It solves three problems:

- **Integration cost**: no per-provider SDK, endpoint or key to maintain — every client points at the same Base URL.
- **Operations cost**: channels, models, tokens, users, groups and rate limits live in one console, and incidents can be traced to a specific channel.
- **Billing cost**: pay per token or per call, with group ratios, top-ups, subscriptions and payment fees, so the books reconcile directly.

## Highlights {#advantages}

| Capability | Details |
| --- | --- |
| Multi-protocol | OpenAI (`/v1/chat/completions`, `/v1/responses`), Anthropic (`/v1/messages`) and Gemini (`/v1beta`) endpoints, so existing clients work unchanged |
| Channel aggregation | One model can bind several channels with weights, priorities, retries and automatic disabling |
| Fine-grained billing | Model ratio, completion ratio, cache ratios, group ratios, per-call pricing and expression-based tiered billing |
| Tokens and permissions | Per-token quota, expiry, model allowlist, IP limits and group |
| Top-ups and subscriptions | Wallet top-ups across multiple payment channels (with fees) and fixed-period subscription plans |
| Observability | Every request records model, token, group, input/output/cache tokens, latency and cost |
| Operations | Redemption codes, referral rewards, announcements, pricing page, rankings, per-group ratios and more |

## Quick start {#quickstart}

1. Sign in to the console and create an API key (`sk-...`) on the Tokens page.
2. Note your site address; OpenAI-compatible clients use `https://tokara.top/v1`.
3. Paste the Base URL and key into any OpenAI-compatible client and pick a model your site offers.

```bash
curl https://tokara.top/v1/chat/completions \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Model names must match what your site configures under model pricing / channels, otherwise the request is rejected as an unknown model.

## Endpoints and protocols {#endpoints}

| Protocol | Endpoint | Typical use |
| --- | --- | --- |
| OpenAI Chat Completions | `POST /v1/chat/completions` | Most clients, SDKs and agent frameworks |
| OpenAI Responses | `POST /v1/responses` | Codex and other Responses-protocol clients |
| Other OpenAI | `/v1/embeddings`, `/v1/audio/*`, `/v1/images/*`, `/v1/models` | Embeddings, speech, images, model list |
| Anthropic Messages | `POST /v1/messages` | Claude Code, Anthropic SDKs |
| Gemini | `/v1beta/models/{model}:{action}` | Gemini SDKs and native Gemini clients |

Authentication uses `Authorization: Bearer sk-...`; Claude clients may also send `x-api-key`.

The Base URL depends on the protocol — the two differ by one `/v1`:

- **OpenAI-compatible clients**: `https://tokara.top/v1` (the client appends `/chat/completions` itself);
- **Claude Code / Anthropic SDKs**: `https://tokara.top` (the SDK appends `/v1/messages` itself — don't add `/v1` here, or the request returns 404).

## Billing and pricing {#billing}

The system keeps its books in quota units. Every model, channel and group ultimately settles as a quota deduction, which is converted to money or tokens for display.

### Quota and currency

By default one US dollar equals `QuotaPerUnit = 500000` quota units:

```text
1 quota = 1 / 500000 USD
```

**Model ratio** is relative pricing: a ratio of `1.0` means `$0.002 / 1K tokens`, i.e. `$2 / 1M tokens`.

$$R_{model} = 1.0 \iff \$0.002/1K\ tokens$$

A site can display quota either as money or as tokens; the numbers are the same.

### Per-token billing (default)

This covers most chat, completion and multimodal models:

$$quota = \left(P + C_{cache} \cdot R_{cache} + C_{write} \cdot R_{write} + I \cdot R_{image} + O \cdot R_{completion}\right) \times R_{model} \times R_{group}$$

| Symbol | Meaning | Notes |
| --- | --- | --- |
| `P` | Regular input tokens | The part that missed the cache |
| `C_cache` | Cache-hit input tokens | Billed at `R_cache`, commonly 0.1–0.5 |
| `C_write` | Cache-write tokens | Billed at `R_write`, default 1.25 |
| `I` | Image tokens | Billed at `R_image` |
| `O` | Output tokens | Billed at `R_completion`, commonly 4 (output costs 4× input) |
| `R_model` | Model ratio | Configured per model |
| `R_group` | Group ratio | See the next section |

Audio input/output uses separate unit prices: unit price per 1M tokens × audio tokens, then multiplied by the group ratio as well.

### Per-call billing (fixed price)

For image generation, video and plugin-style models billed per call, independent of token usage:

$$quota = Price_{call} \times QuotaPerUnit \times R_{group}$$

### Group ratios

`R_group` is the ratio of the group used by the request. If a dedicated "user group → usage group" ratio is configured, that ratio takes precedence.

```text
default = 1.0   → list price
vip     = 0.8   → the same request costs 80%
svip    = 0.6   → costs 60%
```

Administrators can assign users or tokens to different groups to offer wholesale, beta or cost pricing.

### Worked examples

**Example 1 (per token)**: model ratio `0.5`, group ratio `0.8`, 2000 input tokens (1000 of them cache hits, `R_cache = 0.1`), 1000 output tokens, `R_completion = 4`.

```text
input  = 1000 + 1000 × 0.1 = 1100
output = 1000 × 4          = 4000
quota  = (1100 + 4000) × 0.5 × 0.8 = 2040
price  = 2040 / 500000 = $0.00408
```

**Example 2 (per call)**: unit price `$0.02`, group ratio `0.8`.

```text
quota = 0.02 × 500000 × 0.8 = 8000
price = 8000 / 500000 = $0.016
```

### Tiered / expression billing (optional)

Besides a fixed ratio, a model can carry an expression that builds its own formula over token ranges or field combinations, for example "the first 32K input tokens at list price, the rest discounted". The expression is evaluated at request time with that request's usage variables and settles in quota as usual.

### Top-ups, fees and subscriptions

**Wallet top-ups** exchange money for quota, independent of model ratios:

$$credited = amount \times QuotaPerUnit \times R_{topup} \times discount$$

`R_topup` is the top-up group ratio (different user groups can get different exchange rates) and `discount` is an optional promotional discount.


## Client setup {#clients}

Every client needs just two things: a **Base URL** and an **API key**. They differ only in which format and protocol they expect.

| Client | Protocol | Base URL |
| --- | --- | --- |
| OpenAI-compatible client | OpenAI | `https://tokara.top/v1` |
| Claude Code CLI | Anthropic | `https://tokara.top` |
| CC Switch | Both | Use the matching URL above |
| Codex CLI | OpenAI Responses | `https://tokara.top/v1` |
| OpenCode | OpenAI-compatible | `https://tokara.top/v1` |
| Hermes | OpenAI-compatible | `https://tokara.top/v1` |

### Claude Code CLI

Claude Code speaks the Anthropic Messages protocol, so the Base URL is the site root (no `/v1`; the SDK appends `/v1/messages` itself):

```bash
export ANTHROPIC_BASE_URL="https://tokara.top"
export ANTHROPIC_AUTH_TOKEN="sk-your-token"
export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"
export ANTHROPIC_SMALL_FAST_MODEL="claude-haiku-4-5-20251001"
claude
```

You can also put these in the `env` block of `~/.claude/settings.json` to keep them. Some versions name `ANTHROPIC_SMALL_FAST_MODEL` as `ANTHROPIC_DEFAULT_HAIKU_MODEL`; they do the same thing. Use a Claude model your site actually offers; if the site only provides other vendors' models, use a model alias that performs protocol conversion.

### CC Switch

CC Switch switches Claude Code / Codex configuration, which helps when you juggle several sites or accounts:

1. Add a provider with a name, Base URL and API key;
2. Use the root address `https://tokara.top` for the Claude entry and `https://tokara.top/v1` for the Codex entry;
3. Pick a model and switch — the tool rewrites `~/.claude/settings.json` or `~/.codex/config.toml` for you.

Open a new terminal window to pick up the change; no re-login needed.

### Codex CLI

Edit `~/.codex/config.toml` and point the provider at your site:

```toml
model = "gpt-5"
model_provider = "tokara"

[model_providers.tokara]
name = "Tokara"
base_url = "https://tokara.top/v1"
env_key = "NEW_API_KEY"
wire_api = "responses"
```

```bash
export NEW_API_KEY="sk-your-token"
codex
```

`wire_api = "responses"` uses `/v1/responses`; if your site or upstream only supports Chat Completions, set it to `"chat"`.

### OpenCode

Add an OpenAI-compatible provider to `opencode.json` (project-level or global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "tokara": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Tokara",
      "options": {
        "baseURL": "https://tokara.top/v1",
        "apiKey": "{env:NEW_API_KEY}"
      },
      "models": {
        "gpt-5": { "name": "GPT-5" }
      }
    }
  },
  "model": "tokara/gpt-5"
}
```

```bash
export NEW_API_KEY="sk-your-token"
opencode
```

List the model IDs your site offers under `models`, otherwise they will not appear in the picker.

### Hermes

The interactive wizard is the easiest way to connect Hermes:

```bash
hermes setup
# choose OpenAI-compatible / Custom endpoint
# Base URL: https://tokara.top/v1
# API Key:  sk-your-token
# Model:    a model your site offers, e.g. gpt-5 / deepseek-chat
```

You can also edit the config file directly (field names follow your Hermes version; this is the common shape):

```yaml
provider: openai
model: gpt-5
base_url: https://tokara.top/v1
```

`hermes model` switches models at any time. DeepSeek's official "Integrate with Hermes" guide is the same flow with the Base URL pointed at DeepSeek — point it at your site instead and pick the DeepSeek models your site offers.

### Other OpenAI-compatible clients

Cherry Studio, ChatBox, LobeChat, NextChat, Cline, Roo Code, Continue, Dify, n8n and friends all follow the same pattern:

```text
Base URL: https://tokara.top/v1
API Key:  sk-your-token
Model:    a model ID your site offers
```

Some clients (Dify, n8n) require choosing an "OpenAI-compatible / Custom OpenAI" provider type before you can enter a custom address.

## FAQ {#faq}

**401 / invalid token**: the key was copied incompletely, the token expired or is disabled, or the token's model allowlist does not include that model.

**Unknown model / no available channel**: the model ID is misspelled, the model is not enabled on any channel, or it is not open to your group.

**Insufficient balance**: the account cannot cover the pre-charge; top up and retry, and ask the site operator for a lower-rate group if you need one.

**Charges differ from official prices**: your site adds model and group ratios on top — see "Billing and pricing" above.

**Streaming output is cut off**: usually an upstream timeout or proxy buffering; retry or fall back to a non-streaming request, and contact the site operator if it keeps happening.

**Claude Code returns 404**: `ANTHROPIC_BASE_URL` includes `/v1`; use the root `https://tokara.top` instead.
