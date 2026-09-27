/**
 * Free exploration: a virtual walk junction to junction, with the start point and facing as the one reference.
 *
 *     explore(zone, session, command, headingDeg?, branch?) -> ExploreStep (contracts/explore-step.schema.json)
 */
import { dist, relAngle } from './geo/planar';
import { pyRound } from './geo/projection';
import { clockHour, compassIndex, labelKey, relativeDirection, type Label } from './i18n/common';
import { messages, type Messages } from './i18n';
import { r10 } from './overview';
import type { Session } from './session';
import { mostCommon, type Crossing, type Fact, type Zone } from './zone';

export type ExploreCommand = 'start' | 'forward' | 'left' | 'right' | 'take' | 'back' | 'home' | 'where';
export const EXPLORE_COMMANDS: ExploreCommand[] = ['start', 'forward', 'left', 'right', 'take', 'back', 'home', 'where'];

// command -> target angle, lowest and highest relative angle accepted
const TURNS: Record<string, [number, number, number]> = {
  forward: [0, -45, 45],
  left: [-90, -150, -30],
  right: [90, 30, 150],
};
// several crossings on one branch: kinds in the order they are said
const KIND_ORDER: [string, string][] = [['no', 'no'], ['yes', 'yes'], ['yes', 'no'], ['yes', 'unknown'], ['unknown', 'unknown']];

export interface BranchInfo {
  rel: number;
  path: number[];
  name: Label;
  nameText: string;
  leadsTo: string;
  hour: number;
  distance_m: number;
  metres: number;
  crossing: Crossing | null;
  crossings: Crossing[];
}

/** Name of a walked path: the label covering most of its length. */
export function pathLabel(zone: Zone, path: number[]): Label {
  const labels = new Map<string, { label: Label; len: number }>();
  for (let i = 0; i + 1 < path.length; i++) {
    const l = zone.edgeLabel(path[i], path[i + 1]);
    const len = zone.elen(zone.edata(path[i], path[i + 1]));
    const k = labelKey(l);
    const cur = labels.get(k);
    if (cur) cur.len += len;
    else labels.set(k, { label: l, len });
  }
  return mostCommon(labels);
}

/** Ways out of the current node except the one walked in on, left to right relative to the facing. */
export function branches(zone: Zone, s: Session): BranchInfo[] {
  const M = messages(s.lang);
  const out = new Map<string, BranchInfo>();
  for (const { path, name, length } of zone.branches(s.node!, s.came ? s.came[s.came.length - 2] : null)) {
    const rel = relAngle(zone.firstDir(path), s.heading);
    const xs = zone.pathCrossings(path.slice(1));
    const leads = zone.leadsTo(path, name);
    const leadsTo = M.explore.leadsTo(leads.kind === 'junction'
      ? { kind: 'junction', others: leads.others.map((l) => M.label(l)).sort() } : leads);
    const hour = clockHour(rel);
    const b: BranchInfo = { rel, path, name, nameText: M.label(name), leadsTo, hour, distance_m: r10(length), metres: length,
      crossing: xs.length ? { ...xs[0] } : null, crossings: xs };
    // two ways to the same junction that sound the same are one way: keep the one with crossing data, then the shorter
    const key = `${path[path.length - 1]}|${labelKey(name)}|${hour}`;
    const old = out.get(key);
    if (!old || better(b, old)) out.set(key, b);
  }
  return [...out.values()].sort((a, b) => a.rel - b.rel);
}

function better(b: BranchInfo, old: BranchInfo): boolean {
  const bEmpty = b.crossings.length === 0 ? 1 : 0;
  const oEmpty = old.crossings.length === 0 ? 1 : 0;
  return bEmpty < oEmpty || (bEmpty === oEmpty && b.metres < old.metres);
}

/** Crossings on a branch counted by kind, in the order they are said. */
function kinds(xs: Crossing[]): [[string, string], number][] {
  const count = new Map<string, number>();
  for (const x of xs) {
    const k = `${x.signals},${x.signals === 'yes' ? x.sound : x.signals}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return KIND_ORDER.filter((k) => count.get(k.join(','))).map((k) => [k, count.get(k.join(','))!]);
}

function say(M: Messages, b: BranchInfo, again = false): string {
  const d = b.distance_m ? M.metres(b.distance_m) : M.explore.fewMetres;
  const n = again ? M.explore.another(b.name) : b.nameText;
  let s = M.explore.branch(n, M.clock(b.hour), d, b.leadsTo);
  const c = b.crossing;
  if (b.crossings.length > 1) {
    const ks = kinds(b.crossings);
    const total = b.crossings.length;
    if (ks.length === 1) s += M.explore.crossingsAll(total, M.explore.crossingKind(ks[0][0][0], ks[0][0][1], true));
    else s += M.explore.crossingsMixed(total, ks.map(([k, n2]) => M.explore.crossingsPart(n2, M.explore.crossingKind(k[0], k[1], n2 !== 1))));
  } else if (c && c.signals === 'unknown') s += M.explore.crossingUnknown;
  else if (c && c.signals === 'yes') s += M.explore.crossingSignal(c.sound);
  else if (c) s += M.explore.crossingNoSignal;
  return s;
}

/** The junction: ways left to right, the mapped-area edge, and where the walker came from. */
function describe(M: Messages, zone: Zone, s: Session, brs: BranchInfo[]): string {
  const atEdge = zone.boundary.has(s.node!);
  let t: string;
  if (!brs.length) t = M.explore.noOtherWay + (atEdge ? '' : M.explore.deadEnd);
  else if (brs.length === 1) t = M.explore.oneWay(say(M, brs[0]));
  else {
    const heads = brs.map((b) => `${b.nameText}|${b.hour}|${b.distance_m}|${b.leadsTo}`);
    t = M.explore.ways(brs.length, brs.map((b, i) => say(M, b, heads.slice(0, i).includes(heads[i]))));
  }
  if (atEdge) t += M.explore.edge;
  if (s.came) t += M.explore.behind(M.label(pathLabel(zone, s.came)));
  return t;
}

/**
 * Runs one command (start, forward, left, right, take, back, home, where), updates the session and returns an
 * ExploreStep. take follows `branch`: its index in the current branches, left to right from 0, or its name.
 */
export function explore(zone: Zone, session: Session, command: ExploreCommand, headingDeg?: number | null, branch?: number | string | null) {
  const M = messages(session.lang);
  const s = session;
  const [lat, lon, name] = s.origin;
  if (command !== 'start' && s.start === null) command = 'start'; // every walk begins by stating the reference
  const g = zone.graphInputs;
  let intro = '';
  let extra: Fact[] = [];
  const osm = (n: number) => zone.osmId(n);
  if (command === 'start') {
    const a = zone.snap(lat, lon);
    s.node = a.node;
    s.heading = (((headingDeg || 0) % 360) + 360) % 360;
    s.start = [s.node, s.heading];
    s.stack = [];
    s.came = null;
    intro = M.explore.start(name, M.compass(compassIndex(s.heading)), M.onLabel(zone.edgeLabel(a.u, a.v)));
    const d = r10(s.node === a.u ? a.su : a.sv);
    if (d) {
      // the walk goes from a node of the map: say how far along the way it is (rule 8)
      const deg = zone.degree(s.node);
      const kind = deg > 2 ? 'junction' : deg === 1 ? 'dead end' : 'mapped point';
      intro += M.explore.startOffset(kind, M.metres(d));
      extra = [zone.fact('start_offset', d, 'm', 'computed', [`node/${osm(a.u)}`, `node/${osm(a.v)}`],
        { graph: g, origin: [lat, lon], node: osm(s.node), method: 'along the nearest way' })];
    }
  } else if (command in TURNS || command === 'take') {
    const brs0 = branches(zone, s);
    let ok: BranchInfo[];
    let target: number | null = null;
    let where: 'forward' | 'left' | 'right' | 'name' | 'number';
    if (command === 'take') {
      const isName = typeof branch === 'string';
      const wanted = isName ? (branch as string).toLowerCase() : null;
      ok = brs0.filter((b, i) => branch === i || (wanted !== null && wanted === b.nameText.toLowerCase()));
      if (!ok.length && wanted) {
        // a street name for its pavement or crossing: "take via Brembo" for "the pavement of via Brembo"
        ok = brs0.filter((b) => b.name.name && M.street(b.name.name).toLowerCase() === wanted);
      }
      where = isName ? 'name' : 'number';
      ok = ok.slice(0, 1);
    } else {
      const [t, lo, hi] = TURNS[command];
      target = t;
      where = command as 'forward' | 'left' | 'right';
      ok = brs0.filter((b) => lo <= b.rel && b.rel <= hi);
    }
    if (!ok.length) intro = M.explore.noWay(where);
    else {
      let b = ok[0];
      if (target !== null) for (const c of ok) if (Math.abs(c.rel - target) < Math.abs(b.rel - target)) b = c;
      const p = b.path;
      s.stack.push([s.node!, s.heading, s.came]);
      s.node = p[p.length - 1];
      s.heading = zone.arrivalDir(p);
      s.came = p;
      intro = M.explore.walked(M.metres(b.distance_m), M.alongLabel(b.name));
      extra = [
        zone.fact('walked_distance', b.distance_m, 'm', 'computed', zone.pathWays(p), { graph: g, path_nodes: [osm(p[0]), osm(p[p.length - 1])] }),
        zone.fact('heading', pyRound(s.heading) % 360, 'deg', 'computed', [`node/${osm(p[p.length - 2])}`, `node/${osm(p[p.length - 1])}`],
          { graph: g, segment: [osm(p[p.length - 2]), osm(p[p.length - 1])] }),
      ];
    }
  } else if (command === 'back') {
    if (s.stack.length) {
      [s.node, s.heading, s.came] = s.stack.pop()!;
      intro = M.explore.back;
    } else intro = M.explore.atStart;
  } else if (command === 'home') {
    [s.node, s.heading] = s.start!;
    s.stack = [];
    s.came = null;
    intro = M.explore.home(name, M.compass(compassIndex(s.heading)));
  } else if (command === 'where') {
    const labels = new Map<string, Label>();
    for (const m of zone.nbrs(s.node!)) {
      const l = zone.edgeLabel(s.node!, m);
      labels.set(labelKey(l), l);
    }
    const here = [...labels.values()].map((l) => ({ l, t: M.label(l) })).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    const crow = r10(dist(zone.xy(lat, lon), zone.nxy(s.node!)));
    const on = M.explore.whereOn(here.map((h) => h.t), here.length === 1 ? here[0].l : null);
    const far = M.explore.whereFar(crow ? M.metres(crow) : null, name);
    intro = M.explore.where(on, far);
    extra = [zone.fact('straight_line_distance', crow, 'm', 'computed', [`node/${osm(s.node!)}`],
      { graph: g, from: [lat, lon], node: osm(s.node!) })];
  } else {
    throw new Error(`unknown explore command: ${command}`);
  }

  const brs = branches(zone, s);
  const node = s.node!;
  const facts: Fact[] = brs.map((b) => zone.fact('branch_distance', b.distance_m, 'm', 'computed',
    [`node/${osm(node)}`, `node/${osm(b.path[b.path.length - 1])}`],
    { graph: g, from_node: osm(node), to_node: osm(b.path[b.path.length - 1]), heading_deg: s.heading }));
  for (const b of brs) {
    if (b.crossings.length > 1) {
      // back every count said for a branch with several crossings
      const ev = b.crossings.map((x) => x.osm_id);
      const bIn = { graph: g, from_node: osm(node), to_node: osm(b.path[b.path.length - 1]) };
      facts.push(zone.fact('branch_crossings', ev.length, 'count', 'computed', ev, bIn));
      const ks = kinds(b.crossings);
      if (ks.length > 1) {
        for (const [k, n] of ks) facts.push(zone.fact('branch_crossings_of_kind', n, 'count', 'computed', ev,
          { ...bIn, kind: messages('en').explore.crossingKind(k[0], k[1], false) }));
      }
    }
  }
  facts.push(zone.fact('branch_count', brs.length, 'count', 'computed', [`node/${osm(node)}`],
    { graph: g, node: osm(node), heading_deg: s.heading }, zone.boundary.has(node) ? 'unknown' : 'complete'));
  if (/\d/.test(name)) facts.push(zone.fact('origin_name', name, null, 'unknown', [], { origin: [lat, lon] }));
  const [latN, lonN] = zone.LL[node];
  return {
    command,
    lang: session.lang,
    position: { lat: latN, lon: lonN, osm_node: `node/${osm(node)}` },
    heading_deg: pyRound(s.heading) % 360,
    text: intro + describe(M, zone, s, brs),
    branches: brs.map((b) => ({ name: b.nameText, leads_to: b.leadsTo, relative_direction: relativeDirection(b.hour),
      distance_m: b.distance_m, crossing: b.crossing })),
    came_from: s.came ? { name: M.label(pathLabel(zone, s.came)), relative_direction: 'behind',
      osm_node: `node/${osm(s.came[s.came.length - 2])}` } : null,
    junction_stack_depth: s.stack.length,
    at_boundary: zone.boundary.has(node),
    facts: [...facts, ...extra],
    meta: zone.meta(),
  };
}
