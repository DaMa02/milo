/**
 * Routes under the user's constraints, the route they pick, a stop along it, and what changed.
 *
 * Every call returns the whole Plan (contracts/plan.schema.json), keeps it in session.plan and follows the number
 * rule: every number said is also a fact. Route ids keep their role across versions: B is the shortest walk, A the
 * walk under the constraints (or along main streets), C public transport from Transitous.
 */
import * as J from './geo/jsts';
import type { Geom } from './geo/jsts';
import { dist } from './geo/planar';
import { pyRound, type Pt } from './geo/projection';
import { MapGraph, SubGraph, type Graph } from './graph';
import { messages, type Messages } from './i18n';
import { centreName, mins, r10 } from './overview';
import { route } from './routing';
import type { Session } from './session';
import { featureKind, placeHours, PlaceError, resolvePlace, type Aliases } from './tools';
import { decodePolyline, fetchPlan, legMode, stopName, type CacheState, type TransitOptions } from './transit';
import { ids, type Crossing, type Fact, type Snap, type Zone } from './zone';
import { segSegDist } from './zone';

export const PLAN_KINDS = ['unsignalled_crossings', 'signals_without_sound', 'steps', 'construction', 'main_roads', 'transfers', 'walking_over_min'];
const STRENGTHS = ['avoid_when_possible', 'require'];
const TOLERANCE = { min: 5, pct: 25 };
type Pred = (x: Crossing) => boolean;
const BAD: Record<string, Pred> = {
  unsignalled_crossings: (x) => x.signals === 'no',
  signals_without_sound: (x) => x.signals === 'yes' && x.sound === 'no',
};
const UNK: Record<string, Pred> = {
  unsignalled_crossings: (x) => x.signals === 'unknown',
  signals_without_sound: (x) => x.signals !== 'no' && !BAD.signals_without_sound(x) && (x.signals === 'unknown' || x.sound === 'unknown'),
};
const PATH_KINDS = ['unsignalled_crossings', 'signals_without_sound', 'steps', 'main_roads', 'construction'];
const MAIN = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'trunk_link']);
const VIOLATION = 1e7; // fewest known violations, then fewest unknowns, then shortest
const UNKNOWN = 1e4;
const MAIN_PER_M = 1e4;
const XING_M = 10; // an OSM crossing node this close to a Transitous walking trace is on that trace
const PAVEMENT_M = 30; // a pavement (footway=sidewalk) this close to a main road runs along it
const SIDE_STREET_FACTOR = 1.3; // route A: a metre off main roads costs 1.3 metres, so it keeps to main streets
const CROP_M = 1200; // routes are searched in the box around their ends plus this margin
const CAND_N = 8; // places routed for stop candidates: the least straight-line detour among those near the route
const CORRIDOR_M = 300; // stop candidates lie this close to the selected route (when at least CAND_N do)
const MAIN_LABEL = 'along main streets';
export const DATETIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$/;
export const OSM_ID = /^(node|way|relation)\/([0-9]+)$/;

/** Nothing was applied. status: 404 no plan, 409 stale if_version, 422 bad input; the message is said to the user. */
export class PlanError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

export interface Constraint {
  kind: string;
  strength: string;
  value?: number;
}

export interface PlanOptions {
  transit?: TransitOptions;
  aliases?: Aliases;
  now?: () => Date;
  timeZone?: string;
}

// ---------- time ----------
const parseDt = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const at = (depart: string, minutes: number) => iso(new Date(parseDt(depart).getTime() + minutes * 60_000));
const between = (a: string, b: string) => pyRound((parseDt(b).getTime() - parseDt(a).getTime()) / 60_000);
const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);
const fmtG = (v: number) => String(v);

function where(zone: Zone): string {
  return centreName(zone);
}

function sayKind(M: Messages, kind: string, i: number, value?: number | null): string {
  const s = M.plan.say[kind][i] as string;
  return s.replace('{v}', value === undefined || value === null ? String(value) : fmtG(value));
}

/** A fact for every spoken name that contains a number, so the number rule holds for "via Brembo 12". */
function nameFacts(zone: Zone, items: [string, Fact['source'], string[]][]): Fact[] {
  return items.filter(([name]) => /\d/.test(name)).map(([name, src, ev]) => zone.fact('place_name', name, null, src, ev, { said_as: 'place name' }));
}

// ---------- graphs under constraints ----------
function construction(zone: Zone): { sites: Zone['features']; edges: Map<number, string[]> } {
  return zone.memoize('plan.construction', () => {
    const sites = zone.features.filter((f) => f.tags.landuse === 'construction');
    const edges = new Map<number, string[]>();
    for (const f of sites) {
      const b = J.bounds(f.geom);
      for (const e of zone.edgesInBox(b.minX, b.minY, b.maxX, b.maxY)) {
        if (!J.line(zone.eline(e)).intersects(f.geom)) continue;
        const k = pk(zone, zone.eu(e), zone.ev(e));
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k)!.push(`${f.element}/${f.id}`);
      }
    }
    return { sites, edges };
  });
}

function pk(zone: Zone, u: number, v: number): number {
  return u < v ? u * zone.n + v : v * zone.n + u;
}

/** Edges that walk along a main road: the road itself, or a pavement mapped beside it. */
function mainEdges(zone: Zone): Set<number> {
  return zone.memoize('plan.mainEdges', () => {
    const out = new Set<number>();
    const roads: number[] = [];
    for (let e = 0; e < zone.edgeCount; e++) {
      if (MAIN.has(String(zone.etags(e).highway))) {
        roads.push(e);
        out.add(pk(zone, zone.eu(e), zone.ev(e)));
      }
    }
    const roadSet = new Set(roads);
    for (let e = 0; e < zone.edgeCount; e++) {
      if (zone.etags(e).footway !== 'sidewalk') continue;
      const [a, b] = zone.eline(e);
      const near = zone.edgesInBox(Math.min(a.x, b.x) - PAVEMENT_M, Math.min(a.y, b.y) - PAVEMENT_M, Math.max(a.x, b.x) + PAVEMENT_M,
        Math.max(a.y, b.y) + PAVEMENT_M);
      if (near.some((r) => roadSet.has(r) && segSegDist(a, b, ...zone.eline(r)) <= PAVEMENT_M)) out.add(pk(zone, zone.eu(e), zone.ev(e)));
    }
    return out;
  });
}

function edgeBad(zone: Zone, kind: string, e: number): boolean {
  if (kind === 'steps') return zone.etags(e).highway === 'steps';
  const k = pk(zone, zone.eu(e), zone.ev(e));
  return kind === 'main_roads' ? mainEdges(zone).has(k) : construction(zone).edges.has(k);
}

type Box = [number, number, number, number];

function box(zone: Zone, ...snaps: Snap[]): Box {
  const pts = snaps.map((s) => zone.nxy(s.u));
  return [Math.min(...pts.map((p) => p.x)) - CROP_M, Math.min(...pts.map((p) => p.y)) - CROP_M,
    Math.max(...pts.map((p) => p.x)) + CROP_M, Math.max(...pts.map((p) => p.y)) + CROP_M];
}

function inBox(zone: Zone, b: Box): (n: number) => boolean {
  return (n) => zone.x[n] >= b[0] && zone.y[n] >= b[1] && zone.x[n] <= b[2] && zone.y[n] <= b[3];
}

/** A graph to route on: the zone itself (cropped per route), or a graph built for constraints. */
interface RouteGraph {
  g: Graph | null; // null: the whole zone graph, cropped to each route's box
  pen: Map<number, number>;
}

const ZONE_GRAPH: RouteGraph = { g: null, pen: new Map() };

type Key = [string, string][];

function keyOf(constraints: Constraint[], strength?: string): Key {
  return constraints.filter((c) => PATH_KINDS.includes(c.kind)).map((c) => [c.kind, strength ?? c.strength] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

/**
 * Walk graph inside the box for the constraints: "require" removes known violations, "avoid" makes each cost
 * 10,000 km (main roads: 10 km per metre); unknown crossings cost 10 km, so verified ways win ties. main: a metre off
 * main roads costs SIDE_STREET_FACTOR, unless main roads are to be avoided.
 */
function constrained(zone: Zone, key: Key, b: Box, main = false): RouteGraph {
  const memoKey = `plan.graph:${JSON.stringify([key, b, main])}`;
  const cache = zone.memoize('plan.graphs', () => new Map<string, RouteGraph>());
  const hit = cache.get(memoKey);
  if (hit) {
    cache.delete(memoKey);
    cache.set(memoKey, hit);
    return hit;
  }
  const keep = inBox(zone, b);
  let res: RouteGraph;
  if (!key.length && !main) res = { g: new SubGraph(zone, keep), pen: new Map() };
  else {
    const req = new Set(key.filter(([, s]) => s === 'require').map(([k]) => k));
    const kinds = new Set(key.map(([k]) => k));
    const cost = new Map<number, number | null>();
    for (const [n, x] of zone.crossings) {
      let c: number | null = 0;
      if ([...req].some((k) => BAD[k]?.(x))) c = null;
      else {
        for (const k of kinds) if (!req.has(k) && BAD[k]?.(x)) c += VIOLATION;
        for (const k of kinds) if (UNK[k]?.(x)) c += UNKNOWN;
      }
      cost.set(n, c);
    }
    const me = main && !kinds.has('main_roads') ? mainEdges(zone) : null;
    const g = new MapGraph();
    for (let e = 0; e < zone.edgeCount; e++) {
      const u = zone.eu(e);
      const v = zone.ev(e);
      if (!keep(u) || !keep(v)) continue;
      const cu = cost.has(u) ? cost.get(u)! : 0;
      const cv = cost.has(v) ? cost.get(v)! : 0;
      if (cu === null || cv === null) continue;
      const bad = ['steps', 'main_roads', 'construction'].filter((k) => kinds.has(k) && edgeBad(zone, k, e));
      if (bad.some((k) => req.has(k))) continue;
      const len = zone.elen(e);
      const f = me !== null && !me.has(pk(zone, u, v)) ? SIDE_STREET_FACTOR : 1.0;
      let penalty = 0;
      for (const k of bad) penalty += k === 'main_roads' ? MAIN_PER_M * len : VIOLATION;
      const w = len * f + (cu + cv) / 2 + penalty;
      const old = g.edge(u, v);
      if (!old || old.w! > w) g.addEdge(u, v, { len, w });
    }
    const pen = new Map<number, number>();
    for (const [n, c] of cost) if (c) pen.set(n, c);
    res = { g, pen };
  }
  cache.set(memoKey, res);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return res;
}

function routeOn(zone: Zone, H: RouteGraph, a: Snap, b: Snap): [number, number[]] | [null, null] {
  if (H.g === null) return route(zone, new SubGraph(zone, inBox(zone, box(zone, a, b))), a, b);
  return route(zone, H.g, a, b, H.pen);
}

// ---------- what a way passes ----------
interface Eval {
  xs: Crossing[];
  steps: string[];
  main: string[];
  mainM: number;
  constr: string[];
}

const evalOf = (xs: Crossing[] = []): Eval => ({ xs: [...xs], steps: [], main: [], mainM: 0, constr: [] });

function merge(...evs: Eval[]): Eval {
  const out = evalOf();
  for (const e of evs) {
    // each list gains what the lists merged so far lack (repeats within one evaluation stay, as the evidence of each edge)
    out.xs.push(...e.xs);
    out.steps.push(...e.steps.filter((w) => !out.steps.includes(w)));
    out.main.push(...e.main.filter((w) => !out.main.includes(w)));
    out.constr.push(...e.constr.filter((c) => !out.constr.includes(c)));
    out.mainM += e.mainM;
  }
  return out;
}

function pathEval(zone: Zone, path: number[]): Eval {
  const ce = construction(zone).edges;
  const me = mainEdges(zone);
  const e = evalOf(zone.pathCrossings(path));
  for (let i = 0; i + 1 < path.length; i++) {
    const u = path[i];
    const v = path[i + 1];
    if (!zone.hasEdge(u, v)) continue;
    const d = zone.edata(u, v);
    if (zone.etags(d).highway === 'steps') e.steps.push(...ids('way', [zone.eway(d)]));
    const k = pk(zone, u, v);
    if (me.has(k)) {
      e.main.push(...ids('way', [zone.eway(d)]));
      e.mainM += zone.elen(d);
    }
    e.constr.push(...(ce.get(k) ?? []));
  }
  return merge(e);
}

/**
 * Crossings and ways along a Transitous walking leg: mapped crossings within 10 m of its geometry, in order; graph
 * edges lying inside a 10 m buffer of it (main roads and their pavements only when longer than 20 m, so crossing one
 * is not walking along it); construction sites it touches.
 */
function traceEval(zone: Zone, geo: { points: string; precision: number }): Eval {
  const pts = decodePolyline(geo.points, geo.precision).map(([la, lo]) => zone.xy(la, lo));
  if (pts.length < 2) return evalOf();
  const trace = J.line(pts);
  const tb = J.bounds(trace);
  const proj = (p: Pt) => trace.distance(J.point(p)) <= XING_M;
  const onTrace: [number, number, Crossing][] = [];
  for (const [n, c] of zone.crossings) {
    const p = zone.nxy(n);
    if (p.x < tb.minX - XING_M || p.x > tb.maxX + XING_M || p.y < tb.minY - XING_M || p.y > tb.maxY + XING_M) continue;
    if (proj(p)) onTrace.push([projectAlong(pts, p), zone.osmId(n), c]);
  }
  onTrace.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const e = evalOf(onTrace.map((x) => x[2]));
  const me = mainEdges(zone);
  const buf = J.buffer(trace, XING_M);
  const bb = J.bounds(buf);
  for (const d of zone.edgesInBox(bb.minX, bb.minY, bb.maxX, bb.maxY)) {
    if (!buf.contains(J.line(zone.eline(d)))) continue;
    if (zone.etags(d).highway === 'steps') e.steps.push(...ids('way', [zone.eway(d)]));
    if (me.has(pk(zone, zone.eu(d), zone.ev(d))) && zone.elen(d) > 2 * XING_M) {
      e.main.push(...ids('way', [zone.eway(d)]));
      e.mainM += zone.elen(d);
    }
  }
  e.constr = construction(zone).sites.filter((f) => f.geom.intersects(trace)).map((f) => `${f.element}/${f.id}`);
  return merge(e);
}

function projectAlong(pts: Pt[], p: Pt): number {
  let best = Infinity;
  let measure = 0;
  let start = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = dist(a, b);
    const f = len ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len))) : 0;
    const q = { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    const d = dist(p, q);
    if (d < best) {
      best = d;
      measure = start + f * len;
    }
    start += len;
  }
  return measure;
}

// ---------- routes ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = Record<string, any>;

interface Ctx {
  zone: Zone;
  M: Messages;
  o: { name: string; lat: number; lon: number };
  d: { name: string; lat: number; lon: number };
  a: Snap;
  b: Snap;
  depart: string;
  cons: Constraint[];
  stop: Stop | null;
  rin: Record<string, unknown>;
  cache: CacheState[];
  snapEv: string[];
  mainB?: number;
  opts: PlanOptions;
}

interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  shop: boolean;
  noun: string;
  phrase: string;
  at: string;
  from: string;
  with: string;
  doing: string;
  after: string;
  min: number;
  snap: Snap;
  pt: { name: string; lat: number; lon: number };
  leg: Record<string, unknown>;
}

function leg(from: unknown, to: unknown, m: number, minutes?: number) {
  return { mode: 'foot', from, to, distance_m: r10(m), duration_min: minutes === undefined ? mins(m) : minutes, line: null, departure: null, arrival: null };
}

function foot(ctx: Ctx, rid: string, H: RouteGraph, m: number, path: number[], label: string): Route {
  const z = ctx.zone;
  const walk = mins(m);
  const ways = z.pathWays(path);
  return { id: rid, mode: 'foot', duration_min: walk, walk_min: walk, transfers: 0, leave_at: ctx.depart, arrive_at: at(ctx.depart, walk),
    legs: [leg(ctx.o, ctx.d, m, walk)], crossings: z.pathCrossings(path), _m: m, _p: path, _eval: pathEval(z, path),
    _ev: ways.length ? ways : ctx.snapEv, _in: { ...ctx.rin, filter: label }, _H: H, _label: label };
}

function footStop(ctx: Ctx, base: Route, stop: Stop): Route | null {
  const z = ctx.zone;
  const [m1, p1] = routeOn(z, base._H, ctx.a, stop.snap);
  const [m2, p2] = routeOn(z, base._H, stop.snap, ctx.b);
  if (m1 === null || m2 === null || p1 === null || p2 === null) return null;
  const det = mins(Math.max(0, m1 + m2 - base._m));
  const walk = base.walk_min + det;
  const xs = [...z.pathCrossings(p1), ...z.pathCrossings(p2)];
  const baseIds = new Set((base.crossings as Crossing[]).map((x) => x.osm_id));
  return { ...base, duration_min: walk + stop.min, walk_min: walk, arrive_at: at(ctx.depart, walk + stop.min),
    legs: [leg(ctx.o, stop.pt, m1), stop.leg, leg(stop.pt, ctx.d, m2, Math.max(0, walk - mins(m1)))], crossings: xs,
    _m: m1 + m2, _p: [...p1, ...p2], _det: det, _new: xs.filter((x) => !baseIds.has(x.osm_id)),
    _eval: merge(pathEval(z, p1), pathEval(z, p2)), _ev: [stop.id, ...z.pathWays(p1), ...z.pathWays(p2)],
    _in: { ...base._in, stop: stop.id, stop_duration_min: stop.min } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itinerary(js: any): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const its = ((js ?? {}).itineraries ?? []).filter((i: any) => i.legs.some((L: any) => L.mode !== 'WALK'));
  if (!its.length) return null;
  let best = its[0];
  for (const i of its) if (i.endTime < best.endTime) best = i;
  return best;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transitLegs(ctx: Ctx, itin: any, start: string): [Route[], number, Eval] {
  const legs: Route[] = [];
  let walkS = 0;
  const evs: Eval[] = [];
  for (const L of itin.legs) {
    const pt = Object.fromEntries(['from', 'to'].map((k) => [k, { name: stopName(L[k].name, start, ctx.d.name),
      lat: pyRound(L[k].lat, 6), lon: pyRound(L[k].lon, 6) }]));
    const line = L.routeShortName;
    legs.push({ mode: legMode(L.mode), from: pt.from, to: pt.to, distance_m: L.distance ? r10(L.distance) : null,
      duration_min: pyRound(L.duration / 60), line: line === undefined || line === null ? null : String(line), departure: L.startTime, arrival: L.endTime });
    if (L.mode === 'WALK') {
      walkS += L.duration;
      if (L.legGeometry) evs.push(traceEval(ctx.zone, L.legGeometry));
    }
  }
  return [legs, walkS, merge(...evs)];
}

function lines(M: Messages, legs: Route[]): [string, string] {
  const ride = legs.filter((L) => L.mode !== 'foot' && L.mode !== 'stop');
  return [M.plan.lines(ride.map((L) => (L.line ? `${M.plan.lineWord[L.mode]} ${L.line}` : M.plan.lineWord[L.mode]))), ride[0].from.name];
}

async function transit(ctx: Ctx): Promise<[Route | null, string, boolean]> {
  const { o, d, depart: t, zone: z } = ctx;
  const { url, json, state } = await fetchPlan(ctx.opts.transit ?? { offline: true }, [o.lat, o.lon], [d.lat, d.lon], t, { directModes: '' });
  ctx.cache.push(state);
  const js = state === 'hit' || state === 'live' ? json : null;
  const it = itinerary(js);
  if (!it) return [null, url, js !== null];
  const [legs, walkS, ev] = transitLegs(ctx, it, o.name);
  const [line, frm] = lines(ctx.M, legs);
  const extra = legs.filter((L) => L.line).map((L) => z.fact('transit_line', L.line, null, 'transit_api', [url], { request: url }));
  const wait0 = between(t, it.startTime);
  extra.push(z.fact('wait_before_leaving', wait0, 'min', 'transit_api', [url], { request: url, depart_at: t }));
  return [{ id: 'C', mode: 'transit', duration_min: between(t, it.endTime), walk_min: pyRound(walkS / 60), transfers: it.transfers,
    leave_at: it.startTime, arrive_at: it.endTime, legs, crossings: ev.xs, _eval: ev, _ev: [url], _extra: extra, _url: url,
    _in: { request: url, depart_at: t, graph: z.graphInputs, crossings_method: `OSM crossing nodes within ${XING_M} m of the Transitous walking leg geometry` },
    _say: [line, frm, wait0] }, url, true];
}

async function transitStop(ctx: Ctx, stop: Stop): Promise<[Route | null, string | null, boolean]> {
  const z = ctx.zone;
  const [m1, p1] = routeOn(z, ZONE_GRAPH, ctx.a, stop.snap);
  if (m1 === null || p1 === null) return [null, null, true];
  const t2 = at(ctx.depart, mins(m1) + stop.min);
  const { url, json, state } = await fetchPlan(ctx.opts.transit ?? { offline: true }, [stop.pt.lat, stop.pt.lon], [ctx.d.lat, ctx.d.lon], t2, { directModes: '' });
  ctx.cache.push(state);
  const js = state === 'hit' || state === 'live' ? json : null;
  const it = itinerary(js);
  if (!it) return [null, url, js !== null];
  const [legs2, walk2S, ev2] = transitLegs(ctx, it, stop.pt.name);
  const [line, frm] = lines(ctx.M, legs2);
  const wait = between(t2, it.startTime);
  const extra = legs2.filter((L) => L.line).map((L) => z.fact('transit_line', L.line, null, 'transit_api', [url], { request: url }));
  extra.push(z.fact('wait_after_stop', wait, 'min', 'transit_api', [url], { request: url, stop_ends_at: t2 }));
  return [{ id: 'C', mode: 'transit', duration_min: between(ctx.depart, it.endTime), walk_min: mins(m1) + pyRound(walk2S / 60),
    transfers: it.transfers, leave_at: ctx.depart, arrive_at: it.endTime, legs: [leg(ctx.o, stop.pt, m1), stop.leg, ...legs2],
    crossings: [...z.pathCrossings(p1), ...ev2.xs], _eval: merge(pathEval(z, p1), ev2), _ev: [stop.id, url, ...z.pathWays(p1)], _extra: extra,
    _url: url, _in: { graph: z.graphInputs, stop: stop.id, stop_duration_min: stop.min, request_after_stop: url,
      crossings_method: `walk to the stop on the OSM graph; after it, OSM crossing nodes within ${XING_M} m of the Transitous walking legs` },
    _say: [line, frm, wait], _after_stop: true }, url, true];
}

type Check = [Constraint, (string | null)[], string[]];

/** Known violations and unknowns of one constraint on one route, as lists of evidence (null when there is none). */
function check(c: Constraint, r: Route): [(string | null)[], string[]] {
  const k = c.kind;
  const e = r._eval as Eval;
  if (BAD[k]) return [e.xs.filter(BAD[k]).map((x) => x.osm_id), e.xs.filter(UNK[k]).map((x) => x.osm_id)];
  if (k === 'steps') return [e.steps, []];
  if (k === 'main_roads') return [e.main, []];
  if (k === 'construction') return [e.constr, []];
  if (k === 'transfers') return [new Array(r.transfers).fill(null), []];
  return [r.walk_min > (c.value ?? 0) ? [null] : [], []];
}

function phrase(M: Messages, kind: string, bad: unknown[], unk: unknown[], r: Route): string | null {
  const n = bad.length;
  const u = unk.length;
  if (kind === 'unsignalled_crossings' || kind === 'signals_without_sound') return M.plan.badCrossings(kind, n, u);
  if (kind === 'steps') return M.plan.steps(n);
  if (kind === 'main_roads') return M.plan.mainRoads(n, M.metres(r10(r._eval.mainM)));
  if (kind === 'construction') return M.plan.construction(n);
  if (kind === 'transfers' && r.mode === 'transit') return M.plan.transfers(n);
  return null;
}

function warning(M: Messages, kind: string, bad: unknown[], unk: unknown[], r: Route, c: Constraint): string[] {
  const n = bad.length;
  const u = unk.length;
  const out: string[] = [];
  if (kind === 'unsignalled_crossings') {
    if (n) out.push(M.plan.warnUnsignalled(n));
    if (u) out.push(M.plan.warnUnsignalledUnknown(u));
  } else if (kind === 'signals_without_sound') {
    if (n) out.push(M.plan.warnSilent(n));
    if (u) out.push(M.plan.warnSilentUnknown(u));
  } else if (kind === 'walking_over_min' && n) out.push(M.plan.warnWalking(r.walk_min, c.value ?? 0));
  else if (n && phrase(M, kind, bad, unk, r)) out.push(`${cap(phrase(M, kind, bad, unk, r)!)}.`);
  return out;
}

/** Statuses, trade-off, facts, summary and warnings of one route. */
function finish(ctx: Ctx, r: Route, shortest: number, fewest = false): Route {
  const { zone: z, cons, stop, M } = ctx;
  const ev = r._ev as string[];
  const rin = r._in;
  const src = r.mode === 'transit' ? 'transit_api' : 'computed';
  const checks: Check[] = cons.map((c) => [c, ...check(c, r)]);
  r.constraint_status = checks.map(([c, bad, unk]) => ({ kind: c.kind, status: bad.length ? 'violated' : unk.length ? 'unknown' : 'satisfied' }));
  const tk = cons.find((c) => BAD[c.kind])?.kind ?? 'unsignalled_crossings';
  const own = checks.find(([c]) => c.kind === tk);
  const [tb, tu] = own ? [own[1], own[2]] : check({ kind: tk, strength: 'avoid_when_possible' }, r);
  const extraMin = r.duration_min - shortest;
  r.trade_off = { extra_min: extraMin, violating_crossings: tb.length, unknown_crossings: tu.length };
  const xs = r.crossings as Crossing[];
  const tbIds = tb.filter((x): x is string => !!x);
  r.facts = [
    z.fact('route_duration', r.duration_min, 'min', src, ev, rin),
    z.fact('route_walk_time', r.walk_min, 'min', src, ev, rin),
    z.fact('route_crossings', xs.length, 'count', 'computed', xs.length ? xs.map((x) => x.osm_id) : ev, rin),
    z.fact('route_violating_crossings', tb.length, 'count', 'computed', tb.length ? tbIds : ev, { ...rin, constraint: tk }),
    z.fact('route_unknown_crossings', tu.length, 'count', 'computed', tu.length ? tu : ev, { ...rin, constraint: tk }),
    z.fact('route_extra_time', extraMin, 'min', 'computed', ev, rin),
    ...(r._extra ?? []),
  ];
  if ('_m' in r) r.facts.push(z.fact('route_distance', r10(r._m), 'm', 'computed', ev, rin));
  if (r.mode === 'foot' && !cons.some((c) => c.kind === 'main_roads')) {
    r.facts.push(z.fact('route_main_road_distance', r10(r._eval.mainM), 'm', 'computed', r._eval.main.length ? r._eval.main : ev, rin));
  }
  for (const [c, bad, unk] of checks) {
    if (c.kind === tk) continue;
    const cin = { ...rin, constraint: c.kind };
    const badIds = bad.filter((x): x is string => !!x);
    if (c.kind === 'main_roads') r.facts.push(z.fact('route_main_road_distance', r10(r._eval.mainM), 'm', 'computed', bad.length ? badIds : ev, cin));
    r.facts.push(z.fact('constraint_violations', bad.length, 'count', 'computed', badIds.length ? badIds : ev, cin));
    if (unk.length) r.facts.push(z.fact('constraint_unknown', unk.length, 'count', 'computed', unk, cin));
  }
  let said = checks.filter(([c, bad, unk]) => phrase(M, c.kind, bad, unk, r));
  if (!said.length) said = [[{ kind: tk, strength: 'avoid_when_possible' }, tb, tu]];
  const phr = said.map(([c, bad, unk]) => phrase(M, c.kind, bad, unk, r)).join(', ');
  r.warnings = [...said.flatMap(([c, bad, unk]) => warning(M, c.kind, bad, unk, r, c)),
    ...checks.filter(([c]) => c.kind === 'walking_over_min').flatMap(([c, bad, unk]) => warning(M, c.kind, bad, unk, r, c))];
  const dur = M.plan.duration(r.duration_min, stop ? stop.with : null);
  const fewestSaid = fewest && checks.some(([c, bad]) => PATH_KINDS.includes(c.kind) && bad.length);
  if (r.mode === 'foot' && r._label === 'shortest') r.summary = M.plan.shortest(r.id, !!r._same_main, dur, phr);
  else if (r.mode === 'foot' && String(r._label).endsWith(MAIN_LABEL) && r._eval.mainM > (ctx.mainB ?? 0)) {
    r.summary = M.plan.mainStreets(r.id, dur, extraMin, phr, fewestSaid);
  } else if (r.mode === 'foot') r.summary = M.plan.foot(r.id, dur, extraMin, phr, fewestSaid);
  else {
    const [line, frm, wait] = r._say as [string, string, number];
    r.facts.push(...nameFacts(z, [[frm, 'transit_api', [r._url]]]));
    if (r._after_stop) r.summary = M.plan.transitAfterStop(stop!.name, line, frm, dur, wait, r.walk_min, phr);
    else r.summary = M.plan.transit(line, frm, wait, r.duration_min, r.walk_min, phr);
  }
  r._checks = checks;
  return r;
}

function publicRoute(r: Route): Route {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')));
}

// ---------- the plan ----------
function stopPlace(zone: Zone, M: Messages, osmId: unknown): Omit<Stop, 'min' | 'snap' | 'pt' | 'leg'> {
  const m = typeof osmId === 'string' ? OSM_ID.exec(osmId) : null;
  const f = m ? zone.features.find((x) => x.element === m[1] && x.id === Number(m[2])) : undefined;
  if (!f) throw new PlanError(422, M.plan.errors.stopNotFound);
  const g = f.geom;
  const [lat, lon] = zone.ll(J.geomType(g) === 'Point' ? J.coords(g)[0] : J.centroid(g));
  if (!zone.inAnswerArea(lat, lon)) throw new PlanError(422, M.plan.errors.stopOutside(M.metres(zone.answerRadius), where(zone)));
  const shop = typeof f.tags.shop === 'string' ? f.tags.shop : null;
  const kind = shop === 'supermarket' ? 'supermarket' : shop ? 'shop' : 'place';
  const words = M.plan.stopPlace(typeof f.tags.name === 'string' ? f.tags.name : null, kind);
  return { id: osmId as string, lat, lon, shop: !!shop, ...words };
}

async function compute(zone: Zone, M: Messages, st: Doc, opts: PlanOptions, prev: Doc | null = null, op: string | null = null): Promise<Doc> {
  const { origin: o, destination: d, depart_at: depart } = st;
  const cons: Constraint[] = st.constraints;
  const a = zone.snap(o.lat, o.lon);
  const b = zone.snap(d.lat, d.lon);
  const rin = { graph: zone.graphInputs, origin: [o.lat, o.lon], destination: [d.lat, d.lon], speed_m_per_min: 80,
    origin_snap_m: pyRound(a.off), destination_snap_m: pyRound(b.off) };
  let stop: Stop | null = null;
  if (st.stop) {
    const sp = stopPlace(zone, M, st.stop.osm_id);
    const pt = { name: sp.name, lat: sp.lat, lon: sp.lon };
    stop = { ...sp, min: st.stop.duration_min, snap: zone.snap(sp.lat, sp.lon), pt,
      leg: { mode: 'stop', from: pt, to: pt, distance_m: null, duration_min: st.stop.duration_min, line: null, departure: null, arrival: null } };
  }
  const ctx: Ctx = { zone, M, o, d, a, b, depart, cons, stop, rin, cache: [], snapEv: ids('node', [zone.osmId(a.u), zone.osmId(b.u)]), opts };
  // foot: B always the shortest, A the route under the constraints, offered only when it is another way
  const key = keyOf(cons);
  const bx = stop ? box(zone, a, b, stop.snap) : box(zone, a, b);
  const [mB, pB] = routeOn(zone, ZONE_GRAPH, a, b);
  if (mB === null || pB === null) throw new PlanError(422, M.plan.errors.noWalk);
  const HA = constrained(zone, key, bx, true);
  const [mA, pA] = routeOn(zone, HA, a, b);
  const kinds = key.map(([k]) => k).join(', ');
  const main = kinds.includes('main_roads') ? 'shortest' : MAIN_LABEL;
  let feet: Route[] = [foot(ctx, 'B', ZONE_GRAPH, mB, pB, 'shortest')];
  if (mA !== null && pA !== null) feet.unshift(foot(ctx, 'A', HA, mA, pA, key.length ? `fewest known violations of ${kinds}, then ${main}` : main));
  ctx.mainB = feet[feet.length - 1]._eval.mainM;
  if (stop) feet = feet.map((r) => footStop(ctx, r, stop!)).filter((r): r is Route => r !== null);
  if (feet.length === 2 && JSON.stringify(feet[0]._p) === JSON.stringify(feet[1]._p)) {
    feet[1]._same_main = String(feet[0]._label).endsWith(MAIN_LABEL) && feet[1]._eval.mainM > 0;
    feet = feet.slice(1);
  }

  let unknown: string[] = [];
  const [C, url, answered] = stop ? await transitStop(ctx, stop) : await transit(ctx);
  const offline = !!(opts.transit?.offline ?? true);
  if (!C && url) {
    unknown.push(ctx.cache.includes('miss') && offline ? M.plan.busOffline : !answered ? M.plan.busFailed : M.plan.busNone(stop ? stop.from : null));
  }

  const shortest = feet.find((r) => r._label === 'shortest')?.duration_min ?? (feet.length ? feet[0].duration_min : 0);
  const single = cons.filter((c) => PATH_KINDS.includes(c.kind)).length === 1;
  const computed = [...feet, ...(C ? [C] : [])].map((r) => finish(ctx, r, shortest, single && r._label !== 'shortest'));
  const req = cons.filter((c) => c.strength === 'require');
  let dropped: [string, string[]][] = computed.map((r) => [r.id, (r._checks as Check[]).filter(([c, bad]) => bad.length && c.strength === 'require').map(([c]) => c.kind)]);
  dropped = dropped.filter(([, ks]) => ks.length);
  if (key.length && mA === null) dropped.unshift(['A', key.filter(([, s]) => s === 'require').map(([k]) => k)]); // route A itself is what the requirement removed
  const droppedIds = new Set(dropped.map(([id]) => id));
  const offered = computed.filter((r) => !droppedIds.has(r.id));
  const idsOffered = offered.map((r) => r.id);
  const short = offered.find((r) => r._label === 'shortest');
  for (const r of offered) {
    // the bus compared with our own shortest walk
    if (r.mode === 'transit' && !r._after_stop && short) r.summary = r.summary.slice(0, -1) + M.plan.transitCompare(short.id, short.duration_min);
  }
  const sel = idsOffered.includes(st.selected) ? st.selected : null;
  const busUnknown = !C && !answered; // offline miss or error: the bus may meet what the walks do not
  const comp = offered.some((r) => (r._checks as Check[]).every(([, bad, unk]) => !bad.length && !unk.length)) ? 'yes' : busUnknown ? 'unknown' : 'no';

  const facts: Fact[] = [
    zone.fact('radius', zone.dist, 'm', 'unknown', [], { graph: zone.graphInputs }),
    zone.fact('compliant_routes', offered.filter((r) => r.constraint_status.every((s: { status: string }) => s.status === 'satisfied')).length, 'count',
      'computed', [`node/${zone.osmId(a.u)}`], { ...rin, filter: 'every constraint satisfied' }, 'unknown'),
    ...cons.filter((c) => c.kind === 'walking_over_min').map((c) => zone.fact('walking_limit', c.value ?? null, 'min', 'unknown', [], { said_by_user: true })),
    ...nameFacts(zone, [[o.name, 'unknown', []], [d.name, 'unknown', []]]),
  ];
  unknown = [M.plan.farther(M.metres(zone.dist), where(zone)), M.plan.unmapped, ...unknown];

  // what the map says about every way, not only the offered ones
  const everyK = key.map(([k]) => k).filter((k) => M.plan.say[k][4] && routeOn(zone, constrained(zone, [[k, 'require']], bx), a, b)[0] === null);
  const every = everyK.map((k) => sayKind(M, k, 4));
  let fewestRoute: Route | null = null;
  if (req.length && !offered.length) {
    // the way to offer instead: fewest violations of a required path kind, else the shortest walk
    const pathReq = req.some((c) => PATH_KINDS.includes(c.kind));
    const HF = pathReq ? constrained(zone, keyOf(cons, 'avoid_when_possible'), bx) : ZONE_GRAPH;
    const [mF, pF] = routeOn(zone, HF, a, b);
    let fr: Route | null = mF !== null && pF !== null ? foot(ctx, pathReq ? 'A' : 'B', HF, mF, pF, pathReq ? 'fewest known violations' : 'shortest') : null;
    if (fr && stop) fr = footStop(ctx, fr, stop);
    if (fr) {
      fewestRoute = finish(ctx, fr, shortest);
      facts.push(...(fewestRoute.facts as Fact[]).filter((f) => ['route_duration', 'route_violating_crossings', 'route_unknown_crossings',
        'route_main_road_distance', 'constraint_violations', 'constraint_unknown'].includes(f.type)));
    }
  }

  // the stop, measured on the selected route (or the first one offered, or the one offered instead)
  let stopDoc = null;
  let det = 0;
  let newUnknown: Crossing[] = [];
  if (stop) {
    const on = offered.find((r) => r.id === sel) ?? (offered.length ? offered[0] : fewestRoute);
    let method = 'A->S->B minus A->B';
    const baseC = on && on.mode === 'transit' ? (await transit({ ...ctx, stop: null }))[0] : null;
    if (on && on.mode === 'foot') {
      det = on._det;
      newUnknown = (on._new as Crossing[]).filter((x) => x.signals === 'unknown');
    } else if (baseC) {
      det = Math.max(0, on!.walk_min - baseC.walk_min);
      method = 'walking of route C with the stop minus without it';
    } else {
      const g = footStop(ctx, foot(ctx, 'B', ZONE_GRAPH, mB, pB, 'shortest'), stop);
      det = g ? g._det : 0;
      method = 'A->S->B minus A->B on the shortest walk';
    }
    stopDoc = { place: stop.name, osm_id: stop.id, detour_min: det, duration_min: stop.min };
    const stopIn = { ...rin, stop: stop.id, stop_point: [stop.lat, stop.lon], route: on ? on.id : null, method };
    facts.push(zone.fact('stop_detour', det, 'min', 'computed', [stop.id, ...(on ? (on._ev as string[]).slice(0, 20) : [])], stopIn),
      zone.fact('stop_duration', stop.min, 'min', 'unknown', [], { said_by_user: true }),
      zone.fact('stop_new_unknown_crossings', newUnknown.length, 'count', 'computed', newUnknown.length ? newUnknown.map((x) => x.osm_id) : [stop.id], stopIn),
      ...nameFacts(zone, [[stop.name, 'map_tag', [stop.id]]]));
    if (stop.shop) unknown.push(M.plan.stopHours(stop.noun));
  }

  const signalled = computed.flatMap((r) => (r.crossings as Crossing[]).filter((x) => x.signals !== 'no'));
  if (req.some((c) => BAD[c.kind]) && signalled.length && signalled.filter((x) => x.sound === 'unknown').length > signalled.length / 2) {
    unknown.push(M.plan.soundMostly);
  }

  // text
  const dname = d.name;
  let parts: string[] = [];
  if (every.length) parts.push(M.plan.every(dname, every));
  if (!offered.length) {
    const reqs = req.length ? M.joinAnd(req.map((c) => sayKind(M, c.kind, 1, c.value))) : null;
    const so = req.some((c) => everyK.includes(c.kind)); // "So" only when the sentence before implies it
    parts.push(M.plan.noneMeets(busUnknown, so, reqs, busUnknown));
    if (fewestRoute) {
      if (stop) parts.push(M.plan.withStop(stop.at, stop.min));
      const dur = M.plan.duration(fewestRoute.duration_min, stop ? stop.with : null);
      if (fewestRoute._label === 'shortest') parts.push(M.plan.shortestWalk(fewestRoute.id, dur));
      else {
        const checks = fewestRoute._checks as Check[];
        let fp = checks.map(([c, bad, unk]) => phrase(M, c.kind, bad, unk, fewestRoute!)).filter(Boolean).join(', ');
        if (!fp) {
          const [b0, u0] = check({ kind: 'unsignalled_crossings', strength: 'avoid_when_possible' }, fewestRoute);
          fp = phrase(M, 'unsignalled_crossings', b0, u0, fewestRoute)!;
        }
        parts.push(M.plan.fewest(fewestRoute.id, dur, fp));
      }
    }
    if (req.length) parts.push(M.plan.relax);
  } else {
    if (!every.length && cons.length && comp !== 'yes') {
      const unsure = offered.some((r) => (r._checks as Check[]).some(([, , unk]) => unk.length));
      parts.push(M.plan.notVerified(busUnknown, dname, unsure, busUnknown));
    }
    if (stop) parts.push(M.plan.withStop(stop.at, stop.min));
    parts.push(...offered.map((r) => r.summary));
    if (op === 'select' && sel) parts = [M.plan.chose(sel), offered.find((r) => r.id === sel)!.summary];
    else if (sel) parts.push(M.plan.chose(sel));
    else {
      const tol = st.detour_tolerance;
      const A_ = offered.find((r) => r.id === 'A' && r.mode === 'foot');
      const B_ = offered.find((r) => r.id === 'B' && r.mode === 'foot');
      if (A_ && B_ && A_.trade_off.extra_min > Math.max(tol.min, (B_.duration_min * tol.pct) / 100)) {
        const pa = (A_._checks as Check[]).map(([c, bad, unk]) => phrase(M, c.kind, bad, unk, A_)).filter(Boolean).join(', ');
        const pb = (B_._checks as Check[]).map(([c, bad, unk]) => phrase(M, c.kind, bad, unk, B_)).filter(Boolean).join(', ');
        parts.push(M.plan.tradeOff(A_.trade_off.extra_min, pa, pb));
      }
      parts.push(offered.length > 1 ? M.plan.whichOne : M.plan.wantRoute(offered[0].id));
    }
  }

  const cacheState = ctx.cache.includes('miss') || ctx.cache.includes('error') ? 'miss'
    : ctx.cache.length && ctx.cache.every((c) => c === 'hit') ? 'hit' : 'none';
  const doc: Doc = {
    origin: o, destination: d, depart_at: depart, lang: M.lang, plan_version: st.version, constraints: cons,
    detour_tolerance: st.detour_tolerance, text: parts.join(' '), routes: offered.map(publicRoute), compliant_route_available: comp,
    selected_route_id: sel, stop: stopDoc, stop_candidates: [], differences: [], facts, unknown,
    meta: zone.meta(offline ? 'offline' : 'live', cacheState),
  };
  if (prev !== null) doc.differences = differences(zone, M, prev, doc, st, dropped, stop, newUnknown);
  return doc;
}

/** What changed since `prev`; the numbers said are added to doc.facts. */
function differences(zone: Zone, M: Messages, prev: Doc, doc: Doc, st: Doc, dropped: [string, string[]][], stop: Stop | null,
  newUnknown: Crossing[]): string[] {
  const out: string[] = [];
  const facts: Fact[] = doc.facts;
  const was = new Map<string, Route>(prev.routes.map((r: Route) => [r.id, r]));
  const now = new Map<string, Route>(doc.routes.map((r: Route) => [r.id, r]));
  const sel = doc.selected_route_id;
  const psel = prev.selected_route_id;
  const before = (rid: string, value: number) => {
    facts.push(zone.fact('route_duration_before', value, 'min', 'computed', now.get(rid)!.facts[0].evidence.slice(0, 5), { route: rid, version: prev.plan_version }));
  };
  if (sel && sel !== psel) out.push(M.plan.chose(sel));
  if (prev.depart_at !== doc.depart_at) {
    // said relative to the previous time: no clock times
    const total = Math.abs(between(prev.depart_at, doc.depart_at));
    const h = Math.floor(total / 60);
    const m = total % 60;
    out.push(M.plan.diffLeave(h, m, doc.depart_at > prev.depart_at));
    const tin = { depart_at: doc.depart_at, previous_depart_at: prev.depart_at };
    if (h) facts.push(zone.fact('departure_change_hours', h, null, 'unknown', [], { ...tin, unit: 'hour' }));
    if (m) facts.push(zone.fact('departure_change', m, 'min', 'unknown', [], tin));
  }
  const told = new Set<string>();
  const oldC = new Map<string, Constraint>(prev.constraints.map((c: Constraint) => [c.kind, c]));
  const newC = new Map<string, Constraint>(doc.constraints.map((c: Constraint) => [c.kind, c]));
  const same = (x?: Constraint, y?: Constraint) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  for (const [k, c] of newC) {
    const p = oldC.get(k);
    if (same(c, p)) continue;
    if (c.strength === 'require') {
      const gone = dropped.filter(([rid, ks]) => ks.includes(k) && was.has(rid)).map(([rid]) => rid);
      for (const g of gone) told.add(g);
      out.push(M.plan.diffRequired(sayKind(M, k, 2, c.value), gone, M.plan.say[k][3] as string));
    } else if (p && p.strength === 'require') out.push(M.plan.diffRelaxed(sayKind(M, k, 2, p.value), sayKind(M, k, 0, c.value)));
    else out.push(M.plan.diffAvoid(sayKind(M, k, 0, c.value)));
  }
  for (const [k, p] of oldC) {
    if (p.value !== undefined && p.value !== null && !same(p, newC.get(k))) {
      facts.push(zone.fact('previous_walking_limit', p.value, 'min', 'unknown', [], { said_by_user: true }));
    }
    if (!newC.has(k)) out.push(p.strength === 'require' ? M.plan.diffNotRequired(sayKind(M, k, 2, p.value)) : M.plan.diffNotAvoided(sayKind(M, k, 0, p.value)));
  }
  if (JSON.stringify(prev.detour_tolerance) !== JSON.stringify(doc.detour_tolerance)) {
    // in minutes on route B, as the text weighs A against B
    const tol = doc.detour_tolerance;
    const b = now.get('B');
    let n = pyRound(b ? Math.max(tol.min, (b.duration_min * tol.pct) / 100) : tol.min, 1);
    n = Number.isInteger(n) ? n : n;
    out.push(M.plan.diffTolerance(n));
    facts.push(zone.fact('detour_tolerance', n, 'min', 'unknown', [], { said_by_user: true, ...tol, shortest_min: b ? b.duration_min : null }));
  }
  const ps = prev.stop;
  const ns = doc.stop;
  let deltaSel: number | null = null;
  if (ns && (!ps || ps.osm_id !== ns.osm_id)) {
    let s = M.plan.diffStopAdded(ns.place, ps ? ps.place : null);
    if (sel && was.has(sel) && now.has(sel)) {
      before(sel, was.get(sel)!.duration_min);
      s += M.plan.diffStopRoute(sel, now.get(sel)!.duration_min, was.get(sel)!.duration_min, ns.detour_min, ns.duration_min, stop!.doing);
    }
    out.push(`${s}.`);
    if (now.has('C') && was.has('C')) out.push(M.plan.diffBusAfterStop(stop!.after));
    if (newUnknown.length) out.push(M.plan.diffStopUnknown(stop!.noun, stop!.from, newUnknown.length));
    for (const id of now.keys()) told.add(id); // the durations are all new: said by the summaries
  } else if (ns && ps && ns.duration_min !== ps.duration_min) {
    let s = M.plan.diffStopDuration(ns.place, ns.duration_min, ps.duration_min);
    facts.push(zone.fact('previous_stop_duration', ps.duration_min, 'min', 'unknown', [], { said_by_user: true }));
    if (sel && was.has(sel) && now.has(sel)) {
      before(sel, was.get(sel)!.duration_min);
      s += M.plan.diffRouteTakes(sel, now.get(sel)!.duration_min, was.get(sel)!.duration_min);
      deltaSel = now.get(sel)!.duration_min - was.get(sel)!.duration_min;
      told.add(sel);
    }
    out.push(`${s}.`);
  } else if (ps && !ns) {
    let s = M.plan.diffStopRemoved(ps.place);
    if (sel && was.has(sel) && now.has(sel)) {
      before(sel, was.get(sel)!.duration_min);
      s += M.plan.diffRouteTakes(sel, now.get(sel)!.duration_min, was.get(sel)!.duration_min);
      deltaSel = now.get(sel)!.duration_min - was.get(sel)!.duration_min;
      told.add(sel);
    }
    out.push(`${s}.`);
  }
  for (const [rid, r] of now) {
    if (told.has(rid)) continue;
    if (!was.has(rid)) out.push(M.plan.diffOffered(rid));
    else if (r.duration_min !== was.get(rid)!.duration_min && r.duration_min - was.get(rid)!.duration_min !== deltaSel) {
      before(rid, was.get(rid)!.duration_min);
      out.push(M.plan.diffTakes(rid, r.duration_min, was.get(rid)!.duration_min));
    }
  }
  for (const rid of was.keys()) {
    if (!now.has(rid) && !told.has(rid)) out.push(rid === psel ? M.plan.diffChosenGone(rid) : M.plan.diffGone(rid));
  }
  return out;
}

// ---------- input ----------
function nowDepart(now: Date): string {
  const t = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  return iso(t.getTime() < now.getTime() ? new Date(t.getTime() + 60_000) : t);
}

function depart(M: Messages, v: unknown, now: Date): string {
  if (v === null || v === undefined) return nowDepart(now);
  if (typeof v !== 'string' || !DATETIME.test(v) || Number.isNaN(parseDt(v).getTime())) throw new PlanError(422, M.plan.errors.departure);
  return iso(parseDt(v));
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function constraintsOf(M: Messages, v: unknown): Constraint[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new PlanError(422, M.plan.errors.constraints);
  const out = new Map<string, Constraint>();
  for (const c of v) {
    if (!c || typeof c !== 'object' || !PLAN_KINDS.includes(c.kind)) throw new PlanError(422, M.plan.errors.kinds);
    const s = c.strength || 'avoid_when_possible';
    if (!STRENGTHS.includes(s)) throw new PlanError(422, M.plan.errors.strength);
    const item: Constraint = { kind: c.kind, strength: s };
    if (c.kind === 'walking_over_min') {
      if (!isNumber(c.value)) throw new PlanError(422, M.plan.errors.walkingLimit);
      item.value = c.value;
    }
    out.set(c.kind, item); // one per kind: the last one said wins, in the place of the first

  }
  return [...out.values()];
}

function tolerance(M: Messages, v: unknown, dflt: { min: number; pct: number }) {
  if (v === null || v === undefined) return { ...dflt };
  const t = v as { min?: unknown; pct?: unknown };
  if (typeof v !== 'object' || !isNumber(t.min) || !isNumber(t.pct)) throw new PlanError(422, M.plan.errors.tolerance);
  return { min: t.min, pct: t.pct };
}

function point(zone: Zone, M: Messages, spec: unknown, session: Session, opts: PlanOptions) {
  try {
    const [lat, lon, name] = resolvePlace(zone, M, spec as never, session, opts.aliases ?? {});
    return { name, lat, lon };
  } catch (e) {
    if (e instanceof PlaceError) throw new PlanError(422, e.message);
    throw new PlanError(422, M.plan.errors.place);
  }
}

function current(M: Messages, session: Session, ifVersion?: number | null): Doc {
  if (!session.plan) throw new PlanError(404, M.plan.errors.noPlan);
  if (ifVersion !== undefined && ifVersion !== null && ifVersion !== session.plan.plan_version) throw new PlanError(409, M.plan.errors.stale);
  return session.plan;
}

function stateOf(doc: Doc) {
  return { origin: doc.origin, destination: doc.destination, depart_at: doc.depart_at, constraints: doc.constraints,
    detour_tolerance: doc.detour_tolerance, selected: doc.selected_route_id, version: doc.plan_version,
    stop: doc.stop ? { osm_id: doc.stop.osm_id, duration_min: doc.stop.duration_min } : null };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

async function apply(zone: Zone, M: Messages, session: Session, st: Doc, op: string, opts: PlanOptions): Promise<Doc> {
  const prev = session.plan;
  const next = { ...st, version: prev.plan_version + 1 };
  session.plan = await compute(zone, M, clone(next), opts, prev, op); // computed fully before it replaces the old plan
  return clone(session.plan);
}

// ---------- the API ----------
export async function createPlan(zone: Zone, session: Session, args: { destination?: unknown; origin?: unknown; depart_at?: unknown;
  constraints?: unknown; detour_tolerance?: unknown } = {}, opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const destination = args.destination ?? session.destination;
  const dd = destination as { lat?: unknown; name?: unknown } | null | undefined;
  if (!destination || (typeof destination === 'object' && (dd!.lat === undefined || dd!.lat === null) && !dd!.name)) {
    throw new PlanError(422, M.plan.errors.whereTo);
  }
  const o = point(zone, M, args.origin, session, opts);
  const d = point(zone, M, destination, session, opts);
  if (o.lat === d.lat && o.lon === d.lon) throw new PlanError(422, M.plan.errors.samePlace(o.name, d.name));
  const now = opts.now ? opts.now() : zone.now();
  const st = { origin: o, destination: d, depart_at: depart(M, args.depart_at, now), constraints: constraintsOf(M, args.constraints),
    detour_tolerance: tolerance(M, args.detour_tolerance, TOLERANCE), selected: null, stop: null, version: 1 };
  session.plan = await compute(zone, M, st, opts);
  return clone(session.plan);
}

export function getPlan(_zone: Zone, session: Session): Doc {
  return clone(current(messages(session.lang), session, null));
}

export async function selectRoute(zone: Zone, session: Session, routeId: string, ifVersion?: number | null, opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const doc = current(M, session, ifVersion);
  const offered = doc.routes.map((r: Route) => r.id);
  if (!offered.includes(routeId)) throw new PlanError(422, M.plan.errors.noSuchRoute(routeId, offered.length > 0));
  if (routeId === doc.selected_route_id) return clone(doc);
  return apply(zone, M, session, { ...stateOf(doc), selected: routeId }, 'select', opts);
}

export async function stopCandidates(zone: Zone, session: Session, kind = 'supermarket', ifVersion?: number | null, opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const doc = current(M, session, ifVersion);
  if (!M.plan.nouns[kind]) throw new PlanError(422, M.plan.errors.lookFor(Object.values(M.plan.nouns)));
  const sel = doc.selected_route_id;
  const many = M.plan.nouns[kind];
  if (!sel) throw new PlanError(422, M.plan.errors.chooseFirstLook(many));
  const { origin: o, destination: d } = doc;
  const a = zone.snap(o.lat, o.lon);
  const b = zone.snap(d.lat, d.lon);
  let H = sel === 'A' ? constrained(zone, keyOf(doc.constraints), box(zone, a, b), true) : ZONE_GRAPH;
  let [m0, p0] = routeOn(zone, H, a, b);
  if (m0 === null) {
    // require: route A's own graph has no way
    H = ZONE_GRAPH;
    [m0, p0] = routeOn(zone, H, a, b);
  }
  const pa = zone.xy(o.lat, o.lon);
  const pb = zone.xy(d.lat, d.lon);
  const lineGeom: Geom = p0 && p0.length > 1 ? J.line(p0.map((n) => zone.nxy(n))) : J.line([pa, pb]);
  const near: { dd: number; f: Zone['features'][number]; lat: number; lon: number; inCorridor: boolean }[] = [];
  for (const f of zone.features) {
    if (featureKind(f.tags) !== kind) continue;
    if (kind !== 'atm' && typeof f.tags.name !== 'string') continue;
    const p = J.geomType(f.geom) === 'Point' ? J.coords(f.geom)[0] : J.centroid(f.geom);
    const [lat, lon] = zone.ll(p);
    if (zone.inAnswerArea(lat, lon)) near.push({ dd: dist(p, pa) + dist(p, pb), f, lat, lon, inCorridor: lineGeom.distance(J.point(p)) <= CORRIDOR_M });
  }
  const pool = near.filter((x) => x.inCorridor).length >= CAND_N ? near.filter((x) => x.inCorridor) : near;
  const found: { detM: number; name: string; street: string | null; id: string; lat: number; lon: number; path: number[]; hours: [string | null, boolean | null, string] }[] = [];
  const now = opts.now ? opts.now() : zone.now();
  for (const x of pool.map((y, i) => ({ y, i })).sort((p, q) => p.y.dd - q.y.dd || p.i - q.i).slice(0, CAND_N).map((z) => z.y)) {
    const s = zone.snap(x.lat, x.lon);
    const [m1, p1] = routeOn(zone, H, a, s);
    const [m2, p2] = routeOn(zone, H, s, b);
    if (m1 === null || m2 === null || p1 === null || p2 === null) continue;
    const t = x.f.tags;
    const name = typeof t.name === 'string' ? t.name : M.plan.unnamedCandidate(M.plan.noun[kind]);
    const street = typeof t['addr:street'] === 'string' ? t['addr:street'] : zone.roadName(x.f.geom, 60);
    found.push({ detM: m1 + m2 - m0!, name, street, id: `${x.f.element}/${x.f.id}`, lat: x.lat, lon: x.lon, path: [...p1, ...p2],
      hours: placeHours(M, t, now, opts.timeZone) });
  }
  const top = found.map((c, i) => ({ c, i })).sort((p, q) => p.c.detM - q.c.detM || p.i - q.i).slice(0, 3).map((x) => x.c);
  for (const c of top) {
    // two shops with one name are told apart by their street (renamed one by one, as they are counted)
    if (top.filter((k) => k.name === c.name).length > 1 && c.street) c.name = M.plan.onStreet(c.name, c.street);
  }
  const cand = top.map((c) => ({ place: c.name, osm_id: c.id, lat: c.lat, lon: c.lon, detour_min: mins(Math.max(0, c.detM)) }));
  const rin = { graph: zone.graphInputs, origin: [o.lat, o.lon], destination: [d.lat, d.lon], speed_m_per_min: 80, route: sel,
    method: `A->S->B minus A->B${H.g === null && sel !== 'B' ? ' on the shortest walk' : ''}` };
  const cfacts: Fact[] = [
    ...cand.map((c, i) => zone.fact('stop_candidate_detour', c.detour_min, 'min', 'computed', [c.osm_id, ...zone.pathWays(top[i].path).slice(0, 20)],
      { ...rin, stop: c.osm_id })),
    ...nameFacts(zone, cand.map((c) => [c.place, 'map_tag', [c.osm_id]] as [string, Fact['source'], string[]])),
    ...cand.filter((_, i) => top[i].hours[0]).map((c) => zone.fact('opening_hours', top[cand.indexOf(c)].hours[0], null, 'map_tag', [c.osm_id],
      { stop: c.osm_id, tz: opts.timeZone ?? 'local' })),
  ];
  const OPEN = M.plan.candidatesOpen(many);
  const out = clone(doc);
  out.stop_candidates = cand;
  const nearRoute = M.plan.nearRoute(sel);
  out.text = cand.length ? M.plan.candidates(many, nearRoute, cand.map((c, i) => M.plan.candidate(c.place, c.detour_min, top[i].hours[2])), sel === 'C')
    : M.plan.noCandidate(kind, M.plan.noun[kind], nearRoute);
  out.facts = [...out.facts.filter((f: Fact) => f.type !== 'stop_candidate_detour'), ...cfacts];
  out.unknown = [...out.unknown.filter((u: string) => u !== OPEN), ...(cand.length ? [OPEN] : [])];
  session.plan = out;
  return clone(out);
}

export async function setStop(zone: Zone, session: Session, osmId: string | null, durationMin?: number | null, ifVersion?: number | null,
  opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const doc = current(M, session, ifVersion);
  const st = stateOf(doc);
  if (osmId === null) {
    if (doc.stop === null) return clone(doc);
    return apply(zone, M, session, { ...st, stop: null }, 'stop', opts);
  }
  if (!doc.selected_route_id && doc.stop === null) throw new PlanError(422, M.plan.errors.chooseFirstStop); // a stop already in the plan can be moved
  const place = stopPlace(zone, M, osmId);
  const old = doc.stop;
  let minutes = durationMin;
  if (minutes === undefined || minutes === null) {
    if (old === null) throw new PlanError(422, M.plan.errors.howLongAt(place.name));
    minutes = old.duration_min;
  }
  if (!isNumber(minutes) || minutes > 600) throw new PlanError(422, M.plan.errors.howLong);
  if (old && old.osm_id === osmId && old.duration_min === minutes) return clone(doc);
  return apply(zone, M, session, { ...st, stop: { osm_id: osmId, duration_min: minutes } }, 'stop', opts);
}

export async function setConstraints(zone: Zone, session: Session, constraints: unknown, detourTolerance?: unknown, ifVersion?: number | null,
  opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const doc = current(M, session, ifVersion);
  const cons = constraintsOf(M, constraints);
  const tol = tolerance(M, detourTolerance, doc.detour_tolerance);
  if (JSON.stringify(cons) === JSON.stringify(doc.constraints) && JSON.stringify(tol) === JSON.stringify(doc.detour_tolerance)) return clone(doc);
  return apply(zone, M, session, { ...stateOf(doc), constraints: cons, detour_tolerance: tol }, 'constraints', opts);
}

export async function setDepart(zone: Zone, session: Session, departAt: string, ifVersion?: number | null, opts: PlanOptions = {}): Promise<Doc> {
  const M = messages(session.lang);
  const doc = current(M, session, ifVersion);
  const t = depart(M, departAt, opts.now ? opts.now() : zone.now());
  if (t === doc.depart_at) return clone(doc);
  return apply(zone, M, session, { ...stateOf(doc), depart_at: t }, 'depart', opts);
}

/** The node path of a foot route, recomputed exactly as the plan computed it (for live guidance). */
export function footPath(zone: Zone, doc: Doc, rid: string): number[] | null {
  const { origin: o, destination: d } = doc;
  const a = zone.snap(o.lat, o.lon);
  const b = zone.snap(d.lat, d.lon);
  const sp = doc.stop ? stopPlace(zone, messages(doc.lang ?? 'en'), doc.stop.osm_id) : null;
  const stop = sp ? zone.snap(sp.lat, sp.lon) : null;
  let H: RouteGraph = ZONE_GRAPH;
  if (rid === 'A') H = constrained(zone, keyOf(doc.constraints), stop ? box(zone, a, b, stop) : box(zone, a, b), true);
  if (!stop) return routeOn(zone, H, a, b)[1];
  const p1 = routeOn(zone, H, a, stop)[1];
  const p2 = routeOn(zone, H, stop, b)[1];
  return p1 === null || p2 === null ? null : [...p1, ...p2];
}

