import { describe, expect, it } from 'vitest';
import type { Context } from '../src/commands';
import { clean, fold, minutes, ordinal, parse, placeRef } from '../src/grammar';

const ROUTES = [{ id: 'A', label: 'Shortest' }, { id: 'B', label: 'Main streets' }, { id: 'C', label: 'Bus 90' }];
const EXPLORE: Context = { view: 'explore', routes: ROUTES };
const PLAN: Context = { view: 'plan', has_destination: true, routes: ROUTES };
const REAL: Context = { view: 'plan', has_destination: true, routes: [ // labels as the plan's summaries say them
  { id: 'A', label: 'Route A, on foot, 14 minutes, the same time as the shortest: 1 crossing without a signal.' },
  { id: 'B', label: 'Route B, on foot, the shortest, 14 minutes: 3 crossings without a signal.' },
  { id: 'C', label: 'Route C, bus 92 from Viale Umbria: you arrive 29 minutes after it; route B on foot takes 14.' }] };
const REAL_IT: Context = { view: 'plan', has_destination: true, routes: [
  { id: 'A', label: 'Percorso A, a piedi, 14 minuti, lo stesso tempo del più breve: 1 attraversamento senza semaforo.' },
  { id: 'B', label: 'Percorso B, a piedi, il più breve, 14 minuti: 3 attraversamenti senza semaforo.' },
  { id: 'C', label: 'Percorso C, autobus 92 da viale Umbria: arrivi 29 minuti dopo.' }] };
const PENDING: Context = { view: 'overview', pending: 'destination', candidates: ['Bocconi University', 'Bocconi Library'] };
const PENDING_IT: Context = { view: 'overview', pending: 'destination', candidates: ['Università Bocconi', 'Stazione di Milano Porta Romana'] };
const STOPS: Context = { view: 'plan', has_destination: true, routes: ROUTES, pending: 'stop',
  stop_candidates: ['Lidl', 'Carrefour Express', 'Farmacia Ripamonti'] };
const info = (u: string, name: string, ctx: Context = {}) => [u, ctx, 'ask', { tool: 'place_info', params: { place: { name } } }] as const;
const ask = (u: string, tool: string, params: Record<string, unknown>, ctx: Context = {}) => [u, ctx, 'ask', { tool, params }] as const;

type Case = readonly [string, Context, string, Record<string, unknown>];

const ENGLISH: Case[] = [
  ['Use my location.', {}, 'set_origin_here', {}],
  ['Yes.', PENDING, 'confirm', { answer: 'yes' }],
  ["I'm going to Bocconi University.", {}, 'set_destination', { query: 'Bocconi University' }],
  ['How do I get there?', { has_destination: true }, 'route', {}],
  ['Take the shortest.', PLAN, 'route_select', { route_id: 'A' }],
  ["Let's walk.", PLAN, 'explore', { command: 'forward' }],
  ['Take the footpath.', EXPLORE, 'explore', { command: 'take', branch: 'footpath' }],
  ['Where am I?', EXPLORE, 'explore', { command: 'where' }],
  ['Start from the Duomo instead.', {}, 'set_origin', { query: 'Duomo' }],
  ["I'm going to Stazione Centrale.", {}, 'set_destination', { query: 'Stazione Centrale' }],
  ['Start from Monza.', {}, 'set_origin', { query: 'Monza' }],
  ['Stop', {}, 'stop', {}],
  ['Forward', EXPLORE, 'explore', { command: 'forward' }],
  ['go ahead', EXPLORE, 'explore', { command: 'forward' }],
  ['Keep going.', EXPLORE, 'explore', { command: 'forward' }],
  ['go on', EXPLORE, 'explore', { command: 'forward' }],
  ['Turn left', EXPLORE, 'explore', { command: 'left' }],
  ['turn right.', EXPLORE, 'explore', { command: 'right' }],
  ['Take the second one', EXPLORE, 'explore', { command: 'take', branch: 1 }],
  ['number 2', EXPLORE, 'explore', { command: 'take', branch: 1 }],
  ['Take via Brembo', EXPLORE, 'explore', { command: 'take', branch: 'via Brembo' }],
  ['take 3', EXPLORE, 'explore', { command: 'take', branch: 2 }],
  ['Go back', EXPLORE, 'explore', { command: 'back' }],
  ['Back to the start.', EXPLORE, 'explore', { command: 'home' }],
  ['home', EXPLORE, 'explore', { command: 'home' }],
  ['Repeat', {}, 'repeat', {}],
  ['Say that again?', {}, 'repeat', {}],
  ['Quiet!', {}, 'stop', {}],
  ['shut up', {}, 'stop', {}],
  ['More detail', {}, 'more', {}],
  ['Tell me more.', {}, 'more', {}],
  ["What don't you know?", {}, 'unknowns', {}],
  ['Sources', {}, 'sources', {}],
  ['Help', {}, 'help', {}],
  ['What can I say?', {}, 'help', {}],
  ['Faster', {}, 'speed', { change: 'faster' }],
  ['slow down', {}, 'speed', { change: 'slower' }],
  ['Start over', {}, 'start_over', {}],
  ['yeah', PENDING, 'confirm', { answer: 'yes' }],
  ["That's right.", PENDING, 'confirm', { answer: 'yes' }],
  ['Correct', PENDING, 'confirm', { answer: 'yes' }],
  ['No.', PENDING, 'confirm', { answer: 'no' }],
  ['nope', PENDING, 'confirm', { answer: 'no' }],
  ['The second one.', PENDING, 'confirm', { answer: 'yes', index: 1 }],
  ["I'm here", {}, 'set_origin_here', {}],
  ["I'm at Talent Garden", {}, 'set_origin', { query: 'Talent Garden' }],
  ['Starting from Bocconi University', {}, 'set_origin', { query: 'Bocconi University' }],
  ['Take me to the Duomo.', {}, 'set_destination', { query: 'Duomo', then: 'route' }],
  ['Go to Stazione Centrale', {}, 'set_destination', { query: 'Stazione Centrale' }],
  ['My destination is Porta Romana.', {}, 'set_destination', { query: 'Porta Romana' }],
  ['How do I get to Porta Romana?', {}, 'set_destination', { query: 'Porta Romana', then: 'route' }],
  ['Guide me to the Duomo', {}, 'set_destination', { query: 'Duomo', then: 'navigate' }],
  ['Directions', { has_destination: true }, 'route', {}],
  ['route', { has_destination: true }, 'route', {}],
  ['Take the main streets.', PLAN, 'route_select', { route_id: 'B' }],
  ['Take the bus.', PLAN, 'route_select', { route_id: 'C' }],
  ['the second one', PLAN, 'route_select', { route_id: 'B' }],
  ['Other routes', PLAN, 'routes', {}],
  ['Avoid crossings without signals.', PLAN, 'route_avoid', { kind: 'unsignalled_crossings' }],
  ['Avoid signals without sound', PLAN, 'route_avoid', { kind: 'signals_without_sound' }],
  ['No stairs please', PLAN, 'route_avoid', { kind: 'steps' }],
  ['avoid construction', PLAN, 'route_avoid', { kind: 'construction' }],
  ['Avoid main roads', PLAN, 'route_avoid', { kind: 'main_roads' }],
  ['Only side streets.', PLAN, 'route_avoid', { kind: 'main_roads', strength: 'require' }],
  ['Never use steps', PLAN, 'route_avoid', { kind: 'steps', strength: 'require' }],
  ['avoid transfers', PLAN, 'route_avoid', { kind: 'transfers' }],
  ['Take the shortest.', REAL, 'route_select', { route_id: 'B' }],
  ['Take the main streets.', REAL, 'route_select', { route_id: 'A' }],
  ['Take the bus.', REAL, 'route_select', { route_id: 'C' }],
  ['Take route B.', REAL, 'route_select', { route_id: 'B' }],
  ['No, the second one.', PENDING, 'confirm', { answer: 'yes', index: 1 }],
  ['The last one.', PENDING, 'confirm', { answer: 'yes', index: 1 }],
  ['Bocconi Library', PENDING, 'confirm', { answer: 'yes', index: 1 }],
  ['No, take me to the Duomo', PENDING, 'set_destination', { query: 'Duomo', then: 'route' }],
  ['Take me there.', { has_destination: true }, 'navigate', { state: 'start' }],
  ['Take me there.', {}, 'route', {}],
  ['Go to the left.', EXPLORE, 'explore', { command: 'left' }],
  ["What's around me?", {}, 'overview', {}],
  // guidance, stops, place info
  ['Start navigation.', PLAN, 'navigate', { state: 'start' }],
  ["Let's go!", PLAN, 'navigate', { state: 'start' }],
  ['Guide me', PLAN, 'navigate', { state: 'start' }],
  ['Take me there now.', PLAN, 'navigate', { state: 'start' }],
  ['Start guiding', PLAN, 'navigate', { state: 'start' }],
  ["Let's go", EXPLORE, 'explore', { command: 'forward' }],
  ['Stop navigation.', PLAN, 'navigate', { state: 'stop' }],
  ['Stop guiding', PLAN, 'navigate', { state: 'stop' }],
  ['How far is it?', { guidance: true }, 'progress', {}],
  ['Stop at a supermarket for 15 minutes.', PLAN, 'route_stop', { kind: 'supermarket', duration_min: 15 }],
  ['I need to buy something on the way', PLAN, 'route_stop', { kind: 'shop' }],
  ['Add a pharmacy.', PLAN, 'route_stop', { kind: 'pharmacy' }],
  ['I want a coffee on the way', PLAN, 'route_stop', { kind: 'cafe' }],
  ['I need cash on the way', PLAN, 'route_stop', { kind: 'atm' }],
  ['Stop at a bakery for ten minutes', PLAN, 'route_stop', { kind: 'bakery', duration_min: 10 }],
  ['For 10 minutes.', STOPS, 'stop_duration', { minutes: 10 }],
  ['A quarter of an hour', { view: 'plan', last_action: 'route_stop' }, 'stop_duration', { minutes: 15 }],
  ['Half an hour', STOPS, 'stop_duration', { minutes: 30 }],
  ['20', { view: 'plan', awaiting: 'minutes' }, 'stop_duration', { minutes: 20 }],
  ['The first one.', STOPS, 'confirm', { answer: 'yes', index: 0 }],
  ['Lidl', STOPS, 'confirm', { answer: 'yes', index: 0 }],
  ['Carrefour please', STOPS, 'confirm', { answer: 'yes', index: 1 }],
  ['Yes', STOPS, 'confirm', { answer: 'yes' }],
  info('Is the pharmacy open?', 'the pharmacy'),
  info('Tell me about Lidl.', 'Lidl'),
  info('Is there wheelchair access at Esselunga?', 'Esselunga'),
  info('When does the bakery close?', 'the bakery'),
  ['Go to the pharmacy', {}, 'set_destination', { query: 'pharmacy' }],
  ask('How far is Bocconi University?', 'walking_vs_straight_line', { to: { name: 'Bocconi University' } }),
  ask('How far is the Duomo from Piazza Missori?', 'walking_vs_straight_line', { from: { name: 'Piazza Missori' }, to: { name: 'the Duomo' } }),
  ask('Is it far?', 'walking_vs_straight_line', { to: { name: 'destination' } }, REAL),
  ask('Is there anything between me and Bocconi?', 'barrier_between', { to: { name: 'Bocconi' } }),
  ask('Does via Brembo go through?', 'street_continuity', { street: 'via Brembo' }),
  ask('How big is Parco Ravizza?', 'extent', { place: 'Parco Ravizza' }),
  ask('How many ways are there to get to viale Isonzo?', 'independent_connections', { to: { name: 'viale Isonzo' } }),
  ['Speak Italian', {}, 'language', { lang: 'it' }],
  ['Can you repeat that?', {}, 'repeat', {}],
  ['Could you guide me?', PLAN, 'navigate', { state: 'start' }],
];

const ITALIAN: Case[] = [
  ['Avanti', EXPLORE, 'explore', { command: 'forward' }],
  ['sinistra', EXPLORE, 'explore', { command: 'left' }],
  ['Gira a destra', EXPLORE, 'explore', { command: 'right' }],
  ['Svolta a sinistra.', EXPLORE, 'explore', { command: 'left' }],
  ['Indietro', EXPLORE, 'explore', { command: 'back' }],
  ["Torna all'inizio", EXPLORE, 'explore', { command: 'home' }],
  ['Torna all’inizio', EXPLORE, 'explore', { command: 'home' }],
  ['Dove sono?', EXPLORE, 'explore', { command: 'where' }],
  ['Dove mi trovo adesso?', {}, 'explore', { command: 'where' }],
  ['Esplora', {}, 'explore', { command: 'start' }],
  ['Prendi via Brembo', EXPLORE, 'explore', { command: 'take', branch: 'via Brembo' }],
  ['Prendi la seconda', EXPLORE, 'explore', { command: 'take', branch: 1 }],
  ["Prendi l'ultima", EXPLORE, 'explore', { command: 'take', branch: -1 }],
  ['Ripeti', {}, 'repeat', {}],
  ['Puoi ripetere?', {}, 'repeat', {}],
  ['Potresti ripetere per favore?', {}, 'repeat', {}],
  ['Basta', {}, 'stop', {}],
  ['Zitto!', {}, 'stop', {}],
  ['Fermati', {}, 'stop', {}],
  ['Più dettagli', {}, 'more', {}],
  ['piu dettagli', {}, 'more', {}],
  ['Dimmi di più', {}, 'more', {}],
  ['Cosa non sai?', {}, 'unknowns', {}],
  ['Quali sono le fonti?', {}, 'sources', {}],
  ['Aiuto', {}, 'help', {}],
  ['Cosa posso dire?', {}, 'help', {}],
  ['Parla più piano', {}, 'speed', { change: 'slower' }],
  ['Più veloce', {}, 'speed', { change: 'faster' }],
  ['Ricominciamo da capo', {}, 'start_over', {}],
  ["Cosa c'è intorno a me?", {}, 'overview', {}],
  ['Descrivi la zona', {}, 'overview', {}],
  ['Sì', PENDING, 'confirm', { answer: 'yes' }],
  ['si', PENDING, 'confirm', { answer: 'yes' }],
  ['Sì, esatto', PENDING_IT, 'confirm', { answer: 'yes' }],
  ['Va bene', PENDING_IT, 'confirm', { answer: 'yes' }],
  ['No', PENDING, 'confirm', { answer: 'no' }],
  ['Non è quello', PENDING_IT, 'confirm', { answer: 'no' }],
  ['No, la seconda', PENDING_IT, 'confirm', { answer: 'yes', index: 1 }],
  ["L'ultima", PENDING_IT, 'confirm', { answer: 'yes', index: 1 }],
  ['Università Bocconi', PENDING_IT, 'confirm', { answer: 'yes', index: 0 }],
  ['universita bocconi', PENDING_IT, 'confirm', { answer: 'yes', index: 0 }],
  ['Porta Romana', PENDING_IT, 'confirm', { answer: 'yes', index: 1 }],
  ['No, portami alla Stazione Centrale', PENDING_IT, 'set_destination', { query: 'Stazione Centrale', then: 'route' }],
  ['Usa la mia posizione.', {}, 'set_origin_here', {}],
  ['Sono qui', {}, 'set_origin_here', {}],
  ['Parto da Piazza Duomo', {}, 'set_origin', { query: 'Piazza Duomo' }],
  ['Parto dalla stazione di Porta Romana', {}, 'set_origin', { query: 'stazione di Porta Romana' }],
  ["Sono all'Università Bocconi", {}, 'set_origin', { query: 'Università Bocconi' }],
  ['Mi trovo in via Ripamonti 88', {}, 'set_origin', { query: 'via Ripamonti 88' }],
  ['Vado a Porta Romana', {}, 'set_destination', { query: 'Porta Romana' }],
  ['Voglio andare alla Stazione Centrale', {}, 'set_destination', { query: 'Stazione Centrale' }],
  ['Portami in via Ripamonti', {}, 'set_destination', { query: 'via Ripamonti', then: 'route' }],
  ["Portami all'Università Bocconi per favore", {}, 'set_destination', { query: 'Università Bocconi', then: 'route' }],
  ['Portami al Duomo', {}, 'set_destination', { query: 'Duomo', then: 'route' }],
  ['Come arrivo in piazza Duomo?', {}, 'set_destination', { query: 'piazza Duomo', then: 'route' }],
  ['Guidami alla farmacia', {}, 'set_destination', { query: 'farmacia', then: 'navigate' }],
  ['Come ci arrivo?', { has_destination: true }, 'route', {}],
  ['Dammi le indicazioni', { has_destination: true }, 'route', {}],
  ['Altri percorsi', REAL_IT, 'routes', {}],
  ['Prendi il più breve', REAL_IT, 'route_select', { route_id: 'B' }],
  ['Il più corto', REAL_IT, 'route_select', { route_id: 'B' }],
  ['Prendi le strade principali', REAL_IT, 'route_select', { route_id: 'A' }],
  ["Prendiamo l'autobus", REAL_IT, 'route_select', { route_id: 'C' }],
  ['Percorso B', REAL_IT, 'route_select', { route_id: 'B' }],
  ['Il secondo', REAL_IT, 'route_select', { route_id: 'B' }],
  ['Evita gli attraversamenti senza semaforo', PLAN, 'route_avoid', { kind: 'unsignalled_crossings' }],
  ['Evita i semafori senza suono', PLAN, 'route_avoid', { kind: 'signals_without_sound' }],
  ['Niente scale', PLAN, 'route_avoid', { kind: 'steps' }],
  ['Mai le scale', PLAN, 'route_avoid', { kind: 'steps', strength: 'require' }],
  ['Evita i cantieri', PLAN, 'route_avoid', { kind: 'construction' }],
  ['Evita le strade principali', PLAN, 'route_avoid', { kind: 'main_roads' }],
  ['Solo strade secondarie', PLAN, 'route_avoid', { kind: 'main_roads', strength: 'require' }],
  ['Senza cambi', PLAN, 'route_avoid', { kind: 'transfers' }],
  ['Portami', PLAN, 'navigate', { state: 'start' }],
  ['Andiamo!', PLAN, 'navigate', { state: 'start' }],
  ['Avvia la navigazione', PLAN, 'navigate', { state: 'start' }],
  ['Guidami', PLAN, 'navigate', { state: 'start' }],
  ['Portami lì', { has_destination: true }, 'navigate', { state: 'start' }],
  ['Andiamo', EXPLORE, 'explore', { command: 'forward' }],
  ['Ferma la navigazione', PLAN, 'navigate', { state: 'stop' }],
  ['Interrompi la navigazione', PLAN, 'navigate', { state: 'stop' }],
  ['Quanto manca?', { guidance: true }, 'progress', {}],
  ['Fermati in farmacia', PLAN, 'route_stop', { kind: 'pharmacy' }],
  ['Fermiamoci al supermercato per un quarto d’ora', PLAN, 'route_stop', { kind: 'supermarket', duration_min: 15 }],
  ['Devo prendere un caffè lungo la strada', PLAN, 'route_stop', { kind: 'cafe' }],
  ['Devo prelevare al bancomat', PLAN, 'route_stop', { kind: 'atm' }],
  ['Aggiungi una panetteria per dieci minuti', PLAN, 'route_stop', { kind: 'bakery', duration_min: 10 }],
  ['Un quarto d’ora', STOPS, 'stop_duration', { minutes: 15 }],
  ["Mezz'ora", STOPS, 'stop_duration', { minutes: 30 }],
  ['Per venti minuti', STOPS, 'stop_duration', { minutes: 20 }],
  ['dieci', { view: 'plan', awaiting: 'minutes' }, 'stop_duration', { minutes: 10 }],
  ['Il terzo', STOPS, 'confirm', { answer: 'yes', index: 2 }],
  ['La prima', STOPS, 'confirm', { answer: 'yes', index: 0 }],
  ['Carrefour', STOPS, 'confirm', { answer: 'yes', index: 1 }],
  info('La farmacia è aperta?', 'the pharmacy'),
  info('È aperta la farmacia?', 'the pharmacy'),
  info('A che ora chiude il panificio?', 'the bakery'),
  info('Orari della Farmacia Ripamonti', 'Farmacia Ripamonti'),
  info("Parlami dell'Esselunga", 'Esselunga'),
  info('Il Carrefour è accessibile in carrozzina?', 'Il Carrefour'),
  ask('Quanto dista la stazione di Porta Romana?', 'walking_vs_straight_line', { to: { name: 'la stazione di Porta Romana' } }),
  ask('Quanto dista il Duomo da piazza Missori?', 'walking_vs_straight_line', { from: { name: 'piazza Missori' }, to: { name: 'il Duomo' } }),
  ask('La festa è vicina?', 'walking_vs_straight_line', { to: { name: 'La festa' } }),
  ask("C'è qualcosa tra me e viale Isonzo?", 'barrier_between', { to: { name: 'viale Isonzo' } }),
  ask('Cosa c’è tra piazza Trento e corso Lodi?', 'barrier_between', { from: { name: 'piazza Trento' }, to: { name: 'corso Lodi' } }),
  ask('Via Brembo è senza uscita?', 'street_continuity', { street: 'Via Brembo' }),
  ask('Dove finisce via Valsugana?', 'street_continuity', { street: 'via Valsugana' }),
  ask('Quanto è grande il parco Ravizza?', 'extent', { place: 'il parco Ravizza' }),
  ask('In quanti modi posso arrivare a viale Isonzo?', 'independent_connections', { to: { name: 'viale Isonzo' } }),
  ['Parla inglese', {}, 'language', { lang: 'en' }],
  ['Allora, portami al Duomo grazie', {}, 'set_destination', { query: 'Duomo', then: 'route' }],
  ['Ok Milo, dove sono?', {}, 'explore', { command: 'where' }],
];

describe('grammar', () => {
  it.each(ENGLISH)('en: %s', (u, ctx, action, params) => {
    expect(parse(u, ctx)).toEqual({ action, params });
  });

  it.each(ITALIAN)('it: %s', (u, ctx, action, params) => {
    expect(parse(u, ctx)).toEqual({ action, params });
  });

  it('leaves to the models what it does not know for sure', () => {
    for (const u of ['Tell me about the area', 'Is it open?', 'I want to know something', 'Could you describe the neighbourhood for me',
      'I would rather avoid the busy stuff', "Let's go with the one on the big streets", 'Book me a flight to Rome', 'Che tempo fa?',
      'Mi sa che ho sbagliato strada', 'Vorrei evitare il casino', 'For 10 minutes', 'Does the park go through?', 'Is it far?']) {
      const ctx = u === 'For 10 minutes' ? PLAN : {};
      expect(parse(u, ctx), u).toBeNull();
    }
  });

  it('never picks a route from a shared word in a short question', () => {
    expect(parse('Is it far?', { ...REAL, has_destination: false })).toBeNull();
  });

  it('takes a bare answer as the place the app asked for', () => {
    expect(parse('via Brembo 12', { awaiting: 'origin' })).toEqual({ action: 'set_origin', params: { query: 'via Brembo 12' } });
    expect(parse("l'Università Bocconi", { awaiting: 'destination' })).toEqual({ action: 'set_destination', params: { query: 'Università Bocconi' } });
    expect(parse('via Brembo 12', {})).toBeNull();
  });

  it('normalises without losing names', () => {
    expect(clean('Ok, allora... portami al Caffè Nero, per favore!')).toBe('portami al Caffè Nero');
    expect(fold('Più Caffè È')).toBe('piu caffe e');
    expect(fold('Più').length).toBe('Più'.length);
    expect(ordinal('the second one')).toBe(1);
    expect(ordinal('il numero tre')).toBe(2);
    expect(ordinal("l'ultima")).toBe(-1);
    expect(ordinal('via Brembo')).toBeNull();
    expect(minutes("mezz'ora")).toBe(30);
    expect(minutes('twenty-five minutes')).toBe(25);
    expect(minutes('un’ora'.replace('’', "'"))).toBe(60);
    expect(placeRef('la farmacia')).toBe('the pharmacy');
    expect(placeRef('Farmacia Ripamonti')).toBe('Farmacia Ripamonti');
  });

  it('is fast', () => {
    const all = [...ENGLISH, ...ITALIAN];
    const t = performance.now();
    for (let i = 0; i < 20; i++) for (const [u, ctx] of all) parse(u, ctx);
    expect((performance.now() - t) / (20 * all.length)).toBeLessThan(0.5);
  });
});
