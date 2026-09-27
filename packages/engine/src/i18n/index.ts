import type { Lang } from './common';
import { en, type Messages } from './en';
import { it } from './it';

export type { Lang, Label } from './common';
export type { Messages } from './en';

const CATALOGS: Record<Lang, Messages> = { en, it };

/** The message catalog for a language (English for any language without one). */
export function messages(lang: Lang | string): Messages {
  return CATALOGS[lang as Lang] ?? en;
}
