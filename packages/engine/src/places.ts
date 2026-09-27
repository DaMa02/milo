/**
 * Place search and reverse geocoding: Photon (komoot, https://photon.komoot.io, self-hostable) first, the names of
 * the loaded map as the fallback when Photon cannot be reached. Queries and coordinates are never logged.
 */
import * as J from './geo/jsts';
import { greatCircle } from './geo/projection';
import type { Lang } from './i18n/common';
import { messages } from './i18n';
import { r10 } from './overview';
import { norm, places } from './tools';
import type { Zone } from './zone';

export const PHOTON = 'https://photon.komoot.io';
const MAX_KM = 25; // farther than this from the reference point is another city's namesake
const NOISE = ['!amenity:bicycle_rental', '!highway:bus_stop', '!railway:tram_stop', '!railway:platform', '!public_transport:platform',
  '!public_transport:stop_position']; // stops and bike docks outrank the place asked
const NAMED = new Set(['building', 'tourism', 'shop']);
const NAMED_AMENITY = new Set(['university', 'school', 'hospital', 'place_of_worship']);

export interface PhotonOptions {
  url?: string;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Never call Photon: search the loaded maps only. */
  offline?: boolean;
}

export interface Candidate {
  name: string;
  kind: string | null;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  lat: number;
  lon: number;
  /** From the reference point; null without one. */
  distance_m: number | null;
}

export interface Reverse {
  label: string;
  street: string | null;
  housenumber: string | null;
  name: string | null;
  city: string | null;
  lat: number;
  lon: number;
}

const photonLang = (lang: Lang | string) => (['de', 'en', 'fr', 'it'].includes(lang) ? lang : 'default');

async function photon(opts: PhotonOptions, path: string, params: [string, string][]): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const doFetch = opts.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {};
  if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
  const res = await doFetch(`${opts.url ?? PHOTON}${path}?${q}`, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 4000) });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const json = (await res.json()) as { features?: unknown };
  return Array.isArray(json?.features) ? json.features : [];
}

function candidate(name: string, kind: string | null, street: string | null, housenumber: string | null, city: string | null, lat: number,
  lon: number, ref: [number, number] | null): Candidate {
  return { name, kind, street, housenumber, city, lat, lon, distance_m: ref ? r10(greatCircle(ref[0], ref[1], lat, lon)) : null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromPhoton(f: any, ref: [number, number] | null): Candidate {
  const p = f.properties ?? {};
  const [lon, lat] = f.geometry.coordinates;
  const street = p.street ?? (p.osm_key === 'highway' ? p.name : null) ?? null;
  return candidate(p.name ?? street, p.osm_value ?? null, street, p.housenumber ?? null, p.city ?? null, lat, lon, ref);
}

/** Named streets and features of the loaded maps that match the query, nearest first. */
export function offlineSearch(zones: Zone[], lang: Lang, query: string, ref: [number, number] | null): Candidate[] {
  const M = messages(lang);
  const q = norm(M, query);
  const out: Candidate[] = [];
  for (const zone of zones) {
    const pool = places(zone, lang);
    let hits = pool.filter((p) => q === p.name.toLowerCase() || q === p.label.toLowerCase());
    if (!hits.length) {
      const words = q.split(' ');
      hits = pool.filter((p) => {
        const n = p.name.toLowerCase();
        const nw = new Set(n.split(/\s+/));
        return n.includes(q) || words.every((w) => nw.has(w));
      });
    }
    for (const p of hits) {
      const [lat, lon] = zone.ll(J.interiorPoint(p.geom));
      out.push(candidate(p.name, p.kind, p.kind === 'street' ? p.name : null, null, null, lat, lon, ref));
    }
  }
  const seen = new Set<string>();
  return out.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0)).filter((c) => {
    const k = `${c.name.toLowerCase()}|${c.lat.toFixed(4)}|${c.lon.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

/**
 * Up to 3 places matching a query, near a reference point (the user's position): Photon first, restricted to about
 * 20 km around the reference, then the loaded maps. Without a reference (no position yet) Photon ranks by
 * importance. `fix` may propose corrected spellings of a misheard name.
 */
export async function searchPlaces(query: string, ref: [number, number] | null, lang: Lang, zones: Zone[], opts: PhotonOptions = {},
  fix?: (query: string) => Promise<string[]>): Promise<Candidate[]> {
  const q = query.split(/\s+/).filter(Boolean).join(' ');
  if (!q) return [];
  const bias: [string, string][] = [];
  if (ref) {
    const [lat, lon] = ref;
    const bbox = [lon - 0.26, lat - 0.18, lon + 0.26, lat + 0.18].map((v) => v.toFixed(3)).join(',');
    bias.push(['lat', lat.toFixed(3)], ['lon', lon.toFixed(3)], ['bbox', bbox]);
  }
  const near = async (text: string) => {
    const feats = await photon(opts, '/api', [['q', text], ['limit', '3'], ['lang', photonLang(lang)],
      ...NOISE.map((n) => ['osm_tag', n] as [string, string]), ...bias]);
    return feats.map((f) => fromPhoton(f, ref)).filter((c) => c.name && (c.distance_m === null || c.distance_m <= MAX_KM * 1000));
  };
  let found: Candidate[] = [];
  if (!opts.offline) {
    try {
      found = await near(q);
      if (!found.length && fix) {
        // maybe misheard ("Baconi University"): search the corrected names once
        const seen = new Set<string>();
        for (const name of await fix(q)) {
          for (const c of await near(name)) {
            if (!seen.has(c.name.toLowerCase())) {
              seen.add(c.name.toLowerCase());
              found.push(c);
            }
          }
        }
        found = found.slice(0, 3);
      }
    } catch {
      found = [];
    }
  }
  return found.length ? found : offlineSearch(zones, lang, q, ref);
}

/** The street and house number (and a named building) at a point; the loaded map's nearest street as the fallback. */
export async function reversePlace(lat: number, lon: number, lang: Lang, zones: Zone[], opts: PhotonOptions = {}): Promise<Reverse | null> {
  let props: [any, [number, number]][] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!opts.offline) {
    try {
      const feats = await photon(opts, '/reverse', [['lat', lat.toFixed(5)], ['lon', lon.toFixed(5)], ['limit', '5'], ['lang', photonLang(lang)]]);
      props = feats.map((f) => [f.properties ?? {}, f.geometry.coordinates]);
    } catch {
      props = [];
    }
  }
  const addr = props.find(([p]) => p.street || p.osm_key === 'highway')?.[0];
  const named = props.find(([p, [plon, plat]]) => (NAMED.has(p.osm_key) || (p.osm_key === 'amenity' && NAMED_AMENITY.has(p.osm_value)))
    && p.name && greatCircle(lat, lon, plat, plon) <= 25)?.[0];
  let street: string | null = null;
  let number: string | null = null;
  if (addr) {
    street = addr.street ?? addr.name ?? null;
    number = addr.housenumber ?? null;
  } else {
    const zone = zones.find((z) => z.inAnswerArea(lat, lon)) ?? zones[0];
    street = zone ? zone.roadName(zone.xy(lat, lon), 150) : null;
  }
  const name = named?.name ?? null;
  const city = props.find(([p]) => p.city)?.[0]?.city ?? null;
  const label = [street, number].filter(Boolean).join(' ') || name;
  if (!label) return null;
  return { label, street, housenumber: number, name, city, lat, lon };
}
