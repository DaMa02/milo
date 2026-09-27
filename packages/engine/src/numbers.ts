/**
 * The number rule: every number said to the user is also a fact. This module finds the numbers in a sentence
 * (in the conventions of its language) and checks them against the facts of a result.
 */
import type { Lang } from './i18n/common';

/** Keys whose string values are said to the user. */
export const SPOKEN_KEYS = new Set(['text', 'details', 'summary', 'warnings', 'differences', 'unknown']);

/** '1,080' -> '1080', '3.10' -> '3.1', '08' -> '8'. */
export function normNumber(token: string): string {
  const v = Number(token);
  return Number.isInteger(v) ? String(v) : String(v);
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

/**
 * Numbers as said in a sentence: English groups thousands with commas and writes decimals with a point; Italian
 * writes decimals with a comma. Clock positions ("at 3 o'clock", "a ore 3") are directions, not numbers.
 */
export function spokenNumbers(text: string, lang: Lang | string): string[] {
  const out: string[] = [];
  const rx = lang === 'it' ? /\d+(?:,\d+)?/g : /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    let tok = m[0];
    const start = m.index;
    let end = start + tok.length;
    if (lang !== 'it') {
      while (tok.endsWith(',')) {
        tok = tok.slice(0, -1);
        end -= 1;
      }
    }
    const before = text[start - 1];
    const after = text[end];
    if (isWordChar(before) || before === '.' || (lang === 'it' && before === ',')) continue;
    if (isWordChar(after)) continue;
    const rest = text.slice(end);
    if (lang !== 'it' && /^\s*o'clock/.test(rest)) continue;
    if (lang === 'it' && /(?:^|\s)ore\s$/.test(text.slice(Math.max(0, start - 5), start))) continue;
    const plain = lang === 'it' ? tok.replace(',', '.') : tok.replace(/,/g, '');
    out.push(normNumber(plain));
  }
  return out;
}

/** Numbers inside a fact value: a number, or the numbers written in a string (OSM data: points for decimals). */
function valueNumbers(v: unknown): string[] {
  if (typeof v === 'number') return [normNumber(String(v))];
  if (typeof v !== 'string') return [];
  return [...v.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => normNumber(m[0].replace(/,/g, '').replace(/\.$/, '')));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function* lists(node: any): Generator<[string, any[]]> {
  if (Array.isArray(node)) {
    for (const v of node) yield* lists(v);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v)) yield [k, v];
      yield* lists(v);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function* walk(node: any, key: string | null = null): Generator<[string | null, unknown]> {
  if (Array.isArray(node)) {
    for (const v of node) yield* walk(v, key);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* walk(v, k);
  } else yield [key, node];
}

/** Every number backed by a fact anywhere in the document. */
export function backedNumbers(doc: unknown): Set<string> {
  const out = new Set<string>();
  for (const [k, facts] of lists(doc)) {
    if (k !== 'facts') continue;
    for (const f of facts) {
      const v = f?.value;
      if (typeof v === 'boolean' || v === null || v === undefined) continue;
      for (const n of valueNumbers(v)) out.add(n);
    }
  }
  return out;
}

/** Numbers said in the document's spoken strings that no fact backs, with where they were said. */
export function unbackedNumbers(doc: unknown, lang: Lang | string): string[] {
  const backed = backedNumbers(doc);
  const problems: string[] = [];
  for (const [k, v] of walk(doc)) {
    if (!k || !SPOKEN_KEYS.has(k) || typeof v !== 'string') continue;
    for (const n of spokenNumbers(v, lang)) if (!backed.has(n)) problems.push(`${n} in ${k}: ${v.slice(0, 80)}`);
  }
  return problems;
}
