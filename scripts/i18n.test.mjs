import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('English and Italian expose the same complete translation keys', () => {
  const read = (language) => JSON.parse(readFileSync(new URL(`../web/src/i18n/${language}.json`, import.meta.url), 'utf8'));
  const en = read('en');
  const it = read('it');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(it).sort());
  for (const dictionary of [en, it]) for (const value of Object.values(dictionary)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim().length > 0);
  }
});
