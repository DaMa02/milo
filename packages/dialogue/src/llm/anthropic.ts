/**
 * Claude through the official SDK, with the user's own API key (kept in the phone's secure store, sent only to
 * Anthropic). Structured answers use output_config.format; a declined request is retried server-side on the model
 * Anthropic recommends (fallbacks: "default") where the model supports it; a paused web search is continued.
 */
import Anthropic from '@anthropic-ai/sdk';
import { deadline, LLMUnavailable, type LLM, type LLMRequest, type LLMResponse } from './types';

export const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  /** How much the model thinks: `low` keeps a spoken reply quick. null: not sent (models without effort). */
  effort?: Effort | null;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Retry a declined request on Anthropic's recommended model (default: on the models that support it). */
  refusalFallback?: boolean;
  /** Extra headers, e.g. an organisation's workspace id. */
  headers?: Record<string, string>;
  /** Tests pass a stand-in with the same `beta.messages.create`. */
  client?: Pick<Anthropic, 'beta'>;
}

const THINKS_WITH_EFFORT = /opus-4-[5-9]|opus-5|sonnet-4-6|sonnet-5|fable|mythos/;
const CLASSIFIED = /opus-5|fable|mythos/;
const NEW_SEARCH = /opus-4-[6-9]|opus-5|sonnet-4-6|sonnet-5|fable|mythos/;

export class AnthropicLLM implements LLM {
  readonly local = false;
  readonly canSearch = true;
  readonly model: string;
  private readonly client: Pick<Anthropic, 'beta'>;

  constructor(readonly opts: AnthropicOptions) {
    this.model = opts.model || DEFAULT_ANTHROPIC_MODEL;
    this.client = opts.client ?? new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      timeout: opts.timeoutMs ?? 20_000,
      maxRetries: opts.maxRetries ?? 1,
      defaultHeaders: opts.headers,
      // the key is the user's own, typed on their own device: the browser build (Expo web) is the same trust as the app
      dangerouslyAllowBrowser: true,
    });
  }

  get id() {
    return `anthropic:${this.model}`;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const effort = this.opts.effort === undefined ? (THINKS_WITH_EFFORT.test(this.model) ? 'low' : null) : this.opts.effort;
    const fallback = this.opts.refusalFallback ?? CLASSIFIED.test(this.model);
    const outputConfig = {
      ...(effort ? { effort } : {}),
      ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
    };
    const messages: Anthropic.Beta.BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: this.model,
      // thinking counts toward max_tokens on the models that think
      max_tokens: Math.max(req.maxTokens ?? 1024, effort ? 2048 : 0),
      system: req.system,
      messages,
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      ...(req.webSearch ? { tools: [{ type: NEW_SEARCH.test(this.model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search',
        max_uses: 2 } as Anthropic.Beta.BetaToolUnion] } : {}),
    };
    const signal = deadline(req.signal, req.timeoutMs);
    let r: Anthropic.Beta.BetaMessage;
    try {
      r = await this.client.beta.messages.create(params, { signal });
      for (let i = 0; i < 3 && r.stop_reason === 'pause_turn'; i++) {
        // a server-side search paused the turn: send it back to continue
        messages.push({ role: 'assistant', content: r.content as Anthropic.Beta.BetaContentBlockParam[] });
        r = await this.client.beta.messages.create({ ...params, messages }, { signal });
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw new LLMUnavailable(e instanceof Error ? e.message : String(e), e, status);
    }
    if (r.stop_reason === 'refusal') throw new LLMUnavailable('The model declined.');
    if (r.stop_reason === 'max_tokens' && req.schema) throw new LLMUnavailable('The answer was cut off.');
    const text = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    const usedWeb = r.content.some((b) => b.type === 'server_tool_use');
    if (!req.schema) return { text, usedWeb, model: r.model };
    try {
      return { text, json: JSON.parse(text), usedWeb, model: r.model };
    } catch (e) {
      throw new LLMUnavailable('The model did not answer with JSON.', e);
    }
  }
}
