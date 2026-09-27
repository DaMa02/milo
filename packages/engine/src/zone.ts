/**
 * A zone: the walk network and map features of a square area, loaded once, with the geometry every
 * answer is computed from. Distances are metres in the zone's UTM projection; latitude and longitude only
 * at the edges.
 */
import Flatbush from 'flatbush';
import * as J from './geo/jsts';
import type { Geom } from './geo/jsts';
import { Polyline, bearing, dist, mod, segDist } from './geo/planar';
import { Projection, greatCircle, round6, type Pt } from './geo/projection';
import { type Graph, type EdgeData } from './graph';
import { type Label, labelKey } from './i18n/common';
import { buildFeatures, type Feature } from './osm/features';
import { buildWalkNetwork, pairKey, type WalkNetwork } from './osm/network';
import { FEATURE_TAGS } from './osm/overpass';
import type { OverpassResponse, Tags } from './osm/types';

export const SPEED = 80; // metres per walking minute (speaking rule 1)
export const WINDOW = 800; // metres the overview describes around the session origin in a large zone
export const FOOT = ['footway', 'path', 'pedestrian', 'steps', 'cycleway'];
const FOOT_RX = new RegExp(FOOT.join('|'));
export const ENGINE_SOURCE = 'OpenStreetMap via Overpass, Milo engine';

export interface ZoneSpec {
  /** Spoken name of the area, e.g. "Porta Romana, Milan" or the start point's name. */
  name: string;
  /** Centre of the downloaded square, [lat, lon]. */
  center: [number, number];
  /** Half the side of the downloaded square, metres. */
  dist: number;
  /** Places farther than this from the centre are outside the area the engine answers for. */
  answerRadius: number;
  /** A place name for the centre, when it has one ("Talent Garden", "the Duomo"). */
  centerName?: string;
  /** A rectangle to download instead of the square around the centre: [south, west, north, east]. */
  bounds?: [number, number, number, number];
  /** With bounds: the engine answers for places inside the rectangle shrunk by this many metres. */
  answerInset?: number;
}

export interface ZoneData {
  spec: ZoneSpec;
  network: OverpassResponse;
  features: OverpassResponse;
}

export interface ZoneOptions {
  /** The data date written into every fact, YYYY-MM-DD; default: the Overpass snapshot date. */
  snapshot?: string;
  /** Clock for meta.computed_at. */
  now?: () => Date;
}

export interface Fact {
  type: string;
  value: string | number | boolean | null;
  unit: 'm' | 'min' | 'count' | 'ratio' | 'deg' | null;
  source: 'computed' | 'map_tag' | 'transit_api' | 'web' | 'estimated' | 'unknown';
  evidence: string[];
  inputs: Record<string, unknown>;
  data_date: string;
  completeness: 'complete' | 'unknown';
}

export interface Meta {
  mode: 'live' | 'offline';
  cache: 'hit' | 'miss' | 'none';
  computed_at: string;
}

export interface Crossing {
  osm_id: string;
  signals: 'yes' | 'no' | 'unknown';
  sound: 'yes' | 'no' | 'unknown';
  tactile_paving: 'yes' | 'no' | 'unknown';
}

/** The nearest point of the walk network to a position. */
export interface Snap {
  u: number;
  v: number;
  su: number;
  sv: number;
  off: number;
  node: number;
  lat: number;
  lon: number;
}

export interface RailPlace {
  pts: Pt[];
  edges: number[];
  point: Pt;
  /** The road the bridge carries, if a named road does. */
  road: string | null;
  underpass: boolean;
  evidence: string[];
}

/** Where a branch of the walk leads. */
export type LeadsTo =
  | { kind: 'loop' }
  | { kind: 'edge' }
  | { kind: 'dead_end' }
  | { kind: 'junction'; others: Label[] };

export interface Branch {
  path: number[];
  name: Label;
  length: number;
}

/** osmnx bbox_from_point: (left, bottom, right, top). */
export function bboxFromPoint(lat: number, lon: number, distM: number): [number, number, number, number] {
  const R = 6_371_009;
  const dLat = ((distM / R) * 180) / Math.PI;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/** OSM ids "kind/id" without repeats, in order. */
export function ids(kind: string, vals: Iterable<number | string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of vals) {
    const s = `${kind}/${v}`;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export class Zone implements Graph {
  readonly spec: ZoneSpec;
  readonly name: string;
  readonly center: [number, number];
  readonly dist: number;
  readonly answerRadius: number;
  readonly proj: Projection;
  readonly snapshot: string;
  readonly net: WalkNetwork;
  /** Node count. */
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Latitude and longitude of each node, rounded to 6 decimals. */
  readonly LL: [number, number][];
  readonly features: Feature[];
  /** Edges of named roads (not footways): what a street name is read from. */
  readonly roads: number[];
  readonly roadSet: Set<number>;
  readonly boundary: Set<number>;
  readonly crossings: Map<number, Crossing>;
  readonly graphInputs: Record<string, unknown>;
  readonly featureInputs: Record<string, unknown>;
  readonly now: () => Date;
  /** The downloaded rectangle: [west, south, east, north]. */
  readonly box: [number, number, number, number];
  private readonly edgeIndex: Flatbush;
  private readonly roadIndex: Flatbush;
  private readonly labels = new Map<number, Label>();
  private eadj?: number[][];
  /** Per-zone memo for derived data (railway union, main roads, blocks...). */
  readonly memo = new Map<string, unknown>();

  constructor(data: ZoneData, opts: ZoneOptions = {}) {
    const { spec } = data;
    this.spec = spec;
    this.name = spec.name;
    this.center = spec.center;
    this.dist = spec.dist;
    this.answerRadius = spec.answerRadius;
    this.now = opts.now ?? (() => new Date());
    const [clat, clon] = spec.center;
    this.proj = new Projection(clat, clon);

    // the download polygons: the square (or rectangle), and the same buffered by 500 m (for street counts at the cut)
    const [left, bottom, right, top] = spec.bounds ? [spec.bounds[1], spec.bounds[0], spec.bounds[3], spec.bounds[2]]
      : bboxFromPoint(clat, clon, spec.dist);
    this.box = [left, bottom, right, top];
    const boxLL = J.polygon([{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }, { x: left, y: bottom }]);
    const boxXY = J.mapCoords(boxLL, (p) => this.proj.xy(p.y, p.x));
    const bufLL = J.mapCoords(J.buffer(boxXY, 500), (p) => {
      const [lat, lon] = this.proj.llRaw(p.x, p.y);
      return { x: lon, y: lat };
    });
    const insideBuffer = (lat: number, lon: number) => bufLL.intersects(J.point({ x: lon, y: lat }));
    const insideBox = (lat: number, lon: number) => lon >= left && lon <= right && lat >= bottom && lat <= top;

    const net = buildWalkNetwork(data.network, insideBuffer, insideBox);
    this.net = net;
    this.n = net.ids.length;
    this.snapshot = opts.snapshot ?? (net.timestamp ?? this.now().toISOString()).slice(0, 10);
    this.x = new Float64Array(this.n);
    this.y = new Float64Array(this.n);
    this.LL = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const p = this.proj.xy(net.lat[i], net.lon[i]);
      this.x[i] = p.x;
      this.y[i] = p.y;
      this.LL[i] = [round6(net.lat[i]), round6(net.lon[i])];
    }
    this.features = buildFeatures(data.features, FEATURE_TAGS, boxLL, (lat, lon) => this.proj.xy(lat, lon));

    const E = net.eu.length;
    this.edgeIndex = new Flatbush(Math.max(1, E));
    for (let e = 0; e < E; e++) {
      const a = net.eu[e];
      const b = net.ev[e];
      this.edgeIndex.add(Math.min(this.x[a], this.x[b]), Math.min(this.y[a], this.y[b]), Math.max(this.x[a], this.x[b]), Math.max(this.y[a], this.y[b]));
    }
    if (!E) this.edgeIndex.add(0, 0, 0, 0);
    this.edgeIndex.finish();

    this.roads = [];
    for (let e = 0; e < E; e++) {
      const t = net.ways[net.eway[e]].tags;
      if (t.name !== undefined && !FOOT_RX.test(String(t.highway))) this.roads.push(e);
    }
    this.roadSet = new Set(this.roads);
    this.roadIndex = new Flatbush(Math.max(1, this.roads.length));
    for (const e of this.roads) {
      const a = net.eu[e];
      const b = net.ev[e];
      this.roadIndex.add(Math.min(this.x[a], this.x[b]), Math.min(this.y[a], this.y[b]), Math.max(this.x[a], this.x[b]), Math.max(this.y[a], this.y[b]));
    }
    if (!this.roads.length) this.roadIndex.add(0, 0, 0, 0);
    this.roadIndex.finish();

    // osmnx counts streets per node before cutting: fewer neighbours now = the node sits on the cut
    this.boundary = new Set();
    for (let i = 0; i < this.n; i++) if (net.adj[i].length < net.streetCount[i]) this.boundary.add(i);
    this.crossings = new Map();
    for (let i = 0; i < this.n; i++) if (this.isCrossing(i)) this.crossings.set(i, this.classify(i));

    this.graphInputs = { center: [clat, clon], dist_m: spec.dist, network_type: 'walk', simplify: false, snap: 'nearest_edge',
      snapshot: this.snapshot, source: ENGINE_SOURCE };
    this.featureInputs = { center: [clat, clon], dist_m: spec.dist, tags: FEATURE_TAGS, snapshot: this.snapshot };
  }

  // ---------- graph ----------
  hasNode(n: number) {
    return n >= 0 && n < this.n;
  }

  forEachNeighbor(n: number, fn: (v: number, d: EdgeData) => void) {
    for (const v of this.net.adj[n]) fn(v, { len: this.elen(this.edata(n, v)) });
  }

  edge(u: number, v: number): EdgeData | undefined {
    const e = this.net.pairEdges.get(pairKey(u, v));
    return e ? { len: this.net.elen[e[0]] } : undefined;
  }

  /** Neighbours of n, unique, in graph order. */
  nbrs(n: number): number[] {
    return this.net.adj[n];
  }

  /**
   * Neighbours in the order their edges come in the edge list: the adjacency order of a graph rebuilt from
   * the edges (as the constraint graphs are).
   */
  edgeOrderNbrs(n: number): number[] {
    if (!this.eadj) {
      const lists: number[][] = Array.from({ length: this.n }, () => []);
      const seen = Array.from({ length: this.n }, () => new Set<number>());
      for (let e = 0; e < this.net.eu.length; e++) {
        const u = this.net.eu[e];
        const v = this.net.ev[e];
        if (!seen[u].has(v)) { seen[u].add(v); lists[u].push(v); }
        if (!seen[v].has(u)) { seen[v].add(u); lists[v].push(u); }
      }
      this.eadj = lists;
    }
    return this.eadj[n];
  }

  get edgeCount() {
    return this.net.eu.length;
  }

  eu(e: number) {
    return this.net.eu[e];
  }

  ev(e: number) {
    return this.net.ev[e];
  }

  elen(e: number) {
    return this.net.elen[e];
  }

  /** Tags of the way an edge belongs to. */
  etags(e: number): Tags {
    return this.net.ways[this.net.eway[e]].tags;
  }

  /** OSM id of the way an edge belongs to. */
  eway(e: number): number {
    return this.net.ways[this.net.eway[e]].id;
  }

  /** The edge between two adjacent nodes (the first of parallel edges, all equally long). */
  edata(u: number, v: number): number {
    return this.net.pairEdges.get(pairKey(u, v))![0];
  }

  hasEdge(u: number, v: number): boolean {
    return this.net.pairEdges.has(pairKey(u, v));
  }

  degree(n: number): number {
    return this.net.adj[n].length;
  }

  nodeTags(n: number): Tags {
    return this.net.nodeTags[n] ?? {};
  }

  osmId(n: number): number {
    return this.net.ids[n];
  }

  // ---------- geometry ----------
  xy(lat: number, lon: number): Pt {
    return this.proj.xy(lat, lon);
  }

  ll(p: Pt): [number, number] {
    return this.proj.ll(p);
  }

  nxy(n: number): Pt {
    return { x: this.x[n], y: this.y[n] };
  }

  eline(e: number): [Pt, Pt] {
    return [this.nxy(this.net.eu[e]), this.nxy(this.net.ev[e])];
  }

  inAnswerArea(lat: number, lon: number): boolean {
    if (this.spec.bounds) {
      const inset = this.spec.answerInset ?? 0;
      const dLat = (inset / 6_371_009) * (180 / Math.PI);
      const dLon = dLat / Math.cos((this.center[0] * Math.PI) / 180);
      const [w, s, e, n] = this.box;
      return lat >= s + dLat && lat <= n - dLat && lon >= w + dLon && lon <= e - dLon;
    }
    return greatCircle(this.center[0], this.center[1], lat, lon) <= this.answerRadius;
  }

  /** The download polygon of a spec, in [lat, lon] pairs: the rectangle buffered by 500 m (Overpass network query). */
  static bufferedRing(spec: ZoneSpec): [number, number][] {
    const proj = new Projection(spec.center[0], spec.center[1]);
    const [left, bottom, right, top] = spec.bounds ? [spec.bounds[1], spec.bounds[0], spec.bounds[3], spec.bounds[2]]
      : bboxFromPoint(spec.center[0], spec.center[1], spec.dist);
    const boxXY = J.polygon([{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }, { x: left, y: bottom }]
      .map((p) => proj.xy(p.y, p.x)));
    return J.coords(J.buffer(boxXY, 500)).map((p) => proj.llRaw(p.x, p.y));
  }

  /** The rectangle of a spec, in [lat, lon] pairs (Overpass features query). */
  static boxRing(spec: ZoneSpec): [number, number][] {
    const [left, bottom, right, top] = spec.bounds ? [spec.bounds[1], spec.bounds[0], spec.bounds[3], spec.bounds[2]]
      : bboxFromPoint(spec.center[0], spec.center[1], spec.dist);
    return [[bottom, left], [bottom, right], [top, right], [top, left], [bottom, left]];
  }

  fact(type: string, value: Fact['value'], unit: Fact['unit'], source: Fact['source'], evidence: string[],
    inputs: Record<string, unknown>, completeness: Fact['completeness'] = 'complete'): Fact {
    return { type, value, unit, source, evidence, inputs, data_date: this.snapshot, completeness };
  }

  meta(mode: Meta['mode'] = 'offline', cache: Meta['cache'] = 'hit'): Meta {
    return { mode, cache, computed_at: this.now().toISOString().replace(/\.\d{3}Z$/, 'Z') };
  }

  /** Edges whose bounding box meets the given box. */
  edgesInBox(minX: number, minY: number, maxX: number, maxY: number): number[] {
    return this.edgeCount ? this.edgeIndex.search(minX, minY, maxX, maxY).sort((a, b) => a - b) : [];
  }

  /** The nearest edge to p among those `ok` accepts: ties go to the first edge in graph order. */
  nearestEdge(p: Pt, ok?: (e: number) => boolean): { e: number; d: number } | null {
    return nearest(this.edgeIndex, (i) => i, this.edgeCount, p, (e) => segDist(p, ...this.eline(e)), ok);
  }

  // ---------- names ----------
  private nearestRoad(p: Pt, distFn: (e: number) => number, within: number): { e: number; d: number } | null {
    const r = nearest(this.roadIndex, (i) => this.roads[i], this.roads.length, p, distFn);
    return r && r.d <= within ? r : null;
  }

  /** Name of the nearest named road within `within` metres of a point, a line's midpoint or a geometry. */
  roadName(target: Pt | Geom | [Pt, Pt], within = 30): string | null {
    let p: Pt;
    let distFn: (e: number) => number;
    if (Array.isArray(target)) {
      p = new Polyline(target).midpoint();
      distFn = (e) => segDist(p, ...this.eline(e));
    } else if ('x' in target && 'y' in target && typeof (target as Pt).x === 'number') {
      p = target as Pt;
      distFn = (e) => segDist(p, ...this.eline(e));
    } else {
      const g = target as Geom;
      if (J.geomType(g) === 'Point') {
        p = J.coords(g)[0];
        distFn = (e) => segDist(p, ...this.eline(e));
      } else {
        const c = J.bounds(g);
        p = { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 };
        const r = this.nearestRoadGeom(g, within);
        return r === null ? null : this.etags(r).name;
      }
    }
    const r = this.nearestRoad(p, distFn, within);
    return r ? this.etags(r.e).name : null;
  }

  /** Nearest road edge to a geometry (polygon or line), within a distance. */
  private nearestRoadGeom(g: Geom, within: number): number | null {
    const b = J.bounds(g);
    const cands = this.roadIndex.search(b.minX - within, b.minY - within, b.maxX + within, b.maxY + within)
      .map((i) => this.roads[i]).sort((a, c) => a - c);
    let best = Infinity;
    let bestE: number | null = null;
    for (const e of cands) {
      const d = g.distance(J.line(this.eline(e)));
      if (d < best) {
        best = d;
        bestE = e;
      }
    }
    return best <= within ? bestE : null;
  }

  /** Name of the road a crossing segment crosses: within 20 m, at 45 to 135 degrees to it, touching it first. */
  crossedRoad(seg: [Pt, Pt], within = 20): string | null {
    const mid = new Polyline(seg).midpoint();
    const cands = this.roadIndex.search(mid.x - within, mid.y - within, mid.x + within, mid.y + within)
      .map((i) => this.roads[i]).sort((a, b) => a - b);
    let best: [number, number] | null = null;
    let name: string | null = null;
    const sb = bearing(seg[0], seg[1]);
    for (const e of cands) {
      const r = this.eline(e);
      const dm = segDist(mid, r[0], r[1]);
      if (dm > within) continue;
      const a = mod(sb - bearing(r[0], r[1]), 180);
      if (a < 45 || a > 135) continue;
      const key: [number, number] = [segSegDist(r[0], r[1], seg[0], seg[1]), dm];
      if (best === null || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) {
        best = key;
        name = this.etags(e).name;
      }
    }
    return name;
  }

  /** How a blind pedestrian would call this piece of way. */
  edgeLabel(u: number, v: number): Label {
    const key = pairKey(u, v);
    const cached = this.labels.get(key);
    if (cached) return cached;
    const t = this.etags(this.edata(u, v));
    const seg: [Pt, Pt] = [this.nxy(u), this.nxy(v)];
    let label: Label;
    if (t.footway === 'crossing') {
      const n = this.crossedRoad(seg);
      label = n ? { kind: 'crossing', name: n } : { kind: 'crossing' };
    } else if (t.footway === 'sidewalk') {
      // before the name: sidewalks carry stop names like "Lodi M3"
      const n = this.roadName(seg);
      label = n ? { kind: 'pavement', name: n } : { kind: 'pavement' };
    } else if (t.name !== undefined) {
      label = { kind: 'street', name: t.name };
    } else if (t.highway === 'steps') {
      label = { kind: 'steps' };
    } else {
      label = { kind: 'footpath' };
    }
    this.labels.set(key, label);
    return label;
  }

  // ---------- crossings ----------
  private crossingTags(n: number): Tags {
    const t: Tags = { ...this.nodeTags(n) };
    for (const m of this.nbrs(n)) {
      const w = this.etags(this.edata(n, m));
      if (w.footway === 'crossing') {
        for (const k of ['crossing', 'crossing:signals', 'traffic_signals:sound', 'tactile_paving']) {
          if (typeof w[k] === 'string' && t[k] === undefined) t[k] = w[k];
        }
      }
    }
    return t;
  }

  private isCrossing(n: number): boolean {
    const h = this.nodeTags(n).highway;
    return h === 'crossing' || (h === 'traffic_signals' && this.nbrs(n).some((m) => this.etags(this.edata(n, m)).footway === 'crossing'));
  }

  private classify(n: number): Crossing {
    const t = this.crossingTags(n);
    const c = t.crossing;
    const cs = t['crossing:signals'];
    let sig: Crossing['signals'];
    if (cs === 'yes' || c === 'traffic_signals' || t.highway === 'traffic_signals') sig = 'yes';
    else if (cs === 'no' || ['uncontrolled', 'marked', 'zebra', 'unmarked', 'no', 'informal'].includes(c)) sig = 'no';
    else sig = 'unknown';
    const s = t['traffic_signals:sound'];
    const sound = sig === 'no' ? 'no' : s === 'yes' || s === 'walk' ? 'yes' : s === 'no' || s === 'locate' ? 'no' : 'unknown';
    const tp = t.tactile_paving;
    const tactile = tp === 'yes' ? 'yes' : tp === 'no' || tp === 'incorrect' ? 'no' : 'unknown';
    return { osm_id: `node/${this.osmId(n)}`, signals: sig, sound, tactile_paving: tactile };
  }

  pathCrossings(path: number[]): Crossing[] {
    const out: Crossing[] = [];
    for (const n of path) {
      const c = this.crossings.get(n);
      if (c) out.push(c);
    }
    return out;
  }

  pathWays(path: number[]): string[] {
    const ways: number[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      if (path[i] >= 0 && path[i + 1] >= 0 && this.hasEdge(path[i], path[i + 1])) ways.push(this.eway(this.edata(path[i], path[i + 1])));
    }
    return ids('way', ways);
  }

  // ---------- routing ----------
  /** Nearest point on the walk network: the edge (u, v), distances along it, and the offset from the input. */
  snap(lat: number, lon: number): Snap {
    const p = this.xy(lat, lon);
    const r = this.nearestEdge(p)!;
    const u = this.net.eu[r.e];
    const v = this.net.ev[r.e];
    const g = new Polyline([this.nxy(u), this.nxy(v)]);
    const s = g.project(p);
    return { u, v, su: s, sv: g.length - s, off: r.d, node: s <= g.length / 2 ? u : v, lat, lon };
  }

  // ---------- walking the network junction to junction ----------
  /** From node n through neighbour m to the next junction, dead end or boundary node. */
  branch(n: number, m: number): Branch {
    const path = [n, m];
    let prev = n;
    let cur = m;
    while (this.degree(cur) === 2 && !this.boundary.has(cur)) {
      const nxt = this.nbrs(cur).find((x) => x !== prev)!;
      if (path.includes(nxt)) {
        // only path[0] is possible: a loop back to the junction
        path.push(nxt);
        break;
      }
      path.push(nxt);
      prev = cur;
      cur = nxt;
    }
    const labels = new Map<string, { label: Label; len: number }>();
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const l = this.edgeLabel(path[i], path[i + 1]);
      const len = this.elen(this.edata(path[i], path[i + 1]));
      const k = labelKey(l);
      const cur2 = labels.get(k);
      if (cur2) cur2.len += len;
      else labels.set(k, { label: l, len });
    }
    for (let i = 0; i + 1 < path.length; i++) total += this.elen(this.edata(path[i], path[i + 1]));
    return { path, name: mostCommon(labels), length: total };
  }

  /** Every way out of node except `exclude`, folding hops shorter than minLen into what lies beyond. */
  branches(node: number, exclude: number | null = null, minLen = 8): Branch[] {
    const todo = this.nbrs(node).filter((m) => m !== exclude).map((m) => this.branch(node, m));
    const out: Branch[] = [];
    while (todo.length) {
      const b = todo.pop()!;
      const { path, length } = b;
      const end = path[path.length - 1];
      if (length < minLen && this.degree(end) > 2 && !this.boundary.has(end)) {
        for (const m2 of this.nbrs(end)) {
          if (m2 !== path[path.length - 2] && !path.includes(m2)) {
            const b2 = this.branch(end, m2);
            if (b2.path[b2.path.length - 1] !== path[0]) {
              // that loop is also reached the other way round
              todo.push({ path: [...path, ...b2.path.slice(1)], name: b2.name, length: length + b2.length });
            }
          }
        }
        continue;
      }
      out.push(b);
    }
    return out;
  }

  leadsTo(path: number[], name: Label): LeadsTo {
    const end = path[path.length - 1];
    if (end === path[0]) return { kind: 'loop' };
    if (this.boundary.has(end)) return { kind: 'edge' };
    if (this.degree(end) === 1) return { kind: 'dead_end' };
    const others = new Map<string, Label>();
    for (const x of this.nbrs(end)) {
      if (x === path[path.length - 2]) continue;
      const l = this.edgeLabel(end, x);
      if (labelKey(l) !== labelKey(name)) others.set(labelKey(l), l);
    }
    return { kind: 'junction', others: [...others.values()] };
  }

  /** Bearing of the first ~8 m of a path, so a kink at the junction does not decide the direction. */
  firstDir(path: number[]): number {
    const p = this.nxy(path[0]);
    let i = 1;
    while (i < path.length - 1 && dist(p, this.nxy(path[i])) < 8) i++;
    return bearing(p, this.nxy(path[i]));
  }

  arrivalDir(path: number[]): number {
    return bearing(this.nxy(path[path.length - 2]), this.nxy(path[path.length - 1]));
  }

  // ---------- barriers ----------
  railway(): Feature[] {
    return this.memoize('railway', () => this.features.filter((f) => f.tags.railway === 'rail' || f.tags.railway === 'light_rail'));
  }

  railUnion(): Geom | null {
    return this.memoize('railUnion', () => {
      const r = this.railway();
      return r.length ? J.unionAll(r.map((f) => f.geom)) : null;
    });
  }

  /** Places within the answer area (or `radius` m) where a walkable edge crosses the railway, 40 m apart. */
  railwayPlaces(clusterM = 40, radius?: number): RailPlace[] {
    const key = `railPlaces:${clusterM}:${radius ?? ''}`;
    return this.memoize(key, () => {
      const railU = this.railUnion();
      if (!railU) return [];
      const c = this.xy(this.center[0], this.center[1]);
      const limit = radius ?? this.answerRadius;
      const b = J.bounds(railU);
      const places: { pts: Pt[]; edges: number[] }[] = [];
      for (const e of this.edgesInBox(b.minX, b.minY, b.maxX, b.maxY)) {
        const g = J.line(this.eline(e));
        if (!g.intersects(railU)) continue;
        const p = J.centroid(g.intersection(railU));
        if (dist(p, c) > limit) continue;
        const pl = places.find((q) => q.pts.some((r) => dist(p, r) < clusterM));
        if (pl) {
          pl.pts.push(p);
          pl.edges.push(e);
        } else places.push({ pts: [p], edges: [e] });
      }
      return places.map((pl) => {
        const names = pl.edges.map((e) => this.etags(e)).filter((t) => typeof t.name === 'string' && !FOOT.includes(t.highway))
          .map((t) => t.name);
        return { pts: pl.pts, edges: pl.edges, point: pl.pts[0], road: names[0] ?? null,
          underpass: pl.edges.some((e) => this.etags(e).tunnel === 'yes'), evidence: ids('way', pl.edges.map((e) => this.eway(e))) };
      });
    });
  }

  memoize<T>(key: string, fn: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, fn());
    return this.memo.get(key) as T;
  }
}

/** The label covering most of the length (first one on ties, as Counter.most_common). */
export function mostCommon(labels: Map<string, { label: Label; len: number }>): Label {
  let best: { label: Label; len: number } | null = null;
  for (const v of labels.values()) if (!best || v.len > best.len) best = v;
  return best!.label;
}

/** JTS Distance.segmentToSegment. */
export function segSegDist(A: Pt, B: Pt, C: Pt, D: Pt): number {
  if (A.x === B.x && A.y === B.y) return segDist(A, C, D);
  if (C.x === D.x && C.y === D.y) return segDist(D, A, B);
  let noIntersection = false;
  const envIntersects = !(Math.max(C.x, D.x) < Math.min(A.x, B.x) || Math.min(C.x, D.x) > Math.max(A.x, B.x)
    || Math.max(C.y, D.y) < Math.min(A.y, B.y) || Math.min(C.y, D.y) > Math.max(A.y, B.y));
  if (!envIntersects) noIntersection = true;
  else {
    const denom = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);
    if (denom === 0) noIntersection = true;
    else {
      const rNum = (A.y - C.y) * (D.x - C.x) - (A.x - C.x) * (D.y - C.y);
      const sNum = (A.y - C.y) * (B.x - A.x) - (A.x - C.x) * (B.y - A.y);
      const s = sNum / denom;
      const r = rNum / denom;
      if (r < 0 || r > 1 || s < 0 || s > 1) noIntersection = true;
    }
  }
  if (noIntersection) return Math.min(segDist(A, C, D), segDist(B, C, D), segDist(C, A, B), segDist(D, A, B));
  return 0;
}

/**
 * Nearest item to p by exact distance, ties to the lowest item: the k nearest boxes bound the answer, then
 * every box within that bound is checked.
 */
function nearest(index: Flatbush, item: (i: number) => number, count: number, p: Pt, distFn: (e: number) => number,
  ok?: (e: number) => boolean): { e: number; d: number } | null {
  if (!count) return null;
  const filter = ok ? (i: number) => ok(item(i)) : undefined;
  const first = index.neighbors(p.x, p.y, 8, Infinity, filter);
  if (!first.length) return null;
  let bound = Infinity;
  for (const i of first) bound = Math.min(bound, distFn(item(i)));
  const cands = index.neighbors(p.x, p.y, Infinity, bound, filter).map(item).sort((a, b) => a - b);
  let best: { e: number; d: number } | null = null;
  for (const e of cands) {
    const d = distFn(e);
    if (!best || d < best.d) best = { e, d };
  }
  return best;
}
