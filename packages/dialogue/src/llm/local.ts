/**
 * A language model running on the phone (llama.cpp through llama.rn in the app, node-llama-cpp in the benchmark):
 * no network, no key, no cost per request. Answers are constrained to the JSON Schema by a grammar, so even a small
 * model returns a well-formed action; whether it is the right one is what the benchmark measures.
 */
import { LLMUnavailable, parseJson, type LLM, type LLMRequest, type LLMResponse } from './types';

export interface LocalRuntime {
  /** Model name for the id, e.g. "qwen3-1.7b-q4_k_m". */
  readonly name: string;
  /** One chat completion; with `jsonSchema` the output must follow it (llama.cpp turns it into a grammar). */
  complete(args: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; maxTokens: number;
    jsonSchema?: Record<string, unknown>; signal?: AbortSignal }): Promise<string>;
}

export class LocalLLM implements LLM {
  readonly local = true;
  readonly canSearch = false;

  constructor(readonly runtime: LocalRuntime) {}

  get id() {
    return `local:${this.runtime.name}`;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let text: string;
    try {
      text = (await this.runtime.complete({ messages: [{ role: 'system', content: req.system }, ...req.messages],
        maxTokens: req.maxTokens ?? 512, jsonSchema: req.schema, signal: req.signal })).trim();
    } catch (e) {
      throw new LLMUnavailable(e instanceof Error ? e.message : String(e), e);
    }
    // reasoning models may think aloud first
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, ...(req.schema ? { json: parseJson(text) } : {}), usedWeb: false, model: this.runtime.name };
  }
}
