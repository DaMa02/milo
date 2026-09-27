import { describe, expect, it } from 'vitest';
import { step, type NavState } from '../src/navigate';
import { createPlan, PlanError, selectRoute, type PlanOptions } from '../src/plan';
import { newSession } from '../src/session';
import { diff, normalizeReference } from './helpers/compare';
import { FROZEN_NOW, PORTA_ROMANA_ALIASES, portaRomana, reference } from './helpers/fixtures';

const z = portaRomana();
const ref = normalizeReference(reference());
const opts: PlanOptions = { aliases: PORTA_ROMANA_ALIASES, now: () => FROZEN_NOW, timeZone: 'Europe/Rome', transit: { offline: true } };

describe('live guidance (parity)', () => {
  for (const c of ref.cases.filter((x: { kind: string }) => x.kind === 'navigate')) {
    it(c.input.label, async () => {
      const [lat, lon, name] = c.input.origin;
      const s = newSession(z, [lat, lon, name]);
      await createPlan(z, s, { destination: c.input.destination, depart_at: '2026-09-26T16:00:00Z', constraints: c.input.constraints }, opts);
      if (c.input.route_id) {
        try {
          await selectRoute(z, s, c.input.route_id, null, opts);
        } catch (e) {
          if (!(e instanceof PlanError)) throw e;
        }
      }
      const state: NavState = {};
      const t0 = performance.now();
      for (const f of c.output) {
        const out = JSON.parse(JSON.stringify(step(z, s, state, f.lat, f.lon, f.acc, f.heading, f.t)));
        const d = diff(out, f.out);
        expect(d, `t=${f.t}`).toEqual([]);
      }
      const ms = (performance.now() - t0) / c.output.length;
      expect(ms).toBeLessThan(50);
    });
  }
});
