import { isRecord } from './contracts';
import { requestJson } from './http';

export type RouteCoordinate = [number, number];
export interface NavigationFix { lat: number; lon: number; accuracy_m?: number; heading_deg?: number }
export interface NavigationResult {
  status: 'on_route' | 'off_route' | 'arrived' | 'no_route';
  text: string | null;
  route_id: string | null;
  off_route_m: number | null;
  remaining_m: number | null;
  remaining_min: number | null;
  next: { instruction: string; distance_m: number } | null;
  route_line: RouteCoordinate[] | null;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const distance = (v: unknown) => finite(v) && v >= 0;
const nullableDistance = (v: unknown) => v === null || distance(v);
const coordinate = (v: unknown): v is RouteCoordinate => Array.isArray(v) && v.length === 2
  && finite(v[0]) && Math.abs(v[0]) <= 90 && finite(v[1]) && Math.abs(v[1]) <= 180;
export function parseNavigation(v: unknown): NavigationResult {
  if (!isRecord(v) || !['on_route', 'off_route', 'arrived', 'no_route'].includes(String(v.status))
    || !(v.text === null || typeof v.text === 'string') || !(v.route_id === null || typeof v.route_id === 'string')
    || !nullableDistance(v.off_route_m) || !nullableDistance(v.remaining_m) || !nullableDistance(v.remaining_min)
    || !(v.next === null || (isRecord(v.next) && typeof v.next.instruction === 'string' && distance(v.next.distance_m)))
    || !(v.route_line === null || (Array.isArray(v.route_line) && v.route_line.length >= 2 && v.route_line.every(coordinate)))) {
    throw new Error('Invalid navigation response');
  }
  if (v.status !== 'no_route' && (v.route_id === null || v.off_route_m === null || v.remaining_m === null || v.remaining_min === null)) {
    throw new Error('Incomplete navigation response');
  }
  return v as unknown as NavigationResult;
}
export function navigate(sessionId: string, fix: NavigationFix, signal: AbortSignal) {
  return requestJson(`/session/${encodeURIComponent(sessionId)}/navigate`, parseNavigation,
    { body: fix, signal, timeoutMs: 5_000 });
}
export function stopNavigation(sessionId: string) {
  return requestJson(`/session/${encodeURIComponent(sessionId)}/navigate/stop`, (value) => {
    if (!isRecord(value) || value.status !== 'stopped') throw new Error('Invalid navigation stop');
    return value;
  }, { body: {}, timeoutMs: 5_000 });
}

/** Demo-only geometry: roughly ten metres between fixes, with an explicit detour. */
export function demoFixes(line: RouteCoordinate[]): NavigationFix[] {
  const sampled: RouteCoordinate[] = [line[0]];
  let carry = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1], b = line[index];
    const length = Math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 111_000 * Math.cos(a[0] * Math.PI / 180));
    if (!length) continue;
    for (let along = 10 - carry; along <= length; along += 10) {
      const ratio = along / length;
      sampled.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]);
    }
    carry = (carry + length) % 10;
  }
  const end = line[line.length - 1];
  if (sampled.at(-1)?.[0] !== end[0] || sampled.at(-1)?.[1] !== end[1]) sampled.push(end);
  const turn = Math.min(sampled.length - 1, Math.max(1, Math.floor((sampled.length - 1) * .4)));
  const here = sampled[turn];
  const scale = 111_000 * Math.max(.01, Math.cos(here[0] * Math.PI / 180));
  // Prefer the side furthest from the entire route, avoiding a parallel segment
  // that could otherwise make the demonstration's detour appear on route.
  const nearest = (point: RouteCoordinate) => line.slice(1).reduce((nearestDistance, b, i) => {
    const a = line[i];
    const x = (point[1] - a[1]) * scale, y = (point[0] - a[0]) * 111_000;
    const dx = (b[1] - a[1]) * scale, dy = (b[0] - a[0]) * 111_000;
    const fraction = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
    return Math.min(nearestDistance, Math.hypot(x - fraction * dx, y - fraction * dy));
  }, Infinity);
  let off: RouteCoordinate = [here[0] + 50 / 111_000, here[1]];
  let clearance = nearest(off);
  for (let angle = 15; angle < 360; angle += 15) {
    const radians = angle * Math.PI / 180;
    const candidate: RouteCoordinate = [here[0] + 50 * Math.cos(radians) / 111_000, here[1] + 50 * Math.sin(radians) / scale];
    const gap = nearest(candidate);
    if (gap > clearance) { off = candidate; clearance = gap; }
  }
  const points = [...sampled.slice(1, turn), off, off, off, ...sampled.slice(turn)];
  return points.map(([lat, lon]) => ({ lat, lon, accuracy_m: 5 }));
}
