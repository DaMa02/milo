import initialData from '../../../contracts/fixtures/plan.initial-comparison.json';
import candidatesData from '../../../contracts/fixtures/plan.stop-candidates.json';
import stop15Data from '../../../contracts/fixtures/plan.two-foot-routes-and-transit.json';
import stop5Data from '../../../contracts/fixtures/plan.stop-5-min.json';
import requiredData from '../../../contracts/fixtures/plan.no-compliant-route.json';
import { ApiError, requestJson } from './http';
import { parsePlan } from './plan-contracts';
import type { Constraint, DetourTolerance, PlaceRequest, Plan, PlanMutation, PlanRequest, Point } from './plan-contracts';
import type { AreaSession } from './session';

export interface PlanClient {
  create(request: PlanRequest): Promise<Plan>;
  get(): Promise<Plan>;
  mutate<K extends keyof PlanMutation>(endpoint: K, body: PlanMutation[K]): Promise<Plan>;
}

/** Current server-py/lotl/plan.py::_current emits this exact FastAPI detail.
 * There is no machine error code yet. Use only for a GET of the current plan;
 * every other 404 (including app.py::get's missing session) fails closed. */
export function isNoPlanError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
    && error.detail === 'There is no plan yet: tell me where you want to go.';
}

const unavailable = (): never => { throw new ApiError('unavailable'); };
const onlyKeys = (value: object, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));

function samePlace(request: PlaceRequest, point: Point) {
  if (!onlyKeys(request, ['name', 'lat', 'lon'])) return false;
  if ('lat' in request || 'lon' in request) {
    return 'lat' in request && 'lon' in request && request.lat === point.lat && request.lon === point.lon
      && (request.name === undefined || request.name === point.name);
  }
  return request.name === point.name;
}

function sameConstraints(constraints: Constraint[], strength: Constraint['strength']) {
  return constraints.length === 1 && constraints[0].kind === 'unsignalled_crossings'
    && constraints[0].strength === strength && onlyKeys(constraints[0], ['kind', 'strength']);
}

function sameTolerance(tolerance: DetourTolerance, canonical: DetourTolerance) {
  return onlyKeys(tolerance, ['min', 'pct']) && tolerance.min === canonical.min && tolerance.pct === canonical.pct;
}

function createSavedPlanClient(session: AreaSession): PlanClient {
  const initial = parsePlan(structuredClone(initialData));
  const candidates = parsePlan(structuredClone(candidatesData));
  const stop15 = parsePlan(structuredClone(stop15Data));
  const stop5 = parsePlan(structuredClone(stop5Data));
  const required = parsePlan(structuredClone(requiredData));
  let current: Plan | null = null;

  function read() {
    return current ?? unavailable();
  }

  function commit(next: Plan, version: number) {
    const copy = structuredClone(next);
    copy.plan_version = version;
    // Never change the saved state until every structural and safety guard passes.
    const validated = parsePlan(copy);
    current = validated;
    return structuredClone(validated);
  }

  function initialWithSelection(id: string | null) {
    const next = structuredClone(initial);
    next.selected_route_id = id;
    if (id !== null) next.text = next.routes.find((route) => route.id === id)?.summary ?? unavailable();
    return next;
  }

  return {
    async create(request) {
      const reference = session.overview.reference;
      if (!onlyKeys(request, ['destination', 'origin', 'depart_at', 'constraints', 'detour_tolerance'])
        || reference.lat !== initial.origin.lat || reference.lon !== initial.origin.lon
        || !samePlace(request.destination, initial.destination)
        || (request.origin !== undefined && !samePlace(request.origin, initial.origin))
        || (request.depart_at !== undefined && Date.parse(request.depart_at) !== Date.parse(initial.depart_at))
        || (request.constraints !== undefined && !sameConstraints(request.constraints, 'avoid_when_possible'))
        || (request.detour_tolerance !== undefined && !sameTolerance(request.detour_tolerance, initial.detour_tolerance))) {
        return unavailable();
      }
      return commit(initial, 1);
    },
    async get() { return structuredClone(read()); },
    async mutate(endpoint, body) {
      const previous = read();
      if (body.if_version !== undefined && body.if_version !== previous.plan_version) {
        throw new ApiError('network', 409);
      }
      let next: Plan;
      switch (endpoint) {
        case 'select': {
          const request = body as PlanMutation['select'];
          if (!onlyKeys(request, ['route_id', 'if_version'])) return unavailable();
          const route = previous.routes.find((item) => item.id === request.route_id);
          if (!route || (previous.stop !== null && request.route_id !== 'A')) return unavailable();
          next = structuredClone(previous);
          next.selected_route_id = route.id;
          next.text = route.summary;
          next.differences = [];
          next.stop_candidates = [];
          break;
        }
        case 'stop/candidates': {
          const request = body as PlanMutation['stop/candidates'];
          if (!onlyKeys(request, ['kind', 'if_version']) || request.kind !== 'supermarket'
            || previous.selected_route_id !== 'A' || previous.stop !== null
            || !sameConstraints(previous.constraints, 'avoid_when_possible')) return unavailable();
          next = structuredClone(candidates);
          next.differences = [];
          // Candidate lookup changes presentation only, not the plan revision.
          return commit(next, previous.plan_version);
        }
        case 'stop': {
          const request = body as PlanMutation['stop'];
          if (!sameConstraints(previous.constraints, 'avoid_when_possible')) return unavailable();
          if (request.osm_id === null) {
            if (!onlyKeys(request, ['osm_id', 'if_version'])) return unavailable();
            next = initialWithSelection(previous.selected_route_id);
          } else {
            if (!onlyKeys(request, ['osm_id', 'duration_min', 'if_version'])
              || previous.selected_route_id !== 'A' || request.osm_id !== stop15.stop?.osm_id
              || (request.duration_min !== 15 && request.duration_min !== 5)) return unavailable();
            next = structuredClone(request.duration_min === 15 ? stop15 : stop5);
            // Fixture differences describe particular transitions, not any replay.
            const matchesTransition = request.duration_min === 15 ? previous.stop === null
              : previous.stop?.osm_id === request.osm_id && previous.stop.duration_min === 15;
            if (!matchesTransition) next.differences = [];
          }
          break;
        }
        case 'constraints': {
          const request = body as PlanMutation['constraints'];
          if (!onlyKeys(request, ['constraints', 'detour_tolerance', 'if_version']) || previous.stop !== null
            || (request.detour_tolerance !== undefined && !sameTolerance(request.detour_tolerance, initial.detour_tolerance))) {
            return unavailable();
          }
          if (sameConstraints(request.constraints, 'require')) {
            next = structuredClone(required);
            if (sameConstraints(previous.constraints, 'require')) next.differences = [];
          } else if (sameConstraints(request.constraints, 'avoid_when_possible')) {
            next = initialWithSelection(previous.selected_route_id);
          } else return unavailable();
          break;
        }
        case 'depart': {
          const request = body as PlanMutation['depart'];
          if (!onlyKeys(request, ['depart_at', 'if_version'])
            || Date.parse(request.depart_at) !== Date.parse(initial.depart_at)) return unavailable();
          next = structuredClone(previous);
          next.stop_candidates = [];
          next.differences = [];
          break;
        }
        default: return unavailable();
      }
      return commit(next, previous.plan_version + 1);
    },
  };
}

export function createPlanClient(session: AreaSession, saved: boolean): PlanClient {
  if (saved) return createSavedPlanClient(session);
  if (!session.id) throw new ApiError('expired');
  const path = `/session/${encodeURIComponent(session.id)}/plan`;
  return {
    create: (request) => requestJson(path, parsePlan, { body: request }),
    get: () => requestJson(path, parsePlan),
    mutate: (endpoint, body) => requestJson(`${path}/${endpoint}`, parsePlan, { body }),
  };
}
