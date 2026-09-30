import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from '../src/places';
import { portaRomana } from './helpers/fixtures';

const NEAR: [number, number] = [45.44386, 9.20808];
const feature = (name: string, lat = 45.4466, lon = 9.2058) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, osm_key: 'amenity', osm_value: 'university' },
});

function photon(answers: Record<string, ReturnType<typeof feature>[]>) {
  return vi.fn<typeof fetch>(async (input) => {
    const query = new URL(String(input)).searchParams.get('q')!;
    if (!(query in answers)) throw new Error(`Unexpected mocked query: ${query}`);
    return new Response(JSON.stringify({ features: answers[query] }), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('place search correction hook recovered from the hackathon', () => {
  it('searches guesses only after all original hits are rejected, then deduplicates actual Photon results', async () => {
    // ed9c4bf:server-py/tests/test_places.py:53-55,109-116. Model names are never returned as candidates themselves.
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network is forbidden'); }));
    const fetch = photon({
      'Baconi University': [feature('Baconi University', 14.65, 121.07), feature('Bacon University', 44.43, 26.1),
        feature('Naples Baconi', 40.85, 14.27)],
      'Bocconi University': [feature('Bocconi University')],
      'Università Bocconi': [feature('Bocconi University')],
    });
    const fix = vi.fn(async () => ['Bocconi University', 'Università Bocconi']);
    const found = await searchPlaces('  Baconi   University  ', NEAR, 'en', [], { fetch }, fix);
    expect(fix).toHaveBeenCalledExactlyOnceWith('Baconi University');
    expect(found.map((candidate) => candidate.name)).toEqual(['Bocconi University']);
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.searchParams.get('q'))).toEqual(['Baconi University', 'Bocconi University', 'Università Bocconi']);
    for (const url of urls) {
      expect(url.searchParams.get('bbox')).toBe('8.948,45.264,9.468,45.624');
      expect(url.searchParams.get('lat')).toBe('45.444');
      expect(url.searchParams.get('lon')).toBe('9.208');
    }
  });

  it('does not correct a name already found by Photon', async () => {
    const fetch = photon({ Bocconi: [feature('Bocconi University')] });
    const fix = vi.fn(async () => ['A different place']);
    expect((await searchPlaces('Bocconi', NEAR, 'en', [], { fetch }, fix))[0].name).toBe('Bocconi University');
    expect(fix).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns no invented candidate when there is no correction hook or guesses find nothing', async () => {
    const fetch = photon({ Baconi: [], 'A guessed name': [] });
    expect(await searchPlaces('Baconi', NEAR, 'en', [], { fetch })).toEqual([]);
    expect(await searchPlaces('Baconi', NEAR, 'en', [], { fetch }, async () => ['A guessed name'])).toEqual([]);
  });

  it.each(['empty answer', 'failed correction', 'Photon unavailable'])(
    'keeps the loaded-map fallback after %s', async (failure) => {
      const fetch = photon({ 'via Brembo': [] });
      if (failure === 'Photon unavailable') fetch.mockRejectedValue(new Error('Photon unavailable'));
      const fix = vi.fn(async (): Promise<string[]> => {
        if (failure === 'failed correction') throw new Error('Model unavailable');
        return [];
      });
      const found = await searchPlaces('via Brembo', NEAR, 'it', [portaRomana()], { fetch }, fix);
      expect(found[0].name).toBe('Via Brembo');
      expect(fix).toHaveBeenCalledTimes(failure === 'Photon unavailable' ? 0 : 1);
    },
  );

  it('does not contact Photon or the correction hook in offline mode', async () => {
    const fetch = photon({});
    const fix = vi.fn(async () => ['Bocconi University']);
    const found = await searchPlaces('via Brembo', NEAR, 'it', [portaRomana()], { fetch, offline: true }, fix);
    expect(found[0].name).toBe('Via Brembo');
    expect(fetch).not.toHaveBeenCalled();
    expect(fix).not.toHaveBeenCalled();
  });
});
