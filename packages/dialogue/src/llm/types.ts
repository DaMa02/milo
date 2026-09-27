/**
 * One interface for every language model the app can use: a cloud API with the user's own key (Anthropic, any
 * OpenAI-compatible server, Google Gemini) or a model running on the phone. The models never compute a distance or a
 * direction: they pick an action, or reword what the engine found.
 */

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  /** Upper bound on output tokens, thinking included where the model thinks. */
  maxTokens?: number;
  /** JSON Schema the answer must follow; the parsed object comes back in `json`. */
  schema?: Record<string, unknown>;
  /** Allow a web search, on providers that have one (see `canSearch`). */
  webSearch?: boolean;
  signal?: AbortSignal;
  /** Per-request time limit; the provider's default otherwise. */
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  json?: unknown;
  /** The answer used a web search. */
  usedWeb: boolean;
  /** Which model answered (a fallback model may have answered for the one asked). */
  model: string;
}

export interface LLM {
  /** Shown in settings and logs: "anthropic:claude-opus-5-5", "local:qwen3-1.7b". */
  readonly id: string;
  /** Runs on the phone: works offline, and costs nothing per request. */
  readonly local: boolean;
  /** Has a web search tool. */
  readonly canSearch: boolean;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

/** The model could not answer now: no key, no network, a limit, a refusal, a timeout, an unreadable answer. */
export class LLMUnavailable extends Error {
  constructor(message: string, override readonly cause?: unknown, readonly status?: number) {
    super(message);
    this.name = 'LLMUnavailable';
  }
}

/** A JSON answer as an object, tolerating code fences and prose around it (small local models add them). */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new LLMUnavailable('The model did not answer with JSON.');
  }
}

/** A signal that fires on the caller's signal or after `ms`. */
export function deadline(signal: AbortSignal | undefined, ms: number | undefined): AbortSignal | undefined {
  const parts = [signal, ms ? AbortSignal.timeout(ms) : undefined].filter((s): s is AbortSignal => !!s);
  if (parts.length < 2) return parts[0];
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any(parts);
  const c = new AbortController();
  for (const p of parts) p.addEventListener('abort', () => c.abort(p.reason), { once: true });
  return c.signal;
}

/** Tries each model in order; the first that answers wins. */
export class FallbackLLM implements LLM {
  constructor(readonly models: LLM[]) {
    if (!models.length) throw new Error('FallbackLLM needs at least one model.');
  }

  get id() {
    return this.models.map((m) => m.id).join(' > ');
  }

  get local() {
    return this.models.every((m) => m.local);
  }

  get canSearch() {
    return this.models.some((m) => m.canSearch);
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let last: unknown;
    for (const m of this.models) {
      if (req.signal?.aborted) break;
      try {
        return await m.complete({ ...req, webSearch: req.webSearch && m.canSearch });
      } catch (e) {
        last = e;
      }
    }
    throw last instanceof LLMUnavailable ? last : new LLMUnavailable(String(last ?? 'aborted'), last);
  }
}
