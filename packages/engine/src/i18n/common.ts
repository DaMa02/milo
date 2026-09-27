/**
 * Language-neutral pieces the message catalogs share: structured labels for ways, clock positions and
 * the helpers every language uses to build its sentences.
 */
export type Lang = 'en' | 'it';
export const LANGS: Lang[] = ['en', 'it'];

/** How a blind pedestrian would call a piece of way, before it is put into words. */
export interface Label {
  kind: 'street' | 'pavement' | 'crossing' | 'steps' | 'footpath';
  /** The street name: for a pavement or crossing, the street it runs along or crosses. */
  name?: string;
}

export function labelKey(l: Label): string {
  return `${l.kind}:${l.name ?? ''}`;
}

/** The street a label refers to: its own name, or the street a pavement or crossing belongs to. */
export function streetOf(l: Label): string | undefined {
  return l.name;
}

/** A generic label: an unnamed footpath, pavement or crossing, or steps. */
export function isGeneric(l: Label): boolean {
  return l.kind === 'steps' || l.kind === 'footpath' || ((l.kind === 'pavement' || l.kind === 'crossing') && !l.name);
}

const STREET_TYPES = ['Via', 'Viale', 'Corso', 'Piazza', 'Piazzale', 'Largo', 'Vicolo', 'Ripa', 'Alzaia'];

/** 'Via Brembo' -> 'via Brembo', as spoken mid-sentence. */
export function lc(name: string): string {
  const first = name.split(/\s+/)[0];
  return name && STREET_TYPES.includes(first) ? name[0].toLowerCase() + name.slice(1) : name;
}

/** 1080 -> '1,080' (English grouping). */
export function groupThousands(n: number, sep = ','): string {
  const neg = n < 0;
  const [int, frac] = String(Math.abs(n)).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? '-' : '') + grouped + (frac ? `.${frac}` : '');
}

/** Clock position (0-11, 0 = ahead) of a signed relative angle in degrees. */
export function clockHour(rel: number): number {
  const m = ((rel % 360) + 360) % 360;
  return pyRoundInt(m / 30) % 12;
}

/** Python round() for .5 ties (half to even). */
export function pyRoundInt(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
}

/** The canonical relative direction of the contracts: ahead, right, behind, left or "at N o'clock". */
export function relativeDirection(hour: number): string {
  return ({ 0: 'ahead', 3: 'right', 6: 'behind', 9: 'left' } as Record<number, string>)[hour] ?? `at ${hour} o'clock`;
}

/** Index of the nearest of 8 compass points (0 = north). */
export function compassIndex(heading: number): number {
  return pyRoundInt(heading / 45) % 8;
}

export function cap(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
