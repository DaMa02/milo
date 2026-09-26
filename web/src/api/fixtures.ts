import overviewData from '../../../contracts/fixtures/overview.porta-romana.json';
import startData from '../../../contracts/fixtures/explore-step.start.json';
import junctionData from '../../../contracts/fixtures/explore-step.first-junction.json';
import { parseOverview, parseExploreStep, type ExploreCommand, type ExploreStep } from './contracts';
import { ApiError } from './http';

/** Replay the exact shared fixtures; never fabricate a new path or heading. */
export function createSavedSession() {
  const overview = parseOverview(structuredClone(overviewData));
  const start = parseExploreStep(structuredClone(startData));
  const junction = parseExploreStep(structuredClone(junctionData));
  let position: ExploreStep = start;
  return {
    overview,
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
