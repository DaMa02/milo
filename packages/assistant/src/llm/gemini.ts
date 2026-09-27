/**
 * Google Gemini through its REST API, with the user's own key. Structured answers use responseJsonSchema; web
 * searches use Google Search grounding.
 */
import { deadline, LLMUnavailable, parseJson, type LLM, type LLMRequest, type LLMResponse } from './types';

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  /** Thinking tokens; 0 turns thinking off where the model allows it (default: 0 on 2.5 Flash models, for quick replies). */
  thinkingBudget?: number | null;
  fetch?: typeof fetch;
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string; groundingMetadata?: unknown }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { message?: string };
}

export class GeminiLLM implements LLM {
  readonly local = false;
  readonly canSearch = true;
  readonly model: string;

  constructor(readonly opts: GeminiOptions) {
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
  }

  get id() {
    return `gemini:${this.model}`;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const budget = this.opts.thinkingBudget === undefined ? (/2\.5-flash/.test(this.model) ? 0 : null) : this.opts.thinkingBudget;
    const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens ?? 1024 };
    if (req.schema) Object.assign(generationConfig, { responseMimeType: 'application/json', responseJsonSchema: req.schema });
    if (budget !== null) generationConfig.thinkingConfig = { thinkingBudget: budget };
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig,
      ...(req.webSearch && !req.schema ? { tools: [{ google_search: {} }] } : {}),
    };
    let json: GeminiReply;
    try {
      const res = await (this.opts.fetch ?? globalThis.fetch)(`${(this.opts.baseURL ?? GEMINI_URL).replace(/\/+$/, '')}/models/${this.model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey }, body: JSON.stringify(body),
        signal: deadline(req.signal, req.timeoutMs ?? this.opts.timeoutMs ?? 20_000),
      });
      json = (await res.json()) as typeof json;
      if (!res.ok) throw new LLMUnavailable(json?.error?.message ?? `HTTP ${res.status}`, undefined, res.status);
    } catch (e) {
      throw e instanceof LLMUnavailable ? e : new LLMUnavailable(e instanceof Error ? e.message : String(e), e);
    }
    const c = json.candidates?.[0];
    if (json.promptFeedback?.blockReason || !c?.content) throw new LLMUnavailable('The model declined or gave no answer.');
    if (c.finishReason === 'SAFETY' || c.finishReason === 'RECITATION' || (c.finishReason === 'MAX_TOKENS' && req.schema)) {
      throw new LLMUnavailable(`The answer stopped: ${c.finishReason}.`);
    }
    const text = (c.content.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
    return { text, ...(req.schema ? { json: parseJson(text) } : {}), usedWeb: !!c.groundingMetadata, model: json.modelVersion ?? this.model };
  }
}
