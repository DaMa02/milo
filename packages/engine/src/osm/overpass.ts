/**
 * Overpass API queries for a zone: the walkable network and the features the engine talks about.
 *
 * The network filter is osmnx's "walk" filter: every way with a highway tag that a pedestrian may use,
 * including service roads, excluding motorways, cycleways, private and abandoned ways, and roads whose
 * sidewalks are mapped as separate ways (those sidewalks are in the network instead).
 */
import type { OverpassResponse } from './types';

export const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export const WALK_FILTER =
  '["highway"]["area"!~"yes"]["access"!~"private"]' +
  '["highway"!~"abandoned|bus_guideway|construction|cycleway|motor|no|planned|platform|proposed|raceway|razed|rest_area|services"]' +
  '["foot"!~"no"]["service"!~"private"]' +
  '["sidewalk"!~"separate"]["sidewalk:both"!~"separate"]["sidewalk:left"!~"separate"]["sidewalk:right"!~"separate"]';

/** Tags kept on network nodes and ways (osmnx's useful tags plus the crossing and accessibility tags). */
export const NODE_TAGS = ['highway', 'junction', 'railway', 'ref', 'crossing', 'crossing:signals', 'traffic_signals:sound',
  'tactile_paving', 'noexit'];
export const WAY_TAGS = ['access', 'area', 'bridge', 'est_width', 'highway', 'junction', 'landuse', 'lanes', 'maxspeed', 'name',
  'oneway', 'ref', 'service', 'tunnel', 'width', 'footway', 'layer', 'crossing', 'crossing:signals', 'traffic_signals:sound',
  'tactile_paving', 'surface', 'incline', 'wheelchair', 'kerb', 'smoothness', 'lit'];

/** Feature tags: true = any value, a list = one of these values. */
export type FeatureTags = Record<string, true | string[]>;

export const FEATURE_TAGS: FeatureTags = {
  railway: ['rail', 'light_rail'],
  waterway: true,
  landuse: ['railway', 'construction'],
  leisure: ['park', 'garden'],
  shop: true,
  amenity: ['pharmacy', 'cafe', 'atm', 'bank'],
};

/** Overpass (poly:"lat lon lat lon ...") string, 6 decimals. */
export function polyString(ring: [number, number][]): string {
  return ring.map(([lat, lon]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(' ');
}

export function networkQuery(poly: string, timeoutS = 180): string {
  return `[out:json][timeout:${timeoutS}];(way${WALK_FILTER}(poly:"${poly}");>;);out;`;
}

function escapeRegex(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function featuresQuery(poly: string, tags: FeatureTags = FEATURE_TAGS, timeoutS = 180): string {
  const parts = Object.entries(tags).map(([k, v]) =>
    v === true ? `nwr["${k}"](poly:"${poly}");` : `nwr["${k}"~"^(${v.map(escapeRegex).join('|')})$"](poly:"${poly}");`);
  return `[out:json][timeout:${timeoutS}];(${parts.join('')});(._;>;);out;`;
}

export interface OverpassOptions {
  endpoints?: string[];
  fetch?: typeof fetch;
  userAgent?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class OverpassError extends Error {
  constructor(message: string, readonly causes: string[]) {
    super(message);
    this.name = 'OverpassError';
  }
}

/** Runs a query on the first endpoint that answers; busy or failing endpoints are skipped. */
export async function runOverpass(query: string, opts: OverpassOptions = {}): Promise<OverpassResponse> {
  const endpoints = opts.endpoints?.length ? opts.endpoints : DEFAULT_OVERPASS_ENDPOINTS;
  const doFetch = opts.fetch ?? globalThis.fetch;
  const causes: string[] = [];
  for (const url of endpoints) {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 120_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
      const res = await doFetch(url, { method: 'POST', headers, body: `data=${encodeURIComponent(query)}`, signal });
      if (!res.ok) {
        causes.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as OverpassResponse;
      if (!json || !Array.isArray(json.elements)) {
        causes.push(`${url}: no elements`);
        continue;
      }
      return json;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      causes.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new OverpassError('No Overpass server could answer.', causes);
}
