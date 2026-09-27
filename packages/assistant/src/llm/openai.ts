/**
 * Any server that speaks the OpenAI chat completions API, with the user's own key: OpenAI, Mistral, Groq,
 * OpenRouter, DeepSeek, and servers on the user's own network (Ollama, LM Studio, llama.cpp, vLLM).
 */
import { deadline, LLMUnavailable, parseJson, type LLM, type LLMRequest, type LLMResponse } from './types';

export interface OpenAICompatibleOptions {
  /** Not needed by servers on the user's own network. */
  apiKey?: string;
  baseURL?: string;
  model: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** OpenAI's reasoning models take max_completion_tokens; most other servers max_tokens. */
  tokenParam?: 'max_tokens' | 'max_completion_tokens';
  /** How the server is asked for JSON: a schema (strict), any JSON object (the schema goes in the prompt), or not at all. */
  jsonMode?: 'json_schema' | 'json_object' | 'prompt';
  /** Provider name in the id ("openai", "mistral", "ollama"). */
  name?: string;
  fetch?: typeof fetch;
}

export const OPENAI_URL = 'https://api.openai.com/v1';

export class OpenAICompatibleLLM implements LLM {
  readonly local = false;
  readonly canSearch = false;

  constructor(readonly opts: OpenAICompatibleOptions) {}

  get id() {
    return `${this.opts.name ?? 'openai'}:${this.opts.model}`;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const base = (this.opts.baseURL ?? OPENAI_URL).replace(/\/+$/, '');
    const mode = this.opts.jsonMode ?? 'json_schema';
    const tokenParam = this.opts.tokenParam ?? (base === OPENAI_URL ? 'max_completion_tokens' : 'max_tokens');
    let system = req.system;
    if (req.schema && mode !== 'json_schema') system += `\n\nAnswer with one JSON object that follows this JSON Schema, and nothing else:\n${JSON.stringify(req.schema)}`;
    const body: Record<string, unknown> = {
      model: this.opts.model,
      messages: [{ role: 'system', content: system }, ...req.messages],
      [tokenParam]: req.maxTokens ?? 1024,
    };
    if (req.schema && mode === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: req.schema } };
    if (req.schema && mode === 'json_object') body.response_format = { type: 'json_object' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...this.opts.headers };
    if (this.opts.apiKey) headers.Authorization = `Bearer ${this.opts.apiKey}`;
    let json: { model?: string; choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
      error?: { message?: string } };
    try {
      const res = await (this.opts.fetch ?? globalThis.fetch)(`${base}/chat/completions`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: deadline(req.signal, req.timeoutMs ?? this.opts.timeoutMs ?? 20_000),
      });
      json = (await res.json()) as typeof json;
      if (!res.ok) throw new LLMUnavailable(json?.error?.message ?? `HTTP ${res.status}`, undefined, res.status);
    } catch (e) {
      throw e instanceof LLMUnavailable ? e : new LLMUnavailable(e instanceof Error ? e.message : String(e), e);
    }
    const choice = json.choices?.[0];
    if (!choice?.message || choice.message.refusal) throw new LLMUnavailable('The model declined or gave no answer.');
    if (choice.finish_reason === 'length' && req.schema) throw new LLMUnavailable('The answer was cut off.');
    const text = (choice.message.content ?? '').trim();
    return { text, ...(req.schema ? { json: parseJson(text) } : {}), usedWeb: false, model: json.model ?? this.opts.model };
  }
}
