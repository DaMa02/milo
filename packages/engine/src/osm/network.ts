/**
 * The walk network of a zone, built from an Overpass answer the way osmnx builds
 * graph_from_point(center, dist, network_type="walk", simplify=False) and then converts it to an
 * undirected multigraph:
 *
 *  - every way gives one edge per pair of consecutive nodes, walkable both ways;
 *  - the graph is cut to the query polygon buffered by 500 m, reduced to its largest connected part,
 *    then cut to the bounding box itself and reduced again;
 *  - each node keeps the number of streets it had in the buffered graph, so a node on the cut can be told
 *    from a real dead end;
 *  - edge lengths are great-circle distances.
 *
 * Node and edge order follow the order networkx would give them. The engine does not depend on that order,
 * but equal choices (two ways exactly as long, a point exactly between two edges) are then settled the same
 * way as the Python engine this code was ported from, which the parity tests rely on.
 */
import { greatCircle } from '../geo/projection';
import type { Tags, OverpassResponse, OsmWay } from './types';
import { NODE_TAGS, WAY_TAGS } from './overpass';

export interface NetworkWay {
  id: number;
  tags: Tags;
}

export interface WalkNetwork {
  /** OSM node ids, in graph order. */
  ids: number[];
  lat: Float64Array;
  lon: Float64Array;
  nodeTags: (Tags | undefined)[];
  /** Streets per node in the buffered graph (osmnx street_count). */
  streetCount: Int32Array;
  /** Neighbours of each node, unique, in graph order. */
  adj: number[][];
  /** Edges in graph order: endpoints (node indices), way index and length in metres. */
  eu: Int32Array;
  ev: Int32Array;
  eway: Int32Array;
  elen: Float64Array;
  ways: NetworkWay[];
  /** Parallel edges between two nodes, first one first (the one edata() returns). */
  pairEdges: Map<number, number[]>;
  /** Snapshot of the map data (Overpass timestamp_osm_base), if known. */
  timestamp?: string;
}

/** Key of an unordered node pair. */
export function pairKey(a: number, b: number): number {
  return a < b ? a * 2 ** 21 + b : b * 2 ** 21 + a;
}

function pick(tags: Tags | undefined, keys: string[]): Tags | undefined {
  if (!tags) return undefined;
  let out: Tags | undefined;
  for (const k of keys) {
    if (tags[k] !== undefined) (out ??= {})[k] = tags[k];
  }
  return out;
}

export type Inside = (lat: number, lon: number) => boolean;

/**
 * Builds the network. `insideBuffer` tests the bounding box buffered by 500 m, `insideBox` the bounding box
 * itself (both inclusive of their edge, as shapely's intersects).
 */
export function buildWalkNetwork(resp: OverpassResponse, insideBuffer: Inside, insideBox: Inside): WalkNetwork {
  // 1. nodes and ways in answer order
  const order: number[] = [];
  const info = new Map<number, { lat: number; lon: number; tags?: Tags }>();
  const ways: { id: number; nodes: number[]; tags: Tags }[] = [];
  for (const el of resp.elements) {
    if (el.type === 'node') {
      if (!info.has(el.id)) order.push(el.id);
      info.set(el.id, { lat: el.lat, lon: el.lon, tags: pick(el.tags, NODE_TAGS) });
    } else if (el.type === 'way') {
      const w = el as OsmWay;
      const nodes = w.nodes.filter((n, i) => i === 0 || n !== w.nodes[i - 1]);
      ways.push({ id: w.id, nodes, tags: pick(w.tags, WAY_TAGS) ?? {} });
    }
  }

  // 2. the directed multigraph: succ[u] = v -> way index per key, both directions for every way
  const succ = new Map<number, Map<number, number[]>>();
  ways.forEach((w, wi) => {
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < w.nodes.length; i++) pairs.push([w.nodes[i], w.nodes[i + 1]]);
    for (const [u, v] of [...pairs, ...pairs.map(([a, b]) => [b, a] as [number, number])]) {
      if (!info.has(u) || !info.has(v)) continue;
      let m = succ.get(u);
      if (!m) succ.set(u, (m = new Map()));
      let keys = m.get(v);
      if (!keys) m.set(v, (keys = []));
      keys.push(wi);
    }
  });

  const largestComponent = (nodes: number[]): number[] => {
    const keep = new Set(nodes);
    const seen = new Set<number>();
    let best: Set<number> | null = null;
    for (const start of nodes) {
      if (seen.has(start)) continue;
      const comp = new Set<number>([start]);
      seen.add(start);
      const stack = [start];
      while (stack.length) {
        const u = stack.pop()!;
        const m = succ.get(u);
        if (!m) continue;
        for (const v of m.keys()) {
          if (keep.has(v) && !seen.has(v)) {
            seen.add(v);
            comp.add(v);
            stack.push(v);
          }
        }
      }
      if (!best || comp.size > best.size) best = comp;
    }
    return best ? nodes.filter((n) => best!.has(n)) : [];
  };

  // 3. cut to the buffered polygon, largest part; 4. cut to the box, largest part again
  const buffered = largestComponent(order.filter((n) => insideBuffer(info.get(n)!.lat, info.get(n)!.lon)));
  const inBuffer = new Set(buffered);
  const final = largestComponent(buffered.filter((n) => insideBox(info.get(n)!.lat, info.get(n)!.lon)));
  const inFinal = new Set(final);

  // 5. streets per node in the buffered graph: undirected (pair, key) edges, a self-loop counts twice
  const streets = new Map<number, number>();
  const selfLoops = new Set<number>();
  for (const u of buffered) {
    const m = succ.get(u);
    if (!m) continue;
    for (const [v, keys] of m) {
      if (!inBuffer.has(v)) continue;
      if (u === v) {
        selfLoops.add(u);
        continue;
      }
      if (u < v) {
        // the reverse direction has the same keys: count each undirected edge once
        const rev = succ.get(v)?.get(u)?.length ?? 0;
        const n = Math.max(keys.length, rev);
        streets.set(u, (streets.get(u) ?? 0) + n);
        streets.set(v, (streets.get(v) ?? 0) + n);
      } else if (!succ.get(v)?.has(u)) {
        streets.set(u, (streets.get(u) ?? 0) + keys.length);
        streets.set(v, (streets.get(v) ?? 0) + keys.length);
      }
    }
  }
  for (const u of selfLoops) streets.set(u, (streets.get(u) ?? 0) + 2);

  // 6. node order of the projected graph: first appearance in the directed edge iteration
  const nodeOrder: number[] = [];
  const placed = new Set<number>();
  const place = (n: number) => {
    if (!placed.has(n)) {
      placed.add(n);
      nodeOrder.push(n);
    }
  };
  const directed: [number, number, number][] = []; // u, v, key
  for (const u of final) {
    const m = succ.get(u);
    if (!m) continue;
    for (const [v, keys] of m) {
      if (!inFinal.has(v)) continue;
      for (let k = 0; k < keys.length; k++) {
        place(u);
        place(v);
        directed.push([u, v, k]);
      }
    }
  }
  for (const n of final) place(n);

  // 7. the undirected multigraph, built from the projected graph's edges: nodes in their new order, each
  // node's successors in the order they had. Adjacency in insertion order, one edge per (pair, key).
  const index = new Map<number, number>();
  nodeOrder.forEach((n, i) => index.set(n, i));
  const N = nodeOrder.length;
  const byTail = new Map<number, [number, number, number][]>();
  for (const d of directed) {
    const list = byTail.get(d[0]);
    if (list) list.push(d);
    else byTail.set(d[0], [d]);
  }
  const projected = nodeOrder.flatMap((u) => byTail.get(u) ?? []);
  const adjSets: Map<number, number>[] = []; // node -> neighbour, insertion ordered
  for (let i = 0; i < N; i++) adjSets.push(new Map());
  const keydicts = new Map<number, Map<number, number>>();
  for (const [u0, v0, k] of projected) {
    const u = index.get(u0)!;
    const v = index.get(v0)!;
    const pk = pairKey(u, v);
    let kd = keydicts.get(pk);
    if (!kd) {
      kd = new Map();
      keydicts.set(pk, kd);
    }
    if (!adjSets[u].has(v)) adjSets[u].set(v, 0);
    if (!adjSets[v].has(u)) adjSets[v].set(u, 0);
    kd.set(k, succ.get(u0)!.get(v0)![k]);
  }

  // 8. drop parallel edges of the same way (osmnx to_undirected's duplicates); 9. edges in graph order
  const eu: number[] = [];
  const ev: number[] = [];
  const eway: number[] = [];
  const pairEdges = new Map<number, number[]>();
  const seen = new Set<number>();
  for (let n = 0; n < N; n++) {
    for (const nbr of adjSets[n].keys()) {
      if (seen.has(nbr)) continue;
      const kd = keydicts.get(pairKey(n, nbr))!;
      const usedWays = new Set<number>();
      for (const wi of kd.values()) {
        if (usedWays.has(wi)) continue;
        usedWays.add(wi);
        const e = eu.length;
        eu.push(n);
        ev.push(nbr);
        eway.push(wi);
        const pk = pairKey(n, nbr);
        const list = pairEdges.get(pk);
        if (list) list.push(e);
        else pairEdges.set(pk, [e]);
      }
    }
    seen.add(n);
  }

  const lat = new Float64Array(N);
  const lon = new Float64Array(N);
  const nodeTags: (Tags | undefined)[] = new Array(N);
  const streetCount = new Int32Array(N);
  nodeOrder.forEach((id, i) => {
    const nd = info.get(id)!;
    lat[i] = nd.lat;
    lon[i] = nd.lon;
    nodeTags[i] = nd.tags;
    streetCount[i] = streets.get(id) ?? 0;
  });
  const elen = new Float64Array(eu.length);
  for (let e = 0; e < eu.length; e++) elen[e] = greatCircle(lat[eu[e]], lon[eu[e]], lat[ev[e]], lon[ev[e]]);

  return {
    ids: nodeOrder,
    lat,
    lon,
    nodeTags,
    streetCount,
    adj: adjSets.map((m) => [...m.keys()]),
    eu: Int32Array.from(eu),
    ev: Int32Array.from(ev),
    eway: Int32Array.from(eway),
    elen,
    ways: ways.map((w) => ({ id: w.id, tags: w.tags })),
    pairEdges,
    timestamp: resp.osm3s?.timestamp_osm_base,
  };
}
