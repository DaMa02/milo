import { describe, expect, it } from 'vitest';
import { explore, type ExploreCommand } from '../src/explore';
import { overview } from '../src/overview';
import { newSession } from '../src/session';
import { diff, normalizeReference } from './helpers/compare';
import { portaRomana, reference } from './helpers/fixtures';

const z = portaRomana();
const ref = normalizeReference(reference());
const cases = (kind: string) => ref.cases.filter((c: { kind: string }) => c.kind === kind);

describe('overview (parity)', () => {
  for (const c of cases('overview')) {
    const [lat, lon, name] = c.input.origin;
    it(`${name} facing ${c.input.heading}`, () => {
      const s = newSession(z, [lat, lon, name], { heading: c.input.heading });
      const out = JSON.parse(JSON.stringify(overview(z, s)));
      expect(diff(out, c.output)).toEqual([]);
    });
  }
});

describe('explore (parity)', () => {
  // replay each sequence on one session, as the reference did
  const seqs = new Map<string, typeof ref.cases>();
  for (const c of cases('explore')) {
    const key = JSON.stringify([c.input.origin, c.input.heading, c.input.seq]);
    if (!seqs.has(key)) seqs.set(key, []);
    seqs.get(key)!.push(c);
  }
  for (const [key, steps] of seqs) {
    it(key.slice(0, 90), () => {
      const [lat, lon, name] = steps[0].input.origin;
      const s = newSession(z, [lat, lon, name], { heading: steps[0].input.heading });
      for (const c of steps) {
        const h = c.input.command === 'start' ? c.input.heading : null;
        const out = JSON.parse(JSON.stringify(explore(z, s, c.input.command as ExploreCommand, h, c.input.branch)));
        const d = diff(out, c.output);
        expect(d, `${c.input.command} ${c.input.branch ?? ''}`).toEqual([]);
      }
    });
  }
});
