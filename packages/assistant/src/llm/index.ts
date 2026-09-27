/**
 * The providers the settings offer, and one function that turns the user's choice into a model. Keys are the user's
 * own and stay on the phone: the app keeps them in the secure store and passes them here.
 */
import { AnthropicLLM, DEFAULT_ANTHROPIC_MODEL, type Effort } from './anthropic';
import { DEFAULT_GEMINI_MODEL, GeminiLLM } from './gemini';
import { LocalLLM, type LocalRuntime } from './local';
import { OpenAICompatibleLLM, OPENAI_URL, type OpenAICompatibleOptions } from './openai';
import { FallbackLLM, type LLM } from './types';

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'local';

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseURL?: string;
  model: string;
  /** Other models worth offering. */
  models?: string[];
  needsKey: boolean;
  jsonMode?: OpenAICompatibleOptions['jsonMode'];
  /** Where the user gets a key. */
  keyUrl?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  { id: 'anthropic', label: 'Anthropic Claude', kind: 'anthropic', model: DEFAULT_ANTHROPIC_MODEL,
    models: ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'], needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', kind: 'openai', baseURL: OPENAI_URL, model: 'gpt-5-mini', needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', kind: 'gemini', model: DEFAULT_GEMINI_MODEL, models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    needsKey: true, keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', label: 'Mistral', kind: 'openai', baseURL: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', label: 'Groq', kind: 'openai', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true,
    jsonMode: 'json_object', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', label: 'OpenRouter', kind: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5',
    needsKey: true, keyUrl: 'https://openrouter.ai/keys' },
  { id: 'ollama', label: 'Ollama (your own computer)', kind: 'openai', baseURL: 'http://192.168.1.2:11434/v1', model: 'qwen3:4b',
    needsKey: false, jsonMode: 'json_schema' },
  { id: 'local', label: 'On this phone (offline)', kind: 'local', model: 'qwen3-1.7b', needsKey: false },
];

export interface ProviderConfig {
  preset: string;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  effort?: Effort | null;
  timeoutMs?: number;
}

/** A model for the user's settings; null when a key is needed and missing, or the phone model is not loaded. */
export function createLLM(cfg: ProviderConfig, runtime?: LocalRuntime | null): LLM | null {
  const p = PROVIDERS.find((x) => x.id === cfg.preset);
  if (!p) return null;
  if (p.needsKey && !cfg.apiKey) return null;
  const model = cfg.model || p.model;
  switch (p.kind) {
    case 'anthropic':
      return new AnthropicLLM({ apiKey: cfg.apiKey!, model, effort: cfg.effort, baseURL: cfg.baseURL, timeoutMs: cfg.timeoutMs });
    case 'gemini':
      return new GeminiLLM({ apiKey: cfg.apiKey!, model, baseURL: cfg.baseURL, timeoutMs: cfg.timeoutMs });
    case 'openai':
      return new OpenAICompatibleLLM({ apiKey: cfg.apiKey, model, baseURL: cfg.baseURL || p.baseURL, jsonMode: p.jsonMode, name: p.id,
        timeoutMs: cfg.timeoutMs });
    case 'local':
      return runtime ? new LocalLLM(runtime) : null;
  }
}

/** The user's cloud model first, the phone's model when the cloud cannot answer (no network, no key, a limit). */
export function chain(...models: (LLM | null | undefined)[]): LLM | null {
  const ms = models.filter((m): m is LLM => !!m);
  if (!ms.length) return null;
  return ms.length === 1 ? ms[0] : new FallbackLLM(ms);
}

export { AnthropicLLM, GeminiLLM, LocalLLM, OpenAICompatibleLLM, FallbackLLM };
export type { Effort, LocalRuntime };
export * from './types';
