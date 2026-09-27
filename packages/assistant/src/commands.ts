/**
 * The actions the app can take for an utterance. Every layer that interprets speech (the fixed grammar, the
 * semantic router, a language model) produces one of these; only the conversation runs them.
 */
import type { ExploreCommand, Lang, Tool } from '@milo/engine';

/** Things a route can avoid (the engine's constraint kinds that can be said). */
export const AVOID_KINDS = ['unsignalled_crossings', 'signals_without_sound', 'steps', 'construction', 'main_roads', 'transfers'] as const;
export type AvoidKind = (typeof AVOID_KINDS)[number];

/** Kinds of stop on the way; `shop` is anything else to buy. */
export const PLACE_KINDS = ['supermarket', 'pharmacy', 'cafe', 'bakery', 'atm', 'shop'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type Strength = 'avoid_when_possible' | 'require';
export type Reason = 'no_fit' | 'outside_area' | 'unclear' | 'model_unavailable';

/** Actions without parameters. */
export const SIMPLE_ACTIONS = ['overview', 'more', 'unknowns', 'sources', 'repeat', 'stop', 'help', 'start_over', 'set_origin_here',
  'route', 'routes', 'progress'] as const;
export type SimpleAction = (typeof SIMPLE_ACTIONS)[number];

export type Command =
  | { action: 'explore'; params: { command: ExploreCommand; branch?: number | string } }
  | { action: 'ask'; params: { tool: Tool; params: Record<string, unknown>; question?: string } }
  | { action: SimpleAction; params: Record<string, never> }
  | { action: 'speed'; params: { change: 'faster' | 'slower' } }
  | { action: 'language'; params: { lang: Lang } }
  | { action: 'set_origin'; params: { query: string } }
  /** `then`: what to do once the place is confirmed ("how do I get to X" plans the route, "guide me to X" also starts). */
  | { action: 'set_destination'; params: { query: string; then?: 'route' | 'navigate' } }
  | { action: 'confirm'; params: { answer: 'yes' | 'no'; index?: number } }
  | { action: 'route_select'; params: { route_id: string } }
  | { action: 'route_avoid'; params: { kind: AvoidKind; strength?: Strength } }
  | { action: 'route_stop'; params: { kind: PlaceKind; duration_min?: number } }
  | { action: 'stop_duration'; params: { minutes: number } }
  | { action: 'navigate'; params: { state: 'start' | 'stop' } }
  | { action: 'chat'; params: { text?: string; web?: boolean } }
  | { action: 'none'; params: { reason: Reason } };

export type Action = Command['action'];

/** What the conversation tells the interpreters about the moment the utterance was said. */
export interface Context {
  view?: 'overview' | 'explore' | 'plan' | 'guidance' | null;
  /** The question the app asked and is waiting for. */
  pending?: 'origin' | 'destination' | 'stop' | null;
  /** The app asked for a place name (origin, destination) or a number of minutes, and the answer may be just that. */
  awaiting?: 'origin' | 'destination' | 'minutes' | null;
  /** Places offered for the pending origin or destination. */
  candidates?: string[];
  /** Places offered for a stop on the way. */
  stop_candidates?: string[];
  last_action?: string | null;
  has_destination?: boolean;
  routes?: { id: string; label?: string }[];
  /** Streets at the current junction of the virtual walk, left to right. */
  branches?: string[];
  guidance?: boolean;
}

/** Which layer understood the utterance. */
export type Via = 'grammar' | 'router' | 'llm' | 'local' | 'none';

export interface Interpretation {
  command: Command;
  via: Via;
  /** Router similarity or model confidence, when there is one. */
  score?: number;
}

export type ParamsOf<A extends Action> = A extends SimpleAction ? Record<string, never> : Extract<Command, { action: A }>['params'];

export const cmd = <A extends Action>(action: A, params: ParamsOf<A>): Command => ({ action, params }) as Command;
