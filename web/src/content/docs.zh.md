# Tokara 使用文档

统一网关，一处接入全部模型：**一个地址、一个密钥，接上所有主流大模型；一套后台，管住渠道、额度与账单。**

## 项目简介 {#overview}

Tokara 是一个开源的 AI 模型 API 网关（AI Gateway）。它在前面接收你的请求，在后面把请求转发给真正的大模型供应商，并在中间完成鉴权、选渠道、限流、重试、计费和日志。

请求的完整链路只有四步：

1. 客户端（Claude Code、Codex、Cherry Studio 或你自己的代码）用 OpenAI / Anthropic / Gemini 协议发出请求；
2. Tokara 收到后完成鉴权、限流，并选出可用渠道；
3. 请求被转发到上游供应商（OpenAI、Anthropic、Gemini、DeepSeek、自建或中转渠道）；
4. 结果回传给客户端，同时记录用量并扣减额度。

它可以解决三类问题：

- **接入成本**：不用为每个供应商维护一套 SDK、地址和密钥，所有客户端都填同一个 Base URL。
- **管理成本**：渠道、模型、令牌、用户、分组、限流都在一个后台管理，出问题能定位到具体渠道。
- **计费成本**：按 token 或按次计费，支持分组倍率、充值、订阅、手续费，账目可直接对账。

## 核心优势 {#advantages}

| 能力       | 说明                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 多协议兼容 | 同时提供 OpenAI（`/v1/chat/completions`、`/v1/responses`）、Anthropic（`/v1/messages`）、Gemini（`/v1beta`）入口，现有客户端零改造 |
| 多渠道聚合 | 一个模型可绑定多个渠道，支持权重、优先级、失败重试与自动禁用                                                                       |
| 精细计费   | 模型倍率、补全倍率、缓存倍率、分组倍率、按次定价、阶梯表达式计费                                                                   |
| 令牌与权限 | 令牌级别设置额度、过期时间、模型白名单、IP 限制、分组                                                                              |
| 充值与订阅 | 钱包充值（多渠道、可配手续费）、固定周期订阅套餐                                                                                   |
| 用量可观测 | 每次请求记录模型、令牌、分组、输入/输出/缓存 token、耗时与扣费                                                                     |
| 运营能力   | 兑换码、邀请返利、公告、价格页、排行、用户分组倍率等                                                                               |

## 快速开始 {#quickstart}

1. 登录后台，在「令牌」页创建一个 API Key（`sk-` 开头）。
2. 记下站点地址，OpenAI 兼容客户端填 `https://tokara.top/v1`。
3. 在任意 OpenAI 兼容客户端里填入 Base URL 和 Key，选择站点已开放的模型即可。

```bash
curl https://tokara.top/v1/chat/completions \
  -H "Authorization: Bearer sk-你的令牌" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

模型名必须与站点「模型价格 / 渠道」里配置的一致，否则会返回模型不存在。

## 接口与协议 {#endpoints}

| 协议                    | 入口                                                          | 典型用途                            |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------- |
| OpenAI Chat Completions | `POST /v1/chat/completions`                                   | 绝大多数客户端、SDK、Agent 框架     |
| OpenAI Responses        | `POST /v1/responses`                                          | Codex 等使用 Responses 协议的客户端 |
| OpenAI 其他             | `/v1/embeddings`、`/v1/audio/*`、`/v1/images/*`、`/v1/models` | 向量、语音、图像、模型列表          |
| Anthropic Messages      | `POST /v1/messages`                                           | Claude Code、Anthropic SDK          |
| Gemini                  | `/v1beta/models/{model}:{action}`                             | Gemini SDK 与 Gemini 原生客户端     |

鉴权统一用 `Authorization: Bearer sk-...`，Claude 客户端也可以用 `x-api-key`。

Base URL 按协议填写，两者相差一个 `/v1`：

- **OpenAI 兼容客户端**：`https://tokara.top/v1`（客户端会自动拼 `/chat/completions`）；
- **Claude Code / Anthropic SDK**：`https://tokara.top`（SDK 会自动拼 `/v1/messages`，这里不要再补 `/v1`，否则会 404）。

## 计费与收费模式 {#billing}

系统内部用「额度（quota）」记账，所有模型、渠道、分组最终都折算成额度扣减；展示时再换算成金额或令牌数。

### 额度与货币

默认 1 美元对应 `QuotaPerUnit = 500000` 额度，即：

```text
1 额度 = 1 / 500000 美元
```

**模型倍率**是相对价格：倍率 `1.0` 表示 `$0.002 / 1K tokens`，也就是 `$2 / 1M tokens`。

$$R_{model} = 1.0 \iff \$0.002/1K\ tokens$$

站点可以把额度显示为金额或令牌，两者只是展示差异。

### 按 Token 计费（默认）

适用于绝大多数对话、补全、多模态模型：

$$quota = \left(P + C_{cache} \cdot R_{cache} + C_{write} \cdot R_{write} + I \cdot R_{image} + O \cdot R_{completion}\right) \times R_{model} \times R_{group}$$

| 符号      | 含义               | 说明                                                  |
| --------- | ------------------ | ----------------------------------------------------- |
| `P`       | 普通输入 token     | 未命中缓存的部分                                      |
| `C_cache` | 缓存命中输入 token | 按 `R_cache` 计价，常见 0.1–0.5                       |
| `C_write` | 缓存写入 token     | 按 `R_write` 计价，默认 1.25                          |
| `I`       | 图片 token         | 按 `R_image` 计价                                     |
| `O`       | 输出 token         | 按 `R_completion` 计价，常见 4（输出是输入的 4 倍价） |
| `R_model` | 模型倍率           | 每个模型单独配置                                      |
| `R_group` | 分组倍率           | 见下一节                                              |

音频输入/输出使用独立的单价体系，按「单价 / 1M tokens × 音频 token 数」计算后同样乘以分组倍率。

### 按次计费（固定单价）

适用于图像生成、视频、插件类按次收费的模型，与 token 用量无关：

$$quota = Price_{call} \times QuotaPerUnit \times R_{group}$$

### 分组倍率

`R_group` 取「本次请求使用的分组」倍率；如果后台配置了「用户分组 → 使用分组」的专用倍率，则以专用倍率为准。

```text
default = 1.0   → 标准价
vip     = 0.8   → 同样的请求只扣 80%
svip    = 0.6   → 只扣 60%
```

管理员可以给不同用户/令牌分配不同分组，实现批发价、内测价或成本价。

### 计费示例

**示例 1（按 token）**：模型倍率 `0.5`，分组倍率 `0.8`，输入 2000 token（其中 1000 命中缓存，`R_cache = 0.1`），输出 1000 token，`R_completion = 4`。

```text
输入部分 = 1000 + 1000 × 0.1 = 1100
输出部分 = 1000 × 4          = 4000
quota = (1100 + 4000) × 0.5 × 0.8 = 2040
金额  = 2040 / 500000 = $0.00408
```

**示例 2（按次）**：单次价格 `$0.02`，分组倍率 `0.8`。

```text
quota = 0.02 × 500000 × 0.8 = 8000
金额  = 8000 / 500000 = $0.016
```

### 阶梯 / 表达式计费（可选）

除固定倍率外，还可以为模型配置表达式，按 token 区间或字段组合自定义公式，例如「前 32K 输入按标准价，超出部分打折」。表达式在运行时用本次请求的用量变量求值，结果同样以额度结算。

### 充值、手续费与订阅

**钱包充值**：充值是「付钱换额度」，与模型倍率无关：

$$到账额度 = 充值金额 \times QuotaPerUnit \times R_{topup} \times 折扣$$

`R_topup` 是充值分组倍率（可对不同用户分组设置不同兑换比例），`折扣` 是后台配置的充值时优惠（可选）。


## 客户端接入方式 {#clients}

所有客户端都只需要两样东西：**Base URL** 和 **API Key**。区别只在于各家对地址格式和协议的要求不同。

| 客户端            | 协议             | Base URL                |
| ----------------- | ---------------- | ----------------------- |
| OpenAI 兼容客户端 | OpenAI           | `https://tokara.top/v1` |
| Claude Code CLI   | Anthropic        | `https://tokara.top`    |
| CC Switch         | 两者都支持       | 按供应商类型填上面两种  |
| Codex CLI         | OpenAI Responses | `https://tokara.top/v1` |
| OpenCode          | OpenAI 兼容      | `https://tokara.top/v1` |
| Hermes            | OpenAI 兼容      | `https://tokara.top/v1` |

### Claude Code CLI

Claude Code 走 Anthropic Messages 协议，Base URL 填站点根地址（不要带 `/v1`，SDK 会自己拼接 `/v1/messages`）：

```bash
export ANTHROPIC_BASE_URL="https://tokara.top"
export ANTHROPIC_AUTH_TOKEN="sk-你的令牌"
export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"
export ANTHROPIC_SMALL_FAST_MODEL="claude-haiku-4-5-20251001"
claude
```

也可以写进 `~/.claude/settings.json` 的 `env` 字段，长期生效。`ANTHROPIC_SMALL_FAST_MODEL` 在部分版本里叫 `ANTHROPIC_DEFAULT_HAIKU_MODEL`，两个变量作用相同。模型名要换成站点已开放的 Claude 模型；如果站点只提供其他厂商模型，需要用支持协议转换的模型别名。

### CC Switch

CC Switch 是 Claude Code / Codex 的配置切换工具，适合同时维护多个站点或多个账号：

1. 新建供应商，填名称、Base URL、API Key；
2. Claude 类型填根地址 `https://tokara.top`，Codex 类型填 `https://tokara.top/v1`；
3. 选择模型后切换，工具会自动改写 `~/.claude/settings.json` 或 `~/.codex/config.toml`。

切换后新开一个终端窗口即可生效，不需要重复登录。

### Codex CLI

编辑 `~/.codex/config.toml`，把供应商指向站点：

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
export NEW_API_KEY="sk-你的令牌"
codex
```

`wire_api` 用 `responses` 走 `/v1/responses`；如果站点或上游只支持 Chat Completions，改成 `"chat"`。

### OpenCode

在项目目录或全局配置 `opencode.json` 中新增一个 OpenAI 兼容供应商：

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
export NEW_API_KEY="sk-你的令牌"
opencode
```

`models` 里写上站点开放的模型 ID，才能在下拉列表里选到。

### Hermes

Hermes 通过交互式向导接入最省事：

```bash
hermes setup
# 选择 OpenAI 兼容 / Custom endpoint
# Base URL: https://tokara.top/v1
# API Key:  sk-你的令牌
# Model:    站点已开放的模型，如 gpt-5 / deepseek-chat
```

也可以直接改配置文件（字段名以所用版本为准，以下为常见写法）：

```yaml
provider: openai
model: gpt-5
base_url: https://tokara.top/v1
```

Hermes 也支持用 `hermes model` 随时切换模型。DeepSeek 官方文档里「接入 Hermes」的做法，只是把 Base URL 换成 DeepSeek 的地址；换成本站地址就是同样的流程，模型换成站点里的 DeepSeek 系列即可。

### 其他 OpenAI 兼容客户端

Cherry Studio、ChatBox、LobeChat、NextChat、Cline、Roo Code、Continue、Dify、n8n 等，接入方式一致：

```text
Base URL: https://tokara.top/v1
API Key:  sk-你的令牌
Model:    站点已开放的模型 ID
```

部分客户端（如 Dify、n8n）需要选择「OpenAI 兼容 / Custom OpenAI」类型，再填自定义地址。

## 常见问题 {#faq}

**返回 401 / 无效令牌**：Key 复制不完整、令牌已过期、令牌被禁用，或令牌的模型白名单不包含该模型。

**返回模型不存在 / 无可用渠道**：模型 ID 拼写不一致，或该模型未在任何渠道启用、未对当前分组开放。

**余额不足**：账户额度不足以支付本次预扣，充值后重试；需要更低费率可联系站点管理员调整分组。

**实际扣费与官方价格不同**：站点会叠加模型倍率与分组倍率，公式见上文「计费与收费模式」。

**流式输出被截断**：多为上游超时或网络代理缓冲导致，可先重试或改用非流式请求；持续出现请联系站点管理员。

**Claude Code 报 404**：`ANTHROPIC_BASE_URL` 多写了 `/v1`，应填根地址 `https://tokara.top`。
