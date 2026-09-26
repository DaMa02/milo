import { isRecord, type AskRequest, type AskTool, type ExploreCommand } from './contracts';
import type { ConstraintKind, ConstraintStrength } from './plan-contracts';
import { requestJson } from './http';

export interface CommandContext {
  view: 'overview' | 'explore' | 'plan';
  pending: 'origin' | 'destination' | null;
  candidates: string[];
  has_destination: boolean;
  routes: { id: string; label: string }[];
}
type SimpleAction = 'overview' | 'more' | 'unknowns' | 'sources' | 'repeat' | 'stop' | 'help' | 'start_over' | 'set_origin_here' | 'route';
export type VoiceCommand = { action: SimpleAction; params: Record<string, never> }
  | { action: 'explore'; params: { command: ExploreCommand; branch?: number | string } }
  | { action: 'ask'; params: AskRequest }
  | { action: 'speed'; params: { change: 'faster' | 'slower' } }
  | { action: 'set_origin' | 'set_destination'; params: { query: string } }
  | { action: 'confirm'; params: { answer: 'yes' | 'no'; index?: number } }
  | { action: 'route_select'; params: { route_id: string } }
  | { action: 'route_avoid'; params: { kind: ConstraintKind; strength?: ConstraintStrength } }
  | { action: 'none'; params: { reason: 'no_fit' | 'outside_area' | 'unclear' | 'model_unavailable' } };

const simple = new Set<string>(['overview', 'more', 'unknowns', 'sources', 'repeat', 'stop', 'help', 'start_over', 'set_origin_here', 'route']);
const commands = new Set<string>(['start', 'forward', 'left', 'right', 'take', 'back', 'home', 'where']);
const tools = new Set<string>(['barrier_between', 'extent', 'street_continuity', 'independent_connections', 'walking_vs_straight_line']);
const constraints = new Set<string>(['unsignalled_crossings', 'signals_without_sound', 'steps', 'construction', 'main_roads', 'transfers']);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const index = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Structural projection of contracts/README.md, not a separate wire schema. */
export function parseCommand(value: unknown): VoiceCommand {
  if (!isRecord(value) || !text(value.utterance) || !text(value.action) || !isRecord(value.params)
    || !['grammar', 'claude'].includes(String(value.via))) throw new Error('Invalid interpreted command');
  const { action, params: p } = value;
  if (simple.has(action)) return { action: action as SimpleAction, params: {} };
  if (action === 'explore' && commands.has(String(p.command))
    && (p.branch === undefined || index(p.branch) || text(p.branch))
    && (p.command !== 'take' || p.branch !== undefined)) {
    return { action, params: { command: p.command as ExploreCommand, ...(p.branch === undefined ? {} : { branch: p.branch as number | string }) } };
  }
  if (action === 'ask' && text(p.question) && tools.has(String(p.tool)) && isRecord(p.params)) {
    return { action, params: { question: p.question, tool: p.tool as AskTool, params: p.params } };
  }
  if (action === 'speed' && (p.change === 'faster' || p.change === 'slower')) return { action, params: { change: p.change } };
  if ((action === 'set_origin' || action === 'set_destination') && text(p.query)) return { action, params: { query: p.query } };
  if (action === 'confirm' && (p.answer === 'yes' || p.answer === 'no') && (p.index === undefined || index(p.index))) {
    return { action, params: { answer: p.answer, ...(p.index === undefined ? {} : { index: p.index }) } };
  }
  if (action === 'route_select' && text(p.route_id)) return { action, params: { route_id: p.route_id } };
  if (action === 'route_avoid' && constraints.has(String(p.kind))
    && (p.strength === undefined || p.strength === 'require' || p.strength === 'avoid_when_possible')) {
    return { action, params: { kind: p.kind as ConstraintKind, ...(p.strength === undefined ? {} : { strength: p.strength }) } };
  }
  if (action === 'none' && ['no_fit', 'outside_area', 'unclear', 'model_unavailable'].includes(String(p.reason))) {
    return { action, params: { reason: p.reason as 'no_fit' | 'outside_area' | 'unclear' | 'model_unavailable' } };
  }
  throw new Error('Invalid interpreted parameters');
}

export function interpret(utterance: string, context: CommandContext, session_id?: string, signal?: AbortSignal) {
  return requestJson('/interpret', parseCommand, { body: { utterance, lang: 'en', ...(session_id ? { session_id } : {}), context }, signal });
}
