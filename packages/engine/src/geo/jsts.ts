/**
 * The polygon and set operations the engine needs, on JSTS (the JavaScript port of JTS, the library GEOS and
 * so shapely descend from). Geometries are in projected metres.
 */
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import BufferParameters from 'jsts/org/locationtech/jts/operation/buffer/BufferParameters.js';
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js';
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js';
import LineMerger from 'jsts/org/locationtech/jts/operation/linemerge/LineMerger.js';
import ArrayListImpl from 'jsts/java/util/ArrayList.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ArrayList: any = ArrayListImpl;
import 'jsts/org/locationtech/jts/monkey.js';
import type { Pt } from './projection';

/** A JSTS geometry: typed loosely, as the library ships no declarations for its modules. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Geom = any;

export const gf: Geom = new GeometryFactory();

const coord = (p: Pt) => new Coordinate(p.x, p.y);

export function point(p: Pt): Geom {
  return gf.createPoint(coord(p));
}

export function line(pts: Pt[]): Geom {
  return gf.createLineString(pts.map(coord));
}

export function ring(pts: Pt[]): Geom {
  return gf.createLinearRing(pts.map(coord));
}

export function polygon(shell: Pt[], holes: Pt[][] = []): Geom {
  return gf.createPolygon(ring(shell), holes.map(ring));
}

export function collection(geoms: Geom[]): Geom {
  return gf.createGeometryCollection(geoms);
}

export function empty(): Geom {
  return gf.createGeometryCollection([]);
}

/** shapely buffer(distance) with its default 16 segments per quarter circle. */
export function buffer(g: Geom, distance: number, quadrantSegments = 16): Geom {
  return BufferOp.bufferOp(g, distance, new BufferParameters(quadrantSegments));
}

/** shapely union_all / unary_union. */
export function unionAll(geoms: Geom[]): Geom {
  if (!geoms.length) return empty();
  return UnaryUnionOp.union(collection(geoms));
}

/** The point of g nearest to p (shapely nearest_points(g, p)[0]). */
export function nearestPoint(g: Geom, p: Pt): Pt {
  const [c] = DistanceOp.nearestPoints(g, point(p));
  return { x: c.x, y: c.y };
}

export function distanceTo(g: Geom, p: Pt): number {
  return g.distance(point(p));
}

export function polygonize(lines: Geom): Geom[] {
  const pz = new Polygonizer();
  pz.add(lines);
  return pz.getPolygons().toArray();
}

export function lineMerge(lines: Geom[]): Geom[] {
  const m = new LineMerger();
  const list = new ArrayList();
  for (const l of lines) list.add(l);
  m.add(list);
  return m.getMergedLineStrings().toArray();
}

/** A copy of g with every coordinate mapped through fn (for projecting between lon/lat and metres). */
export function mapCoords(g: Geom, fn: (p: Pt) => Pt): Geom {
  const map = (cs: { x: number; y: number }[]) => cs.map((c) => coord(fn({ x: c.x, y: c.y })));
  const t = g.getGeometryType();
  if (g.isEmpty()) return g.copy();
  switch (t) {
    case 'Point':
      return gf.createPoint(map(g.getCoordinates())[0]);
    case 'LineString':
      return gf.createLineString(map(g.getCoordinates()));
    case 'LinearRing':
      return gf.createLinearRing(map(g.getCoordinates()));
    case 'Polygon': {
      const holes = [];
      for (let i = 0; i < g.getNumInteriorRing(); i++) holes.push(gf.createLinearRing(map(g.getInteriorRingN(i).getCoordinates())));
      return gf.createPolygon(gf.createLinearRing(map(g.getExteriorRing().getCoordinates())), holes);
    }
    case 'MultiPoint':
      return gf.createMultiPoint(parts(g).map((p) => mapCoords(p, fn)));
    case 'MultiLineString':
      return gf.createMultiLineString(parts(g).map((p) => mapCoords(p, fn)));
    case 'MultiPolygon':
      return gf.createMultiPolygon(parts(g).map((p) => mapCoords(p, fn)));
    default:
      return gf.createGeometryCollection(parts(g).map((p) => mapCoords(p, fn)));
  }
}

export function parts(g: Geom): Geom[] {
  const out: Geom[] = [];
  for (let i = 0; i < g.getNumGeometries(); i++) out.push(g.getGeometryN(i));
  return out;
}

export function coords(g: Geom): Pt[] {
  return g.getCoordinates().map((c: { x: number; y: number }) => ({ x: c.x, y: c.y }));
}

export function geomType(g: Geom): string {
  return g.getGeometryType();
}

export function isArea(g: Geom): boolean {
  const t = g.getGeometryType();
  return t === 'Polygon' || t === 'MultiPolygon';
}

export function centroid(g: Geom): Pt {
  const c = g.getCentroid().getCoordinate();
  return { x: c.x, y: c.y };
}

/** shapely representative_point: a point guaranteed inside the geometry. */
export function interiorPoint(g: Geom): Pt {
  const c = g.getInteriorPoint().getCoordinate();
  return { x: c.x, y: c.y };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(g: Geom): Bounds {
  const e = g.getEnvelopeInternal();
  return { minX: e.getMinX(), minY: e.getMinY(), maxX: e.getMaxX(), maxY: e.getMaxY() };
}

/** Bounds of the geometry rotated counter-clockwise by `degrees` around `origin` (shapely affinity.rotate). */
export function rotatedBounds(g: Geom, degrees: number, origin: Pt): Bounds {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const c of g.getCoordinates()) {
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const x = origin.x + cos * dx - sin * dy;
    const y = origin.y + sin * dx + cos * dy;
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

/** The longest side of the minimum-area rotated rectangle around g (shapely minimum_rotated_rectangle). */
export function minRectLongestSide(g: Geom): number {
  const hull = coords(g.convexHull());
  if (hull.length < 3) {
    const b = bounds(g);
    return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  }
  let best = Infinity;
  let side = 0;
  for (let i = 0; i + 1 < hull.length; i++) {
    const a = hull[i];
    const b = hull[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const v = -(p.x - a.x) * uy + (p.y - a.y) * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best) {
      best = area;
      side = Math.max(maxU - minU, maxV - minV);
    }
  }
  return side;
}
