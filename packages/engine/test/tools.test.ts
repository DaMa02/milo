import { describe, expect, it } from 'vitest';
import { hoursNow } from '../src/hours';
import { messages } from '../src/i18n';
import { newSession } from '../src/session';
import { ask } from '../src/tools';
import { diff, normalizeReference } from './helpers/compare';
import { FROZEN_NOW, PORTA_ROMANA_ALIASES, portaRomana, reference } from './helpers/fixtures';

const z = portaRomana();
const ref = normalizeReference(reference());
const cases = (kind: string) => ref.cases.filter((c: { kind: string }) => c.kind === kind);

describe('opening hours (parity)', () => {
  const M = messages('en');
  for (const c of cases('hours')) {
    it(`${c.input.raw || '(none)'} at ${c.input.now}`, () => {
      const [open, state] = hoursNow(c.input.raw, new Date(c.input.now), 'Europe/Rome');
      const phrase = !state ? null : state.kind === 'always' ? M.hours.always : state.kind === 'open_until' ? M.hours.openUntil(state.hm)
        : state.kind === 'opens' ? M.hours.opens(state.when, state.hm) : M.hours.closed;
      expect([open, phrase]).toEqual(c.output);
    });
  }
});

describe('ask (parity)', () => {
  for (const c of cases('ask')) {
    const [lat, lon, name] = c.input.origin;
    it(`${name}: ${c.input.tool} ${JSON.stringify(c.input.params).slice(0, 70)}`, () => {
      const s = newSession(z, [lat, lon, name]);
      const out = JSON.parse(JSON.stringify(ask(z, s, c.input.tool, c.input.params, 'q',
        { aliases: PORTA_ROMANA_ALIASES, now: FROZEN_NOW, timeZone: 'Europe/Rome' })));
      expect(diff(out, c.output)).toEqual([]);
    });
  }
});
