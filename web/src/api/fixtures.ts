import overviewData from '../../../contracts/fixtures/overview.porta-romana.json';
import startData from '../../../contracts/fixtures/explore-step.start.json';
import junctionData from '../../../contracts/fixtures/explore-step.first-junction.json';
import distanceData from '../../../contracts/fixtures/answer.detour-ratio.json';
import barrierData from '../../../contracts/fixtures/answer.barrier-between.json';
import streetData from '../../../contracts/fixtures/answer.street-through.json';
import { parseOverview, parseExploreStep, parseAnswer, type ExploreCommand, type ExploreStep, type AskRequest } from './contracts';
import { ApiError } from './http';
import type { AreaSession } from './session';

const party = { lat: 45.44658, lon: 9.20584, name: 'viale Isonzo' };
export const savedQuestions: AskRequest[] = [
  { question: distanceData.question, tool: 'walking_vs_straight_line', params: { to: party } },
  { question: barrierData.question, tool: 'barrier_between', params: { to: party } },
  { question: streetData.question, tool: 'street_continuity', params: { street: 'Via Arcivescovo Calabiana' } },
];
const savedAnswers = [distanceData, barrierData, streetData];

/** Replay the exact shared fixtures; never fabricate a new path or heading. */
export function createSavedSession(): AreaSession {
  const overview = parseOverview(structuredClone(overviewData));
  const start = parseExploreStep(structuredClone(startData));
  const junction = parseExploreStep(structuredClone(junctionData));
  let position: ExploreStep = start;
  return {
    overview,
    async ask(request: AskRequest) {
      const index = savedQuestions.findIndex((known) => known.question === request.question
        && known.tool === request.tool && JSON.stringify(known.params) === JSON.stringify(request.params));
      if (index === -1) throw new ApiError('unavailable');
      return parseAnswer(structuredClone(savedAnswers[index]));
    },
    async explore(command: ExploreCommand, branch?: number): Promise<ExploreStep> {
      if (command === 'start' || command === 'home') position = start;
      else if (command === 'where') { /* Reading the current saved position changes nothing. */ }
      else if (command === 'back' && position === junction) position = start;
      else if (command === 'forward' && position === start) position = junction;
      else if (command === 'take' && position === start && branch !== undefined
        && start.facts.filter((fact) => fact.type === 'branch_distance')[branch]?.inputs.to_node === Number(junction.position.osm_node.split('/')[1])) position = junction;
      else throw new ApiError('unavailable');
      return structuredClone(position);
    },
  };
}
