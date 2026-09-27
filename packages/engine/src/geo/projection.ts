/**
 * Coordinates: WGS84 latitude/longitude at the edges, metres in the local UTM zone inside the engine.
 *
 * Every length, distance and bearing the engine computes is planar, in the UTM projection of the zone
 * (the same one osmnx and geopandas pick), except edge lengths, which are great-circle distances
 * between the two nodes, as osmnx computes them.
 */
import proj4, { type Converter } from 'proj4';

export const EARTH_RADIUS_M = 6_371_009;

export interface Pt {
  x: number;
  y: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

const DEG_TO_RAD = Math.PI / 180;
const rad = (d: number) => d * DEG_TO_RAD; // numpy deg2rad

/** Great-circle distance in metres (haversine, osmnx's formula and earth radius). */
export function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y1 = rad(lat1);
  const y2 = rad(lat2);
  const dy = y2 - y1;
  const dx = rad(lon2) - rad(lon1);
  const sy = Math.sin(dy / 2);
  const sx = Math.sin(dx / 2);
  let h = sy * sy + Math.cos(y1) * Math.cos(y2) * sx * sx;
  h = Math.min(1, h);
  return 2 * Math.asin(Math.sqrt(h)) * EARTH_RADIUS_M;
}

/** The UTM zone (EPSG code) that contains a point. */
export function utmEpsg(lat: number, lon: number): number {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  return (lat >= 0 ? 32600 : 32700) + zone;
}

/** Forward and inverse UTM projection for one zone. */
export class Projection {
  readonly epsg: number;
  private readonly converter: Converter;

  constructor(lat: number, lon: number) {
    this.epsg = utmEpsg(lat, lon);
    const zone = this.epsg % 100;
    const south = this.epsg >= 32700 ? ' +south' : '';
    this.converter = proj4('EPSG:4326', `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`) as Converter;
  }

  xy(lat: number, lon: number): Pt {
    const [x, y] = this.converter.forward([lon, lat]);
    return { x, y };
  }

  /** Latitude and longitude of a projected point, rounded to 6 decimals (about 10 cm). */
  ll(p: Pt): [number, number] {
    const [lon, lat] = this.converter.inverse([p.x, p.y]);
    return [round6(lat), round6(lon)];
  }

  /** Unrounded inverse, for building geometries back in degrees. */
  llRaw(x: number, y: number): [number, number] {
    const [lon, lat] = this.converter.inverse([x, y]);
    return [lat, lon];
  }
}

/** Python's round(v, 6) for coordinates. */
export function round6(v: number): number {
  return pyRound(v, 6);
}

/**
 * Python's round(x, digits): the exact binary value correctly rounded, exact ties to even. toFixed rounds the
 * exact value too (ties up), so only exact ties need the half-to-even rule.
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 60));
  const dot = exact.indexOf('.');
  const tail = exact.slice(dot + 1 + digits);
  if (tail[0] === '5' && /^50*$/.test(tail)) {
    // an exact tie: keep the even neighbour
    const down = Number(exact.slice(0, dot + 1 + digits).replace(/\.$/, ''));
    const lastDigit = Number(exact[dot + digits] === '.' ? exact[dot - 1] : exact[dot + digits]);
    const step = 10 ** -digits;
    const r = lastDigit % 2 === 0 ? down : Number((down + step).toFixed(digits));
    return x < 0 ? -r : r;
  }
  return digits === 0 ? Math.sign(x) * Math.round(Math.abs(x)) : Number(x.toFixed(digits));
}
