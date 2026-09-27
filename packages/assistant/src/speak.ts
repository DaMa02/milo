/**
 * What the app says now: a model turns an engine result into at most two short sentences for the ear. Every number it
 * writes must be in the result (or the trip facts), in the conventions of the language; otherwise, and on a timeout or
 * any error, the engine's own first sentences are said. The engine is always right; the model only makes it shorter.
 */
import { spokenNumbers, type Lang } from '@milo/engine';
import type { LLM } from './llm/types';

export type SpeakKind = 'overview' | 'explore' | 'answer' | 'plan' | 'places' | 'navigate' | 'error';

const LANG_NAME: Record<Lang, string> = { en: 'English', it: 'Italian' };

export function speakSystem(lang: Lang): string {
  return `You are the voice of Milo, a walking app for blind and low-vision people. You get the user's words, what the app's map engine found (result JSON) and facts about the trip. Write what the app says now, to be read aloud, in ${LANG_NAME[lang]}.

Rules:
- At most 2 short sentences that directly answer the user's words, using ONLY the result and the trip facts. Do not add a next-step hint or tell the user what to say: the app adds that itself.
- Copy every number exactly as the result writes it, in metres and minutes; keep clock positions as given ("at 3 o'clock", "a ore 3"). Never compute, round, convert or invent a number, and never write a number in words.
- No lists, no repetition, no alternatives unless asked, and nothing the map does not know unless the user asks what the app does not know.
- kind plan: recommend the selected route, or route A, in one sentence (its time, and its crossings without signals if more than 0); do not mention the other routes.
- kind explore: where the user is and how many ways out, naming at most 3 of them from left to right by street and clock position only, without their distances.
- kind overview: only the 2 most useful things (for example the railway ahead and how to cross it), not everything.
- kind answer: the answer to the question, with its numbers.
- Plain words for the ear: no markdown, no emoji, no URLs, no abbreviations other than "m".`;
}

/** Keys of result objects that are noise for the ear (and cost tokens and latency). */
const DROP = new Set(['osm_ids', 'evidence', 'inputs', 'meta', 'geometry', 'polyline', 'coords', 'lat', 'lon', 'sources', 'source', 'data_date',
  'completeness', 'route_line', 'osm_node', 'osm_id', 'position', 'legs']);

export function trim(doc: unknown, drop: Set<string> = DROP): unknown {
  if (Array.isArray(doc)) return doc.map((v) => trim(v, drop));
  if (doc && typeof doc === 'object') {
    return Object.fromEntries(Object.entries(doc as Record<string, unknown>).filter(([k]) => !drop.has(k)).map(([k, v]) => [k, trim(v, drop)]));
  }
  return doc;
}

const norm = (tok: string) => String(Number(tok));

/** Every number in a JSON tree: numeric values and numbers written in strings (either language's conventions). */
export function numbersIn(doc: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(doc)) for (const v of doc) numbersIn(v, out);
  else if (doc && typeof doc === 'object') for (const v of Object.values(doc)) numbersIn(v, out);
  else if (typeof doc === 'number') out.add(norm(String(doc)));
  else if (typeof doc === 'string') {
    for (const m of doc.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(norm(m[0].replace(/,/g, '')));
    for (const m of doc.matchAll(/\d+(?:,\d+)?/g)) out.add(norm(m[0].replace(',', '.')));
  }
  return out;
}

const WORDS: Record<Lang, Record<string, string>> = {
  // "one" and "uno/una/un" are too often a pronoun or an article
  en: Object.fromEntries('two three four five six seven eight nine ten eleven twelve'.split(' ').map((w, i) => [w, String(i + 2)])),
  it: Object.fromEntries('due tre quattro cinque sei sette otto nove dieci undici dodici'.split(' ').map((w, i) => [w, String(i + 2)])),
};

/** True when every number said (digits, and number words from two to twelve) is in `allowed`. */
export function backed(text: string, lang: Lang, allowed: Set<string>): boolean {
  const said = new Set(spokenNumbers(text, lang));
  for (const w of text.toLowerCase().match(/\p{L}+/gu) ?? []) if (WORDS[lang][w]) said.add(WORDS[lang][w]);
  return [...said].every((n) => allowed.has(n));
}

/** How many sentences of the engine's own text are said when the model does not speak. */
const SENTENCES: Partial<Record<SpeakKind, number>> = { plan: 1, overview: 3, explore: 4, answer: 3, navigate: 3 };

export function firstSentences(text: string, n: number): string {
  const t = text.trim();
  const rx = /[.!?]\s+(?=\p{Lu}|\d)/gu;
  let count = 0;
  for (let m = rx.exec(t); m; m = rx.exec(t)) if (++count === n) return t.slice(0, m.index + 1);
  return t;
}

export function engineText(kind: SpeakKind, result: unknown): string {
  const text = String((result as { text?: unknown } | null)?.text ?? '');
  return firstSentences(text, SENTENCES[kind] ?? 2);
}

export interface SpeakArgs {
  kind: SpeakKind;
  lang: Lang;
  utterance: string;
  result: unknown;
  trip?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The sentence to say and who wrote it. */
export async function reply(llm: LLM | null | undefined, a: SpeakArgs): Promise<{ text: string; via: 'llm' | 'engine' }> {
  const fallback = { text: engineText(a.kind, a.result), via: 'engine' as const };
  if (!llm) return fallback;
  const result = trim(a.result, a.kind === 'plan' ? new Set([...DROP, 'crossings']) : DROP);
  try {
    const r = await llm.complete({
      system: speakSystem(a.lang), maxTokens: 400, signal: a.signal, timeoutMs: a.timeoutMs ?? 4000,
      messages: [{ role: 'user', content: JSON.stringify({ kind: a.kind, user_said: a.utterance.slice(0, 500), trip: a.trip ?? {}, result }) }],
    });
    const text = r.text.replace(/[*_#`]|\bhttps?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (!text || !backed(text, a.lang, new Set([...numbersIn(a.result), ...numbersIn(a.trip ?? {})]))) return fallback;
    return { text, via: 'llm' };
  } catch {
    return fallback;
  }
}
