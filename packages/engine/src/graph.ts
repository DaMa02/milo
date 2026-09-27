/**
 * Weighted undirected graphs over node indices, with the algorithms the engine needs: shortest paths
 * (Dijkstra, with networkx's tie-breaking), distances within a radius, connected components and the minimum
 * node cut between two sets of nodes (Menger: the number of independent ways).
 *
 * An edge carries `len` (metres) and optionally `w`, the routing cost when it differs from the length
 * (penalties for constraints). Neighbours are visited in insertion order.
 */

export interface EdgeData {
  len: number;
  w?: number;
}

export interface Graph {
  hasNode(n: number): boolean;
  /** Calls fn for each neighbour of n, in order. */
  forEachNeighbor(n: number, fn: (v: number, d: EdgeData) => void): void;
  edge(u: number, v: number): EdgeData | undefined;
}

/** A graph stored as insertion-ordered maps, like networkx.Graph. */
export class MapGraph implements Graph {
  readonly adj = new Map<number, Map<number, EdgeData>>();

  hasNode(n: number) {
    return this.adj.has(n);
  }

  addNode(n: number) {
    if (!this.adj.has(n)) this.adj.set(n, new Map());
  }

  /** networkx add_edge: adds the nodes if needed; an existing edge keeps its other attributes. */
  addEdge(u: number, v: number, d: EdgeData) {
    this.addNode(u);
    this.addNode(v);
    const old = this.adj.get(u)!.get(v);
    const data = old ? { ...old, ...stripUndefined(d) } : { ...d };
    this.adj.get(u)!.set(v, data);
    this.adj.get(v)!.set(u, data);
  }

  forEachNeighbor(n: number, fn: (v: number, d: EdgeData) => void) {
    const m = this.adj.get(n);
    if (m) for (const [v, d] of m) fn(v, d);
  }

  edge(u: number, v: number) {
    return this.adj.get(u)?.get(v);
  }

  get size() {
    return this.adj.size;
  }
}

function stripUndefined(d: EdgeData): EdgeData {
  const out: EdgeData = { len: d.len };
  if (d.w !== undefined) out.w = d.w;
  return out;
}

/** A view of `base` restricted to the nodes `keep` accepts (networkx subgraph). */
export class SubGraph implements Graph {
  constructor(readonly base: Graph, readonly keep: (n: number) => boolean) {}

  hasNode(n: number) {
    return this.keep(n) && this.base.hasNode(n);
  }

  forEachNeighbor(n: number, fn: (v: number, d: EdgeData) => void) {
    if (!this.keep(n)) return;
    this.base.forEachNeighbor(n, (v, d) => {
      if (this.keep(v)) fn(v, d);
    });
  }

  edge(u: number, v: number) {
    return this.keep(u) && this.keep(v) ? this.base.edge(u, v) : undefined;
  }
}

/**
 * `base` plus a few extra edges (the snapped start and end points of a route), appended after the base
 * neighbours as networkx appends them.
 */
export class Overlay implements Graph {
  readonly extra = new Map<number, Map<number, EdgeData>>();

  constructor(readonly base: Graph) {}

  hasNode(n: number) {
    return this.extra.has(n) || this.base.hasNode(n);
  }

  addEdge(u: number, v: number, d: EdgeData) {
    const old = this.edge(u, v);
    const data = old ? { ...old, ...stripUndefined(d) } : { ...d };
    for (const [a, b] of [[u, v], [v, u]]) {
      let m = this.extra.get(a);
      if (!m) this.extra.set(a, (m = new Map()));
      m.set(b, data);
    }
  }

  forEachNeighbor(n: number, fn: (v: number, d: EdgeData) => void) {
    const extra = this.extra.get(n);
    if (this.base.hasNode(n)) {
      this.base.forEachNeighbor(n, (v, d) => {
        if (!extra?.has(v)) fn(v, d);
      });
    }
    if (extra) for (const [v, d] of extra) fn(v, d);
  }

  edge(u: number, v: number) {
    return this.extra.get(u)?.get(v) ?? this.base.edge(u, v);
  }
}

/** A binary heap on (distance, insertion counter), as networkx's heapq entries. */
class Heap {
  private d: number[] = [];
  private c: number[] = [];
  private n: number[] = [];

  get length() {
    return this.d.length;
  }

  private less(i: number, j: number) {
    return this.d[i] < this.d[j] || (this.d[i] === this.d[j] && this.c[i] < this.c[j]);
  }

  private swap(i: number, j: number) {
    [this.d[i], this.d[j]] = [this.d[j], this.d[i]];
    [this.c[i], this.c[j]] = [this.c[j], this.c[i]];
    [this.n[i], this.n[j]] = [this.n[j], this.n[i]];
  }

  push(dist: number, count: number, node: number) {
    this.d.push(dist);
    this.c.push(count);
    this.n.push(node);
    let i = this.d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.d[0], this.n[0]];
    const last = this.d.length - 1;
    this.swap(0, last);
    this.d.pop();
    this.c.pop();
    this.n.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.d.length && this.less(l, m)) m = l;
      if (r < this.d.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

export type Weight = (d: EdgeData) => number;
export const byLength: Weight = (d) => d.len;
export const byCost: Weight = (d) => (d.w === undefined ? d.len : d.w);

/** Shortest path from s to t (networkx dijkstra_path), or null when t cannot be reached. */
export function shortestPath(g: Graph, s: number, t: number, weight: Weight = byLength): number[] | null {
  if (!g.hasNode(s) || !g.hasNode(t)) return null;
  const dist = new Map<number, number>();
  const seen = new Map<number, number>([[s, 0]]);
  const paths = new Map<number, number[]>([[s, [s]]]);
  const heap = new Heap();
  let counter = 0;
  heap.push(0, counter++, s);
  while (heap.length) {
    const [d, v] = heap.pop();
    if (dist.has(v)) continue;
    dist.set(v, d);
    if (v === t) break;
    g.forEachNeighbor(v, (u, e) => {
      const vu = d + weight(e);
      if (dist.has(u)) return;
      const su = seen.get(u);
      if (su === undefined || vu < su) {
        seen.set(u, vu);
        heap.push(vu, counter++, u);
        paths.set(u, [...paths.get(v)!, u]);
      }
    });
  }
  return dist.has(t) ? paths.get(t)! : null;
}

/** Distances from s to every node within cutoff, in the order Dijkstra settles them. */
export function distancesWithin(g: Graph, s: number, cutoff: number, weight: Weight = byLength): Map<number, number> {
  const dist = new Map<number, number>();
  if (!g.hasNode(s)) return dist;
  const seen = new Map<number, number>([[s, 0]]);
  const heap = new Heap();
  let counter = 0;
  heap.push(0, counter++, s);
  while (heap.length) {
    const [d, v] = heap.pop();
    if (dist.has(v)) continue;
    dist.set(v, d);
    g.forEachNeighbor(v, (u, e) => {
      const vu = d + weight(e);
      if (vu > cutoff || dist.has(u)) return;
      const su = seen.get(u);
      if (su === undefined || vu < su) {
        seen.set(u, vu);
        heap.push(vu, counter++, u);
      }
    });
  }
  return dist;
}

/** Sum of the edge lengths along a path (networkx path_weight). */
export function pathLength(g: Graph, path: number[]): number {
  let cost = 0;
  for (let i = 0; i + 1 < path.length; i++) cost += g.edge(path[i], path[i + 1])!.len;
  return cost;
}

/** Nodes reachable from s (s included). */
export function component(g: Graph, s: number): Set<number> {
  const out = new Set<number>([s]);
  const stack = [s];
  while (stack.length) {
    const u = stack.pop()!;
    g.forEachNeighbor(u, (v) => {
      if (!out.has(v)) {
        out.add(v);
        stack.push(v);
      }
    });
  }
  return out;
}

/**
 * Minimum node cut between node sets S and T of an undirected graph given as adjacency sets, as networkx's
 * minimum_node_cut(H, "S", "T") on the graph plus a source joined to S and a sink joined to T: unit capacity
 * on every node and every edge, and the cut nearest to the sink (the partition networkx derives from the
 * residual graph). Returns the cut and the nodes the two sides still reach without it.
 */
export function minimumNodeCut(adj: Map<number, Set<number>>, S: Set<number>, T: Set<number>):
  { cut: Set<number>; sourceSide: Set<number>; sinkSide: Set<number> } {
  const SRC = -1;
  const SNK = -2;
  const nodes = [SRC, SNK, ...adj.keys()];
  const neighbours = (n: number): Iterable<number> =>
    n === SRC ? S : n === SNK ? T : (function* () {
      yield* adj.get(n) ?? [];
      if (S.has(n)) yield SRC;
      if (T.has(n)) yield SNK;
    })();
  // path exists at all?
  const reach = new Set<number>([SRC]);
  const st = [SRC];
  while (st.length) {
    const u = st.pop()!;
    for (const v of neighbours(u)) if (!reach.has(v)) { reach.add(v); st.push(v); }
  }
  if (!reach.has(SNK)) {
    return { cut: new Set(), ...sides(adj, S, T, new Set()) };
  }
  // auxiliary digraph: node i -> (iA, iB) with iA->iB capacity 1; edge u-v -> uB->vA and vB->uA capacity 1
  const idx = new Map<number, number>();
  nodes.forEach((n, i) => idx.set(n, i));
  const A = (n: number) => 2 * idx.get(n)!;
  const B = (n: number) => 2 * idx.get(n)! + 1;
  const M = 2 * nodes.length;
  const head: number[] = new Array(M).fill(-1);
  const to: number[] = [];
  const cap: number[] = [];
  const next: number[] = [];
  const add = (u: number, v: number, c: number) => {
    to.push(v); cap.push(c); next.push(head[u]); head[u] = to.length - 1;
    to.push(u); cap.push(0); next.push(head[v]); head[v] = to.length - 1;
  };
  for (const n of nodes) add(A(n), B(n), 1);
  const seenEdge = new Set<string>();
  for (const n of nodes) {
    for (const m of neighbours(n)) {
      const key = n < m ? `${n},${m}` : `${m},${n}`;
      if (seenEdge.has(key) || n === m) continue;
      seenEdge.add(key);
      add(B(n), A(m), 1);
      add(B(m), A(n), 1);
    }
  }
  const s = B(SRC);
  const t = A(SNK);
  // Edmonds-Karp
  for (;;) {
    const prevEdge = new Int32Array(M).fill(-1);
    const visited = new Uint8Array(M);
    visited[s] = 1;
    const q = [s];
    for (let qi = 0; qi < q.length && !visited[t]; qi++) {
      const u = q[qi];
      for (let e = head[u]; e !== -1; e = next[e]) {
        if (cap[e] > 0 && !visited[to[e]]) {
          visited[to[e]] = 1;
          prevEdge[to[e]] = e;
          q.push(to[e]);
        }
      }
    }
    if (!visited[t]) break;
    for (let v = t; v !== s; v = to[prevEdge[v] ^ 1]) {
      cap[prevEdge[v]] -= 1;
      cap[prevEdge[v] ^ 1] += 1;
    }
  }
  // nodes that can still reach the sink in the residual graph
  const toSink = new Uint8Array(M);
  toSink[t] = 1;
  const q = [t];
  for (let qi = 0; qi < q.length; qi++) {
    const v = q[qi];
    for (let e = head[v]; e !== -1; e = next[e]) {
      // e is v->u; its twin e^1 is u->v, residual capacity cap[e^1]
      const u = to[e];
      if (!toSink[u] && cap[e ^ 1] > 0) {
        toSink[u] = 1;
        q.push(u);
      }
    }
  }
  const cut = new Set<number>();
  const nodeOf = (x: number) => nodes[x >> 1];
  for (let u = 0; u < M; u++) {
    if (toSink[u]) continue;
    for (let e = head[u]; e !== -1; e = next[e]) {
      if (e & 1) continue; // forward edges of the auxiliary graph only
      if (toSink[to[e]]) {
        cut.add(nodeOf(u));
        cut.add(nodeOf(to[e]));
      }
    }
  }
  cut.delete(SRC);
  cut.delete(SNK);
  return { cut, ...sides(adj, S, T, cut) };
}

function sides(adj: Map<number, Set<number>>, S: Set<number>, T: Set<number>, cut: Set<number>) {
  const grow = (start: Set<number>) => {
    const out = new Set<number>();
    const stack: number[] = [];
    for (const n of start) if (!cut.has(n) && !out.has(n)) { out.add(n); stack.push(n); }
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of adj.get(u) ?? []) if (!cut.has(v) && !out.has(v)) { out.add(v); stack.push(v); }
    }
    return out;
  };
  return { sourceSide: grow(S), sinkSide: grow(T) };
}
