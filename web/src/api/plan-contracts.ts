/**
 * Projections of contracts/plan.schema.json and the request bodies documented
 * in contracts/README.md. The shared schemas remain the source of truth.
 * Guards cover consumed fields; they are not a replacement draft-07 validator.
 */
import { isFact, isMeta, isRecord } from './contracts';
import type { Fact, Meta } from './contracts';

export type ConstraintKind = 'unsignalled_crossings' | 'signals_without_sound'
  | 'steps' | 'construction' | 'main_roads' | 'transfers' | 'walking_over_min';
export type ConstraintStrength = 'avoid_when_possible' | 'require';
export type Constraint = { strength: ConstraintStrength } & (
  | { kind: 'walking_over_min'; value: number }
  | { kind: Exclude<ConstraintKind, 'walking_over_min'>; value?: number }
);
export interface Point { name: string; lat: number; lon: number }
export type PlaceRequest = { lat: number; lon: number; name?: string } | { name: string };
export interface DetourTolerance { min: number; pct: number }
type Tri = 'yes' | 'no' | 'unknown';
export interface Crossing { signals: Tri; sound: Tri; tactile_paving: Tri; osm_id: string }
export interface ConstraintStatus { kind: ConstraintKind; status: 'satisfied' | 'violated' | 'unknown' }
export interface Leg {
  mode: 'foot' | 'bus' | 'tram' | 'subway' | 'rail' | 'stop' | 'other';
  from: Point;
  to: Point;
  distance_m: number | null;
  duration_min: number;
  line: string | null;
  departure: string | null;
  arrival: string | null;
}
export interface Route {
  id: string;
  mode: 'foot' | 'transit';
  summary: string;
  duration_min: number;
  walk_min: number;
  transfers: number;
  leave_at: string;
  arrive_at: string;
  legs: Leg[];
  crossings: Crossing[];
  constraint_status: ConstraintStatus[];
  trade_off: { extra_min: number; violating_crossings: number; unknown_crossings: number };
  warnings: string[];
  facts: Fact[];
}
export interface PlanStop { place: string; osm_id: string; detour_min: number; duration_min: number }
export interface StopCandidate { place: string; osm_id: string; lat: number; lon: number; detour_min: number }
export interface Plan {
  origin: Point;
  destination: Point;
  depart_at: string;
  lang: 'en' | 'it';
  plan_version: number;
  constraints: Constraint[];
  detour_tolerance: DetourTolerance;
  text: string;
  routes: Route[];
  compliant_route_available: Tri;
  selected_route_id: string | null;
  stop: PlanStop | null;
  stop_candidates: StopCandidate[];
  differences: string[];
  facts: Fact[];
  unknown: string[];
  meta: Meta;
}

export interface PlanRequest {
  destination: PlaceRequest;
  origin?: PlaceRequest;
  depart_at?: string;
  constraints?: Constraint[];
  detour_tolerance?: DetourTolerance;
}
export type StopKind = 'supermarket' | 'pharmacy' | 'cafe' | 'bakery' | 'atm' | 'shop';
export const stopKinds: readonly StopKind[] = ['supermarket', 'pharmacy', 'cafe', 'bakery', 'atm', 'shop'];
interface VersionCondition { if_version?: number }
/** Keys are endpoint suffixes; values are the exact documented JSON bodies. */
export interface PlanMutation {
  select: { route_id: string } & VersionCondition;
  'stop/candidates': { kind: StopKind } & VersionCondition;
  stop: ({ osm_id: string; duration_min: number } | { osm_id: null }) & VersionCondition;
  constraints: { constraints: Constraint[]; detour_tolerance?: DetourTolerance } & VersionCondition;
  depart: { depart_at: string } & VersionCondition;
}

const kinds: readonly ConstraintKind[] = ['unsignalled_crossings', 'signals_without_sound',
  'steps', 'construction', 'main_roads', 'transfers', 'walking_over_min'];
const isString = (value: unknown): value is string => typeof value === 'string';
const isText = (value: unknown): value is string => isString(value) && value.length > 0;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonnegative = (value: unknown): value is number => isNumber(value) && value >= 0;
const isCount = (value: unknown): value is number => isNonnegative(value) && Number.isInteger(value);
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);
const isOneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  isString(value) && choices.includes(value as T);
const isKind = (value: unknown): value is ConstraintKind => isOneOf(value, kinds);
const isTri = (value: unknown): value is Tri => isOneOf(value, ['yes', 'no', 'unknown']);
const isOsmId = (value: unknown): value is string =>
  isString(value) && /^(node|way|relation)\/[0-9]+$/.test(value);
const isDateTime = (value: unknown): value is string => isString(value)
  && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const isNullableDateTime = (value: unknown): value is string | null => value === null || isDateTime(value);

function isPoint(value: unknown): value is Point {
  return isRecord(value) && isString(value.name)
    && isNumber(value.lat) && value.lat >= -90 && value.lat <= 90
    && isNumber(value.lon) && value.lon >= -180 && value.lon <= 180;
}
function isConstraint(value: unknown): value is Constraint {
  return isRecord(value) && isKind(value.kind)
    && isOneOf(value.strength, ['avoid_when_possible', 'require'])
    && (!('value' in value) || isNonnegative(value.value))
    && (value.kind !== 'walking_over_min' || isNonnegative(value.value));
}
function isTolerance(value: unknown): value is DetourTolerance {
  return isRecord(value) && isNonnegative(value.min) && isNonnegative(value.pct);
}
function isCrossing(value: unknown): value is Crossing {
  return isRecord(value) && isTri(value.signals) && isTri(value.sound)
    && isTri(value.tactile_paving) && isOsmId(value.osm_id);
}
function isConstraintStatus(value: unknown): value is ConstraintStatus {
  return isRecord(value) && isKind(value.kind) && isOneOf(value.status, ['satisfied', 'violated', 'unknown']);
}
function isLeg(value: unknown): value is Leg {
  return isRecord(value) && isOneOf(value.mode, ['foot', 'bus', 'tram', 'subway', 'rail', 'stop', 'other'])
    && isPoint(value.from) && isPoint(value.to)
    && (value.distance_m === null || isNonnegative(value.distance_m))
    && isNonnegative(value.duration_min) && (value.line === null || isString(value.line))
    && isNullableDateTime(value.departure) && isNullableDateTime(value.arrival);
}
function isRoute(value: unknown): value is Route {
  return isRecord(value) && isText(value.id) && isOneOf(value.mode, ['foot', 'transit'])
    && isText(value.summary) && isNonnegative(value.duration_min) && isNonnegative(value.walk_min)
    && isCount(value.transfers) && isDateTime(value.leave_at) && isDateTime(value.arrive_at)
    && isArrayOf(value.legs, isLeg) && value.legs.length > 0 && isArrayOf(value.crossings, isCrossing)
    && isArrayOf(value.constraint_status, isConstraintStatus) && isRecord(value.trade_off)
    && isNumber(value.trade_off.extra_min) && isCount(value.trade_off.violating_crossings)
    && isCount(value.trade_off.unknown_crossings) && isArrayOf(value.warnings, isText)
    && isArrayOf(value.facts, isFact);
}
function isStop(value: unknown): value is PlanStop {
  return isRecord(value) && isString(value.place) && isOsmId(value.osm_id)
    && isNonnegative(value.detour_min) && isNonnegative(value.duration_min);
}
function isStopCandidate(value: unknown): value is StopCandidate {
  return isRecord(value) && isString(value.place) && isOsmId(value.osm_id)
    && isNumber(value.lat) && isNumber(value.lon) && isNonnegative(value.detour_min);
}
function isPlan(value: unknown): value is Plan {
  return isRecord(value) && isPoint(value.origin) && isPoint(value.destination)
    && isDateTime(value.depart_at) && isOneOf(value.lang, ['en', 'it'])
    && isCount(value.plan_version) && value.plan_version > 0
    && isArrayOf(value.constraints, isConstraint) && isTolerance(value.detour_tolerance)
    && isText(value.text) && isArrayOf(value.routes, isRoute) && isTri(value.compliant_route_available)
    && (value.selected_route_id === null || isString(value.selected_route_id))
    && (value.stop === null || isStop(value.stop)) && isArrayOf(value.stop_candidates, isStopCandidate)
    && isArrayOf(value.differences, isText) && isArrayOf(value.facts, isFact)
    && isArrayOf(value.unknown, isText) && isMeta(value.meta) && isDateTime(value.meta.computed_at);
}

/** Pure lookup: never select a replacement route or change server state. */
export function findSelectedRoute(plan: Plan): Route | null {
  return plan.routes.find((route) => route.id === plan.selected_route_id) ?? null;
}

/** Unknown compliance remains unknown; known violations of a requirement fail closed. */
export function validateHardRequirements(plan: Plan): void {
  for (const route of plan.routes) {
    for (const constraint of plan.constraints) {
      const statuses = route.constraint_status.filter((item) => item.kind === constraint.kind);
      if (statuses.length !== 1) throw new Error(`Invalid plan: route ${route.id} has missing or duplicate constraint status`);
      if (constraint.strength === 'require' && statuses[0].status === 'violated') {
        throw new Error(`Invalid plan: route ${route.id} violates a required constraint`);
      }
    }
  }
}

export function parsePlan(value: unknown): Plan {
  if (!isPlan(value)) throw new Error('Invalid plan response');
  if (new Set(value.routes.map((route) => route.id)).size !== value.routes.length) {
    throw new Error('Invalid plan: duplicate route IDs');
  }
  if (value.selected_route_id !== null && !findSelectedRoute(value)) {
    throw new Error('Invalid plan: selected route is not among the returned routes');
  }
  if (new Set(value.constraints.map((constraint) => constraint.kind)).size !== value.constraints.length) {
    throw new Error('Invalid plan: duplicate constraints');
  }
  validateHardRequirements(value);
  for (const route of value.routes) {
    const stops = route.legs.filter((leg) => leg.mode === 'stop');
    if (value.stop === null ? stops.length !== 0
      : stops.length !== 1 || stops[0].duration_min !== value.stop.duration_min) {
      throw new Error('Invalid plan: route stop legs do not match the current stop');
    }
  }
  return value;
}
