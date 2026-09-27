/**
 * Live turn-by-turn guidance for a blind walker: one GPS fix in, what to say now out.
 *
 * step() is called about once a second per session (plus compass heartbeats with the same position); `state` is
 * the caller's per-session object (reset whenever the selected route or the plan version changes). Cues come early
 * enough to act, repeat as the point approaches, and never repeat for a duplicate fix. Nothing here stores
 * coordinates beyond the last few fixes.
 */
import { Polyline, bearing, dist, relAngle } from './geo/planar';
import type { Pt } from './geo/projection';
import { clockHour, labelKey, type Label } from './i18n/common';
import { messages, type Messages } from './i18n';
import { mins, r10 } from './overview';
import { footPath } from './plan';
import type { Session } from './session';
import type { Crossing, Zone } from './zone';

const TURN_DEG = 35; // a bearing change above this at a path node is a candidate maneuver
const BEND_DEG = 60; // below this, a bend along the same street is not a turn
const MERGE_M = 20; // two maneuvers closer than this are said as one sentence
const CUES = [60, 25]; // "In N metres" cues before a maneuver; then "now" at NOW_M
const NOW_M = 8;
const DONE_M = 15; // "Now on X" this far past a maneuver
const CROSS_M = 30;
const CROSS_NOW_M = 5;
const QUIET_S = 25; // progress reminder after this long without speech
const REPEAT_S = 10; // the same sentence is never said twice within this
const BACK_DROP_M = 12;
const BACK_WIN_S = 6;
const WRONG_DEG = 120;
const WRONG_FIXES = 3;
const WRONG_EVERY_S = 15;
const WALK_MPS = 0.6; // above this the GPS direction of travel is used, never the compass
const LOOK_S = 2.5; // speech latency covered by the lookahead
const JUMP_OFF_M = 60;
const REMIND_S = 12;
const REROUTE_S = 25;
const REROUTE_M = 80;
const NOISY_M = 60;
const BACK_M = 30; // progress never jumps backwards more than this in one fix (GPS noise)
const WINDOW_M = 150; // progress is searched this far ahead, so a route that doubles back does not jump

/** A way as guidance names it: a pavement goes by its street's name. */
type NavLabel = Label | { kind: 'route' };

function base(l: Label): NavLabel {
  return l.kind === 'pavement' && l.name ? { kind: 'street', name: l.name } : l;
}

const isCrossing = (l: NavLabel) => l.kind === 'crossing';
/** An unnamed way, said "a footpath", "a pavement", "a crossing". */
const isA = (l: NavLabel) => l.kind === 'footpath' || ((l.kind === 'pavement' || l.kind === 'crossing') && !('name' in l && l.name));
const key = (l: NavLabel) => (l.kind === 'route' ? 'route' : labelKey(l));

interface Turn {
  at: number;
  rel: number;
  sides: { sharp: boolean; right: boolean }[];
  onto: NavLabel;
  said: Set<string | number>;
  end?: number;
  cross?: NavCrossing;
  xsaid?: boolean;
}

interface NavCrossing extends Crossing {
  at: number;
  said?: boolean;
  now?: boolean;
}

interface Fix {
  t: number;
  p: Pt;
  s: number | null;
}

export interface NavState {
  key?: string;
  rid?: string;
  line?: Polyline;
  ll?: [number, number][];
  turns?: Turn[];
  cross?: NavCrossing[];
  segs?: [number, NavLabel][];
  dest?: Pt;
  name?: string;
  progress?: number | null;
  fixes?: Fix[];
  saidAt?: Map<string, number>;
  lastSpeech?: number;
  off?: boolean;
  over?: boolean;
  offSince?: number | null;
  warned?: number;
  arrived?: boolean;
  oriented?: boolean | null;
  wrong?: boolean;
  wrongN?: number;
  wrongAt?: number;
  lastRouteAt?: number;
  newLine?: boolean;
}

export interface NavResult {
  status: 'on_route' | 'off_route' | 'arrived' | 'no_route';
  text: string | null;
  route_id: string | null;
  off_route_m: number | null;
  remaining_m: number | null;
  remaining_min: number | null;
  next: { instruction: string; distance_m: number } | null;
  route_line: [number, number][] | null;
}

function metres(M: Messages, m: number): string {
  return M.navigate.metres(m < 100 ? Math.max(5, Math.trunc(pyRound5(m))) : r10(m));
}

function pyRound5(m: number): number {
  const x = m / 5;
  const r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r) * 5;
}

function sideText(M: Messages, t: Turn) {
  return M.navigate.side(t.sides);
}

function ontoText(M: Messages, t: Turn): string {
  return t.onto.kind === 'route' ? `onto ${M.navigate.theRoute}` : M.navigate.onto(t.onto as Label);
}

function labelText(M: Messages, l: NavLabel): string {
  return l.kind === 'route' ? M.navigate.theRoute : M.label(l as Label);
}

/** Absolute bearing as a clock position from ref (direction of travel or compass), else a compass word. */
function whereText(M: Messages, b: number, ref: number | null): string {
  return M.navigate.where(b, ref === null ? null : clockHour(relAngle(b, ref)));
}

function prepare(zone: Zone, doc: { origin: { lat: number; lon: number }; destination: { lat: number; lon: number; name?: string } },
  rid: string, path: number[], M: Messages, origin?: { lat: number; lon: number }): NavState {
  const o = origin ?? doc.origin;
  const d = doc.destination;
  const ll: [number, number][] = [[o.lat, o.lon], ...path.map((n) => zone.LL[n]), [d.lat, d.lon]];
  const line = new Polyline([zone.xy(o.lat, o.lon), ...path.map((n) => zone.nxy(n)), zone.xy(d.lat, d.lon)]);
  const at = path.map((n) => line.project(zone.nxy(n)));
  const segs: [number, NavLabel][] = path.slice(0, -1).map((n, k) => [at[k], base(zone.edgeLabel(n, path[k + 1]))]);
  if (!segs.length) segs.push([0, { kind: 'route' }]);
  const turns: Turn[] = [];
  const cross: NavCrossing[] = [];
  path.forEach((n, k) => {
    const s = at[k];
    const c = zone.crossings.get(n);
    const last = cross[cross.length - 1];
    const same = !!last && s - last.at < 30 && last.signals === c?.signals;
    if (c && !same) cross.push({ at: s, ...c }); // both ends of one crossing, or a traffic island, are one cue
    if (k > 0 && k < path.length - 1) {
      const here = zone.nxy(n);
      const rel = relAngle(bearing(here, line.interpolate(Math.min(line.length, s + 8))), bearing(line.interpolate(Math.max(0, s - 8)), here));
      const onto = base(zone.edgeLabel(n, path[k + 1]));
      const before = base(zone.edgeLabel(path[k - 1], n));
      if (Math.abs(rel) <= TURN_DEG || (key(onto) === key(before) && Math.abs(rel) < BEND_DEG)) return;
      const t: Turn = { at: s, rel: Math.abs(rel), sides: [{ sharp: Math.abs(rel) > 120, right: rel > 0 }], onto, said: new Set() };
      const prev = turns[turns.length - 1];
      if (prev && s - prev.at < 15) {
        // one bend drawn with several nodes: keep its sharpest node
        if (t.rel > prev.rel) turns[turns.length - 1] = t;
        return;
      }
      turns.push(t);
    }
  });
  const merged: Turn[] = [];
  for (const t of turns) {
    const m = merged[merged.length - 1];
    if (m && t.at - m.at < MERGE_M) {
      m.sides = [...m.sides, ...t.sides];
      m.onto = t.onto;
      m.end = t.at;
    } else merged.push(t);
  }
  for (const t of merged) {
    if (isCrossing(t.onto)) {
      const c = cross.find((x) => -5 <= x.at - t.at && x.at - t.at <= 25 && !x.said);
      if (c) {
        c.said = true;
        t.cross = c;
      }
    }
  }
  return { rid, line, ll, turns: merged, cross, segs, dest: zone.xy(d.lat, d.lon), name: d.name || M.navigate.yourDestination, progress: null };
}

function streetAt(st: NavState, s: number): NavLabel {
  const segs = st.segs!;
  let k = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i][0] <= s + 1) {
      k = i;
      break;
    }
  }
  if (!isCrossing(segs[k][1])) return segs[k][1];
  const order = [...segs.slice(k), ...segs.slice(0, k + 1).reverse()];
  return order.find(([, l]) => !isCrossing(l))?.[1] ?? { kind: 'route' };
}

function aheadTurn(st: NavState, lo = -5): Turn | undefined {
  return st.turns!.find((t) => t.at - st.progress! > lo && !t.said.has('done'));
}

function along(M: Messages, verb: 'walk' | 'keep going', street: NavLabel): string {
  const named = !(isA(street) || street.kind === 'route');
  return M.navigate.along(verb, named ? labelText(M, street) : null);
}

/** "Walk along X for N metres, then turn left onto Y." from the current progress. */
function walkText(M: Messages, st: NavState, remaining: number): string {
  const t = aheadTurn(st, 0);
  let street = streetAt(st, st.progress!);
  let first = '';
  if (isCrossing(street)) {
    first = M.navigate.firstCross('name' in street && street.name ? street.name : null);
    street = st.segs!.find(([a, l]) => a > st.progress! && !isCrossing(l))?.[1] ?? { kind: 'route' };
  }
  let walk = along(M, 'walk', street);
  walk = first + (first ? walk[0].toLowerCase() + walk.slice(1) : walk);
  if (!t) return M.navigate.walkTo(walk, metres(M, remaining), st.name!);
  if (t.at - st.progress! < CUES[0]) t.said.add(60);
  return M.navigate.walkThenTurn(walk, metres(M, t.at - st.progress!), sideText(M, t), ontoText(M, t));
}

function crossingWords(M: Messages, c: Crossing): string {
  return M.navigate.crossingWords(c.signals, c.sound);
}

/** ": a crossing with traffic lights, ..." once for a turn onto a crossing, else ".". */
function xwords(M: Messages, t: Turn): string {
  if (!t.cross || t.xsaid) return '.';
  t.xsaid = true;
  return `, ${crossingWords(M, t.cross)}`;
}

function nextOf(M: Messages, st: NavState, remaining: number) {
  const t = aheadTurn(st, 0);
  if (t) return { instruction: M.navigate.nextTurn(sideText(M, t), ontoText(M, t)), distance_m: r10(t.at - st.progress!) };
  return { instruction: M.navigate.nextArrive(st.name!), distance_m: r10(remaining) };
}

function noRoute(state: NavState, k: string, text: string, rid: string | null = null): NavResult {
  const said = state.key === k;
  for (const p of Object.keys(state)) delete (state as Record<string, unknown>)[p];
  state.key = k;
  return { status: 'no_route', text: said ? null : text, route_id: rid, off_route_m: null, remaining_m: null, remaining_min: null, next: null,
    route_line: null };
}

/** Maneuver, crossing and "now on" cues due at the current progress. */
function cues(M: Messages, st: NavState, look: number, remaining: number): string[] {
  const out: string[] = [];
  const pr = st.progress!;
  const turns = st.turns!;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const ahead = t.at - pr;
    if (t.said.has('done')) continue;
    if (ahead < -DONE_M) {
      t.said.add('done');
      const nt = aheadTurn(st, 0);
      const gap = nt ? nt.at - pr : remaining;
      if (t.said.has('now') && gap - CUES[0] >= 40) {
        const street = streetAt(st, pr);
        out.push(M.navigate.nowOn(isA(street) ? null : labelText(M, street), metres(M, gap)));
      }
      continue;
    }
    if (t.said.has('now')) continue;
    if (ahead <= NOW_M + look) {
      for (const x of [60, 25, 'now']) t.said.add(x);
      let words = M.navigate.turnNow(sideText(M, t), ontoText(M, t)) + xwords(M, t);
      const nt = i + 1 < turns.length ? turns[i + 1] : undefined;
      const c = st.cross!.find((x) => !x.said && x.at - t.at > 0 && x.at - t.at <= CROSS_M && !(nt && nt.at < x.at));
      if (c) {
        c.said = true;
        words += M.navigate.thenCrossing(metres(M, c.at - t.at), crossingWords(M, c));
      }
      if (nt && nt.at - t.at < CUES[0]) nt.said.add(60);
      if (nt && nt.at - t.at < CUES[0] && !c) {
        // after a crossing clause, the next turn keeps its own 25 m cue
        const close = nt.at - t.at < CUES[1] + 15;
        if (close) nt.said.add(25);
        words += M.navigate.thenTurn(metres(M, nt.at - t.at), sideText(M, nt), ontoText(M, nt)) + (close ? xwords(M, nt) : '.');
      }
      out.push(words);
    } else if (ahead <= CUES[1] + look && !t.said.has(25)) {
      t.said.add(60);
      t.said.add(25);
      const after = st.cross!.some((x) => pr < x.at && x.at < t.at - 2);
      out.push(M.navigate.inTurn(metres(M, ahead), after, sideText(M, t), ontoText(M, t)) + xwords(M, t));
    } else if (ahead <= CUES[0] + look && !t.said.has(60)) {
      t.said.add(60);
      out.push(`${M.navigate.inTurn(metres(M, ahead), false, sideText(M, t), ontoText(M, t))}.`);
    }
    break; // only the next turn is cued; the one after comes with its "now"
  }
  const pend = turns.find((t) => !t.said.has('now') && t.at > pr - 5);
  for (const c of st.cross!) {
    const ahead = c.at - pr;
    if (pend && pend.at < c.at - 2 && !c.said) continue; // a crossing just after a turn comes with that turn's "now"
    if (ahead < -5) {
      c.said = true;
      c.now = true;
    } else if (!c.said && ahead <= CROSS_M + look) {
      c.said = true;
      if (ahead > CROSS_NOW_M + look) out.push(M.navigate.inCrossing(metres(M, ahead), crossingWords(M, c)));
      else {
        c.now = true;
        out.push(M.navigate.crossingHere(crossingWords(M, c)));
      }
    } else if (c.signals !== 'yes' && !c.now && ahead <= CROSS_NOW_M + look) {
      c.now = true;
      out.push(M.navigate.crossingNow);
    }
  }
  return out;
}

function reroute(zone: Zone, session: Session, st: NavState, lat: number, lon: number, M: Messages): boolean {
  const doc = session.plan;
  const origin = { lat, lon };
  const path = footPath(zone, { ...doc, origin, stop: null }, 'A');
  if (!path || !path.length) return false;
  const fresh = prepare(zone, doc, 'A', path, M, origin);
  const fixes = (st.fixes ?? []).map((f) => ({ ...f, s: null }));
  Object.assign(st, fresh, { fixes });
  st.progress = 0;
  st.off = false;
  st.over = false;
  st.newLine = true;
  return true;
}

/** One fix: where the walker is on the selected foot route, and what to say now. `now` is in seconds. */
export function step(zone: Zone, session: Session, state: NavState, lat: number, lon: number, accuracyM: number | null = null,
  headingDeg: number | null = null, now = 0): NavResult {
  const M = messages(session.lang);
  const doc = session.plan;
  if (!doc) return noRoute(state, 'none', M.navigate.noPlan);
  const routes = new Map<string, { mode: string }>(doc.routes.map((r: { id: string; mode: string }) => [r.id, r]));
  const rid: string | null = doc.selected_route_id || (routes.has('A') ? 'A' : routes.keys().next().value ?? null);
  const k = `${doc.plan_version}:${rid}`;
  if (rid === null || routes.get(rid)!.mode !== 'foot') return noRoute(state, k, M.navigate.notFoot, rid);
  const first = state.key !== k || !state.line;
  if (first) {
    const path = footPath(zone, doc, rid);
    if (path === null) return noRoute(state, k, M.navigate.notFoot, rid);
    for (const p of Object.keys(state)) delete (state as Record<string, unknown>)[p];
    Object.assign(state, prepare(zone, doc, rid, path, M), { key: k, fixes: [], saidAt: new Map(), lastSpeech: now, off: false, over: false,
      offSince: null, warned: 0, arrived: false, oriented: null, wrong: false, wrongN: 0, wrongAt: -1e9 });
  }
  const st = state;
  const heading = headingDeg !== null && headingDeg >= 0 && headingDeg < 360 ? headingDeg : null;
  const acc = accuracyM ?? 15;
  const p = zone.xy(lat, lon);
  const line = st.line!;
  const off = line.distance(p);
  const text: string[] = [];

  const result = (): NavResult => {
    const spoken: string[] = [];
    for (const t of text) {
      // the same sentence is never said twice within REPEAT_S
      if (now - (st.saidAt!.get(t) ?? -1e9) >= REPEAT_S) {
        st.saidAt!.set(t, now);
        spoken.push(t);
      }
    }
    if (spoken.length) st.lastSpeech = now;
    const remaining = Math.max(0, st.line!.length - st.progress!);
    const newLine = first || !!st.newLine;
    st.newLine = false;
    const status = st.arrived ? 'arrived' : st.off ? 'off_route' : 'on_route';
    return { status, text: spoken.join(' ') || null, route_id: st.rid!, off_route_m: Math.trunc(pyRoundHalfEven(st.line!.distance(p))),
      remaining_m: st.arrived ? 0 : r10(remaining), remaining_min: st.arrived ? 0 : mins(remaining),
      next: st.arrived ? null : nextOf(M, st, remaining), route_line: newLine ? st.ll! : null };
  };

  if (st.arrived) return result();
  const noisy = acc > NOISY_M;
  if (noisy && off <= REROUTE_M && !first) return result(); // a noisy fix moves nothing and says nothing

  // direction of travel from GPS, speed along the recent fixes
  const fx = st.fixes!;
  const dup = fx.length > 0 && dist(fx[fx.length - 1].p, p) < 0.5;
  const prev = [...fx].reverse().find((f) => now - f.t >= 0.8);
  let moving: boolean | null = null;
  let travel: number | null = null;
  if (prev && !dup) {
    const v = dist(prev.p, p) / Math.max(0.5, now - prev.t);
    moving = v > WALK_MPS;
    if (moving && dist(prev.p, p) >= 1) travel = bearing(prev.p, p);
  }
  const old = fx.filter((f) => now - f.t <= 5 && f.s !== null);
  let speed = 0;
  if (old.length >= 2 && now > old[0].t) {
    speed = Math.min(2, Math.max(0, (old[old.length - 1].s! - old[0].s!) / (old[old.length - 1].t - old[0].t || 1)));
  }
  const look = speed ? Math.max(first ? 1.3 : speed, speed) * LOOK_S : 1.3 * LOOK_S;
  const ref = moving ? travel : heading; // clock reference: travel while walking, compass when still

  // on / off route
  const thr = Math.max(20, Math.min(acc, 40));
  const over = off > thr;
  const isOff = off > JUMP_OFF_M || (over && !!(st.over || st.off));
  st.over = over;
  if (!isOff && !noisy) {
    let s: number;
    if (st.progress === null || st.progress === undefined || st.off) s = line.project(p);
    else {
      const lo = Math.max(0, st.progress - BACK_M);
      s = lo + line.substring(lo, Math.min(line.length, st.progress + WINDOW_M)).project(p);
    }
    if (st.progress === null || st.progress === undefined || s >= st.progress - BACK_M) st.progress = s;
  } else if (st.progress === null || st.progress === undefined) st.progress = line.project(p);
  const remaining = Math.max(0, line.length - st.progress!);
  const routeDir = bearing(line.interpolate(st.progress!), line.interpolate(Math.min(line.length, st.progress! + 10)));

  if (first) {
    text.push(M.navigate.started(st.name!, metres(M, remaining), mins(remaining)));
    if (heading !== null && Math.abs(relAngle(routeDir, heading)) > 45) {
      const rel = relAngle(routeDir, heading);
      text.push(Math.abs(rel) > 135 ? M.navigate.turnAround : M.navigate.routeStarts(whereText(M, routeDir, heading), rel > 0));
      st.oriented = false;
    }
    text.push(walkText(M, st, remaining));
  } else if (st.oriented === false && heading !== null && !moving && Math.abs(relAngle(routeDir, heading)) <= 30) {
    st.oriented = true;
    text.push(M.navigate.goodStraight);
  } else if (st.oriented === false && moving && travel !== null && Math.abs(relAngle(routeDir, travel)) <= 45) {
    st.oriented = true;
  }

  const arriveM = Math.max(15, Math.min(acc, 25));
  const dd = dist(p, st.dest!);
  if (!first && !noisy && dd <= arriveM && (remaining < 60 || !isOff)) {
    st.arrived = true;
    const b = bearing(p, st.dest!);
    text.push(M.navigate.arrived(st.name!, dd >= 5 ? whereText(M, b, ref) : null, dd >= 5 ? metres(M, dd) : null));
    st.fixes = [...fx, { t: now, p, s: st.progress! }].slice(-8);
    return result();
  }

  if (isOff) {
    const near = line.interpolate(line.project(p));
    const where = whereText(M, bearing(p, near), ref);
    if (!st.off) {
      st.off = true;
      st.warned = now;
      st.offSince = now;
      text.push(M.navigate.offRoute(metres(M, off), where));
    } else if (now - st.offSince! > REROUTE_S || off > REROUTE_M) {
      if (reroute(zone, session, st, lat, lon, M)) {
        st.progress = 0;
        text.push(M.navigate.newRoute + walkText(M, st, st.line!.length));
        st.lastRouteAt = now;
      } else st.offSince = now;
    } else if (now - st.warned! >= REMIND_S) {
      st.warned = now;
      text.push(M.navigate.stillOff(metres(M, off), where));
    }
  } else if (!noisy) {
    if (st.off) {
      st.off = false;
      st.lastRouteAt = now;
      text.push(M.navigate.backOn + walkText(M, st, remaining));
    }
    // wrong way: progress dropping, or GPS travel against the route
    const drop = fx.filter((f) => now - f.t <= BACK_WIN_S && f.s !== null).map((f) => f.s!);
    let falling = drop.length > 0 && Math.max(...drop) - st.progress! > BACK_DROP_M;
    const against = travel !== null && !!moving && Math.abs(relAngle(travel, routeDir)) > WRONG_DEG;
    const settle = now - (st.lastRouteAt ?? -1e9) < 8; // fixes from before a new route point elsewhere
    falling = falling && !settle;
    if (!dup) st.wrongN = against && !settle ? st.wrongN! + 1 : 0; // a compass heartbeat carries no direction of travel
    if (falling || st.wrongN! >= WRONG_FIXES) {
      if (now - st.wrongAt! >= WRONG_EVERY_S) {
        st.wrong = true;
        st.wrongAt = now;
        text.push(M.navigate.wrongWay);
      }
    } else if (st.wrong && travel !== null && moving && Math.abs(relAngle(travel, routeDir)) < 60) {
      st.wrong = false;
      text.push(M.navigate.rightWay);
    }
    if (!st.wrong) text.push(...cues(M, st, look, remaining));
    const t = aheadTurn(st, 0);
    const soon = (t && t.at - st.progress! < CUES[1] + look + 5)
      || st.cross!.some((c) => !c.said && c.at - st.progress! > 0 && c.at - st.progress! < CROSS_M + look + 5);
    if (!text.length && now - st.lastSpeech! >= QUIET_S && !dup && !soon) {
      // a cue is due soon anyway
      const street = streetAt(st, st.progress!);
      text.push(t ? M.navigate.keepGoingTurn(along(M, 'keep going', street), metres(M, t.at - st.progress!))
        : M.navigate.keepGoingArrive(along(M, 'keep going', street), metres(M, remaining), st.name!));
    }
  }
  st.fixes = [...fx, { t: now, p, s: isOff ? null : st.progress! }].slice(-8);
  return result();
}

function pyRoundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
}
