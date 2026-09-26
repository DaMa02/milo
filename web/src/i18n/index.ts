import en from './en.json';
import it from './it.json';

export type Language = 'en' | 'it';
export type Dictionary = typeof en;
export const dictionaries: Record<Language, Dictionary> = { en, it };
