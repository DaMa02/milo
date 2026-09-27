/** Shortest walks between two snapped points, on the zone graph or on a graph built for constraints. */
import { Overlay, byCost, pathLength, shortestPath, type Graph } from './graph';
import type { Snap } from './zone';

export const START = -1;
export const END = -2;

/**
 * The shortest walk from a to b on H: [metres including the access pieces from the input points, node path]
 * or [null, null]. `pen` charges a crossing at a snap node in full: each edge of H carries half of its nodes'
 * cost, the snapped point's own edge none.
 */
export function route(_zone: unknown, H: Graph, a: Snap, b: Snap, pen?: Map<number, number>): [number, number[]] | [null, null] {
  const g = new Overlay(H);
  const ends: [number, Snap][] = [[START, a], [END, b]];
  if (pen && pen.size) {
    for (const [name, s] of ends) {
      for (const [n, w] of [[s.u, s.su], [s.v, s.sv]] as [number, number][]) {
        const p = pen.get(n);
        if (p && H.hasNode(n)) g.addEdge(name, n, { len: w, w: w + p / 2 });
      }
    }
  }
  for (const [name, s] of ends) {
    for (const [n, w] of [[s.u, s.su], [s.v, s.sv]] as [number, number][]) if (H.hasNode(n)) g.addEdge(name, n, { len: w });
  }
  // two points snapped to the same edge are joined directly, not through its end nodes
  if ((a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u)) {
    g.addEdge(START, END, { len: Math.abs(a.su - (b.u === a.u ? b.su : b.sv)) });
  }
  const path = shortestPath(g, START, END, byCost);
  if (!path) return [null, null];
  return [pathLength(g, path) + a.off + b.off, path.slice(1, -1)];
}
