/**
 * Every result, in every language, follows its JSON Schema (contracts/) and the number rule: each number said
 * is also a fact. Runs the whole reference battery in English and in Italian.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { explore, type ExploreCommand } from '../src/explore';
import type { Lang } from '../src/i18n/common';
import { unbackedNumbers } from '../src/numbers';
import { overview } from '../src/overview';
import { createPlan, PlanError, selectRoute, setConstraints, setDepart, setStop, stopCandidates, type PlanOptions } from '../src/plan';
import { newSession } from '../src/session';
import { ask } from '../src/tools';
import { FROZEN_NOW, PORTA_ROMANA_ALIASES, portaRomana, reference } from './helpers/fixtures';

const dir = fileURLToPath(new URL('../../../contracts/', import.meta.url));
const ajv = new Ajv({ allErrors: true, strict: false });
const schemas: Record<string, object> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.schema.json'))) {
  const s = JSON.parse(readFileSync(dir + f, 'utf8'));
  schemas[f.replace('.schema.json', '')] = s;
  ajv.addSchema(s);
}
const validate = (name: string, doc: unknown) => {
  const v = ajv.getSchema((schemas[name] as { $id: string }).$id)!;
  return v(doc) ? [] : (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
};

const z = portaRomana();
const ref = reference();
const cases = (kind: string) => ref.cases.filter((c: { kind: string }) => c.kind === kind);
const opts: PlanOptions = { aliases: PORTA_ROMANA_ALIASES, now: () => FROZEN_NOW, timeZone: 'Europe/Rome', transit: { offline: true } };
const samples: Record<string, string[]> = { en: [], it: [] };

for (const lang of ['en', 'it'] as Lang[]) {
  describe(`contracts and number rule (${lang})`, () => {
    it('overview', () => {
      for (const c of cases('overview')) {
        const [lat, lon, name] = c.input.origin;
        const doc = JSON.parse(JSON.stringify(overview(z, newSession(z, [lat, lon, name], { heading: c.input.heading, lang }))));
        expect(validate('overview', doc)).toEqual([]);
        expect(unbackedNumbers(doc, lang), doc.text).toEqual([]);
        samples[lang].push(doc.text, ...doc.details);
      }
    });
    it('explore', () => {
      for (const c of cases('explore')) {
        if (c.input.command !== 'start') continue;
        const [lat, lon, name] = c.input.origin;
        const s = newSession(z, [lat, lon, name], { heading: c.input.heading, lang });
        for (const cmd of c.input.seq) {
          const [command, branch] = typeof cmd === 'string' ? [cmd, null] : cmd;
          const doc = JSON.parse(JSON.stringify(explore(z, s, command as ExploreCommand, command === 'start' ? c.input.heading : null, branch)));
          expect(validate('explore-step', doc)).toEqual([]);
          expect(unbackedNumbers(doc, lang), doc.text).toEqual([]);
          if (samples[lang].length < 40) samples[lang].push(doc.text);
        }
      }
    });
    it('ask', () => {
      for (const c of cases('ask')) {
        const [lat, lon, name] = c.input.origin;
        const doc = JSON.parse(JSON.stringify(ask(z, newSession(z, [lat, lon, name], { lang }), c.input.tool, c.input.params, 'q',
          { aliases: PORTA_ROMANA_ALIASES, now: FROZEN_NOW, timeZone: 'Europe/Rome' })));
        expect(validate('answer', doc)).toEqual([]);
        expect(unbackedNumbers(doc, lang), doc.text).toEqual([]);
        samples[lang].push(doc.text);
      }
    });
    it('plan', async () => {
      const s = newSession(z, [45.44386, 9.20808, 'Talent Garden'], { lang });
      const avoid = [{ kind: 'unsignalled_crossings', strength: 'avoid_when_possible' }];
      const docs = [await createPlan(z, s, { destination: { lat: 45.44658, lon: 9.20584, name: 'viale Isonzo' }, depart_at: '2026-09-26T16:00:00Z', constraints: avoid }, opts)];
      docs.push(await selectRoute(z, s, 'A', null, opts));
      const c = await stopCandidates(z, s, 'supermarket', null, opts);
      docs.push(c);
      docs.push(await setStop(z, s, c.stop_candidates[0].osm_id, 15, null, opts));
      docs.push(await setStop(z, s, c.stop_candidates[0].osm_id, 5, null, opts));
      docs.push(await setConstraints(z, s, [{ kind: 'unsignalled_crossings', strength: 'require' }], null, null, opts));
      docs.push(await setDepart(z, s, '2026-09-26T16:30:00Z', null, opts));
      docs.push(await setStop(z, s, null, null, null, opts));
      docs.push(await setConstraints(z, s, [...avoid, { kind: 'steps', strength: 'avoid_when_possible' }, { kind: 'walking_over_min', strength: 'avoid_when_possible', value: 10 }], { min: 2, pct: 10 }, null, opts));
      for (const d of docs) {
        const doc = JSON.parse(JSON.stringify(d));
        expect(validate('plan', doc)).toEqual([]);
        expect(unbackedNumbers(doc, lang), doc.text).toEqual([]);
        samples[lang].push(doc.text, ...doc.differences);
      }
      await expect(createPlan(z, newSession(z, [45.44386, 9.20808, 'TG'], { lang }), { destination: { lat: 45.47, lon: 9.19 } }, opts)).rejects.toBeInstanceOf(PlanError);
    });
  });
}

describe('samples', () => {
  it('prints a few sentences per language', () => {
    for (const lang of ['en', 'it']) console.log(`--- ${lang}\n${samples[lang].filter((x, i) => i % 7 === 0).slice(0, 18).join('\n')}`);
  });
});
