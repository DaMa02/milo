/**
 * Any utterance -> one action for the app. The fixed grammar first (no model, well under a millisecond), then the
 * semantic router (local embeddings, tens of milliseconds, only for actions without free text), then a language
 * model that fills a JSON schema. The model only picks an action and copies names from the utterance; the
 * conversation runs the action on the engine.
 */
import { TOOLS, type Tool } from '@milo/engine';
import { AVOID_KINDS, cmd, PLACE_KINDS, SIMPLE_ACTIONS, type Command, type Context, type Interpretation } from './commands';
import { parse, placeRef } from './grammar';
import type { LLM } from './llm/types';
import type { SemanticRouter } from './router';

const ACTIONS = ['explore', 'ask', ...SIMPLE_ACTIONS, 'speed', 'language', 'set_origin', 'set_destination', 'confirm', 'route_select',
  'route_avoid', 'route_stop', 'stop_duration', 'navigate', 'chat', 'none'] as const;
const COMMANDS = ['start', 'forward', 'left', 'right', 'take', 'back', 'home', 'where'] as const;

export const INTERPRET_SYSTEM = `You turn one utterance from a blind or low-vision person using Milo, a walking app, into exactly one action for the app. You never answer the utterance yourself. The user may speak Italian or English, or mix them.

Actions:
- explore: move through the street network in a virtual walk. command: start, forward, left, right, take (branch = the street name, or its 0-based index left to right among the context's branches), back, home (back to the start), where.
- ask: a question about the map, answered by one tool:
  walking_vs_straight_line (from_place optional, to_place): how far, how close, how long on foot, is it near.
  barrier_between (from_place optional, to_place): is there anything between two places, what separates them, can I cross.
  independent_connections (from_place optional, to_place): how many different ways connect two places.
  street_continuity (street): does a street go through or end.
  extent (place): how big a park, square, site or street is.
  place_info (place): is a shop, pharmacy, café or other place open, its hours, its wheelchair access; place may be a kind: "the pharmacy".
- overview (describe the area around the user), more (more detail), unknowns (what the app does not know), sources, repeat, stop (be quiet, cancel the question), help, speed (change: faster|slower), start_over, language (lang: en|it).
- set_origin (query: where the user is or starts from), set_origin_here (use the phone's location), set_destination (query: where the user is going; then: "route" when they ask how to get there or to be taken there, "navigate" when they ask to be guided there now, else empty).
- confirm (answer: yes|no; index: 0-based choice among the candidates, or among stop_candidates when pending is "stop", -1 if none): only when something is pending.
- route (plan or read the route to the destination), routes (compare the offered routes), route_select (route_id: one of the offered routes' ids), route_avoid (kind: unsignalled_crossings, signals_without_sound, steps, construction, main_roads, transfers; strength: avoid_when_possible, or require for "never" or "only side streets").
- route_stop (kind: supermarket, pharmacy, cafe, bakery, atm, or shop for anything else to buy; minutes: how long, -1 if not said): a stop on the way.
- stop_duration (minutes): how long the stop lasts, when a stop is pending or was just added.
- navigate (state: start|stop): start or stop turn-by-turn guidance while walking.
- progress: how far is still to go, while being guided.
- chat: a general question about a place or the destination (what it is, what it is known for, what is there), a request to search the web, or a question on how to use the app. Never for moving, distances, directions or routes: those are the other actions.
- none: nothing fits (reason: no_fit), the place is clearly too far to walk to (outside_area), or the utterance is unclear (unclear).

Rules:
- Copy place and street names exactly as the user said them, in their language. Never translate, correct or invent places, numbers or coordinates.
- Leave from_place empty when the user means where they are now. The trip's destination ("the party", "my destination", "there", "la destinazione", "lì") is to_place "destination".
- Fill only the fields the chosen action uses; leave the others as empty strings (index and minutes -1).`;

const S = { type: 'string' };
const e = (...v: readonly string[]) => ({ type: 'string', enum: ['', ...v] });

export const INTERPRET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'command', 'branch', 'tool', 'from_place', 'to_place', 'street', 'place', 'query', 'then', 'answer', 'index', 'change',
    'lang', 'route_id', 'kind', 'strength', 'reason', 'state', 'minutes'],
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    command: e(...COMMANDS),
    branch: S,
    tool: e(...TOOLS),
    from_place: S, to_place: S, street: S, place: S, query: S,
    then: e('route', 'navigate'),
    answer: e('yes', 'no'),
    index: { type: 'integer' },
    change: e('faster', 'slower'),
    lang: e('en', 'it'),
    route_id: S,
    kind: e(...AVOID_KINDS, ...PLACE_KINDS),
    strength: e('avoid_when_possible', 'require'),
    reason: e('no_fit', 'outside_area', 'unclear'),
    state: e('start', 'stop'),
    minutes: { type: 'integer' },
  },
} as const;

export type ModelAction = Record<(typeof INTERPRET_SCHEMA.required)[number], string | number>;

function askParams(tool: Tool, o: ModelAction): Record<string, unknown> {
  const place = (v: unknown) => (typeof v === 'string' && v.trim() ? { name: v.trim() } : null);
  if (tool === 'street_continuity') return { street: String(o.street ?? '').trim() };
  if (tool === 'extent') return { place: String(o.place ?? '').trim() };
  if (tool === 'place_info') return { place: { name: placeRef(String(o.place ?? '').trim()) } };
  const from = place(o.from_place);
  const to = place(o.to_place);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** The model's flat answer -> a Command; anything unusable becomes none (unclear). */
export function toCommand(o: Partial<ModelAction>, ctx: Context): Command {
  const s = (k: keyof ModelAction) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const n = (k: keyof ModelAction) => (typeof o[k] === 'number' && Number.isInteger(o[k]) ? (o[k] as number) : -1);
  const a = s('action');
  const unclear = cmd('none', { reason: 'unclear' });
  switch (a) {
    case 'explore': {
      const c = s('command') as (typeof COMMANDS)[number];
      if (!COMMANDS.includes(c)) return unclear;
      if (c !== 'take') return cmd('explore', { command: c });
      const b = s('branch');
      if (!b) return unclear;
      return cmd('explore', { command: 'take', branch: /^\d+$/.test(b) ? Number(b) : b });
    }
    case 'ask': {
      const tool = s('tool') as Tool;
      if (!(TOOLS as readonly string[]).includes(tool)) return unclear;
      const params = askParams(tool, o as ModelAction);
      const missing = (tool === 'street_continuity' && !params.street) || (tool === 'extent' && !params.place)
        || (['walking_vs_straight_line', 'barrier_between', 'independent_connections'].includes(tool) && !params.to)
        || (tool === 'place_info' && !(params.place as { name: string }).name);
      return missing ? unclear : cmd('ask', { tool, params });
    }
    case 'set_origin':
    case 'set_destination': {
      const q = s('query');
      if (!q) return unclear;
      if (a === 'set_origin') return cmd('set_origin', { query: q });
      const then = s('then');
      return cmd('set_destination', then === 'route' || then === 'navigate' ? { query: q, then } : { query: q });
    }
    case 'confirm': {
      const ans = s('answer');
      if (ans !== 'yes' && ans !== 'no') return unclear;
      const i = n('index');
      return cmd('confirm', i >= 0 ? { answer: ans, index: i } : { answer: ans });
    }
    case 'speed':
      return s('change') === 'faster' || s('change') === 'slower' ? cmd('speed', { change: s('change') as 'faster' | 'slower' }) : unclear;
    case 'language':
      return s('lang') === 'en' || s('lang') === 'it' ? cmd('language', { lang: s('lang') as 'en' | 'it' }) : unclear;
    case 'route_select': {
      const r = (ctx.routes ?? []).find((x) => x.id.toLowerCase() === s('route_id').toLowerCase());
      return r ? cmd('route_select', { route_id: r.id }) : cmd('none', { reason: 'no_fit' });
    }
    case 'route_avoid': {
      const kind = s('kind') as (typeof AVOID_KINDS)[number];
      if (!AVOID_KINDS.includes(kind)) return cmd('none', { reason: 'no_fit' });
      const st = s('strength');
      return cmd('route_avoid', st === 'require' || st === 'avoid_when_possible' ? { kind, strength: st } : { kind });
    }
    case 'route_stop': {
      const kind = s('kind') as (typeof PLACE_KINDS)[number];
      if (!PLACE_KINDS.includes(kind)) return cmd('none', { reason: 'no_fit' });
      const m = n('minutes');
      return cmd('route_stop', m > 0 ? { kind, duration_min: m } : { kind });
    }
    case 'stop_duration': {
      const m = n('minutes');
      return m > 0 ? cmd('stop_duration', { minutes: m }) : unclear;
    }
    case 'navigate':
      return s('state') === 'start' || s('state') === 'stop' ? cmd('navigate', { state: s('state') as 'start' | 'stop' }) : unclear;
    case 'chat':
      return cmd('chat', {});
    case 'none': {
      const r = s('reason');
      return cmd('none', { reason: r === 'no_fit' || r === 'outside_area' || r === 'unclear' ? r : 'no_fit' });
    }
    default:
      return (SIMPLE_ACTIONS as readonly string[]).includes(a) ? cmd(a as (typeof SIMPLE_ACTIONS)[number], {}) : unclear;
  }
}

export interface InterpretOptions {
  llm?: LLM | null;
  router?: SemanticRouter | null;
  lang?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The action for an utterance and which layer understood it. */
export async function interpret(utterance: string, ctx: Context, opts: InterpretOptions = {}): Promise<Interpretation> {
  const withQuestion = (c: Command): Command => (c.action === 'ask' ? { action: 'ask', params: { ...c.params, question: utterance } } : c);
  const g = parse(utterance, ctx);
  if (g) return { command: withQuestion(g), via: 'grammar' };
  if (opts.router) {
    try {
      const r = await opts.router.route(utterance, ctx);
      if (r) return { command: withQuestion(r.command), via: 'router', score: r.score };
    } catch {
      // no embeddings now: the model decides
    }
  }
  if (!opts.llm) return { command: cmd('none', { reason: 'model_unavailable' }), via: 'none' };
  try {
    const r = await opts.llm.complete({
      system: INTERPRET_SYSTEM, schema: INTERPRET_SCHEMA as unknown as Record<string, unknown>, maxTokens: 1024, signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? 12_000,
      messages: [{ role: 'user', content: `Context: ${JSON.stringify({ ...ctx, lang: opts.lang })}\nUtterance: ${utterance}` }],
    });
    return { command: withQuestion(toCommand((r.json ?? {}) as Partial<ModelAction>, ctx)), via: opts.llm.local ? 'local' : 'llm' };
  } catch {
    return { command: cmd('none', { reason: 'model_unavailable' }), via: 'none' };
  }
}
