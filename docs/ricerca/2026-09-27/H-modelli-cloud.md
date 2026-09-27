# H: Cloud LLM selection (September 2026)
Research date: 27 Sep 2026. Tags: [V] verified today in a primary source I fetched; [P] secondary source; [U] could not verify. Bracketed numbers refer to the Sources list. Report E (§2 and §3) already covers the schema and on-device models; this report covers only the cloud side.

## 0. Bottom line

- **Speed belongs to a (model, host) pair.** For the same weights, DeepSeek V4.1 Flash runs at 59 to 611 tokens/s depending on the host, and gpt-oss-120b at 45 to 1,754 tokens/s [6, 7] [V] (AA 72-hour medians, re-checked on 27 Sep; they drift by about ±10%). Tool-call quality also depends on the host (§3). The bake-off must therefore compare pairs, not models.
- **The founders' claim is half right.** Claude Haiku 4.5 no longer leads on quality per second:
  - On Artificial Analysis (AA), newer non-thinking models beat it on the intelligence index and on τ²-bench [2] [V].
  - Its output speed of 81 tokens/s makes a 120-token JSON answer take about 2.2 s.
  - However, "GLM Flash" cannot be used for this step at all: GLM-5.3-Flash always thinks.
  - Gemini Flash is closed weights, and its latest version cannot switch thinking off.
  - "DeepSeek V4.1" exists only as **DeepSeek-V4.1-Flash** (§1).
- **Default guess:** DeepSeek-V4.1-Flash, non-thinking, strict tool calls, served by a Western or EU host with zero data retention (Fireworks today; Scaleway once it serves V4.1).
  - **Runner-up:** GPT-6 Luna (reasoning effort `none`) with OpenAI EU data residency.
  - **Escalation:** Gemini 3.8 Flash (thinking `low`) on Vertex AI's EU endpoint.
  - **Last fallback:** the existing grammar, then "ask the user to split the request".
- **Cost does not decide.** Every candidate costs about $3.5 or less per active user per month at 40 turns a day, and the default costs about $0.7 (§5.5). Latency, tool-call accuracy and data residency decide.

## 1. What actually exists (checked against primary sources)

| Founder's name | Actual model (Sep 2026) | Weights / licence | Can thinking be turned off? | Verdict for Milo's understand step |
|---|---|---|---|---|
| "DeepSeek V4.1" | **DeepSeek-V4.1-Flash** (10 Sep 2026). API name `deepseek-flash`. There is no V4.1 Pro: Pro is `DeepSeek-V4-Pro-0813` [13, 16] [V] | Open weights, MIT. 552B backbone, 8B active in prefill and 16B in decode [16] [V] | Yes: `thinking: {type: "disabled"}` [14] [V] | **Strong candidate.** Do not use the first-party API with user data (§4) |
| "GLM Flash" | **GLM-5.3-Flash** (26 Aug 2026). The older GLM-4.7-Flash (Jan 2026) is free on Z.ai [17, 19] [V] | Open weights, MIT (320B total, 18B active) [17] [V]. The model card lists only en and zh | **No**: "thinking.type only supports enabled; thinking cannot be disabled" [18] [V] | **Unusable for the 1.5 s budget.** Time to first answer token (TTFA) is 8.9–48 s on all 19 hosts AA measured [9] [V] |
| "Gemini Flash" | **Gemini 3.8 Flash** (2 Sep 2026). Also 3.7 Flash, 3.5 Flash-Lite and 2.5 Flash-Lite [20] [V] | **Closed weights.** Gemma is Google's open family, not Gemini | 3.8 and 3.7 Flash: lowest level is `low`. 3.5 Flash-Lite: `minimal` (default). 2.5 Flash-Lite: thinking off by default [21] [V] | Good escalation model. Borderline as the default because thinking stays on |
| Claude Haiku | **Claude Haiku 4.5** (Oct 2025) is still the only Haiku [24] [V] | Proprietary | Extended thinking is optional | Baseline. Retirement date "not sooner than 15 Oct 2026" [24] [V] |

Other candidates the brief asked about [2, 28, 29, 31, 32] [V]:
- **GPT-6 Luna** (22 Sep 2026): $0.10/$0.50, effort `none`, strict structured outputs.
- **gpt-oss-120b / 20b**: Apache-2.0.
- **Qwen3.6-35B-A3B** and **Qwen3.8-27B**: Apache-2.0.
- **Kimi K2.6** and **K3**: licence "other" on Hugging Face (HF) [44, 50] [V]. K2.6's is a "Modified MIT" licence: MIT plus a duty to show "Kimi K2.6" in the interface above 100M monthly users or $20M monthly revenue. K3's custom licence adds a separate agreement only for model-as-a-service businesses above $20M revenue. Neither blocks an MIT app that calls them through an API.
- **Mistral Small 4**: Apache-2.0. **Mistral Medium 3.5**: licence "other".
- **Llama 4 Maverick/Scout**: Llama 4 Community licence. Its use policy does not grant the licence rights for Llama 4's multimodal models to EU-domiciled people or companies, except as end users of a product [49] [V]. An Italian team therefore cannot self-host or fine-tune them itself.
- **Grok**: the current Grok 4.6/4.7 models are reasoning models taking 8–48 s to the first token [2] [V]. AA marks Grok 4.1 Fast as superseded.

"Open weights" is not "open source": DeepSeek and GLM publish weights under MIT but not their training data. Gemini publishes neither. The distinction matters for vendor risk: open weights can be moved to another host, closed weights cannot.

## 2. Accuracy for Milo's three jobs

### 2.1 Function calling

**BFCL V4 is stale.** Its data was last updated on 2026-04-12 [1] [V]. It contains no DeepSeek V4.x, GLM-4.7/5.x, Gemini 3.x Flash, Qwen3.5+ or GPT-6 model. Within that snapshot, E's conclusion still holds: Haiku 4.5 is the most accurate model under 2 s mean latency.

| BFCL V4 (FC mode) [1] [V] | Overall | Multi-turn | Mean latency (s) | Licence |
|---|---|---|---|---|
| GLM-4.6 (thinking) | 72.38 | 68.00 | 4.34 | MIT |
| **Claude Haiku 4.5** | **68.70** | 53.62 | **1.68** | proprietary |
| Kimi K2 Instruct | 59.06 | 50.63 | 6.40 | modified-MIT |
| Grok 4.1 Fast (non-reasoning) | 58.29 | 46.75 | 2.29 | proprietary |
| Gemini 2.5 Flash | 56.24 | 36.25 | 2.99 | proprietary |
| DeepSeek V3.2-Exp | 54.12 | 37.38 | 5.83 | MIT |
| GPT-4.1 mini | 50.45 | 34.13 | 1.32 | proprietary |
| Qwen3-235B-A22B-2507 | 47.99 | 45.38 | 2.57 | Apache-2.0 |
| Gemini 2.5 Flash-Lite | 36.87 | 13.50 | 1.18 | proprietary |
| Mistral Small 2506 | 37.15 | 11.50 | 1.48 | proprietary |
| Llama 4 Maverick | 37.29 | 20.25 | 18.43 | Llama 4 |

**AA has newer models** [2, 4] [V].
- Intelligence Index v4.3.
- τ²-bench **Telecom**, a dual-control tool-use benchmark. AA's page appears to tag it "Legacy" [P], and models released after about mid-2026 lack it. Their replacement column, τ³-Banking, was itself dropped from the index in v4.3.
- IFBench (instruction following).
- AA-Omniscience non-hallucination rate (1 − hallucination rate). This matters for (b): place answers must not invent facts.

| Model (mode) | Released | AA index | τ²-Telecom | IFBench | Non-halluc. | Licence |
|---|---|---|---|---|---|---|
| Claude Haiku 4.5 (non-reasoning) | 2025-10 | 15.4 | 0.32 | 0.42 | **0.74** | proprietary |
| DeepSeek V4.1 Flash (non-thinking) | 2026-09 | **24.7** | n/a (V4 Flash 0420 NR: **0.94**) | n/a (0420: 0.47) | 0.46 | MIT |
| GPT-6 Luna (none) | 2026-09 | 18.3 | n/a | n/a | 0.21 | proprietary |
| Gemini 3.8 Flash (low) | 2026-09 | 33.5 | n/a (τ³-Banking 0.33) | n/a | 0.35 | proprietary |
| Gemini 3.5 Flash-Lite | 2026-07 | 22.2 | n/a (τ³ 0.18) | n/a | 0.66 | proprietary |
| Gemini 2.5 Flash-Lite (no thinking) | 2025-06 | 6.7 | 0.19 | 0.31 | 0.12 | proprietary |
| gpt-oss-120b (low) | 2025-08 | 10.2 | 0.45 | 0.58 | 0.09 | Apache-2.0 |
| GLM-4.7 (non-thinking) | 2025-12 | 17.4 | **0.94** | 0.55 | 0.07 | MIT |
| Kimi K2.6 (non-thinking) | 2026-04 | 23.6 | **0.94** | 0.44 | 0.56 | other |
| Qwen3.6-35B-A3B (non-thinking) | 2026-04 | 15.2 | 0.85 | 0.36 | 0.08 | Apache-2.0 |
| Qwen3.8-27B (non-thinking) | 2026-08 | 20.2 | n/a (τ³ 0.20) | n/a | **0.82** | Apache-2.0 |
| Mistral Small 4 (non-reasoning) | 2026-03 | 9.0 | 0.18 | 0.33 | 0.22 | Apache-2.0 |
| Claude Sonnet 5 (non-reasoning) | 2026-06 | 23.2 | n/a (τ³ 0.16) | n/a | 0.48 | proprietary |

How to read the table:
- **Tool use without thinking.** Recent Chinese open-weights models are far ahead of Haiku 4.5 on τ²-Telecom (0.94 against 0.32). This benchmark is multi-turn and involves a simulated user, so it is closer to Milo's mid-trip edits than BFCL's single calls.
- **Not inventing facts.** Haiku, Qwen3.8-27B and Gemini 3.5 Flash-Lite most often decline instead of guessing. gpt-oss, GLM-4.7 and Qwen3.6 rarely decline, so with them the answer prompt must restrict the model strictly to the facts the engine supplies (as E recommends).
- **None of these benchmarks is Milo's task.** The A1 corpus decides.

### 2.2 English first, Italian later

All shortlisted models are multilingual except GLM-5.3-Flash, whose card declares en/zh only [17] [V]. E showed that small models lose accuracy on multilingual tool calls. Before the Italian launch, re-run the bake-off on the Italian half of the corpus: do not assume the English ranking carries over.

## 3. Latency: the host matters as much as the model

AA's default workload is **10,000 input tokens** with at least 1,500 answer tokens: the median over the past 72 hours, measured 8 times a day [3] [V]. For Milo's turn of about 1,500 tokens with a cached prefix, AA's time to first token (TTFT) is therefore a **conservative upper bound**.

**Same model, different hosts** [6, 7] [V]:

| Model | Slowest measured host | Fastest measured host | TTFT range |
|---|---|---|---|
| gpt-oss-120b (high) | CoreWeave, 55 tok/s | Cerebras, 1,737 tok/s | 0.21 s (Baseten) to 5.39 s (Vertex) |
| DeepSeek V4.1 Flash (thinking) | DigitalOcean, 59 tok/s | LithosAI "ULTRA CHAT", 611 tok/s | Fireworks 0.50 s, 364 tok/s |

**Quality also changes by host.** AA's endpoint-accuracy check on gpt-oss-120b, where 100 = the reference setup [7] [V]:
- Together scored 76.7: it returns function calls as plain text.
- Google Vertex scored 72.2: it "frequently produces invalid function-call arguments".
- Groq scored 86.4: it rejects calls whose arguments do not match the schema exactly, and "retries don't help".
- Bedrock (100.8) and SambaNova (98.2) matched the reference.
- Cerebras scored 87.3, also flagged "below" the reference. Its tool-use (BFCL) sub-score was close to the reference (0.352 against 0.371); the loss is mainly on reasoning and long context.

**Latency model** for one understand turn (typical output ~120 tokens):

T ≈ 0.15 s + TTFT + (output + thinking tokens) / tok/s

- The 0.15 s covers phone → EU virtual private server (VPS) → provider with pooled connections. This is my estimate [U].
- TTFT and tok/s are AA's host medians [5–12] [V].
- Costs assume 1,200 of the 1,500 input tokens cached, where caching applies.
- Per user per month means 40 turns a day × 30 days.

| Model, host | TTFT (s) | tok/s | Est. T (s) | $/turn | $/user/month |
|---|---|---|---|---|---|
| DeepSeek V4.1 Flash NR, DeepSeek API (peak) | 1.16 | 242 | 1.81 | 0.00024 | 0.29 (0.14 off-peak) |
| DeepSeek V4.1 Flash NR, LithosAI | 0.72 | 580 | 1.08 | 0.00028 | 0.34 |
| DeepSeek V4.1 Flash, Fireworks (NR assumed as fast as the measured thinking mode) [U] | 0.50 | 364 | 0.98 | 0.00024 | 0.29 (0.43 on the US-pinned SKU) |
| GPT-6 Luna (none), OpenAI | 0.74 | 133 | 1.79 | 0.00010 | 0.12 |
| Claude Haiku 4.5, Anthropic | 0.65 | 81 | 2.28 | 0.00210 | 2.52 |
| Claude Haiku 4.5, Bedrock | 0.82 | 100 | 2.17 | 0.00210 | 2.52 |
| Gemini 3.7 Flash (low), AI Studio (3.8 low not measured) | 1.20 (TTFA) | 310 | 1.74 | 0.00158 | 1.89 |
| Gemini 2.5 Flash-Lite (no thinking), AI Studio | 0.29 | 284 | 0.86 | 0.00020 | 0.24 |
| gpt-oss-120b (low, +~100 reasoning tokens [U]), Cerebras | 0.50 | 1,782 | 0.77 | 0.00069 | 0.83 |
| gpt-oss-120b (low), Groq | 0.70 | 477 | 1.31 | 0.00027 | 0.32 |
| GLM-4.7 NR, Vertex | 0.69 | 190 | 1.47 | 0.00116 | 1.40 |
| Qwen3.6-35B-A3B NR, Scaleway Paris (EUR) | 1.22 | 141 | 2.22 | 0.00056 | 0.67 |
| Mistral Small 4 NR, Mistral | 0.72 | 159 | 1.62 | 0.00014 | 0.16 |
| Claude Sonnet 5 NR, Anthropic (escalation) | 1.36 | 65 | 3.36 | 0.00204 | 2.45 |

Notes on the table:
- **Fireworks price.** AA lists Fireworks at $0.22/$0.66, but that is Fireworks' price for DeepSeek V4 Flash (0731). Fireworks' own pricing page lists V4.1 Flash at $0.30 / $0.006 cached / $1.20, and $0.45 / $0.009 / $1.80 on the US-pinned SKU [47] [V]. The row uses Fireworks' page.
- **gpt-oss-120b "low" still reasons.** On AA's workload, the time to first answer token at `low` is 1.63 s on Cerebras and 4.9 s on Groq, which means roughly 2,000 reasoning tokens [7] [V]. The +~100 reasoning tokens assumed above is a best case for short commands [U]. The bake-off must measure it.

**What follows:**
1. **Haiku misses the 1.5 s median because of its output speed, not its TTFT.** It needs 1.5 s just to write 120 tokens.
2. **The schema matters as much as the model.**
   - Cutting output to about 60 tokens (short keys, enum codes, place ids instead of names) saves 0.4–0.7 s on any model under 150 tok/s.
   - Haiku then comes to about 1.5 s and GPT-6 Luna to about 1.3 s.
3. **For (b), short spoken answers, stream to text-to-speech (TTS) sentence by sentence.** Perceived latency is then TTFT plus about 15 tokens, so TTFT dominates. Haiku (0.65 s) and Luna (0.74 s) are fine there.
4. **The Haiku and Gemini 3.x Flash costs above are not a mistake: their prompts are never cached.** The minimum cacheable prompt is 4,096 tokens for Haiku 4.5 and for Gemini 3.5–3.8 Flash [22, 27] [V], so a 1,500-token prompt pays full price and full prefill every time. Other minimums:
   - OpenAI: 1,024 tokens from GPT-5.6 onward [30] [V].
   - DeepSeek: caches automatically, including common prefixes [15] [V].
   - Cerebras: caches in 128-token blocks, with a 5-minute TTL [31] [V].
5. **DeepSeek's first-party "peak" pricing hits Italy's morning commute.** Peak is 01:00–04:00 and 06:00–10:00 UTC on weekdays [13] [V], which is 03:00–06:00 and 08:00–12:00 in summer time. Prices double at peak.

## 4. Structured output, retention and EU residency per host

| Host | Strict schema | No training / zero data retention (ZDR) | EU processing |
|---|---|---|---|
| OpenAI | Strict structured outputs. Luna supports function calling in Chat Completions only with effort `none` [29] [V] | API data not used for training (standard terms) [U] | EU data residency for GPT-6 Sol/Luna, Standard processing only, +10% [28] [V] |
| Anthropic | JSON outputs and `strict: true` tools, generally available (GA) and covering Haiku 4.5 [25] [V] | ZDR by agreement [U] | `inference_geo` returns 400 on Haiku 4.5, and it only offers `us` and `global` anyway [26] [V]. For EU, use Vertex (Haiku 4.5 is ticked for EU multi-region and europe-west1) [23] [V] or Bedrock regional endpoints, which Anthropic's docs say exist for Sonnet 4.5 and later models [24] [P] |
| Google Gemini API / Vertex | Response schema supported [11] [V] | Free-tier content "used to improve our products"; paid tier not [20] [V] | Vertex's data-residency table ticks Gemini 3.8 Flash (and 3.7 Flash, 3.5 Flash-Lite) as "Supported" for the US and EU multi-regions [23] [V]. Non-global (regional) endpoints cost 10% more: $0.825/$4.125 until 31 Dec 2026, then $1.65/$8.25 [48] [V]. Requesty documents `gemini-3.8-flash@eu` [45] [P] |
| DeepSeek API | `json_object` only; strict tool calls in beta on `/beta` [15] [V] | [U] | **No.** DeepSeek's privacy policy says it "directly collect[s], process[es] and store[s]" personal data in the People's Republic of China [46] [V]. Italy's Garante definitively limited DeepSeek's processing of Italian users' data in Jan 2025 [43] [P] |
| Fireworks | JSON / function calling [6] [V: AA feature flags] | "Zero Data Retention by default" for open models [37] [V] | EU not documented [U]. The standard V4.1 Flash SKU is not region-pinned; a US-pinned SKU costs 1.5× [47] [V] |
| Cerebras | Structured outputs (docs page) [31] [V] | [U] | US [U]. Shared tier serves **only gpt-oss-120b and Qwen 3.8 27B** [31] [V] |
| Groq | Structured outputs [32] [V]. Schema-rejection issue in §3 | [U] | Helsinki data centre since Jul 2025 [33] [V]; `api.eu.groq.com` [33] [P] |
| Scaleway (Paris) | OpenAI-compatible | "All hosted in Europe" [34] [V] | Yes. DeepSeek-V4-Flash-0731 at €0.40 / €0.08 cached / €0.80; gpt-oss-120b €0.15/€0.60; Qwen3.6-35B €0.25/€1.50; Qwen3.8-27B €0.60/€3.30; 1M tokens free [34] [V] |
| OVHcloud AI Endpoints | OpenAI-compatible | [U] | Yes. gpt-oss-120b €0.08/€0.40; Qwen3.8-27B €0.40/€2.70; Qwen3.5-9B €0.10/€0.15 [35] [V] |
| Nebius Token Factory | OpenAI-compatible | ZDR option [36] [P] | Finland and France data centres [36] [P]. Serves GLM-5.3-Flash, Kimi K2.6 and MiniMax-M3 [6–12] [V] |
| Mistral | JSON schema [U] | [U] | EU by default [P]. Mistral Small 4 costs $0.15/$0.60 but scores τ²-Telecom 0.18 [2] [V] |
| OpenRouter | Passes provider features through | `zdr: true` and `data_collection: "deny"` per request [38] [V] | EU in-region routing for enterprise customers only [38] [V] |

**GDPR.** Milo sends precise location. Using an app for blind people can also reveal a disability, which would be health data under GDPR Article 9 (my reading, not legal advice [U]). Even without a lawyer, default to EU processing or ZDR hosts, and never send user traffic to the DeepSeek first-party API.

## 5. Recommendation

### 5.1 Bake-off shortlist: six (model, host) pairs

Run each pair on the A1 corpus (English first), three times a day on different days, from the EU VPS. Measure:
- exact-frame match;
- schema-valid rate;
- the rate of asking to split multi-intent sentences;
- p50/p95 latency;
- cost per turn.

| # | Pair | Why |
|---|---|---|
| 1 | **DeepSeek-V4.1-Flash, non-thinking, strict tools @ Fireworks** (also @ LithosAI or Together) | Best AA index among sub-2 s non-thinking models. Predecessor scored 0.94 on τ²-Telecom. MIT weights, so any host works |
| 2 | **GPT-6 Luna, effort `none`, strict structured outputs @ OpenAI EU** | Cheapest, simplest compliance, guaranteed schema. Released 5 days ago, so there is no tool benchmark yet |
| 3 | **gpt-oss-120b, effort low @ Cerebras** (Groq and OVH EU as backups) | Speed ceiling (~0.8 s if reasoning stays short; see the note in §3). Tests whether a weaker but instant model is enough once the grammar handles simple commands. Cerebras' endpoint accuracy is 87.3, below the reference, though its tool-use sub-score is close to it |
| 4 | **Gemini 3.8 Flash, thinking `low` @ Vertex EU** | Strongest here (AA index 33.5 at low). Candidate for escalation and place Q&A. 3.5 Flash-Lite `minimal` is dropped as a fast variant: AA measures a median of 9.9 s to its first token (6.1 s on medium prompts) [11] [V] |
| 5 | **Claude Haiku 4.5 @ Anthropic or Bedrock EU** | Baseline: BFCL leader, existing adapter, fewest invented facts (0.74) |
| 6 | **Qwen3.8-27B or Qwen3.6-35B-A3B, non-thinking @ Scaleway/OVH Paris** | Fully EU-hosted open-weights fallback. Same family as E's on-device Qwen3.5-2B, which helps distillation |

Runners-up not shortlisted:
- **GLM-4.7 NR @ Vertex/Baseten**: τ²-Telecom 0.94, ~1.5 s, superseded by GLM-5.x.
- **Kimi K2.6 NR**: 21–249 tok/s depending on host, about $0.95/$4.
- **Mistral Small 4**: EU, fast, but weak on tools.
- **Gemini 2.5 Flash-Lite**: 0.86 s but weak multi-turn; 13.5 on BFCL multi-turn.
- **Claude Sonnet 5 NR**: 3.4 s.
- **GLM-5.3-Flash**: always thinks.

### 5.2 Default guess

**DeepSeek-V4.1-Flash (non-thinking) via Fireworks**, moving to an EU host (Scaleway, or Nebius if it adds V4.1) when one serves it.

Reasons:
1. It has the best measured quality among fast non-thinking models.
2. It has the widest choice of hosts: 18 hosts (21 endpoints) on AA [6]. One prompt and one model can therefore fail over between hosts without re-tuning.
3. Its weights are MIT.
4. It costs about $0.3 per user per month for understanding.

Risks:
1. Non-thinking speed on Fireworks is not measured [U].
2. DeepSeek's first-party API is only suitable as a benchmark reference.
3. The model has 552B parameters, so it cannot be self-hosted on a VPS.

**If the corpus shows a tie, pick GPT-6 Luna** for its guaranteed schema and EU residency.

### 5.3 Fallback chain

1. **Deterministic router and grammar first** (existing `router.ts` and `grammar.ts`) for single-intent commands. No network needed.
2. **Fast model** with strict schema, 2.0 s timeout.
   - Hedge: if no token arrives by about 0.8 s, send the same request to a second host of the same open-weights model and keep the first valid answer. This doubles cost only on slow requests.
3. **Validate** the answer: JSON schema plus semantics (ids exist, places resolve).
   - On failure, retry once on the **escalation model** (Gemini 3.8 Flash `low` @ Vertex EU; runner-up: DeepSeek V4.1 Flash with thinking at `low`).
   - Pass the validator's error message into the retry.
   - Say a short filler line ("One moment") if the retry goes over 1.5 s.
4. **Still invalid, or offline:** run the grammar on each clause. If the sentence held several intents and some were not understood, Milo names what it understood and asks for the rest one at a time (founders' point 7). Implement this as a `clarify`/`split` command in E's schema. Measure it in the bake-off: models with higher IFBench should follow this rule more reliably.
5. **On-device model** (per E) when there is no network.

### 5.4 Abstraction layer

- **App side.** The app talks to **Milo's gateway** through one OpenAI-compatible `chat/completions` with `tools`. It uses logical model names (`milo-fast`, `milo-strong`) that a server config maps to host, model and parameters.
- **Gateway.** A small TypeScript service on the EU VPS that holds:
  - the per-user quota;
  - the provider keys;
  - hedging and fallback;
  - latency and cost logs, which also feed the bake-off.

  Every shortlisted host exposes an OpenAI-compatible endpoint. Milo's `openai.ts` adapter already sends `json_schema` strict. Add a strict-**tools** mode to it, because DeepSeek's API offers `json_object` only.
- **Library.** Use **pi-ai** if the team adopts the Pi harness. It is now `@earendil-works/pi-ai` 0.87.1 (22 Sep 2026), MIT, and supports DeepSeek, Groq, Cerebras, Fireworks, Together, Mistral, Vertex, Bedrock, OpenRouter and any OpenAI-compatible host. It validates tool calls with TypeBox schemas and can hand a conversation to another model mid-session [39] [V]. The old `@mariozechner/pi-ai` stopped at 0.73.1 in May 2026 [39] [V]. Otherwise, the plain `openai` SDK (Apache-2.0) is enough.
- **For the bake-off only:** OpenRouter (`provider.only`, `sort: "latency"`, `zdr: true`) [38] [V]. It adds a hop and a fee, and its EU routing is enterprise-only.
- **Avoid LiteLLM Proxy unless its admin UI is needed.**
  - For: MIT outside `enterprise/`, with virtual keys and budgets [40] [V].
  - Against: it needs Python and Postgres, and versions 1.82.7 and 1.82.8 on PyPI were compromised on 24 March 2026 with a credential stealer [41] [V]. If used, pin versions with hashes.
- **Other gateways:** Portkey's gateway (MIT) last published to npm in Jan 2026 [42] [V]. The Vercel AI SDK (Apache-2.0, published 27 Sep 2026) is an active alternative [42] [V].

### 5.5 Cost per active user (40 turns a day)

| Scenario | $/month |
|---|---|
| Default | ≈ $0.7 |
| Same mix from 1 Jan 2027, when Gemini 3.8 Flash doubles (to $1.65/$8.25 on Vertex regional endpoints) [20, 48] [V] | ≈ $1.0 |
| Haiku for everything | ≈ $2.5–3.5 |
| gpt-oss-120b on Cerebras (understanding only) | ≈ $0.8 |

The default's ≈ $0.7 breaks down as:
- $0.29 for understanding (Fireworks' V4.1 Flash price, [47]);
- about $0.10 for answers (30% of turns, 150 output tokens each);
- about $0.30 for escalations (10% of turns on Gemini 3.8 Flash low at the Vertex EU price, about $0.0025 each for 1,500 input and 300 output tokens, thinking included).

A €5–15/month VPS is negligible per user. A quota of about 100 turns a day would cap the worst case at about $1.7 per user per month with the default mix.

## 6. Where the founders' assumptions are wrong or imprecise

1. **"GLM Flash is fast."** GLM-5.3-Flash cannot disable thinking [18]. Its TTFA is ≥ 8.9 s on every host [9].
2. **"Gemini Flash is open."** Gemini is closed weights.
   - 3.8 Flash cannot go below `low` thinking [21].
   - Its price doubles on 1 Jan 2027 [20].
   - Its implicit cache ignores prompts under 4,096 tokens [22].
3. **"DeepSeek V4.1."** The model is V4.1-**Flash**, and it is open weights, not open source. The official API keeps data in China [43], so it needs a third-party host.
4. **"Haiku is not the fastest."** Haiku's TTFT (0.65 s) is among the best. What is slow is its output speed (81 tok/s), and its prompts are never cached (4,096-token minimum) [27].
5. **"Open models perform better."** True on τ²-Telecom and the AA index, not on the April BFCL. Speed and even tool-call correctness depend on the host [7]. The best fast option may also be closed (GPT-6 Luna, Gemini).
6. **Haiku 4.5's lifetime is not guaranteed past 15 Oct 2026** [24]. It is still "Active", and Anthropic gives at least 60 days' notice, so it cannot be retired before late November 2026 [51] [V]. Keep it as a baseline, not a dependency.

## 7. Open questions

1. **US hosts or EU only?** Do the founders accept US processing with ZDR (Fireworks, OpenAI standard), or require EU-only (Scaleway, OVH, Vertex EU, OpenAI EU)? This decides pairs 1 and 2.
2. **Real turn size.** How many input and output tokens does a real turn use once E's schema is compacted? This moves Haiku and Luna across the 1.5 s line.
3. **Pi harness.** Will the team adopt it? If so, the gateway should use pi-ai.
4. **Free quota** per user per day, and whether heavy users bring their own key.
5. **Google Maps grounding for place questions.** It costs $14 per 1,000 after 5,000 free a month [20] [V]. Check its terms before mixing it with OpenStreetMap data [U].

## Sources

1. Berkeley Function Calling Leaderboard V4, data updated 2026-04-12. https://gorilla.cs.berkeley.edu/leaderboard.html (CSV: https://gorilla.cs.berkeley.edu/data_overall.csv)
2. Artificial Analysis, LLM leaderboard (Intelligence Index v4.3, per-model metrics), fetched 2026-09-27. https://artificialanalysis.ai/leaderboards/models
3. Artificial Analysis, performance benchmarking methodology. https://artificialanalysis.ai/methodology/performance-benchmarking
4. Artificial Analysis, τ²-Bench Telecom (legacy). https://artificialanalysis.ai/evaluations/tau2-bench
5. AA providers, DeepSeek V4.1 Flash (non-reasoning). https://artificialanalysis.ai/models/deepseek-v4-1-flash-non-reasoning/providers
6. AA providers, DeepSeek V4.1 Flash. https://artificialanalysis.ai/models/deepseek-v4-1-flash/providers
7. AA providers, gpt-oss-120b (high/low), including endpoint accuracy. https://artificialanalysis.ai/models/gpt-oss-120b/providers and https://artificialanalysis.ai/models/gpt-oss-120b-low/providers
8. AA providers, Claude 4.5 Haiku. https://artificialanalysis.ai/models/claude-4-5-haiku/providers
9. AA providers, GLM-5.3-Flash. https://artificialanalysis.ai/models/glm-5-3-flash/providers
10. AA providers, GPT-6 Luna (non-reasoning). https://artificialanalysis.ai/models/gpt-6-luna-non-reasoning/providers
11. AA providers, Gemini 3.7 Flash low / 3.8 Flash / 2.5 Flash-Lite. https://artificialanalysis.ai/models/gemini-3-7-flash-low/providers, https://artificialanalysis.ai/models/gemini-3-8-flash/providers, https://artificialanalysis.ai/models/gemini-2-5-flash-lite/providers
12. AA providers, GLM-4.7 NR, Qwen3.6-35B-A3B NR, Mistral Small 4 NR, Kimi K2.6 NR, Claude Sonnet 5 NR. https://artificialanalysis.ai/models/glm-4-7-non-reasoning/providers (same pattern for the other slugs)
13. DeepSeek API, Models & Pricing. https://api-docs.deepseek.com/quick_start/pricing
14. DeepSeek API, Thinking Mode. https://api-docs.deepseek.com/guides/thinking_mode
15. DeepSeek API, Tool Calls (strict mode beta), JSON Output, Context Caching. https://api-docs.deepseek.com/guides/tool_calls, https://api-docs.deepseek.com/guides/json_mode, https://api-docs.deepseek.com/guides/kv_cache
16. DeepSeek-V4.1-Flash model card (MIT, created 2026-09-10). https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash
17. GLM-5.3-Flash model card (MIT). https://huggingface.co/zai-org/GLM-5.3-Flash
18. Z.ai, GLM-5.3-Flash overview. https://docs.z.ai/guides/llm/glm-5.3-flash
19. Z.ai, pricing. https://docs.z.ai/guides/overview/pricing
20. Gemini Developer API pricing. https://ai.google.dev/gemini-api/docs/pricing
21. Gemini API, thinking levels. https://ai.google.dev/gemini-api/docs/thinking
22. Gemini API, context caching (implicit-cache minimums). https://ai.google.dev/gemini-api/docs/caching
23. Google Cloud, Vertex AI data residency (the old URL now redirects to https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency). https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
24. Anthropic, models overview (Haiku 4.5 retirement "not sooner than October 15, 2026"). https://platform.claude.com/docs/en/about-claude/models/overview
25. Anthropic, structured outputs. https://platform.claude.com/docs/en/build-with-claude/structured-outputs
26. Anthropic, data residency (`inference_geo`). https://platform.claude.com/docs/en/build-with-claude/data-residency
27. Anthropic, prompt caching (minimum cacheable lengths). https://platform.claude.com/docs/en/build-with-claude/prompt-caching
28. OpenAI API pricing (GPT-6 Luna/Sol, EU residency uplift). https://developers.openai.com/api/docs/pricing
29. OpenAI, GPT-6 Luna model page. https://developers.openai.com/api/docs/models/gpt-6-luna
30. OpenAI, prompt caching. https://developers.openai.com/api/docs/guides/prompt-caching
31. Cerebras, model catalog and prompt caching. https://inference-docs.cerebras.ai/models/overview, https://inference-docs.cerebras.ai/capabilities/prompt-caching
32. Groq, supported models and prices. https://console.groq.com/docs/models
33. Groq, Helsinki data centre (Jul 2025). https://groq.com/newsroom/groq-launches-european-data-center-footprint-in-helsinki-finland; EU endpoint claim (secondary): https://theneuralbase.com/groq/learn/advanced/data-privacy-and-residency/
34. Scaleway Generative APIs, supported models (reviewed 14 Aug 2026) and prices. https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/, https://www.scaleway.com/en/pricing/model-as-a-service/
35. OVHcloud AI Endpoints catalog. https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/
36. Nebius Token Factory. https://nebius.com/services/token-factory/inference-service
37. Fireworks, data handling. https://docs.fireworks.ai/guides/security_compliance/data_handling
38. OpenRouter, provider routing and ZDR. https://openrouter.ai/docs/features/provider-routing, https://openrouter.ai/docs/features/zdr
39. pi-ai: https://registry.npmjs.org/@earendil-works/pi-ai (0.87.1, 2026-09-22), README https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/README.md, legacy https://registry.npmjs.org/@mariozechner/pi-ai (0.73.1, 2026-05-07)
40. LiteLLM licence, README and PyPI (1.102.1, 2026-09-23). https://raw.githubusercontent.com/BerriAI/litellm/main/LICENSE, https://pypi.org/pypi/litellm/json
41. LiteLLM, security update (March 2026). https://docs.litellm.ai/blog/security-update-march-2026; analysis: https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-teampcp-supply-chain-campaign/
42. npm: Vercel AI SDK https://registry.npmjs.org/ai (7.0.118, 2026-09-27); Portkey gateway https://registry.npmjs.org/@portkey-ai/gateway (1.15.2, 2026-01-12)
43. Bird & Bird on the Garante's DeepSeek limitation (Jan 2025). https://www.twobirds.com/en/insights/2025/the-garante-imposes-a-definitive-limitation-on-the-processing-of-italian-users%E2%80%99-personal-data
44. Hugging Face model API (licences): https://huggingface.co/api/models/zai-org/GLM-4.7, https://huggingface.co/api/models/Qwen/Qwen3.8-27B, https://huggingface.co/api/models/Qwen/Qwen3.6-35B-A3B, https://huggingface.co/api/models/moonshotai/Kimi-K2.6, https://huggingface.co/api/models/mistralai/Mistral-Small-4-119B-2603, https://huggingface.co/api/models/openai/gpt-oss-120b
45. Requesty, Gemini 3.8 Flash EU route. https://www.requesty.ai/models/vertex/gemini-3.8-flash-eu
46. DeepSeek privacy policy ("Where We Store Your Personal Data"). https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
47. Fireworks, serverless pricing (DeepSeek V4.1 Flash, standard and US SKUs). https://docs.fireworks.ai/serverless/pricing
48. Google Cloud, Vertex AI / Agent Platform generative AI pricing (Gemini 3.8 Flash global and non-global). https://cloud.google.com/vertex-ai/generative-ai/pricing
49. Meta, Llama 4 Acceptable Use Policy (EU clause for multimodal models). https://dev.meta.ai/llama/llama4/use-policy/
50. Moonshot AI licences. https://huggingface.co/moonshotai/Kimi-K2.6/raw/main/LICENSE, https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE
51. Anthropic, model deprecations (status table, 60-day notice). https://platform.claude.com/docs/en/about-claude/model-deprecations

## Verification (27 Sep 2026)

An adversarial fact-check re-fetched the primary sources for 34 claims.

**Confirmed as written:**
- DeepSeek-V4.1-Flash: HF card (MIT, 552B backbone, 8B/16B active, created 10 Sep).
- DeepSeek API: `deepseek-flash` and `deepseek-v4-pro` = V4-Pro-0813, peak and off-peak prices and hours, `thinking.type: disabled`, strict tools in beta on `/beta`.
- GLM-5.3-Flash: thinking cannot be disabled, 320B/18B, MIT, en/zh only. GLM-4.7-Flash is free on Z.ai.
- GPT-6 Luna: $0.10/$0.01/$0.50, effort `none`, function calling in Chat Completions only at `none`, EU residency on Standard processing only, 10% regional uplift, AA release date 22 Sep.
- Gemini 3.8 Flash: $0.75/$3.75 until 31 Dec 2026, then $1.50/$7.50; lowest thinking level `low`; 4,096-token implicit-cache minimum; Google Maps grounding at $14 per 1,000 after 5,000 free.
- Haiku 4.5: retirement "not sooner than October 15, 2026"; `inference_geo` 400; 4,096-token cache minimum; structured outputs GA.
- The AA intelligence-index, τ²-Telecom, IFBench and non-hallucination values in §2.1.
- BFCL: updated 2026-04-12, and every row in §2.1.
- AA endpoint accuracy for gpt-oss-120b: Together, Vertex, Groq (about 7%), Bedrock, SambaNova.
- Cerebras: model list and caching.
- Scaleway and OVHcloud prices.
- pi-ai, the Vercel AI SDK and Portkey versions on npm.
- LiteLLM: licence and the compromised versions.
- Licences for GLM-4.7, Qwen, gpt-oss and Mistral Small 4.
- The OpenRouter routing flags.
- Fireworks ZDR.
- `openai.ts` already sends strict `json_schema`.

**Corrected:**
- Fireworks' price for V4.1 Flash is $0.30/$0.006/$1.20, not AA's $0.22/$0.66, which is V4 Flash 0731. As a result:
  - understanding on Fireworks costs $0.29 instead of $0.19 per user per month;
  - the default mix costs about $0.7 instead of $0.5 (about $1.0 from 2027);
  - the 100-turn quota caps at about $1.7 instead of $1.3.
- Escalation cost now uses Vertex's regional price, which is 10% higher.
- AA medians were refreshed: the gpt-oss-120b TTFT range on Vertex is now 5.39 s (was 1.92 s); the DeepSeek and gpt-oss speed ranges were updated; the GLM-5.3-Flash TTFA floor is now 8.9 s (was 9.7 s); Grok is now 8–48 s.
- The Gemini 3.8 Flash EU multi-region support on Vertex is now read from the table's aria-labels ("Supported"), so it is tagged [V], not partly unverified. The same table confirms Haiku 4.5 on Vertex EU.
- LiteLLM is now tagged [V].

**Added:**
- Cerebras endpoint accuracy is 87.3 (below the reference).
- On AA's workload, gpt-oss-120b `low` shows a 1.63 s TTFA on Cerebras and 4.9 s on Groq.
- Gemini 3.5 Flash-Lite has a 9.9 s median TTFT on AA.
- Fireworks has a separate US-pinned SKU at 1.5× the price.
- DeepSeek's privacy policy confirms storage in China.
- Details of the Kimi K2.6 and K3 licences (no blocker for an MIT app).
- The Llama 4 EU restriction on its multimodal models.
- Haiku 4.5 is still "Active", with at least 60 days' notice before retirement.

**Recommendation changes:**
- Pair 4 drops Gemini 3.5 Flash-Lite `minimal` as a fast variant, because AA measures about 10 s to its first token.
- Pair 3 now warns that gpt-oss-120b's reasoning time at `low` must be measured.
- The default pick is unchanged: its cost rose by about $0.1 per user per month, and cost does not decide the choice.

**Still unverified:**
- Non-thinking speed on Fireworks.
- The 0.15 s gateway overhead.
- Groq's `api.eu.groq.com` endpoint and the Garante decision, which remain [P].
- The GLM-4.7 on Vertex and Mistral Small 4 per-turn prices, which were not recomputed.
