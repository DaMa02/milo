/** Deep comparison that lists where two JSON documents differ (numbers within a tolerance). */
export function diff(a: unknown, b: unknown, path = '$', out: string[] = [], tol = 1e-6): string[] {
  if (out.length > 20) return out;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > tol * Math.max(1, Math.abs(a), Math.abs(b))) out.push(`${path}: ${a} != ${b}`);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out, tol);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out, tol);
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

/** The legacy engine's graph source string, replaced by this engine's. */
export function normalizeReference<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc).replace(/OpenStreetMap via Overpass, osmnx [0-9.]+/g, 'OpenStreetMap via Overpass, Milo engine'));
}
