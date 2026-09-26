/**
 * Source of truth: contracts/{fact,overview,explore-step}.schema.json.
 * These are TypeScript projections and structural guards for the fields the UI
 * consumes, not a second schema or a complete JSON Schema draft-07 validator.
 */
type Language = 'en' | 'it';
type RelativeDirection = 'ahead' | 'behind' | 'left' | 'right'
  | `at ${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12} o'clock`;
type Tri = 'yes' | 'no' | 'unknown';

export interface Fact {
  type: string;
  value: number | string | boolean | null;
  unit: 'm' | 'min' | 'count' | 'ratio' | 'deg' | null;
  source: 'computed' | 'map_tag' | 'transit_api' | 'web' | 'estimated' | 'unknown';
  evidence: string[];
  inputs: Record<string, unknown>;
  data_date: string;
  completeness: 'complete' | 'unknown';
}

export interface Meta {
  mode: 'live' | 'offline';
  cache: 'hit' | 'miss' | 'none';
  computed_at: string;
}

export type AskTool = 'barrier_between' | 'extent' | 'street_continuity' | 'independent_connections' | 'walking_vs_straight_line';
export interface AskRequest { question: string; tool: AskTool; params: Record<string, unknown> }
export interface Answer {
  question: string;
  lang: Language;
  tool: AskTool | 'place_info' | 'none';
  text: string;
  facts: Fact[];
  unknown: string[];
  meta: Meta;
}

interface Feature {
  name: string;
  kind: 'railway' | 'water' | 'construction' | 'main_road' | 'bridge'
    | 'underpass' | 'stop' | 'park' | 'square' | 'other';
  relative_direction: RelativeDirection;
  distance_m: number;
  osm_ids: string[];
  crossings_on_foot?: number | null;
}

export interface Overview {
  zone: { name: string; center: { lat: number; lon: number }; radius_m: number };
  lang: Language;
  reference: { place: string; lat: number; lon: number; heading_deg: number; text: string };
  text: string;
  details: string[];
  landmarks: Feature[];
  barriers: (Feature & { crossings_on_foot: number | null })[];
  facts: Fact[];
  unknown: string[];
  meta: Meta;
}

export type ExploreCommand = 'start' | 'forward' | 'left' | 'right' | 'take' | 'back' | 'home' | 'where';

interface Crossing {
  signals: Tri;
  sound: Tri;
  tactile_paving: Tri;
  osm_id: string;
}

export interface ExploreStep {
  command: ExploreCommand;
  lang: Language;
  position: { lat: number; lon: number; osm_node: string };
  heading_deg: number;
  text: string;
  branches: {
    name: string;
    leads_to: string;
    relative_direction: RelativeDirection;
    distance_m: number;
    crossing: Crossing | null;
  }[];
  came_from: { name: string; relative_direction: 'behind'; osm_node: string } | null;
  junction_stack_depth: number;
  at_boundary: boolean;
  facts: Fact[];
  meta: Meta;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isText = (value: unknown): value is string => isString(value) && value.length > 0;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonnegative = (value: unknown): value is number => isNumber(value) && value >= 0;
const isCount = (value: unknown): value is number => isNonnegative(value) && Number.isInteger(value);
const isHeading = (value: unknown): value is number => isNonnegative(value) && value < 360;
const isNullableCount = (value: unknown): value is number | null => value === null || isCount(value);
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);
const isOneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  isString(value) && choices.includes(value as T);
const matches = (value: unknown, pattern: RegExp): value is string => isString(value) && pattern.test(value);
const isLanguage = (value: unknown): value is Language => isOneOf(value, ['en', 'it']);
const isOsmId = (value: unknown): value is string => matches(value, /^(node|way|relation)\/[0-9]+$/);
const isEvidence = (value: unknown): value is string => matches(value, /^((node|way|relation)\/[0-9]+|https?:\/\/\S+)$/);
const isDirection = (value: unknown): value is RelativeDirection =>
  matches(value, /^(ahead|behind|left|right|at ([1-9]|1[0-2]) o'clock)$/);
const isTri = (value: unknown): value is Tri => isOneOf(value, ['yes', 'no', 'unknown']);

function isFact(value: unknown): value is Fact {
  if (!isRecord(value)) return false;
  const primitive = value.value === null || isString(value.value)
    || typeof value.value === 'boolean' || isNumber(value.value);
  return matches(value.type, /^[a-z][a-z0-9_]*$/)
    && primitive
    && (value.unit === null || isOneOf(value.unit, ['m', 'min', 'count', 'ratio', 'deg']))
    && isOneOf(value.source, ['computed', 'map_tag', 'transit_api', 'web', 'estimated', 'unknown'])
    && isArrayOf(value.evidence, isEvidence)
    && (value.source === 'estimated' || value.source === 'unknown' || value.evidence.length > 0)
    && isRecord(value.inputs) && Object.keys(value.inputs).length > 0
    && matches(value.data_date, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    && isOneOf(value.completeness, ['complete', 'unknown']);
}

function isMeta(value: unknown): value is Meta {
  return isRecord(value)
    && isOneOf(value.mode, ['live', 'offline'])
    && isOneOf(value.cache, ['hit', 'miss', 'none'])
    && matches(value.computed_at, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$/);
}

function isFeature(value: unknown): value is Feature {
  return isRecord(value)
    && isString(value.name)
    && isOneOf(value.kind, ['railway', 'water', 'construction', 'main_road', 'bridge', 'underpass', 'stop', 'park', 'square', 'other'])
    && isDirection(value.relative_direction)
    && isNonnegative(value.distance_m)
    && isArrayOf(value.osm_ids, isOsmId)
    && (!('crossings_on_foot' in value) || isNullableCount(value.crossings_on_foot));
}

function isBarrier(value: unknown): value is Overview['barriers'][number] {
  return isFeature(value) && isNullableCount(value.crossings_on_foot);
}

function isOverview(value: unknown): value is Overview {
  if (!isRecord(value) || !isRecord(value.zone) || !isRecord(value.zone.center) || !isRecord(value.reference)) {
    return false;
  }
  const { zone, reference } = value;
  return isString(zone.name)
    && isNumber(value.zone.center.lat) && isNumber(value.zone.center.lon)
    && isNumber(zone.radius_m) && zone.radius_m > 0
    && isLanguage(value.lang)
    && isString(reference.place) && isNumber(reference.lat) && isNumber(reference.lon)
    && isHeading(reference.heading_deg) && isText(reference.text)
    && isText(value.text) && isArrayOf(value.details, isText)
    && isArrayOf(value.landmarks, isFeature) && isArrayOf(value.barriers, isBarrier)
    && isArrayOf(value.facts, isFact) && isArrayOf(value.unknown, isText) && isMeta(value.meta);
}

function isCrossing(value: unknown): value is Crossing {
  return isRecord(value) && isTri(value.signals) && isTri(value.sound)
    && isTri(value.tactile_paving) && isOsmId(value.osm_id);
}

function isBranch(value: unknown): value is ExploreStep['branches'][number] {
  return isRecord(value) && isString(value.name) && isString(value.leads_to)
    && isDirection(value.relative_direction) && isNonnegative(value.distance_m)
    && (value.crossing === null || isCrossing(value.crossing));
}

function isCameFrom(value: unknown): value is ExploreStep['came_from'] {
  return value === null || (isRecord(value) && isString(value.name)
    && value.relative_direction === 'behind' && isOsmId(value.osm_node));
}

function isExploreStep(value: unknown): value is ExploreStep {
  return isRecord(value) && isRecord(value.position)
    && isOneOf(value.command, ['start', 'forward', 'left', 'right', 'take', 'back', 'home', 'where'])
    && isLanguage(value.lang)
    && isNumber(value.position.lat) && isNumber(value.position.lon) && isOsmId(value.position.osm_node)
    && isHeading(value.heading_deg) && isText(value.text)
    && isArrayOf(value.branches, isBranch) && isCameFrom(value.came_from)
    && isCount(value.junction_stack_depth) && typeof value.at_boundary === 'boolean'
    && isArrayOf(value.facts, isFact) && isMeta(value.meta);
}

export function parseOverview(value: unknown): Overview {
  if (!isOverview(value)) throw new Error('Invalid overview response');
  return value;
}

export function parseExploreStep(value: unknown): ExploreStep {
  if (!isExploreStep(value)) throw new Error('Invalid explore response');
  return value;
}

export function parseAnswer(value: unknown): Answer {
  if (!isRecord(value) || !isText(value.question) || !isLanguage(value.lang)
    || !isOneOf(value.tool, ['barrier_between', 'extent', 'street_continuity', 'independent_connections', 'walking_vs_straight_line', 'place_info', 'none'])
    || !isText(value.text) || !isArrayOf(value.facts, isFact) || !isArrayOf(value.unknown, isText) || !isMeta(value.meta)) {
    throw new Error('Invalid answer response');
  }
  return value as unknown as Answer;
}
