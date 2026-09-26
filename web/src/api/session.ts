import { parseOverview, parseExploreStep, parseAnswer } from './contracts';
import type { Overview, ExploreStep, ExploreCommand, Answer, AskRequest } from './contracts';
import { requestJson } from './http';
import { parsePlace, type Place } from './places';

/** Methods follow contracts/README.md; the session owns exploration, not the UI. */
export interface AreaSession {
  id?: string;
  overview: Overview;
  origin?: Place;
  destination?: Place;
  zone?: { name: string; source: 'city' | 'cache' | 'download' };
  setDestination?: (place: Place, signal?: AbortSignal) => Promise<Place>;
  explore(command: ExploreCommand, branch?: number | string): Promise<ExploreStep>;
  ask(request: AskRequest): Promise<Answer>;
}

export async function createConnectedSession(origin?: Place, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<AreaSession> {
  const created = await requestJson('/session', (value) => {
    if (value === null || typeof value !== 'object' || !('session_id' in value)
      || typeof value.session_id !== 'string' || !value.session_id || !('overview' in value)) throw new Error('Invalid session');
    let zone: AreaSession['zone'];
    if ('zone' in value) {
      const item = value.zone;
      if (item === null || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string'
        || !('source' in item) || !['city', 'cache', 'download'].includes(String(item.source))) throw new Error('Invalid zone');
      zone = item as AreaSession['zone'];
    }
    return { id: value.session_id, overview: parseOverview(value.overview), ...(origin ? { origin } : {}), ...(zone ? { zone } : {}) };
  }, { body: { lang: 'en', ...(origin ? { origin } : {}) }, ...options });
  const path = `/session/${encodeURIComponent(created.id)}`;
  return {
    ...created,
    setDestination: (place, signal) => requestJson(`${path}/destination`, (value) => {
      if (value === null || typeof value !== 'object' || !('destination' in value) || !('straight_line_m' in value)
        || typeof value.straight_line_m !== 'number' || !Number.isFinite(value.straight_line_m) || value.straight_line_m < 0) throw new Error('Invalid destination');
      return parsePlace(value.destination);
    }, { body: place, signal }),
    explore: (command, branch) => requestJson(`${path}/explore`, parseExploreStep, { body: { command, ...(branch === undefined ? {} : { branch }) } }),
    ask: (request) => requestJson(`${path}/ask`, parseAnswer, { body: request }),
  };
}
