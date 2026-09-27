/**
 * The engine as an app uses it: zones downloaded where the user is (and where they go), kept in a store for
 * offline use, sessions, and every question and route computed on the device.
 *
 *     const engine = new Engine({ store });
 *     const { session, overview } = await engine.startSession({ origin: { lat, lon, name: 'via Brembo 12' }, lang: 'it' });
 *     const plan = await engine.plan(session.id, { destination: { lat, lon, name } });
 */
import { explore as exploreStep, type ExploreCommand } from './explore';
import { greatCircle } from './geo/projection';
import type { Lang } from './i18n/common';
import { step, type NavResult, type NavState } from './navigate';
import { DEFAULT_OVERPASS_ENDPOINTS, featuresQuery, networkQuery, polyString, runOverpass, type OverpassOptions } from './osm/overpass';
import { overview as overviewOf } from './overview';
import { createPlan, getPlan, selectRoute, setConstraints, setDepart, setStop, stopCandidates, PlanError, type PlanOptions } from './plan';
import { reversePlace, searchPlaces, type Candidate, type PhotonOptions, type Reverse } from './places';
import { newSession, type Destination, type Session } from './session';
import { ask as askTool, type Aliases } from './tools';
import { MemoryTransitCache, type TransitOptions } from './transit';
import { Zone, type ZoneData, type ZoneSpec } from './zone';

export const USER_AGENT = 'Milo/0.2 (open source walking assistant; +https://github.com/dama02/milo)';

/** Where downloaded zones are kept between runs (the app's file system; memory in tests). */
export interface ZoneStore {
  get(key: string): Promise<ZoneData | null | undefined>;
  set(key: string, data: ZoneData): Promise<void>;
  /** Keys of the stored zones, to find one that covers a place when there is no connection. */
  keys?(): Promise<string[]>;
}

export class MemoryZoneStore implements ZoneStore {
  readonly map = new Map<string, ZoneData>();

  async get(key: string) {
    return this.map.get(key);
  }

  async set(key: string, data: ZoneData) {
    this.map.set(key, data);
  }

  async keys() {
    return [...this.map.keys()];
  }
}

export interface EngineOptions {
  overpass?: Omit<OverpassOptions, 'signal'>;
  photon?: PhotonOptions;
  transit?: TransitOptions;
  store?: ZoneStore;
  now?: () => Date;
  /** IANA time zone for opening hours; default the device's. */
  timeZone?: string;
  /** Never download: zones from the store only, public transport from its cache only. */
  offline?: boolean;
  /** Metres of map loaded around the places of a trip (default 1500). */
  margin?: number;
  /** Largest trip span on foot, metres between the farthest points (default 6000). */
  maxSpan?: number;
  aliases?: Aliases;
  userAgent?: string;
  /** Zones kept in memory (default 2). */
  keepZones?: number;
}

export class TooFarError extends Error {
  constructor(readonly metres: number) {
    super(`The places are ${Math.round(metres)} m apart: too far for a walking map.`);
    this.name = 'TooFarError';
  }
}

export class MapUnavailableError extends Error {
  constructor(readonly causes: string[]) {
    super('The map of this area could not be downloaded, and no stored copy covers it.');
    this.name = 'MapUnavailableError';
  }
}

export class NoSessionError extends Error {
  constructor() {
    super('No such session: start a new one.');
    this.name = 'NoSessionError';
  }
}

export type Progress = (stage: 'cache' | 'download' | 'build', detail?: string) => void;

interface Point {
  lat: number;
  lon: number;
}

const R = 6_371_009;
const degLat = (m: number) => (m / R) * (180 / Math.PI);
const degLon = (m: number, lat: number) => degLat(m) / Math.cos((lat * Math.PI) / 180);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

function keyOf(spec: ZoneSpec): string {
  return spec.bounds ? `b:${spec.bounds.map((v) => v.toFixed(4)).join(',')}` : `c:${spec.center.join(',')}:${spec.dist}`;
}

function parseKey(key: string): [number, number, number, number] | null {
  if (!key.startsWith('b:')) return null;
  const v = key.slice(2).split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? (v as [number, number, number, number]) : null;
}

export class Engine {
  readonly sessions = new Map<string, Session>();
  private zones: Zone[] = [];
  private readonly nav = new Map<string, NavState>();
  private readonly building = new Map<string, Promise<Zone>>();
  private readonly transit: TransitOptions;

  constructor(readonly opts: EngineOptions = {}) {
    this.transit = { cache: new MemoryTransitCache(), userAgent: opts.userAgent ?? USER_AGENT, ...opts.transit,
      offline: !!(opts.offline || opts.transit?.offline) };
  }

  get loadedZones(): Zone[] {
    return [...this.zones];
  }

  private planOptions(): PlanOptions {
    return { transit: this.transit, aliases: this.opts.aliases, now: this.opts.now, timeZone: this.opts.timeZone };
  }

  /** The rectangle a trip needs: the places plus a margin, answered for up to 800 m around them. */
  zoneSpecFor(points: Point[], name: string): ZoneSpec {
    const margin = this.opts.margin ?? 1500;
    const pts = points.map((p) => ({ lat: round3(p.lat), lon: round3(p.lon) }));
    let span = 0;
    for (const a of pts) for (const b of pts) span = Math.max(span, greatCircle(a.lat, a.lon, b.lat, b.lon));
    if (span > (this.opts.maxSpan ?? 6000)) throw new TooFarError(span);
    const s = Math.min(...pts.map((p) => p.lat));
    const n = Math.max(...pts.map((p) => p.lat));
    const w = Math.min(...pts.map((p) => p.lon));
    const e = Math.max(...pts.map((p) => p.lon));
    const cLat = (s + n) / 2;
    const bounds: [number, number, number, number] = [s - degLat(margin), w - degLon(margin, cLat), n + degLat(margin), e + degLon(margin, cLat)];
    const center: [number, number] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const halfNS = greatCircle(bounds[0], center[1], bounds[2], center[1]) / 2;
    const halfEW = greatCircle(center[0], bounds[1], center[0], bounds[3]) / 2;
    const inset = Math.max(0, margin - 800);
    return { name, center, dist: Math.round(Math.max(halfNS, halfEW)), answerRadius: Math.round(Math.min(halfNS, halfEW) - inset),
      centerName: name, bounds, answerInset: inset };
  }

  /** A zone that answers for every point: one in memory, else the stored copy, else a download. */
  async zoneFor(points: Point[], name: string, onProgress?: Progress): Promise<Zone> {
    const loaded = this.zones.find((z) => points.every((p) => z.inAnswerArea(p.lat, p.lon)));
    if (loaded) return loaded;
    return this.buildZone(this.zoneSpecFor(points, name), points, onProgress);
  }

  private async buildZone(spec: ZoneSpec, points: Point[], onProgress?: Progress): Promise<Zone> {
    const key = keyOf(spec);
    const pending = this.building.get(key);
    if (pending) return pending;
    const job = (async () => {
      let data = (await this.opts.store?.get(key)) ?? null;
      if (data) onProgress?.('cache');
      if (!data && !this.opts.offline) {
        onProgress?.('download');
        const o = { endpoints: DEFAULT_OVERPASS_ENDPOINTS, userAgent: this.opts.userAgent ?? USER_AGENT, ...this.opts.overpass };
        try {
          const network = await runOverpass(networkQuery(polyString(Zone.bufferedRing(spec))), o);
          const features = await runOverpass(featuresQuery(polyString(Zone.boxRing(spec))), o);
          data = { spec, network, features };
          await this.opts.store?.set(key, data);
        } catch (e) {
          data = await this.storedCovering(points);
          if (!data) throw new MapUnavailableError(e instanceof Error ? [e.message, ...((e as { causes?: string[] }).causes ?? [])] : [String(e)]);
        }
      }
      if (!data) data = await this.storedCovering(points);
      if (!data) throw new MapUnavailableError(['offline, and no stored map covers this place']);
      onProgress?.('build');
      const zone = new Zone(data, { now: this.opts.now });
      this.zones = [zone, ...this.zones.filter((z) => z !== zone)].slice(0, this.opts.keepZones ?? 2);
      return zone;
    })();
    this.building.set(key, job);
    try {
      return await job;
    } finally {
      this.building.delete(key);
    }
  }

  /** A stored zone whose answer area covers every point (for when there is no connection). */
  private async storedCovering(points: Point[]): Promise<ZoneData | null> {
    const keys = (await this.opts.store?.keys?.()) ?? [];
    for (const k of keys) {
      const b = parseKey(k);
      if (!b || !points.every((p) => p.lat >= b[0] && p.lat <= b[2] && p.lon >= b[1] && p.lon <= b[3])) continue;
      const data = await this.opts.store!.get(k);
      if (!data) continue;
      const probe = { ...data.spec };
      const inset = probe.answerInset ?? 0;
      const ok = points.every((p) => p.lat >= b[0] + degLat(inset) && p.lat <= b[2] - degLat(inset)
        && p.lon >= b[1] + degLon(inset, p.lat) && p.lon <= b[3] - degLon(inset, p.lat));
      if (ok) return data;
    }
    return null;
  }

  // ---------- sessions ----------
  async startSession(args: { origin: { lat: number; lon: number; name?: string }; heading?: number; lang?: Lang; destination?: Destination },
    onProgress?: Progress) {
    const { origin } = args;
    const name = origin.name || (args.lang === 'it' ? 'il punto di partenza' : 'your start point');
    const points = [origin, ...(args.destination ? [args.destination] : [])];
    let zone: Zone;
    try {
      zone = await this.zoneFor(points, name, onProgress);
    } catch (e) {
      if (!(e instanceof TooFarError) || !args.destination) throw e;
      zone = await this.zoneFor([origin], name, onProgress); // the destination is too far on foot: the map around the start
    }
    const session = newSession(zone, [origin.lat, origin.lon, name], { lang: args.lang, heading: args.heading });
    if (args.destination && zone.inAnswerArea(args.destination.lat, args.destination.lon)) session.destination = { ...args.destination };
    this.sessions.set(session.id, session);
    return { session, overview: overviewOf(zone, session), zone: { name: zone.name, snapshot: zone.snapshot } };
  }

  session(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new NoSessionError();
    return s;
  }

  endSession(id: string) {
    this.sessions.delete(id);
    this.nav.delete(id);
  }

  overview(id: string) {
    const s = this.session(id);
    return overviewOf(s.zone, s);
  }

  explore(id: string, command: ExploreCommand, headingDeg?: number | null, branch?: number | string | null) {
    const s = this.session(id);
    return exploreStep(s.zone, s, command, headingDeg, branch);
  }

  ask(id: string, tool: string, params: Record<string, unknown>, question: string | null) {
    const s = this.session(id);
    return askTool(s.zone, s, tool, params, question, { aliases: this.opts.aliases, now: this.opts.now?.(), timeZone: this.opts.timeZone });
  }

  /** Sets the destination; loads a larger map when it lies outside the current one. Returns whether the map changed. */
  async setDestination(id: string, place: Destination, onProgress?: Progress) {
    const s = this.session(id);
    let zoneChanged = false;
    if (!s.zone.inAnswerArea(place.lat, place.lon)) {
      const zone = await this.zoneFor([{ lat: s.origin[0], lon: s.origin[1] }, place], s.origin[2], onProgress);
      if (zone !== s.zone) {
        // a new map: node numbers change, so the virtual walk starts over
        Object.assign(s, { zone, node: null, came: null, start: null, stack: [], plan: null });
        this.nav.delete(id);
        zoneChanged = true;
      }
    }
    s.destination = { lat: place.lat, lon: place.lon, name: place.name };
    return { destination: s.destination, straight_line_m: Math.round(greatCircle(s.origin[0], s.origin[1], place.lat, place.lon)), zoneChanged };
  }

  // ---------- routes ----------
  async plan(id: string, args: { destination?: Destination | { name: string }; depart_at?: string; constraints?: unknown; detour_tolerance?: unknown } = {},
    onProgress?: Progress) {
    const s = this.session(id);
    const d = args.destination as Destination | undefined;
    if (d && typeof d.lat === 'number' && typeof d.lon === 'number') await this.setDestination(id, { lat: d.lat, lon: d.lon, name: d.name ?? '' }, onProgress);
    this.nav.delete(id);
    return createPlan(s.zone, s, { ...args, destination: args.destination ?? s.destination }, this.planOptions());
  }

  getPlan(id: string) {
    const s = this.session(id);
    return getPlan(s.zone, s);
  }

  selectRoute(id: string, routeId: string, ifVersion?: number | null) {
    const s = this.session(id);
    return selectRoute(s.zone, s, routeId, ifVersion, this.planOptions());
  }

  stopCandidates(id: string, kind = 'supermarket', ifVersion?: number | null) {
    const s = this.session(id);
    return stopCandidates(s.zone, s, kind, ifVersion, this.planOptions());
  }

  setStop(id: string, osmId: string | null, durationMin?: number | null, ifVersion?: number | null) {
    const s = this.session(id);
    return setStop(s.zone, s, osmId, durationMin, ifVersion, this.planOptions());
  }

  setConstraints(id: string, constraints: unknown, detourTolerance?: unknown, ifVersion?: number | null) {
    const s = this.session(id);
    return setConstraints(s.zone, s, constraints, detourTolerance, ifVersion, this.planOptions());
  }

  setDepart(id: string, departAt: string, ifVersion?: number | null) {
    const s = this.session(id);
    return setDepart(s.zone, s, departAt, ifVersion, this.planOptions());
  }

  // ---------- live guidance ----------
  /** One GPS fix; `t` in seconds (monotonic). */
  navigate(id: string, fix: { lat: number; lon: number; accuracy_m?: number | null; heading_deg?: number | null; t: number }): NavResult {
    const s = this.session(id);
    let state = this.nav.get(id);
    if (!state) this.nav.set(id, (state = {}));
    return step(s.zone, s, state, fix.lat, fix.lon, fix.accuracy_m ?? null, fix.heading_deg ?? null, fix.t);
  }

  stopNavigation(id: string) {
    this.nav.delete(id);
  }

  // ---------- places ----------
  searchPlaces(query: string, near: Point, lang: Lang, fix?: (q: string) => Promise<string[]>): Promise<Candidate[]> {
    return searchPlaces(query, [near.lat, near.lon], lang, this.zones, { userAgent: this.opts.userAgent ?? USER_AGENT, ...this.opts.photon,
      offline: this.opts.offline || this.opts.photon?.offline }, fix);
  }

  reverse(lat: number, lon: number, lang: Lang): Promise<Reverse | null> {
    return reversePlace(lat, lon, lang, this.zones, { userAgent: this.opts.userAgent ?? USER_AGENT, ...this.opts.photon,
      offline: this.opts.offline || this.opts.photon?.offline });
  }
}

export { PlanError };
