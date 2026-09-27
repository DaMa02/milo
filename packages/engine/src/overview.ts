/** Overview: the shape of the area from the session's reference point and facing (contracts/overview.schema.json). */
import * as J from './geo/jsts';
import type { Geom } from './geo/jsts';
import { bearing, closestOnSegment, dist, relAngle } from './geo/planar';
import { pyRound, type Pt } from './geo/projection';
import { clockHour, compassIndex, relativeDirection } from './i18n/common';
import { messages } from './i18n';
import { refHeading, type Session } from './session';
import { ids, WINDOW, type Fact, type Zone } from './zone';

const CONSTRUCTION_M = 400; // construction sites said in the overview
const MAIN_ROAD_M = 500; // main roads said in the overview
const MAIN_RX = /primary|secondary|trunk/;

export function r10(m: number): number {
  return Math.trunc(pyRound(m / 10) * 10);
}

export function mins(m: number, speed = 80): number {
  return Math.max(1, Math.trunc(pyRound(m / speed)));
}

/** The name of the zone's centre as spoken ("Talent Garden"), else the zone's name. */
export function centreName(zone: Zone): string {
  return zone.spec.centerName ?? zone.name;
}

/** (point, radius, name) the overview counts within: a small zone's whole answer area, else 800 m around the origin. */
export function window(zone: Zone, session: Session | null): [Pt, number, string] {
  if (zone.answerRadius <= WINDOW || !session || !session.origin) {
    return [zone.xy(zone.center[0], zone.center[1]), zone.answerRadius, centreName(zone)];
  }
  const [lat, lon, name] = session.origin;
  return [zone.xy(lat, lon), WINDOW, name];
}

interface Static {
  rail: { features: Zone['features']; geom: Geom; buf: Geom } | null;
  construction: Zone['features'];
  roads: { name: string; segments: [Pt, Pt][]; evidence: string[] }[];
}

/** Everything that does not depend on the reference point, computed once per zone. */
export function staticOf(zone: Zone): Static {
  return zone.memoize('overview.static', () => {
    const rail = zone.railway();
    const geom = zone.railUnion();
    const construction = zone.features.filter((f) => f.tags.landuse === 'construction');
    const byName = new Map<string, number[]>();
    for (let e = 0; e < zone.edgeCount; e++) {
      const t = zone.etags(e);
      if (t.name !== undefined && MAIN_RX.test(String(t.highway))) {
        const list = byName.get(t.name);
        if (list) list.push(e);
        else byName.set(t.name, [e]);
      }
    }
    const roads = [...byName.keys()].sort().map((name) => {
      const es = byName.get(name)!;
      return { name, segments: es.map((e) => zone.eline(e)), evidence: ids('way', es.map((e) => zone.eway(e))).slice(0, 10) };
    });
    return { rail: rail.length && geom ? { features: rail, geom, buf: J.buffer(geom, 10) } : null, construction, roads };
  });
}

/** The railway inside the window of radius R around (x, y): null when no railway is there. */
function railIn(zone: Zone, x: number, y: number, R: number) {
  return zone.memoize(`overview.rail:${x}:${y}:${R}`, () => {
    const r = staticOf(zone).rail;
    const disc = J.buffer(J.point({ x, y }), R);
    if (!r || !r.geom.intersects(disc)) return null;
    const rows = r.features.filter((f) => f.geom.intersects(disc));
    const diff = disc.difference(r.buf);
    const pieces = J.geomType(diff) === 'MultiPolygon' || J.geomType(diff) === 'GeometryCollection' ? J.parts(diff) : [disc];
    const parts = pieces.filter((p) => p.getArea() > disc.getArea() * 0.05);
    const counts = new Map<string, number>();
    for (const f of rows) if (typeof f.tags.name === 'string') counts.set(f.tags.name, (counts.get(f.tags.name) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    const name = counts.size ? [...counts.keys()].filter((k) => counts.get(k) === top).sort()[0] : null;
    return { geom: r.geom, inArea: r.geom.intersection(disc), ids: ids('way', rows.map((f) => f.id)), name, parts };
  });
}

function nearestOnSegments(segs: [Pt, Pt][], o: Pt): Pt {
  let best = Infinity;
  let q = segs[0][0];
  for (const [a, b] of segs) {
    const c = closestOnSegment(o, a, b);
    const d = dist(c, o);
    if (d < best) {
      best = d;
      q = c;
    }
  }
  return q;
}

export function overview(zone: Zone, session: Session) {
  const M = messages(session.lang);
  const [lat, lon, name] = session.origin;
  const heading = refHeading(session);
  const st = staticOf(zone);
  const o = zone.xy(lat, lon);
  const [wc, R, center] = window(zone, session);
  const atCenter = dist(o, wc) < 20;

  const near = (q: Pt) => {
    const hour = clockHour(relAngle(bearing(o, q), heading));
    return { d: r10(dist(q, o)), hour, q };
  };
  const nearGeom = (g: Geom) => near(J.nearestPoint(J.isArea(g) ? g.getBoundary() : g, o));
  const at = (d: number, hour: number) => M.distanceAt(M.metres(d), M.clock(hour));

  const distIn = { graph: zone.graphInputs, from: [lat, lon], heading_deg: pyRound(heading), method: 'straight line to nearest point' };
  const facts: Fact[] = [];
  const details: string[] = [];
  const barriers: Record<string, unknown>[] = [];
  const unknown: string[] = [];
  const facing = M.compass(compassIndex(heading));
  const s = zone.snap(lat, lon);
  const l = zone.edgeLabel(s.u, s.v);
  let street = l.kind !== 'steps' && l.kind !== 'footpath' && l.name ? M.street(l.name) : null;
  if (street && name.toLowerCase().includes(street.toLowerCase())) street = null;
  const text = [M.overview.facing(facing, name)];

  // railway: distance, how it runs across the facing, how it splits the area, crossing places
  const rail = railIn(zone, pyRound(wc.x), pyRound(wc.y), R);
  const places = zone.railwayPlaces().filter((p) => dist(p.point, wc) <= R).map((p) => ({ ...p, ...near(p.point) }));
  places.sort((a, b) => a.d - b.d);
  let rd = 0;
  let rq: Pt = o;
  if (rail) {
    const n0 = nearGeom(rail.geom);
    rd = n0.d;
    rq = n0.q;
    const spoken = M.overview.railwayName(rail.name);
    const seen = J.rotatedBounds(!rail.inArea.isEmpty() ? rail.inArea : rail.geom, heading, o);
    const across = M.overview.across(seen.maxX - seen.minX > seen.maxY - seen.minY);
    const n = rail.parts.length;
    const side = M.compass(compassIndex(bearing(rq, o)));
    text.push(M.overview.railway(spoken, across, at(rd, n0.hour), M.overview.split(n, side)));
    const railName = rail.name ?? 'railway';
    facts.push(zone.fact('barrier_distance', rd, 'm', 'computed', rail.ids, { ...distIn, feature: railName }));
    if (n > 2) facts.push(zone.fact('area_parts', n, 'count', 'computed', rail.ids.slice(0, 10), { graph: zone.graphInputs, railway: railName, radius_m: R }));
    barriers.push({ name: railName, kind: 'railway', relative_direction: relativeDirection(n0.hour), distance_m: rd,
      osm_ids: rail.ids.slice(0, 5), crossings_on_foot: places.length });
    const within = M.overview.within(M.metres(R), atCenter ? null : center);
    if (places.length) {
      const p0 = places[0];
      text.push(M.overview.crossPlaces(within, places.length, M.bridge(p0.road), at(p0.d, p0.hour)));
    } else text.push(M.overview.noCrossPlace(within));
    facts.push(zone.fact('railway_crossing_places', places.length, 'count', 'computed',
      places.flatMap((p) => p.evidence).length ? places.flatMap((p) => p.evidence) : rail.ids.slice(0, 10),
      { graph: zone.graphInputs, railway: railName, cluster_m: 40, radius_m: R }, 'unknown'));
    for (const p of places) {
      facts.push(zone.fact('railway_crossing_distance', p.d, 'm', 'computed', p.evidence, { ...distIn, place: M.bridge(p.road) }));
    }
    facts.push(zone.fact('barrier', railName, null, 'map_tag', rail.ids, zone.featureInputs));
    unknown.push(M.overview.railUnknown(M.metres(R), center));
  }

  // construction sites within 400 m, nearest first
  const sites: { name: string | null; d: number; hour: number; q: Pt; id: string }[] = [];
  for (const f of st.construction) {
    if (f.geom.distance(J.point(o)) > CONSTRUCTION_M) continue;
    const r = nearGeom(f.geom);
    if (r.d <= CONSTRUCTION_M) {
      sites.push({ name: typeof f.tags.name === 'string' ? f.tags.name : null, d: r.d, hour: r.hour, q: r.q, id: `${f.element}/${f.id}` });
    }
  }
  sites.sort((a, b) => a.d - b.d);
  if (sites.length) {
    const c0 = sites[0];
    const between = !!rail && c0.d < rd && Math.abs(relAngle(bearing(o, c0.q), bearing(o, rq))) < 60;
    let sent = M.overview.construction(between, c0.name, at(c0.d, c0.hour));
    if (sites.length > 1) {
      sent += M.overview.moreConstruction(sites.length - 1, M.metres(CONSTRUCTION_M), at(sites[1].d, sites[1].hour));
      facts.push(zone.fact('construction_sites', sites.length - 1, 'count', 'computed', sites.slice(1).map((x) => x.id),
        { ...zone.featureInputs, from: [lat, lon], within_m: CONSTRUCTION_M, excluding: c0.id }));
      facts.push(zone.fact('search_radius', CONSTRUCTION_M, 'm', 'unknown', [], { feature: 'construction sites' }));
    }
    details.push(`${sent}.`);
    for (const x of sites) {
      const nm = x.name ?? M.overview.constructionSite;
      facts.push(zone.fact('barrier_distance', x.d, 'm', 'computed', [x.id], { ...distIn, feature: nm }));
      facts.push(zone.fact('barrier', nm, null, 'map_tag', [x.id], zone.featureInputs));
      barriers.push({ name: nm, kind: 'construction', relative_direction: relativeDirection(x.hour), distance_m: x.d,
        osm_ids: [x.id], crossings_on_foot: null });
    }
  }

  // main roads within 500 m, grouped by name, nearest first
  const roads = st.roads.map((r) => ({ ...r, ...near(nearestOnSegments(r.segments, o)) })).filter((r) => r.d <= MAIN_ROAD_M);
  roads.sort((a, b) => a.d - b.d);
  if (roads.length) details.push(M.overview.mainRoads(roads.map((r) => M.overview.roadItem(M.street(r.name), at(r.d, r.hour)))));
  for (const r of roads) facts.push(zone.fact('main_road_distance', r.d, 'm', 'computed', r.evidence, { ...distIn, road: M.street(r.name) }));
  if (places.length) details.push(M.overview.crossings(places.map((p) => M.overview.roadItem(M.bridgePhrase(p.road, p.underpass), at(p.d, p.hour)))));
  facts.push(zone.fact('radius', R, 'm', 'unknown', [], { graph: zone.graphInputs }));
  if (/\d/.test(name)) facts.push(zone.fact('origin_name', name, null, 'unknown', [], { origin: [lat, lon] }));
  const landmarks = [
    ...places.map((p) => ({ name: M.bridgePhrase(p.road, p.underpass), kind: 'bridge', relative_direction: relativeDirection(p.hour),
      distance_m: p.d, osm_ids: p.evidence.slice(0, 5) })),
    ...roads.map((r) => ({ name: M.street(r.name), kind: 'main_road', relative_direction: relativeDirection(r.hour), distance_m: r.d,
      osm_ids: r.evidence.slice(0, 5) })),
  ];
  if (!rail && !sites.length) text.push(M.overview.nothing);
  return {
    zone: { name: zone.name, center: { lat: zone.center[0], lon: zone.center[1] }, radius_m: zone.answerRadius },
    lang: session.lang,
    reference: { place: street ? `${name}, ${street}` : name, lat, lon, heading_deg: pyRound(heading) % 360,
      text: M.overview.reference(name, street, facing) },
    text: text.join(' '),
    details: details.length ? details : [M.overview.nothingMore],
    landmarks,
    barriers,
    facts,
    unknown,
    meta: zone.meta(),
  };
}
