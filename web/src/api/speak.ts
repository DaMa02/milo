import { isRecord } from './contracts';
import { requestJson } from './http';

export type SpeakKind = 'overview' | 'explore' | 'answer' | 'plan' | 'places' | 'navigate' | 'error';
export interface SpeakRequest {
  utterance: string;
  lang: string;
  session_id?: string;
  kind: SpeakKind;
  result: unknown;
}
export interface SpokenResult { text: string; via: string }

/** Projection of /speak: the server owns wording and its grounding checks. */
export function parseSpokenResult(value: unknown): SpokenResult {
  if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim()
    || typeof value.via !== 'string' || !value.via.trim()) throw new Error('Invalid spoken result');
  return { text: value.text, via: value.via };
}

export function speak(request: SpeakRequest, signal?: AbortSignal): Promise<SpokenResult> {
  return requestJson('/speak', parseSpokenResult, { signal, timeoutMs: 4_000, body: {
    utterance: request.utterance,
    lang: request.lang,
    ...(request.session_id === undefined ? {} : { session_id: request.session_id }),
    kind: request.kind,
    result: request.result,
  } });
}
