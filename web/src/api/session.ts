import { parseOverview, parseExploreStep, parseAnswer } from './contracts';
import type { Overview, ExploreStep, ExploreCommand, Answer, AskRequest } from './contracts';
import { requestJson } from './http';

/** Methods follow contracts/README.md; the session owns exploration, not the UI. */
export interface AreaSession {
  id?: string;
  overview: Overview;
  explore(command: ExploreCommand, branch?: number): Promise<ExploreStep>;
  ask(request: AskRequest): Promise<Answer>;
}

export async function createConnectedSession(): Promise<AreaSession> {
  const created = await requestJson('/session', (value) => {
    if (value === null || typeof value !== 'object' || !('session_id' in value)
      || typeof value.session_id !== 'string' || !value.session_id || !('overview' in value)) throw new Error('Invalid session');
    return { id: value.session_id, overview: parseOverview(value.overview) };
  }, { body: { lang: 'en' } });
  const path = `/session/${encodeURIComponent(created.id)}`;
  return {
    ...created,
    explore: (command, branch) => requestJson(`${path}/explore`, parseExploreStep, { body: { command, ...(branch === undefined ? {} : { branch }) } }),
    ask: (request) => requestJson(`${path}/ask`, parseAnswer, { body: request }),
  };
}
