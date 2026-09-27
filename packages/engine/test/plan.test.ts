import { describe, expect, it } from 'vitest';
import { createPlan, getPlan, PlanError, selectRoute, setConstraints, setDepart, setStop, stopCandidates, type PlanOptions } from '../src/plan';
import { newSession, type Session } from '../src/session';
import { diff, normalizeReference } from './helpers/compare';
import { FROZEN_NOW, PORTA_ROMANA_ALIASES, portaRomana, reference } from './helpers/fixtures';

const z = portaRomana();
const ref = normalizeReference(reference());
const opts: PlanOptions = { aliases: PORTA_ROMANA_ALIASES, now: () => FROZEN_NOW, timeZone: 'Europe/Rome', transit: { offline: true } };

async function run(s: Session, op: string, a: Record<string, any>, best: { id: string | null }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const args = { ...a };
  if (args.osm_id === '$best') args.osm_id = best.id;
  switch (op) {
    case 'get': return getPlan(z, s);
    case 'create': return createPlan(z, s, args, opts);
    case 'select': return selectRoute(z, s, args.route_id, args.if_version, opts);
    case 'candidates': {
      const r = await stopCandidates(z, s, args.kind ?? 'supermarket', args.if_version, opts);
      if (r.stop_candidates.length && (args.kind ?? 'supermarket') === 'supermarket') best.id = r.stop_candidates[0].osm_id;
      return r;
    }
    case 'set_stop': return setStop(z, s, args.osm_id, args.duration_min, args.if_version, opts);
    case 'set_constraints': return setConstraints(z, s, args.constraints, args.detour_tolerance, args.if_version, opts);
    case 'set_depart': return setDepart(z, s, args.depart_at, args.if_version, opts);
    default: throw new Error(op);
  }
}

describe('plan (parity)', () => {
  const flows = new Map<string, typeof ref.cases>();
  for (const c of ref.cases.filter((x: { kind: string }) => x.kind === 'plan')) {
    if (!flows.has(c.input.session)) flows.set(c.input.session, []);
    flows.get(c.input.session)!.push(c);
  }
  for (const [sid, steps] of flows) {
    it(sid, async () => {
      const [lat, lon, name] = steps[0].input.origin;
      const s = newSession(z, [lat, lon, name]);
      const best = { id: null as string | null };
      for (const c of steps) {
        let out;
        try {
          out = JSON.parse(JSON.stringify(await run(s, c.input.op, c.input.args, best)));
        } catch (e) {
          if (!(e instanceof PlanError)) throw e;
          out = { error: 'PlanError', status: e.status, message: e.message };
        }
        expect(diff(out, c.output), `${c.input.op} ${JSON.stringify(c.input.args).slice(0, 80)}`).toEqual([]);
      }
    });
  }
});
