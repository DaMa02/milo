/**
 * Planar geometry in metres, written to give the same numbers as GEOS/JTS (and so shapely) for the few
 * operations the engine runs in tight loops: point-segment distance, projecting a point on a line and
 * interpolating a point along it. Polygons and set operations go through JSTS (geo/jsts.ts).
 */
import type { Pt } from './projection';

const RAD_TO_DEG = 180 / Math.PI; // Python math.degrees

export function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Python's a % n for floats: the result has the sign of n. */
export function mod(a: number, n: number): number {
  const r = a % n;
  return r !== 0 && (r < 0) !== (n < 0) ? r + n : r;
}

/** Degrees clockwise from north, from p to q. */
export function bearing(p: Pt, q: Pt): number {
  return mod(Math.atan2(q.x - p.x, q.y - p.y) * RAD_TO_DEG, 360);
}

/** Signed angle in (-180, 180]: negative is left of the heading. */
export function relAngle(absolute: number, heading: number): number {
  return mod(absolute - heading + 180, 360) - 180;
}

/** JTS Distance.pointToSegment. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  if (a.x === b.x && a.y === b.y) return dist(p, a);
  const len2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
  const r = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
  if (r <= 0) return dist(p, a);
  if (r >= 1) return dist(p, b);
  const s = ((a.y - p.y) * (b.x - a.x) - (a.x - p.x) * (b.y - a.y)) / len2;
  return Math.abs(s) * Math.sqrt(len2);
}

/** JTS LineSegment.projectionFactor. */
export function projectionFactor(p: Pt, a: Pt, b: Pt): number {
  if (p.x === a.x && p.y === a.y) return 0;
  if (p.x === b.x && p.y === b.y) return 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return Number.NaN;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

/** The point of segment a-b nearest to p (JTS LineSegment.closestPoint). */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const f = projectionFactor(p, a, b);
  if (f > 0 && f < 1) return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
  return dist(a, p) < dist(b, p) ? a : b;
}

/** A polyline with the same project/interpolate semantics as shapely's LineString. */
export class Polyline {
  readonly pts: Pt[];
  readonly length: number;

  constructor(pts: Pt[]) {
    this.pts = pts;
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) total += dist(pts[i], pts[i + 1]);
    this.length = total;
  }

  /** Distance along the line of the point nearest to p (shapely project; the first nearest segment wins). */
  project(p: Pt): number {
    let best = Number.MAX_VALUE;
    let measure = -1;
    let start = 0;
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const segLen = dist(a, b);
      const d = segDist(p, a, b);
      const f = projectionFactor(p, a, b);
      const m = f <= 0 || Number.isNaN(f) ? start : f <= 1 ? start + f * segLen : start + segLen;
      if (d < best && m > -1) {
        best = d;
        measure = m;
      }
      start += segLen;
    }
    return measure < 0 ? 0 : measure;
  }

  /** The point at a distance along the line, clamped to its ends (shapely interpolate). */
  interpolate(distance: number): Pt {
    const pts = this.pts;
    if (distance < 0) distance = this.length + distance;
    if (distance <= 0 || pts.length < 2) return pts[0];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segLen = dist(a, b);
      if (total + segLen > distance) {
        const frac = (distance - total) / segLen;
        return { x: a.x + frac * (b.x - a.x), y: a.y + frac * (b.y - a.y) };
      }
      total += segLen;
    }
    return pts[pts.length - 1];
  }

  /** The point halfway along (shapely interpolate(0.5, normalized=True)). */
  midpoint(): Pt {
    return this.interpolate(0.5 * this.length);
  }

  distance(p: Pt): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i + 1 < this.pts.length; i++) best = Math.min(best, segDist(p, this.pts[i], this.pts[i + 1]));
    if (this.pts.length === 1) best = dist(p, this.pts[0]);
    return best;
  }

  /** shapely.ops.substring(line, start, end) for start < end. */
  substring(start: number, end: number): Polyline {
    const s = this.interpolate(start);
    const e = this.interpolate(end);
    const out: Pt[] = [s];
    let current = 0;
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const p1 = this.pts[i];
      const p2 = this.pts[i + 1];
      if (start < current && current < end) out.push(p1);
      else if (current >= end) break;
      current += Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
    out.push(e);
    return new Polyline(out);
  }
}
