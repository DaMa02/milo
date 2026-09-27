import { describe, expect, it } from 'vitest';
import { Engine, MemoryZoneStore, TooFarError } from '../src/engine';
import { unbackedNumbers } from '../src/numbers';
import { readGz } from './helpers/fixtures';

/** A fetch that answers Overpass queries with the stored Porta Romana answers and counts the calls. */
function fakeOverpass() {
  const network = readGz('network.json.gz');
  const features = readGz('features.json.gz');
  const calls: string[] = [];
  const fetch = (async (url: string, init?: { body?: string }) => {
    const body = decodeURIComponent(String(init?.body ?? '')).replace(/^data=/, '');
    calls.push(String(url));
    const json = body.includes('way["highway"]') ? network : features;
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const TG = { lat: 45.44386, lon: 9.20808, name: 'Talent Garden' };
const ISONZO = { lat: 45.44658, lon: 9.20584, name: 'viale Isonzo' };
const now = () => new Date('2026-09-26T16:00:00Z');

describe('Engine', () => {
  const store = new MemoryZoneStore();
  const net = fakeOverpass();
  const engine = new Engine({ store, now, timeZone: 'Europe/Rome', overpass: { fetch: net.fetch }, photon: { offline: true }, transit: { offline: true } });

  it('downloads the map around the start, speaks Italian, and stores the map', async () => {
    const { session, overview } = await engine.startSession({ origin: TG, lang: 'it', heading: 0 });
    expect(net.calls.length).toBe(2);
    expect(overview.lang).toBe('it');
    expect(overview.text).toMatch(/^Da Talent Garden, sei rivolto verso nord\./);
    expect(unbackedNumbers(overview, 'it')).toEqual([]);
    expect((await store.keys()).length).toBe(1);
    const step = engine.explore(session.id, 'start', 0);
    expect(step.text).toMatch(/^Partenza da Talent Garden/);
  });

  it('plans, selects and guides in Italian', async () => {
    const { session } = await engine.startSession({ origin: TG, lang: 'it', heading: 0 });
    expect(net.calls.length).toBe(2); // the map in memory is reused
    const d = await engine.setDestination(session.id, ISONZO);
    expect(d.zoneChanged).toBe(false);
    const plan = await engine.plan(session.id, { depart_at: '2026-09-26T16:00:00Z', constraints: [{ kind: 'unsignalled_crossings', strength: 'avoid_when_possible' }] });
    expect(plan.text).toMatch(/Percorso A, a piedi/);
    expect(unbackedNumbers(plan, 'it')).toEqual([]);
    const sel = await engine.selectRoute(session.id, 'A');
    expect(sel.selected_route_id).toBe('A');
    const r = engine.navigate(session.id, { lat: TG.lat, lon: TG.lon, accuracy_m: 8, heading_deg: 45, t: 0 });
    expect(r.status).toBe('on_route');
    expect(r.text).toMatch(/^Guida avviata verso viale Isonzo: 1050 metri, circa 13 minuti\./);
    const ans = engine.ask(session.id, 'place_info', { place: { name: 'la farmacia' } }, 'la farmacia è aperta?');
    expect(ans.text).toMatch(/una farmacia a \d+ m da qui in linea d'aria/);
  });

  it('finds places on the loaded map without a connection', async () => {
    const c = await engine.searchPlaces('via Brembo', TG, 'it');
    expect(c[0].name).toBe('Via Brembo');
    const r = await engine.reverse(TG.lat, TG.lon, 'it');
    expect(r?.street).toBeTruthy();
  });

  it('loads a larger map for a farther destination and refuses a trip too long on foot', async () => {
    const { session } = await engine.startSession({ origin: TG, lang: 'en' });
    const far = await engine.setDestination(session.id, { lat: 45.4545, lon: 9.2100, name: 'north' });
    expect(far.zoneChanged).toBe(true);
    await expect(engine.setDestination(session.id, { lat: 45.53, lon: 9.21, name: 'far away' })).rejects.toBeInstanceOf(TooFarError);
  });

  it('works offline from the stored map', async () => {
    const offline = new Engine({ store, now, offline: true });
    const { overview } = await offline.startSession({ origin: TG, lang: 'en' });
    expect(overview.text).toMatch(/^Facing north from Talent Garden\./);
  });
});
