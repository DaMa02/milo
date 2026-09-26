import { isRecord } from './contracts';
import { requestJson } from './http';

export interface Place { name: string; lat: number; lon: number }
export interface PlaceCandidate extends Place {
  kind: string | null; street: string | null; housenumber: string | null;
  city: string | null; distance_m: number;
}
export interface ReversePlace {
  label: string; name: string | null; street: string | null; housenumber: string | null;
  city: string | null; lat: number; lon: number;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const nullable = (v: unknown) => v === null || typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const coordinates = (v: Record<string, unknown>) => finite(v.lat) && Math.abs(v.lat) <= 90 && finite(v.lon) && Math.abs(v.lon) <= 180;
export function parsePlace(v: unknown): Place {
  if (!isRecord(v) || !text(v.name) || !coordinates(v)) throw new Error('Invalid place');
  return { name: v.name, lat: v.lat as number, lon: v.lon as number };
}
export function parseSearch(v: unknown): PlaceCandidate[] {
  if (!isRecord(v) || typeof v.query !== 'string' || !Array.isArray(v.candidates) || v.candidates.length > 3) throw new Error('Invalid places');
  return v.candidates.map((item) => {
    const place = parsePlace(item);
    if (!isRecord(item) || !['kind', 'street', 'housenumber', 'city'].every((key) => nullable(item[key]))
      || !finite(item.distance_m) || item.distance_m < 0) throw new Error('Invalid candidate');
    return { ...place, kind: item.kind, street: item.street, housenumber: item.housenumber, city: item.city, distance_m: item.distance_m } as PlaceCandidate;
  });
}
export function parseReverse(v: unknown): ReversePlace {
  if (!isRecord(v) || !text(v.label) || !coordinates(v)
    || !['name', 'street', 'housenumber', 'city'].every((key) => nullable(v[key]))) throw new Error('Invalid reverse place');
  return v as unknown as ReversePlace;
}
export function searchPlaces(query: string, signal: AbortSignal, near?: { lat: number; lon: number }) {
  return requestJson('/places/search', parseSearch, { body: { query, lang: 'en', ...(near ? { near } : {}) }, signal });
}
export function reversePlace(lat: number, lon: number, signal: AbortSignal) {
  return requestJson('/places/reverse', parseReverse, { body: { lat, lon, lang: 'en' }, signal });
}
export function placeLabel(place: PlaceCandidate) {
  return [place.name, [place.street, place.housenumber].filter(Boolean).join(' '), place.city].filter(Boolean).join(', ');
}
