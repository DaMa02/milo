/** Per-user state: where the user starts, the virtual walk, the destination and the plan. In memory only. */
import type { Lang } from './i18n/common';
import type { Zone } from './zone';

export interface Destination {
  lat: number;
  lon: number;
  name: string;
}

export interface Session {
  id: string;
  lang: Lang;
  /** Reference point: [lat, lon, name]. */
  origin: [number, number, string];
  /** Facing given with the origin, degrees from north. */
  heading: number;
  /** Current node of the virtual walk. */
  node: number | null;
  /** Node path of the last move, for "behind you". */
  came: number[] | null;
  /** Where the walk started: [node, heading]. */
  start: [number, number] | null;
  /** Saved junctions: [node, heading, came]. */
  stack: [number, number, number[] | null][];
  destination: Destination | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan: any | null;
  /** The zone this session answers from. */
  zone: Zone;
}

let counter = 0;

export function newSession(zone: Zone, origin: [number, number, string], opts: { lang?: Lang; heading?: number; id?: string } = {}): Session {
  counter += 1;
  return {
    id: opts.id ?? `${Date.now().toString(36)}${counter.toString(36)}`,
    lang: opts.lang ?? 'en',
    origin,
    heading: ((opts.heading ?? 0) % 360 + 360) % 360,
    node: null,
    came: null,
    start: null,
    stack: [],
    destination: null,
    plan: null,
    zone,
  };
}

/** The facing every direction refers to: where exploration started, else the session's facing. */
export function refHeading(s: Session): number {
  return ((s.start ? s.start[1] : s.heading || 0) % 360 + 360) % 360;
}
