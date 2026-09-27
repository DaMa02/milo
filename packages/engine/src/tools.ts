/**
 * The six map questions, answered deterministically from the zone. Each returns an Answer
 * (contracts/answer.schema.json) in which every spoken number is also a fact.
 *
 * Places are resolved inside the zone only: an unknown, ambiguous or far place becomes a question back.
 */
import * as J from './geo/jsts';
import type { Geom } from './geo/jsts';
import { dist } from './geo/planar';
import { greatCircle, pyRound, type Pt } from './geo/projection';
import { MapGraph, distancesWithin, minimumNodeCut, byLength } from './graph';
import { hoursNow } from './hours';
import { isGeneric, lc, type Lang } from './i18n/common';
import { messages, type Messages } from './i18n';
import { centreName, mins, r10, window } from './overview';
import { route } from './routing';
import type { Session } from './session';
import { ids, type Fact, type Zone } from './zone';
import type { Tags } from './osm/types';

export const TOOLS = ['walking_vs_straight_line', 'barrier_between', 'street_continuity', 'independent_connections', 'extent',
  'place_info'] as const;
export type Tool = (typeof TOOLS)[number];

const AREAS = ['park', 'garden', 'construction site', 'railway land'];
const CONN_CROP_M = 500; // independent_connections: counted in the box around both ends plus this margin
const AREA_M = 40; // a place for independent_connections: 40 m around both ends of its snapped edge
const AREA_CAP = 200;
const BOUND_M = 30; // a bounding street runs at least 40 m within 30 m of the edge of the area
const BOUND_MIN = 40;
const BLOCK_SHARE = 0.6; // "takes the block" when the area covers at least 60% of the block around it
const MAIN = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link']);

/** A place that cannot be used: the message is said to the user, `unknown` says what is missing. */
export class PlaceError extends Error {
  constructor(message: string, readonly unknown: string, readonly facts: Fact[] = []) {
    super(message);
    this.name = 'PlaceError';
  }
}

export interface Place {
  name: string;
  /** Spoken label: the name, "Lidl on corso Lodi" for a shop told apart by its street, "via Brembo". */
  label: string;
  kind: string;
  geom: Geom;
  evidence: string[];
  tags?: Tags;
  /** Street of a shop (for the label), when known. */
  street?: string | null;
}

/** Zone-level aliases for named places (the legacy demo zone uses them). */
export type Aliases = Record<string, [number, number, string]>;

export function featureKind(t: Tags): string {
  if (typeof t.railway === 'string') return 'railway';
  if (typeof t.waterway === 'string') return 'waterway';
  if (t.landuse === 'construction') return 'construction site';
  if (typeof t.leisure === 'string') return t.leisure;
  if (t.landuse === 'railway') return 'railway land';
  const a = t.amenity;
  if (a === 'pharmacy' || a === 'cafe') return a;
  if (a === 'atm' || a === 'bank') return 'atm';
  const s = t.shop;
  return typeof s === 'string' ? (s !== 'supermarket' && s !== 'bakery' ? 'shop' : s) : 'place';
}

/** Opening hours as said: [raw OSM value or null, open now, phrase]. */
export function placeHours(M: Messages, tags: Tags | undefined, now: Date, timeZone?: string): [string | null, boolean | null, string] {
  const raw = tags && typeof tags.opening_hours === 'string' ? tags.opening_hours : null;
  if (raw === null) return [null, null, M.hours.unknown];
  const [open, state] = hoursNow(raw, now, timeZone);
  if (!state) return [raw, open, M.hours.unreadable];
  const phrase = state.kind === 'always' ? M.hours.always : state.kind === 'open_until' ? M.hours.openUntil(state.hm)
    : state.kind === 'opens' ? M.hours.opens(state.when, state.hm) : M.hours.closed;
  return [raw, open, phrase];
}

function wheelchair(tags: Tags | undefined): string | null {
  const w = tags?.wheelchair;
  return w === 'yes' || w === 'limited' || w === 'no' ? w : null;
}

// ---------- places ----------
interface PlaceSource {
  name: string;
  kind: string;
  geom: Geom;
  evidence: string[];
  tags?: Tags;
  street?: string | null;
  isStreet: boolean;
  isPoint: boolean;
}

/** Every named street and named feature of the zone, before it is put into words. */
function placeSources(zone: Zone): PlaceSource[] {
  return zone.memoize('tools.placeSources', () => {
    const out: PlaceSource[] = [];
    const byName = new Map<string, number[]>();
    for (let e = 0; e < zone.edgeCount; e++) {
      const t = zone.etags(e);
      if (t.name === undefined || t.footway === 'sidewalk' || t.footway === 'crossing') continue; // sidewalks carry stop names
      const list = byName.get(t.name);
      if (list) list.push(e);
      else byName.set(t.name, [e]);
    }
    for (const name of [...byName.keys()].sort()) {
      const es = byName.get(name)!;
      out.push({ name, kind: 'street', geom: J.unionAll(es.map((e) => J.line(zone.eline(e)))), evidence: ids('way', es.map((e) => zone.eway(e))),
        isStreet: true, isPoint: false });
    }
    const groups = new Map<string, PlaceSource & { geoms: Geom[] }>();
    for (const f of zone.features) {
      const t = f.tags;
      const atm = t.amenity === 'atm' || t.amenity === 'bank';
      if (typeof t.name !== 'string' && !atm) continue;
      const kind = featureKind(t);
      const ev = `${f.element}/${f.id}`;
      if (J.geomType(f.geom) === 'Point') {
        // shops: each one is its own place, told apart by its street
        const st = typeof t['addr:street'] === 'string' ? t['addr:street'] : zone.roadName(f.geom, 60);
        out.push({ name: t.name, kind, geom: f.geom, evidence: [ev], tags: t, street: st, isStreet: false, isPoint: true });
      } else {
        const op = typeof t.operator === 'string' ? t.operator : typeof t.brand === 'string' ? t.brand : '';
        const key = `${t.name ?? `\u0001${op}`}\u0000${kind}`;
        let g = groups.get(key);
        if (!g) {
          g = { name: t.name, kind, geom: null, geoms: [], evidence: [], tags: t, isStreet: false, isPoint: false };
          groups.set(key, g);
          out.push(g);
        }
        g.geoms.push(f.geom);
        g.evidence.push(ev);
      }
    }
    // areas are listed after streets and shops, as the legacy engine listed them
    const areas = out.filter((p) => !p.isStreet && !p.isPoint) as (PlaceSource & { geoms: Geom[] })[];
    for (const g of areas) g.geom = J.unionAll(g.geoms);
    return [...out.filter((p) => p.isStreet || p.isPoint), ...areas];
  });
}

/** Every named street and feature, with spoken names and labels in a language. */
export function places(zone: Zone, lang: Lang): Place[] {
  return zone.memoize(`tools.places:${lang}`, () => {
    const M = messages(lang);
    return placeSources(zone).map((p) => {
      // an unnamed cash machine: its bank's name, if the map has it
      const op = p.tags ? (typeof p.tags.operator === 'string' ? p.tags.operator : typeof p.tags.brand === 'string' ? p.tags.brand : null) : null;
      const name = p.name ?? M.places.cashMachine(op);
      const label = p.isStreet ? lc(name) : p.isPoint && p.street ? M.places.onStreet(name, p.street) : name;
      return { name, label, kind: p.kind, geom: p.geom, evidence: p.evidence, tags: p.tags, street: p.street };
    });
  });
}

function rank(p: Place): number {
  const t = J.geomType(p.geom);
  return t === 'Polygon' || t === 'MultiPolygon' ? 0 : p.kind === 'street' ? 1 : 2;
}

/** 'the pharmacy' -> 'pharmacy': lower case, spaces collapsed, a leading article dropped. */
export function norm(M: Messages, text: string): string {
  const q = String(text).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  for (const art of M.places.articles) if (q.startsWith(art)) return q.slice(art.length);
  return q;
}

function radiusFact(zone: Zone): Fact {
  return zone.fact('radius', zone.answerRadius, 'm', 'unknown', [], { graph: zone.graphInputs });
}

function outside(M: Messages, zone: Zone, what: string | null = null): PlaceError {
  const r = M.metres(zone.answerRadius);
  return new PlaceError(M.places.outside(what, r, centreName(zone)), M.places.outsideUnknown(r, centreName(zone)), [radiusFact(zone)]);
}

function placeFact(zone: Zone, p: Place): Fact {
  return zone.fact('place', p.label, null, 'map_tag', p.evidence.slice(0, 20), { match: 'name in OSM streets and features', ...zone.featureInputs });
}

type Resolved = [number, number, string, Place | null];

const dxy = (g: Geom, p: Pt) => g.distance(J.point(p));

/** Places matching a name inside the answer area, best first; PlaceError when none, far, or several. */
export function findPlaces(zone: Zone, M: Messages, text: unknown, kinds: string[] | null = null, what = M.places.whatPlace,
  session: Session | null = null): Place[] {
  if (typeof text !== 'string') throw new PlaceError(M.places.which, M.places.unusable);
  const q = norm(M, text);
  if (!q) throw new PlaceError(M.places.which, M.places.notGiven);
  const pool = places(zone, M.lang);
  let hits = pool.filter((p) => q === p.name.toLowerCase() || q === p.label.toLowerCase());
  const c = zone.xy(zone.center[0], zone.center[1]);
  const kindWords = M.places.kindWords[q];
  if (!hits.length && kindWords) {
    // the nearest place of that kind to the session origin
    const ref = session?.origin ? zone.xy(session.origin[0], session.origin[1]) : c;
    const near = pool.filter((p) => kindWords.includes(p.kind) && dxy(p.geom, c) <= zone.answerRadius)
      .map((p) => ({ p, d: dxy(p.geom, ref) })).sort((a, b) => a.d - b.d);
    if (near.length) return [near[0].p];
  }
  if (!hits.length) {
    const words = q.split(' ');
    hits = pool.filter((p) => {
      const n = p.name.toLowerCase();
      const nw = new Set(n.split(/\s+/).filter(Boolean));
      return n.includes(q) || words.every((w) => nw.has(w));
    });
  }
  const asked: Fact[] = [{ type: 'place_query', value: String(text), unit: null, source: 'unknown', evidence: [], inputs: { query: String(text) },
    data_date: zone.snapshot, completeness: 'complete' }];
  if (!hits.length) throw new PlaceError(M.places.notFound(text), M.places.notFoundUnknown(text), asked);
  if (kinds && !hits.some((p) => kinds.includes(p.kind))) {
    const p = hits[0];
    throw new PlaceError(M.places.wrongKind(p.label, M.tools.kindName(p.kind), what), M.places.wrongKindUnknown(what), [placeFact(zone, p)]);
  }
  hits = hits.filter((p) => !kinds || kinds.includes(p.kind));
  const near = hits.map((p) => ({ p, d: dxy(p.geom, c) })).filter((x) => x.d <= zone.answerRadius).sort((a, b) => a.d - b.d).map((x) => x.p);
  if (!near.length) throw outside(M, zone, hits[0].label);
  // same name = same place (a street and its square), except shops, which differ by street
  const groups = new Map<string, Place[]>();
  for (const p of near) {
    const key = (J.geomType(p.geom) === 'Point' ? p.label : p.name).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  if (groups.size > 1) {
    const opts = [...groups.values()].map((g) => g[0]).slice(0, 3);
    throw new PlaceError(M.places.ambiguous(opts.map((p) => p.label)), M.places.ambiguousUnknown, opts.map((p) => placeFact(zone, p)));
  }
  return [...groups.values()][0].map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/** Where a place is: a shop's point, an area's centroid, a street's point nearest to the zone centre. */
function placePoint(zone: Zone, g: Geom): Pt {
  const c = zone.xy(zone.center[0], zone.center[1]);
  const t = J.geomType(g);
  if (t === 'Point') return J.coords(g)[0];
  if ((t === 'Polygon' || t === 'MultiPolygon') && dist(J.centroid(g), c) <= zone.answerRadius) return J.centroid(g);
  return J.nearestPoint(g, c);
}

type Spec = string | { name?: unknown; lat?: unknown; lon?: unknown } | null | undefined;

function given(spec: Spec): boolean {
  if (typeof spec === 'string') return !!spec.trim();
  return !!spec && typeof spec === 'object' && ['name', 'lat', 'lon'].some((k) => {
    const v = (spec as Record<string, unknown>)[k];
    return v !== null && v !== undefined && v !== '';
  });
}

/**
 * (lat, lon, name, place or null). Nothing, "here" or "start" is the session origin; "here" is the walk
 * position once the walk has left the start. A place given in a shape that cannot be used is a PlaceError.
 */
export function resolvePlace(zone: Zone, M: Messages, spec: Spec, session: Session | null, aliases: Aliases = {}): Resolved {
  let s: Record<string, unknown> = typeof spec === 'string' ? { name: spec } : (spec ?? {}) as Record<string, unknown>;
  if (typeof s !== 'object' || (s.name !== undefined && s.name !== null && typeof s.name !== 'string')) {
    throw new PlaceError(M.places.which, M.places.unusable);
  }
  s = { ...s };
  if (s.lat !== undefined && s.lat !== null || s.lon !== undefined && s.lon !== null) {
    const lat = Number(s.lat);
    const lon = Number(s.lon);
    if (s.lat === null || s.lon === null || s.lat === undefined || s.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new PlaceError(M.places.which, M.places.unusable);
    }
    if (!zone.inAnswerArea(lat, lon)) throw outside(M, zone);
    const road = s.name ? null : zone.roadName(zone.xy(lat, lon), 60);
    return [lat, lon, (s.name as string) || M.places.pointOn(road), null];
  }
  const q = norm(M, (s.name as string) || '');
  if (M.places.here.includes(q) && !M.places.startWords.includes(q) && session && session.start && session.node !== null && session.node !== session.start[0]) {
    const [lat, lon] = zone.LL[session.node];
    return [lat, lon, M.places.walkPosition, null];
  }
  if (!q || M.places.here.includes(q)) {
    const o = session?.origin ?? [zone.center[0], zone.center[1], centreName(zone)];
    return [o[0], o[1], o[2], null];
  }
  if (M.places.destination.includes(q) && session?.destination) {
    const d = session.destination;
    return [d.lat, d.lon, d.name, null];
  }
  if (aliases[q]) {
    const [lat, lon, name] = aliases[q];
    return [lat, lon, name, null];
  }
  const p = findPlaces(zone, M, s.name, null, M.places.whatPlace, session)[0];
  const [lat, lon] = zone.ll(placePoint(zone, p.geom));
  return [lat, lon, p.label, p];
}

function placeFacts(zone: Zone, ...ps: Resolved[]): Fact[] {
  const out: Fact[] = [];
  for (const [lat, lon, name, p] of ps) {
    if (p) out.push(zone.fact('place', name, null, 'map_tag', p.evidence.slice(0, 20), { point: [lat, lon], match: 'name in OSM streets and features', ...zone.featureInputs }));
    else if (/\d/.test(name)) out.push(zone.fact('place', name, null, 'unknown', [], { point: [lat, lon] }));
  }
  return out;
}

/** Street names with digits in them are numbers too: back each with its ways. */
function nameFacts(zone: Zone, lang: Lang, names: string[], inputs: Record<string, unknown>): Fact[] {
  const out: Fact[] = [];
  for (const n of names) {
    const p = places(zone, lang).find((q) => q.label === n);
    if (p && /\d/.test(n)) out.push(zone.fact('street_name', n, null, 'map_tag', p.evidence.slice(0, 10), inputs));
  }
  return out;
}

interface Ctx {
  zone: Zone;
  M: Messages;
  session: Session;
  aliases: Aliases;
  now: Date;
  timeZone?: string;
}

function pair(ctx: Ctx, params: Record<string, unknown>): [Resolved, Resolved] {
  const { M } = ctx;
  const to = params.to;
  if (!(typeof to === 'string' || (typeof to === 'object') || to === undefined)) throw new PlaceError(M.places.which, M.places.unusable);
  if (!given(to as Spec)) throw new PlaceError(M.places.which, M.places.noDestination);
  const a = resolvePlace(ctx.zone, M, params.from as Spec, ctx.session, ctx.aliases);
  const b = resolvePlace(ctx.zone, M, to as Spec, ctx.session, ctx.aliases);
  if (a[0] === b[0] && a[1] === b[1]) throw new PlaceError(M.places.samePlace(a[2], b[2]) + M.places.whichOther, M.places.samePlaceUnknown);
  return [a, b];
}

// ---------- barriers on the straight line ----------
interface Barrier {
  kind: 'railway' | 'waterway' | 'construction site';
  name: string | null;
  evidence: string[];
  wt?: string;
  long: string;
  short: string;
}

/** Railways, water and construction sites crossing the straight line a-b, railway first, one per named feature. */
function barriersOn(ctx: Ctx, a: Resolved, b: Resolved): Barrier[] {
  const { zone, M } = ctx;
  const line = J.line([zone.xy(a[0], a[1]), zone.xy(b[0], b[1])]);
  const out = new Map<string, Barrier>();
  for (const f of zone.features) {
    if (!f.geom.intersects(line)) continue;
    const kind = featureKind(f.tags);
    if ((kind !== 'railway' && kind !== 'waterway' && kind !== 'construction site') || ['yes', 'culvert'].includes(String(f.tags.tunnel))) continue;
    const name = typeof f.tags.name === 'string' ? f.tags.name : null;
    const key = `${kind}\u0000${name ?? ''}`;
    let e = out.get(key);
    if (!e) {
      e = { kind, name, evidence: [], wt: f.tags.waterway, long: '', short: '' };
      out.set(key, e);
    }
    e.evidence.push(`${f.element}/${f.id}`);
  }
  const order = ['railway', 'waterway', 'construction site'];
  const res = [...out.values()].map((e, i) => ({ e, i })).sort((x, y) => order.indexOf(x.e.kind) - order.indexOf(y.e.kind) || x.i - y.i).map((x) => x.e);
  for (const e of res) {
    if (e.kind === 'railway') [e.long, e.short] = M.tools.railway(e.name);
    else if (e.kind === 'waterway') e.long = e.short = M.tools.waterway(e.name, e.wt);
    else e.long = e.short = M.tools.constructionSite(e.name);
  }
  return res;
}

function barrierFacts(zone: Zone, bars: Barrier[], a: Resolved, b: Resolved): Fact[] {
  const lineIn = { ...zone.featureInputs, line: [[a[0], a[1]], [b[0], b[1]]] };
  return bars.map((e) => zone.fact('barrier', e.name ?? e.long, null, 'map_tag', e.evidence, lineIn));
}

type Result = [string, Fact[], string[]];

// ---------- 1 walking vs straight line ----------
function walking(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M } = ctx;
  const [a, b] = pair(ctx, params);
  const A = zone.snap(a[0], a[1]);
  const B = zone.snap(b[0], b[1]);
  const oa = r10(A.off);
  const ob = r10(B.off);
  const routeIn = { graph: zone.graphInputs, origin: [a[0], a[1]], destination: [b[0], b[1]], speed_m_per_min: 80, origin_snap_m: oa, destination_snap_m: ob };
  const crow = r10(greatCircle(a[0], a[1], b[0], b[1]));
  const facts = placeFacts(zone, a, b);
  if (crow === 0) return [M.tools.sameSpot(a[2], b[2]), facts, []];
  const url = `https://www.openstreetmap.org/directions?route=${encodeURIComponent(`${a[0]},${a[1]};${b[0]},${b[1]}`)}`;
  facts.push(zone.fact('straight_line_distance', crow, 'm', 'computed', [url], { from: [a[0], a[1]], to: [b[0], b[1]], method: 'great circle' }));
  const [m, path] = route(zone, zone, A, B);
  if (m === null || path === null) return [M.tools.noRoute(M.metres(crow), a[2], b[2]), facts, [M.tools.noRouteUnknown]];
  const walk = r10(m);
  const ways = zone.pathWays(path);
  const ev = ways.length ? ways : ids('node', [zone.osmId(A.u), zone.osmId(A.v)]);
  const ratio = pyRound(walk / crow, 1);
  facts.push(zone.fact('walking_distance', walk, 'm', 'computed', ev, routeIn), zone.fact('walking_time', mins(m), 'min', 'computed', ev, routeIn),
    zone.fact('detour_ratio', ratio, 'ratio', 'computed', ev, routeIn));
  const bar = ratio >= 1.5 ? barriersOn(ctx, a, b).slice(0, 1) : [];
  const xing = railCrossed(zone, A, B, path);
  let text = M.tools.walking(M.metres(crow), ratio >= 1.5, M.metres(walk), mins(m));
  text += bar.length ? M.tools.inBetween(bar[0].short) : '.';
  if (xing.length) text += M.tools.crossOn(!!bar.length && bar[0].kind === 'railway', xing.map((p) => M.bridge(p.road)));
  text += M.tools.ratio(ratio);
  facts.push(...barrierFacts(zone, bar, a, b));
  for (const p of xing) {
    const own = ev.filter((w) => p.evidence.includes(w));
    facts.push(zone.fact('railway_crossing_on_route', M.bridge(p.road), null, 'computed', own.length ? own : p.evidence, routeIn));
  }
  facts.push(zone.fact('snap_distance', oa, 'm', 'computed', ids('node', [zone.osmId(A.u), zone.osmId(A.v)]), routeIn),
    zone.fact('snap_distance', ob, 'm', 'computed', ids('node', [zone.osmId(B.u), zone.osmId(B.v)]), routeIn));
  const off = ([[oa, a[2]], [ob, b[2]]] as [number, string][]).filter(([o]) => o).map(([o, n]) => M.tools.snapItem(M.metres(o), n));
  return [text, facts, off.length ? [M.tools.snapUnknown(off)] : []];
}

/** Railway crossing places the walked line itself crosses, snapped access pieces included. */
function railCrossed(zone: Zone, A: ReturnType<Zone['snap']>, B: ReturnType<Zone['snap']>, path: number[]) {
  const railU = zone.railUnion();
  if (!railU) return [];
  const ends = [A, B].map((s) => {
    const [p, q] = [zone.nxy(s.u), zone.nxy(s.v)];
    const len = dist(p, q);
    const f = len ? Math.min(1, s.su / len) : 0;
    return { x: p.x + f * (q.x - p.x), y: p.y + f * (q.y - p.y) };
  });
  const line = J.line([ends[0], ...path.map((n) => zone.nxy(n)), ends[1]]);
  const hit = line.intersection(railU);
  if (hit.isEmpty()) return [];
  return zone.railwayPlaces().filter((p) => p.pts.some((q) => dxy(hit, q) < 40));
}

// ---------- 2 barrier between ----------
function barrier(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M, session } = ctx;
  const [a, b] = pair(ctx, params);
  const bars = barriersOn(ctx, a, b);
  const facts = [...placeFacts(zone, a, b), ...barrierFacts(zone, bars, a, b)];
  if (!bars.length) return [M.tools.noBarrier(a[2], b[2]), facts, [M.tools.noBarrierUnknown]];
  let text = M.tools.barriers(bars.map((e) => e.long));
  const unknown: string[] = [];
  if (bars.some((e) => e.kind === 'railway')) {
    const pa = zone.xy(a[0], a[1]);
    const [wc, W, wname] = window(zone, session);
    const r = M.metres(W);
    const ps = zone.railwayPlaces().filter((p) => Math.min(...p.pts.map((q) => dist(q, wc))) <= W)
      .map((p) => ({ ...p, d: r10(Math.min(...p.pts.map((q) => dist(q, pa)))) })).sort((x, y) => x.d - y.d);
    text += ps.length ? M.tools.railPlaces(r, wname, ps.map((p) => M.tools.railPlaceItem(M.bridgePhrase(p.road, p.underpass), M.metres(p.d))))
      : M.tools.noRailPlace(r, wname);
    const railBar = bars.find((e) => e.kind === 'railway')!;
    facts.push(zone.fact('railway_crossing_places', ps.length, 'count', 'computed', ps.flatMap((p) => p.evidence).length ? ps.flatMap((p) => p.evidence) : bars[0].evidence,
      { graph: zone.graphInputs, railway: bars[0].name ?? railBar.name, cluster_m: 40, radius_m: W }, 'unknown'));
    for (const p of ps) {
      facts.push(zone.fact('railway_crossing_distance', p.d, 'm', 'computed', p.evidence,
        { graph: zone.graphInputs, from: [a[0], a[1]], method: 'straight line to nearest point', place: M.bridge(p.road) }));
    }
    facts.push(zone.fact('radius', W, 'm', 'unknown', [], { graph: zone.graphInputs }));
    unknown.push(M.tools.railPlacesUnknown(r, wname));
  }
  return [text, facts, unknown];
}

// ---------- 3 street continuity ----------
interface StreetInfo {
  label: string;
  ends: number[];
  dead: number[];
  names: string[];
  conn: string;
  metres: number;
  length: number;
  ev: string[];
  inputs: Record<string, unknown>;
  note: string;
  comp: 'complete' | 'unknown';
  unk: string[];
  facts: Fact[];
}

function nearNodes(zone: Zone, n: number, r: number): number[] {
  const out: number[] = [];
  const x = zone.x[n];
  const y = zone.y[n];
  for (let i = 0; i < zone.n; i++) if (Math.hypot(zone.x[i] - x, zone.y[i] - y) <= r) out.push(i);
  return out;
}

/** networkx Graph.edges order: each edge once, from the first of its nodes in node order. */
function edgesOf(g: MapGraph): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  for (const [n, nbrs] of g.adj) {
    for (const m of nbrs.keys()) if (!seen.has(m)) out.push([n, m]);
    seen.add(n);
  }
  return out;
}

function degreeOf(g: MapGraph, n: number): number {
  const nb = g.adj.get(n)!;
  return nb.size + (nb.has(n) ? 1 : 0);
}

/** A street's length, each carriageway once: the longer of its longest walkable piece and its straight span. */
function streetLength(zone: Zone, S: MapGraph): number {
  if (!S.size) return 0;
  const nodes = [...S.adj.keys()];
  const ends = nodes.filter((n) => degreeOf(S, n) === 1);
  if (!ends.length && nodes.every((n) => degreeOf(S, n) === 2)) {
    let total = 0;
    for (const [u, v] of edgesOf(S)) total += S.edge(u, v)!.len; // a loop
    return total;
  }
  let walk = 0;
  for (const n of ends.length ? ends : nodes) walk = Math.max(walk, ...distancesWithin(S, n, Infinity, byLength).values());
  let span = 0;
  for (const a of nodes) for (const b of nodes) span = Math.max(span, Math.hypot(zone.x[a] - zone.x[b], zone.y[a] - zone.y[b]));
  return Math.max(walk, span);
}

function streetInfo(ctx: Ctx, p: Place): StreetInfo {
  const { zone, M } = ctx;
  const name = p.name;
  const all: number[] = [];
  for (let e = 0; e < zone.edgeCount; e++) {
    const t = zone.etags(e);
    if (t.footway !== 'sidewalk' && t.footway !== 'crossing' && t.name === name) all.push(e);
  }
  // a service lane that carries the street's name is not the street itself
  const main = all.filter((e) => zone.etags(e).highway !== 'service');
  const S = new MapGraph();
  for (const e of main.length ? main : all) {
    const u = zone.eu(e);
    const v = zone.ev(e);
    const old = S.edge(u, v);
    if (!old || old.len > zone.elen(e)) S.addEdge(u, v, { len: zone.elen(e) });
  }
  const ends = [...S.adj.keys()].filter((n) => degreeOf(S, n) === 1);
  // degree 1 in the walk graph is not enough: where a road's pavements are mapped apart, the roadway stops but the
  // pavements go on, and there a junction lies within 30 m
  const junctions = new Map(ends.map((n) => [n, nearNodes(zone, n, 30).filter((m) => !S.hasNode(m) && zone.degree(m) >= 3)]));
  const loose = ends.filter((n) => zone.nodeTags(n).noexit !== 'yes' && !zone.boundary.has(n) && zone.degree(n) === 1 && !junctions.get(n)!.length);
  // a main road does not end in town: its roadway stops where the map allows no walking on it
  const opened = loose.filter((n) => MAIN.has(String(zone.etags(zone.edata(n, [...S.adj.get(n)!.keys()][0])).highway)));
  const dead = ends.filter((n) => zone.nodeTags(n).noexit === 'yes' || (loose.includes(n) && !opened.includes(n)));
  const names = new Set<string>();
  for (const n of ends) {
    if (dead.includes(n)) continue;
    const at = zone.degree(n) > 1 ? [n] : junctions.get(n)!;
    for (const x of at) {
      for (const y of zone.nbrs(x)) {
        if (S.edge(x, y)) continue;
        const l = zone.edgeLabel(x, y);
        if (!isGeneric(l) && l.name) names.add(lc(l.name));
      }
    }
  }
  names.delete(p.label);
  const sortedNames = [...names].map((s, i) => ({ s, i })).sort((a, b) => {
    const x = a.s.toLowerCase();
    const y = b.s.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a.i - b.i;
  }).map((x) => x.s);
  const metres = streetLength(zone, S);
  const ev = ids('way', edgesOf(S).map(([u, v]) => zone.eway(zone.edata(u, v))));
  const stIn = { graph: zone.graphInputs, street: name,
    method: 'street ends checked for other walkable links; length: the longer of the walk along its longest piece and the straight line between its farthest points' };
  let note = '';
  let nfacts: Fact[] = [];
  let comp: 'complete' | 'unknown' = 'complete';
  let unk: string[] = [];
  if (ends.some((n) => zone.boundary.has(n))) {
    note = M.tools.edgeNote;
    comp = 'unknown';
    unk = [M.tools.edgeUnknown];
  } else if (ends.some((n) => !zone.inAnswerArea(...zone.LL[n]))) {
    note = M.tools.beyondNote(M.metres(zone.answerRadius), centreName(zone));
    comp = 'unknown';
    nfacts = [radiusFact(zone)];
    unk = [M.tools.beyondUnknown];
  }
  if (opened.length) unk.push(M.tools.openedUnknown);
  const conn = M.tools.connections(sortedNames);
  const shown = sortedNames.slice(0, 5);
  return { label: p.label, ends, dead, names: shown, conn, metres, length: r10(metres), ev, inputs: stIn, note, comp, unk,
    facts: [placeFact(zone, p), ...nfacts, ...nameFacts(zone, M.lang, shown, stIn)] };
}

function continuity(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M } = ctx;
  if (!params.street) throw new PlaceError(M.places.whichStreet, M.places.noStreet);
  const st = streetInfo(ctx, findPlaces(zone, M, params.street, ['street'], M.places.whatStreet, ctx.session)[0]);
  const L = M.metres(st.length);
  let text: string;
  if (!st.ends.length) text = M.tools.loop(st.label, L);
  else if (st.dead.length) text = M.tools.deadEnds(st.label, L, st.dead.length, st.dead.length >= st.ends.length, st.conn);
  else text = M.tools.goesThrough(st.label, L, st.conn);
  text += st.note;
  const facts = [
    zone.fact('street_continuity', st.dead.length ? 'ends' : 'goes_through', null, 'computed', [...ids('node', st.ends.map((n) => zone.osmId(n))), ...st.ev], st.inputs, st.comp),
    zone.fact('street_length', st.length, 'm', 'computed', st.ev, st.inputs),
    ...st.facts,
  ];
  if (st.dead.length > 1) facts.push(zone.fact('dead_ends', st.dead.length, 'count', 'computed', ids('node', st.dead.map((n) => zone.osmId(n))), st.inputs, st.comp));
  const unknown = [...st.unk, ...(st.dead.some((n) => zone.nodeTags(n).noexit !== 'yes') ? [M.tools.noexitUnknown] : []), M.tools.pavementsUnknown];
  return [text, facts, unknown];
}

// ---------- 4 independent connections ----------
/** The walk graph with each crossing merged into its junction, so both pavements and the crossing count once. */
function junctionGraph(zone: Zone): { Q: Map<number, Set<number>>; rep: Int32Array } {
  return zone.memoize('tools.junctions', () => {
    const parent = new Int32Array(zone.n).map((_, i) => i);
    const weight = new Int32Array(zone.n).fill(1);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (items: number[]) => {
      const roots = [...new Set(items.map(find))].sort((a, b) => weight[b] - weight[a] || a - b);
      if (!roots.length) return;
      const root = roots[0];
      for (const r of roots.slice(1)) {
        weight[root] += weight[r];
        parent[r] = root;
      }
    };
    for (let e = 0; e < zone.edgeCount; e++) if (zone.etags(e).footway === 'crossing') union([zone.eu(e), zone.ev(e)]);
    // a railway bridge, its pavements and the underpass beside it: one passage
    for (const pl of zone.railwayPlaces(40, Infinity)) union(pl.edges.flatMap((e) => [zone.eu(e), zone.ev(e)]));
    const rep = new Int32Array(zone.n);
    for (let i = 0; i < zone.n; i++) rep[i] = find(i);
    const Q = new Map<number, Set<number>>();
    for (let e = 0; e < zone.edgeCount; e++) {
      const a = rep[zone.eu(e)];
      const b = rep[zone.ev(e)];
      if (a === b) continue;
      if (!Q.has(a)) Q.set(a, new Set());
      if (!Q.has(b)) Q.set(b, new Set());
      Q.get(a)!.add(b);
      Q.get(b)!.add(a);
    }
    return { Q, rep };
  });
}

/** Junctions within 40 m on foot of either end of the snapped edge, nearest first, capped. */
function areaOf(zone: Zone, s: ReturnType<Zone['snap']>, rep: Int32Array): Set<number> {
  const near = new Map<number, number>();
  for (const n of [s.u, s.v]) {
    for (const [m, d] of distancesWithin(zone, n, AREA_M)) near.set(m, Math.min(d, near.get(m) ?? d));
  }
  const order = [...near.keys()].map((m, i) => ({ m, i })).sort((a, b) => near.get(a.m)! - near.get(b.m)! || a.i - b.i).slice(0, AREA_CAP);
  return new Set(order.map((x) => rep[x.m]));
}

function junctionLabel(ctx: Ctx, nodes: number[]): string {
  const { zone, M } = ctx;
  const ways = new Set<string>();
  for (const n of nodes) for (const m of zone.nbrs(n)) for (const w of zone.pathWays([n, m])) ways.add(w);
  for (const pl of zone.railwayPlaces()) if (pl.evidence.some((e) => ways.has(e))) return M.bridge(pl.road);
  const counts = new Map<string, number>();
  for (const n of nodes) {
    for (const m of zone.nbrs(n)) {
      const l = zone.edgeLabel(n, m);
      const key = isGeneric(l) ? `\u0000${l.kind}` : lc(l.name!);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const names = [...counts.entries()].map(([s, c], i) => ({ s, c, i })).sort((a, b) => b.c - a.c || a.i - b.i)
    .map((x) => x.s).filter((s) => !s.startsWith('\u0000')).slice(0, 2);
  return !names.length ? M.tools.footpath : names.length === 1 ? names[0] : M.tools.corner(names[0], names[1]);
}

function connections(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M } = ctx;
  const [a, b] = pair(ctx, params);
  const A = zone.snap(a[0], a[1]);
  const B = zone.snap(b[0], b[1]);
  const { Q, rep } = junctionGraph(zone);
  const SA = areaOf(zone, A, rep);
  const TB = areaOf(zone, B, rep);
  const facts = placeFacts(zone, a, b);
  if ([...SA].some((n) => TB.has(n))) return [M.tools.samePlaceWays(a[2], b[2]), facts, []];
  const bset = new Set([...zone.boundary].map((n) => rep[n]));
  const [x0, y0] = [zone.x[A.u], zone.y[A.u]];
  const [x1, y1] = [zone.x[B.u], zone.y[B.u]];
  const keep = new Set<number>();
  for (let i = 0; i < zone.n; i++) {
    if (Math.abs(zone.x[i] - (x0 + x1) / 2) <= Math.abs(x1 - x0) / 2 + CONN_CROP_M
      && Math.abs(zone.y[i] - (y0 + y1) / 2) <= Math.abs(y1 - y0) / 2 + CONN_CROP_M && Q.has(i)) keep.add(i);
  }
  for (const n of [...SA, ...TB]) keep.add(n);
  const rim = new Set([...keep].filter((n) => Q.has(n) && [...Q.get(n)!].some((m) => !keep.has(m))));
  const sub = new Map<number, Set<number>>();
  for (const n of keep) if (Q.has(n)) sub.set(n, new Set([...Q.get(n)!].filter((m) => keep.has(m))));
  let res = minimumNodeCut(sub, SA, TB);
  const open = (side: Set<number>) => [...side].some((n) => bset.has(n) || rim.has(n));
  // a side closed inside the crop (no rim, no zone edge) makes the crop's cut exact for the zone; else the whole zone
  if (open(res.sourceSide) && open(res.sinkSide)) res = minimumNodeCut(Q, SA, TB);
  const cut = res.cut;
  const k = cut.size;
  const comp = ![...res.sourceSide].some((n) => bset.has(n)) || ![...res.sinkSide].some((n) => bset.has(n)) ? 'complete' : 'unknown';
  const members = new Map<number, number[]>();
  for (let n = 0; n < zone.n; n++) {
    if (cut.has(rep[n])) {
      if (!members.has(rep[n])) members.set(rep[n], []);
      members.get(rep[n])!.push(n);
    }
  }
  const [x, y] = [a[2], b[2]];
  const labels = k <= 2 ? [...members.values()].map((ns) => junctionLabel(ctx, ns)) : [];
  let text: string;
  if (k === 0) text = M.tools.noWay(x, y);
  else if (k === 1) text = M.tools.oneWay(x, y, labels[0]);
  else if (k === 2 && labels[0] === labels[1]) text = M.tools.twoSame(x, y, labels[0]);
  else if (k === 2) text = M.tools.two(x, y, labels[0], labels[1]);
  else text = M.tools.many(k, x, y);
  if (comp === 'unknown') text += k ? M.tools.outsideMore : M.tools.outsideAny;
  const cIn = { graph: zone.graphInputs, from: [a[0], a[1]], to: [b[0], b[1]], area_m: AREA_M,
    method: 'minimum node cut between the two areas, crossings merged into their junction' };
  const memberIds = [...members.values()].flat().map((n) => zone.osmId(n)).sort((p, q) => p - q);
  const evidence = memberIds.length ? ids('node', memberIds).slice(0, 20) : ids('node', [A.u, A.v, B.u, B.v].map((n) => zone.osmId(n)));
  facts.push(zone.fact('independent_ways', k, 'count', 'computed', evidence, cIn, comp), ...nameFacts(zone, M.lang, labels, cIn));
  const unknown = [...(comp === 'unknown' ? [M.tools.leaveUnknown] : []), M.tools.pavementSidesUnknown];
  return [text, facts, unknown];
}

// ---------- 5 extent ----------
/** The blocks the named roads enclose, near a geometry (where pavements are mapped apart the ring may stay open). */
function blockAround(zone: Zone, g: Geom): Geom | null {
  const pt = J.interiorPoint(g);
  const b = J.bounds(g);
  const m = 1000;
  const segs = zone.edgesInBox(b.minX - m, b.minY - m, b.maxX + m, b.maxY + m).filter((e) => zone.roadSet.has(e));
  if (!segs.length) return null;
  const faces = J.polygonize(J.unionAll(segs.map((e) => J.line(zone.eline(e)))));
  const p = J.point(pt);
  return faces.find((f) => p.within(f)) ?? null;
}

function extent(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M } = ctx;
  const q = params.place || params.street;
  if (!q) throw new PlaceError(M.places.which, M.places.notGiven);
  const p = findPlaces(zone, M, q, [...AREAS, 'street'], M.places.whatArea, ctx.session)[0];
  if (p.kind === 'street') {
    const st = streetInfo(ctx, p);
    const text = M.tools.streetExtent(st.label, M.metres(st.length), mins(st.metres), st.conn, st.note);
    const facts = [zone.fact('street_length', st.length, 'm', 'computed', st.ev, st.inputs, st.comp),
      zone.fact('street_walk_time', mins(st.metres), 'min', 'computed', st.ev, { ...st.inputs, speed_m_per_min: 80 }, st.comp), ...st.facts];
    return [text, facts, [...st.unk, M.tools.pavementsUnknown]];
  }
  const geom = p.geom;
  const spoken = M.tools.areaName(p.label, p.kind === 'construction site');
  const ring = J.buffer(geom.getBoundary(), BOUND_M);
  const rb = J.bounds(ring);
  const near = new Map<string, number>();
  const evidenceBy = new Map<string, number[]>();
  for (const e of zone.edgesInBox(rb.minX, rb.minY, rb.maxX, rb.maxY)) {
    if (!zone.roadSet.has(e)) continue;
    const l = J.line(zone.eline(e));
    if (!l.intersects(ring)) continue;
    const n = zone.etags(e).name;
    near.set(n, (near.get(n) ?? 0) + l.intersection(ring).getLength());
    if (!evidenceBy.has(n)) evidenceBy.set(n, []);
    evidenceBy.get(n)!.push(e);
  }
  const bound = [...near.entries()].sort((x, y) => y[1] - x[1]).filter(([, m]) => m >= BOUND_MIN).map(([n]) => n).slice(0, 4);
  const side = J.minRectLongestSide(geom);
  const outline = J.geomType(geom) === 'Polygon' ? geom.getExteriorRing() : geom.convexHull().getExteriorRing?.() ?? geom.convexHull().getBoundary();
  const perim = outline.getLength();
  const labels = bound.map((n) => lc(n));
  const block = blockAround(zone, geom);
  const fills = block !== null && geom.getArea() >= BLOCK_SHARE * block.getArea();
  const text = M.tools.extent(spoken, M.tools.extentWhere(labels, fills), mins(side), M.metres(r10(side)), mins(perim));
  const eIn = { place: p.label, method: 'minimum rotated rectangle and outline of the OSM area', speed_m_per_min: 80, snapshot: zone.snapshot };
  const bIn = { place: p.label, buffer_m: BOUND_M, min_length_m: BOUND_MIN, snapshot: zone.snapshot };
  const facts = [placeFact(zone, p),
    ...bound.map((n) => zone.fact('bounding_street', lc(n), null, 'computed', ids('way', evidenceBy.get(n)!.map((e) => zone.eway(e))).slice(0, 10), bIn)),
    zone.fact('longest_side', r10(side), 'm', 'computed', p.evidence, eIn),
    zone.fact('longest_side_time', mins(side), 'min', 'computed', p.evidence, eIn),
    zone.fact('walk_around_time', mins(perim), 'min', 'computed', p.evidence, eIn)];
  return [text, facts, [M.tools.entrancesUnknown]];
}

// ---------- 6 place info ----------
function placeInfo(ctx: Ctx, params: Record<string, unknown>): Result {
  const { zone, M, session } = ctx;
  let spec = params.place as Spec;
  if (typeof spec === 'string') spec = { name: spec };
  if (!given(spec)) throw new PlaceError(M.places.which, M.places.notGiven);
  const sp = spec as { name?: unknown; lat?: unknown; lon?: unknown };
  let p: Place | null = null;
  if (sp.lat !== undefined && sp.lat !== null && sp.lon !== undefined && sp.lon !== null) {
    // the map feature at that point, else its name
    const lat = Number(sp.lat);
    const lon = Number(sp.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new PlaceError(M.places.which, M.places.unusable);
    const pt = zone.xy(lat, lon);
    let best = Infinity;
    for (const q of places(zone, M.lang)) {
      if (q.kind === 'street') continue;
      const d = dxy(q.geom, pt);
      if (d <= 40 && d < best) {
        best = d;
        p = q;
      }
    }
  }
  p = p ?? findPlaces(zone, M, sp.name, null, M.places.whatPlace, session)[0];
  const o = session?.origin ?? [zone.center[0], zone.center[1], centreName(zone)];
  const d = r10(dist(placePoint(zone, p.geom), zone.xy(o[0], o[1])));
  const t = p.tags;
  const st = t && typeof t['addr:street'] === 'string' ? t['addr:street'] : null;
  const no = t && typeof t['addr:housenumber'] === 'string' ? t['addr:housenumber'] : null;
  const addr = st && no ? `${lc(st)} ${no}` : st ? lc(st) : null;
  const noun = M.tools.kindNoun(p.kind);
  const [raw, , phrase] = placeHours(M, t, ctx.now, ctx.timeZone);
  const w = wheelchair(t);
  const parts = [M.tools.placeInfo(p.name, addr, noun, M.metres(d))];
  if (raw) parts.push(M.tools.hoursSentence(phrase));
  if (w) parts.push(M.tools.wheelchair(M.tools.wheelchairValue(w)));
  const inputs = { origin: [o[0], o[1]], ...zone.featureInputs };
  const facts = [placeFact(zone, p), zone.fact('straight_line_distance', d, 'm', 'computed', p.evidence.slice(0, 20), inputs)];
  if (addr) facts.push(zone.fact('address', addr, null, 'map_tag', p.evidence.slice(0, 1), inputs));
  if (raw) facts.push(zone.fact('opening_hours', raw, null, 'map_tag', p.evidence.slice(0, 1), { ...inputs, tz: ctx.timeZone ?? 'local' }));
  const unknown = [...(raw ? [] : [M.tools.hoursUnknown]), ...(w ? [] : [M.tools.wheelchairUnknown])];
  return [parts.join(' '), facts, unknown];
}

const RUN: Record<Tool, (ctx: Ctx, params: Record<string, unknown>) => Result> = {
  walking_vs_straight_line: walking,
  barrier_between: barrier,
  street_continuity: continuity,
  independent_connections: connections,
  extent,
  place_info: placeInfo,
};

export interface AskOptions {
  aliases?: Aliases;
  now?: Date;
  /** IANA time zone for opening hours; default the device's. */
  timeZone?: string;
}

/** Runs one tool and returns an Answer. A place that cannot be used is answered with a question back. */
export function ask(zone: Zone, session: Session, tool: string, params: Record<string, unknown> | null | undefined, question: string | null,
  opts: AskOptions = {}) {
  if (!(TOOLS as readonly string[]).includes(tool)) throw new Error(`unknown tool ${tool}; expected one of ${TOOLS.join(', ')}`);
  const M = messages(session.lang);
  const p: Record<string, unknown> = { ...(params ?? {}) };
  for (const k of ['place', 'street']) {
    // the contract's place shape {name} is accepted wherever a bare name is
    const v = p[k] as { name?: unknown } | undefined;
    if (tool !== 'place_info' && v && typeof v === 'object' && typeof v.name === 'string') p[k] = v.name;
  }
  const ctx: Ctx = { zone, M, session, aliases: opts.aliases ?? {}, now: opts.now ?? zone.now(), timeZone: opts.timeZone };
  let text: string;
  let facts: Fact[];
  let unknown: string[];
  try {
    [text, facts, unknown] = RUN[tool as Tool](ctx, p);
  } catch (e) {
    if (!(e instanceof PlaceError)) throw e;
    [text, facts, unknown] = [e.message, e.facts, [e.unknown]];
  }
  return { question: question || M.tools.question(tool), lang: session.lang, tool, text, facts, unknown, meta: zone.meta() };
}

