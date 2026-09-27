import { describe, expect, it } from 'vitest';
import { portaRomana, reference } from './helpers/fixtures';

describe('zone graph (parity with the legacy osmnx engine)', () => {
  const t0 = performance.now();
  const z = portaRomana();
  const built = performance.now() - t0;
  const ref = reference();

  it('builds in reasonable time', () => {
    console.log(`zone built in ${built.toFixed(0)} ms: ${z.n} nodes, ${z.edgeCount} edges, ${z.features.length} features`);
    expect(built).toBeLessThan(20_000);
  });

  it('has the same nodes in the same order', () => {
    const ids = ref.graph.nodes.map((n: number[]) => n[0]);
    expect(z.n).toBe(ids.length);
    expect(z.net.ids).toEqual(ids);
  });

  it('projects nodes like pyproj', () => {
    let worst = 0;
    ref.graph.nodes.forEach((n: number[], i: number) => {
      worst = Math.max(worst, Math.abs(z.x[i] - n[1]), Math.abs(z.y[i] - n[2]));
      expect(z.LL[i]).toEqual([n[3], n[4]]);
    });
    expect(worst).toBeLessThan(1e-6);
  });

  it('has the same adjacency order', () => {
    const index = new Map(z.net.ids.map((id, i) => [id, i]));
    ref.graph.adj.forEach((nbrs: number[], i: number) => {
      expect(z.nbrs(i).map((j) => z.net.ids[j])).toEqual(nbrs);
    });
    expect(index.size).toBe(z.n);
  });

  it('has the same edges, in order, with the same lengths', () => {
    const edges = ref.graph.edges;
    expect(z.edgeCount).toBe(edges.length);
    edges.forEach(([u, v, , osmid, len]: number[], e: number) => {
      expect([z.osmId(z.eu(e)), z.osmId(z.ev(e)), z.eway(e)]).toEqual([u, v, osmid]);
      expect(Math.abs(z.elen(e) - len)).toBeLessThan(1e-9);
    });
  });

  it('marks the same boundary nodes and crossings', () => {
    expect([...z.boundary].map((i) => z.osmId(i)).sort((a, b) => a - b)).toEqual(ref.graph.boundary);
    const crossings = Object.fromEntries([...z.crossings].map(([i, c]) => [String(z.osmId(i)), c]));
    expect(crossings).toEqual(ref.graph.crossings);
  });

  it('builds the same features', () => {
    expect(z.features.map((f) => [f.element, f.id, f.geom.getGeometryType()])).toEqual(ref.features);
  });
});
