/**
 * Public transport from Transitous (MOTIS, https://transitous.org), one itinerary request per route C.
 * Answers are cached by request, so a trip planned once is available offline afterwards.
 */

export const TRANSITOUS = 'https://api.transitous.org/api/v6/plan?';

export interface TransitCache {
  get(url: string): Promise<unknown | undefined> | unknown | undefined;
  set(url: string, value: unknown): Promise<void> | void;
}

/** An in-memory cache, for tests and for a session without storage. */
export class MemoryTransitCache implements TransitCache {
  private readonly map = new Map<string, unknown>();

  get(url: string) {
    return this.map.get(url);
  }

  set(url: string, value: unknown) {
    this.map.set(url, value);
  }
}

export interface TransitOptions {
  /** Never call the service: answers come from the cache only. */
  offline?: boolean;
  cache?: TransitCache;
  fetch?: typeof fetch;
  userAgent?: string;
  endpoint?: string;
  timeoutMs?: number;
}

export type CacheState = 'hit' | 'live' | 'miss' | 'error';

/** Transitous v6 plan, cached by URL. The answer is null when it is not available. */
export async function fetchPlan(opts: TransitOptions, from: [number, number], to: [number, number], time: string,
  extra: Record<string, string>): Promise<{ url: string; json: any | null; state: CacheState }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = new URLSearchParams({ fromPlace: `${from[0]},${from[1]}`, toPlace: `${to[0]},${to[1]}`, time, maxTransfers: '2',
    maxTravelTime: '60', ...extra });
  const url = (opts.endpoint ?? TRANSITOUS) + q.toString();
  let json: any = opts.cache ? await opts.cache.get(url) : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (json) {
    // never reuse an answer for another trip
    const same = [['from', from], ['to', to]].every(([k, p]) => ['lat', 'lon'].every((c, j) =>
      Math.abs(json?.[k as string]?.[c] - (p as [number, number])[j]) < 1e-5));
    if (same) return { url, json, state: 'hit' };
  }
  if (opts.offline) return { url, json: null, state: 'miss' };
  try {
    const doFetch = opts.fetch ?? globalThis.fetch;
    const headers: Record<string, string> = {};
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
    const res = await doFetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    if (!res.ok) return { url, json: null, state: 'error' };
    json = await res.json();
    await opts.cache?.set(url, json);
    return { url, json, state: 'live' };
  } catch {
    return { url, json: null, state: 'error' };
  }
}

/** Google encoded polyline -> [[lat, lon]]. */
export function decodePolyline(points: string, precision: number): [number, number][] {
  const coords: [number, number][] = [];
  let idx = 0;
  let lat = 0;
  let lon = 0;
  const f = 10 ** precision;
  while (idx < points.length) {
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = points.charCodeAt(idx) - 63;
        idx += 1;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lon += d;
    }
    coords.push([lat / f, lon / f]);
  }
  return coords;
}

export function legMode(m: string): 'foot' | 'bus' | 'tram' | 'subway' | 'rail' | 'other' {
  if (m === 'WALK') return 'foot';
  if (m === 'BUS' || m === 'COACH') return 'bus';
  if (m === 'TRAM' || m === 'CABLE_CAR') return 'tram';
  if (m === 'SUBWAY' || m === 'METRO') return 'subway';
  return m.includes('RAIL') || ['SUBURBAN', 'LONG_DISTANCE', 'NIGHT_RAIL'].includes(m) ? 'rail' : 'other';
}

const ABBR: [string, string][] = [['v.le ', 'viale '], ['p.za ', 'piazza '], ['c.so ', 'corso '], ['l.go ', 'largo '], ['p.ta ', 'porta ']];

/** Python's str.title(): a letter after a non-letter is upper case, every other letter lower case. */
export function titleCase(s: string): string {
  let out = '';
  let prevCased = false;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    const cased = lower !== upper;
    out += cased ? (prevCased ? lower : upper) : ch;
    prevCased = cased;
  }
  return out;
}

export function stopName(s: string, start: string, end: string): string {
  if (s === 'START' || s === 'END') return s === 'START' ? start : end;
  for (const [k, v] of ABBR) s = s.split(k).join(v);
  return titleCase(s);
}
