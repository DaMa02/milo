import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Zone, type ZoneData } from '../../src/zone';

const dir = fileURLToPath(new URL('../fixtures/porta-romana/', import.meta.url));

export function readGz<T = unknown>(name: string): T {
  return JSON.parse(gunzipSync(readFileSync(dir + name)).toString('utf8')) as T;
}

/** The Porta Romana test zone of the legacy engine: 1.5 km around Talent Garden, answers within 800 m. */
export const PORTA_ROMANA_SPEC = {
  name: 'Porta Romana, Milan',
  center: [45.44386, 9.20808] as [number, number],
  dist: 1500,
  answerRadius: 800,
  centerName: 'Talent Garden',
};

export const FROZEN_NOW = new Date('2026-09-26T17:30:00Z');

let zone: Zone | null = null;

export function portaRomana(): Zone {
  if (!zone) {
    const data: ZoneData = { spec: PORTA_ROMANA_SPEC, network: readGz('network.json.gz'), features: readGz('features.json.gz') };
    zone = new Zone(data, { snapshot: '2026-09-26', now: () => FROZEN_NOW });
  }
  return zone;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reference = any;
let ref: Reference | null = null;

export function reference(): Reference {
  if (!ref) ref = readGz('reference.json.gz');
  return ref;
}

/** The legacy demo's names for its two places. */
export const PORTA_ROMANA_ALIASES: Record<string, [number, number, string]> = {
  'talent garden': [45.44386, 9.20808, 'Talent Garden'],
  destination: [45.44658, 9.20584, 'the destination on viale Isonzo'],
  party: [45.44658, 9.20584, 'the destination on viale Isonzo'],
  'viale isonzo': [45.44658, 9.20584, 'the destination on viale Isonzo'],
  there: [45.44658, 9.20584, 'the destination on viale Isonzo'],
};
