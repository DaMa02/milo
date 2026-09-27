/**
 * Map features (railways, water, construction sites, parks, shops, pharmacies, cafés, cash machines...) built
 * from an Overpass answer with osmnx's rules: nodes are points, open ways are lines, closed ways are polygons
 * when their tags describe an area, and multipolygon or boundary relations are (multi)polygons.
 */
import * as J from '../geo/jsts';
import type { Geom } from '../geo/jsts';
import type { Pt } from '../geo/projection';
import type { FeatureTags } from './overpass';
import type { OsmElement, OsmRelation, OverpassResponse, Tags } from './types';

export interface Feature {
  element: 'node' | 'way' | 'relation';
  id: number;
  tags: Tags;
  /** Projected geometry (metres). */
  geom: Geom;
}

type PolygonRule = { polygon: 'all' } | { polygon: 'passlist' | 'blocklist'; values: Set<string> };

// https://wiki.openstreetmap.org/wiki/Overpass_turbo/Polygon_Features, as osmnx uses it
const POLYGON_FEATURES: Record<string, PolygonRule> = {
  aeroway: { polygon: 'blocklist', values: new Set(['taxiway']) },
  amenity: { polygon: 'all' },
  area: { polygon: 'all' },
  'area:highway': { polygon: 'all' },
  barrier: { polygon: 'passlist', values: new Set(['city_wall', 'ditch', 'hedge', 'retaining_wall', 'spikes']) },
  boundary: { polygon: 'all' },
  building: { polygon: 'all' },
  'building:part': { polygon: 'all' },
  craft: { polygon: 'all' },
  golf: { polygon: 'all' },
  highway: { polygon: 'passlist', values: new Set(['elevator', 'escape', 'rest_area', 'services']) },
  historic: { polygon: 'all' },
  indoor: { polygon: 'all' },
  landuse: { polygon: 'all' },
  leisure: { polygon: 'all' },
  man_made: { polygon: 'blocklist', values: new Set(['cutline', 'embankment', 'pipeline']) },
  military: { polygon: 'all' },
  natural: { polygon: 'blocklist', values: new Set(['arete', 'cliff', 'coastline', 'ridge', 'tree_row']) },
  office: { polygon: 'all' },
  place: { polygon: 'all' },
  power: { polygon: 'passlist', values: new Set(['generator', 'plant', 'substation', 'transformer']) },
  public_transport: { polygon: 'all' },
  railway: { polygon: 'passlist', values: new Set(['platform', 'roundhouse', 'station', 'turntable']) },
  ruins: { polygon: 'all' },
  shop: { polygon: 'all' },
  tourism: { polygon: 'all' },
  waterway: { polygon: 'passlist', values: new Set(['boatyard', 'dam', 'dock', 'riverbank']) },
};

function isAreaWay(nodes: number[], tags: Tags): boolean {
  if (nodes[0] !== nodes[nodes.length - 1] || tags.area === 'no') return false;
  for (const k of Object.keys(tags)) {
    const rule = POLYGON_FEATURES[k];
    if (!rule) continue;
    if (rule.polygon === 'all') return true;
    if (rule.polygon === 'passlist' && rule.values.has(tags[k])) return true;
    if (rule.polygon === 'blocklist' && !rule.values.has(tags[k])) return true;
  }
  return false;
}

function matches(tags: Tags | undefined, query: FeatureTags): boolean {
  if (!tags) return false;
  for (const [k, v] of Object.entries(query)) {
    const t = tags[k];
    if (t === undefined) continue;
    if (v === true || v.includes(t)) return true;
  }
  return false;
}

function relationGeometry(rel: OsmRelation, wayGeoms: Map<number, Geom>): Geom {
  const outerLines: Geom[] = [];
  const innerLines: Geom[] = [];
  const outerPolys: Geom[] = [];
  const innerPolys: Geom[] = [];
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const g = wayGeoms.get(m.ref);
    if (!g) return J.gf.createPolygon();
    const poly = J.geomType(g) === 'Polygon';
    if (m.role === 'outer') (poly ? outerPolys : outerLines).push(g);
    else if (m.role === 'inner') (poly ? innerPolys : innerLines).push(g);
  }
  for (const merged of J.lineMerge(outerLines)) outerPolys.push(...J.polygonize(merged));
  for (const merged of J.lineMerge(innerLines)) innerPolys.push(...J.polygonize(merged));
  let geom: Geom;
  if (!innerPolys.length) geom = J.unionAll(outerPolys);
  else {
    const withHoles = outerPolys.map((outer) => {
      const holes = innerPolys.filter((inner) => outer.contains(inner));
      return holes.length ? outer.difference(J.unionAll(holes)) : outer;
    });
    geom = J.unionAll(withHoles);
  }
  return J.isArea(geom) ? geom : J.gf.createPolygon();
}

/**
 * Features matching `query` that intersect the zone polygon (lat/lon), sorted as osmnx sorts them
 * (by element type name, then id), with geometries projected by `project`.
 */
export function buildFeatures(resp: OverpassResponse, query: FeatureTags, zonePolygonLL: Geom,
  project: (lat: number, lon: number) => Pt): Feature[] {
  const coords = new Map<number, [number, number]>(); // id -> lon, lat
  const els = resp.elements as OsmElement[];
  for (const el of els) if (el.type === 'node') coords.set(el.id, [el.lon, el.lat]);
  const llGeoms = new Map<number, Geom>(); // way id -> geometry in lon/lat
  const out: { f: Omit<Feature, 'geom'>; ll: Geom }[] = [];
  for (const el of els) {
    if (el.type === 'node') {
      if (matches(el.tags, query)) out.push({ f: { element: 'node', id: el.id, tags: el.tags ?? {} }, ll: J.point({ x: el.lon, y: el.lat }) });
    } else if (el.type === 'way') {
      const pts = el.nodes.map((n) => coords.get(n)).filter((c): c is [number, number] => !!c).map(([x, y]) => ({ x, y }));
      let g: Geom;
      try {
        if (pts.length !== el.nodes.length) throw new Error('missing nodes');
        g = isAreaWay(el.nodes, el.tags ?? {}) ? J.polygon(pts) : J.line(pts);
      } catch {
        g = isAreaWay(el.nodes, el.tags ?? {}) ? J.gf.createPolygon() : J.gf.createLineString();
      }
      llGeoms.set(el.id, g);
      if (matches(el.tags, query)) out.push({ f: { element: 'way', id: el.id, tags: el.tags ?? {} }, ll: g });
    }
  }
  for (const el of els) {
    if (el.type !== 'relation') continue;
    const type = el.tags?.type;
    if (type !== 'multipolygon' && type !== 'boundary') continue;
    let g: Geom;
    try {
      g = relationGeometry(el, llGeoms);
    } catch {
      g = J.gf.createPolygon();
    }
    // relations are kept whatever their tags (osmnx keeps them all, then filters by tags below)
    out.push({ f: { element: 'relation', id: el.id, tags: el.tags ?? {} }, ll: g });
  }
  const typeOrder = { node: 0, relation: 1, way: 2 };
  const kept = out.filter(({ f, ll }) => matches(f.tags, query) && !ll.isEmpty() && ll.intersects(zonePolygonLL));
  kept.sort((a, b) => typeOrder[a.f.element] - typeOrder[b.f.element] || a.f.id - b.f.id);
  return kept.map(({ f, ll }) => ({ ...f, geom: projectGeom(ll, project) }));
}

/** Copies a lon/lat geometry into projected metres. */
export function projectGeom(g: Geom, project: (lat: number, lon: number) => Pt): Geom {
  return J.mapCoords(g, (p) => project(p.y, p.x));
}
