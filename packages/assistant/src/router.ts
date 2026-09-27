/**
 * The semantic router: an open, on-device replacement for Jev. Each action without free text has example sentences
 * in Italian and English; an utterance goes to the action whose examples it is most similar to (cosine similarity
 * of sentence embeddings), when it is similar enough and clearly more similar than to any other action. The same
 * idea as aurelio-labs/semantic-router; the embedding model runs on the phone (llama.cpp) or anywhere else.
 *
 * Actions that copy words from the utterance (places, streets) are never routed here: a language model fills them.
 */
import { cmd, type Command, type Context, type PlaceKind, type AvoidKind } from './commands';
import { minutes } from './grammar';

export interface Embedder {
  /** Model id: stored vectors are only reused for the same id. */
  readonly id: string;
  /** One unit-length (or any length) vector per text. `kind` lets e5-style models add "query: " / "passage: ". */
  embed(texts: string[], kind: 'query' | 'passage'): Promise<ArrayLike<number>[]>;
}

export interface RouteDef {
  id: string;
  /** The command, or a function of the context and the utterance (null: the route does not apply). */
  command: Command | ((ctx: Context, utterance: string) => Command | null);
  /** When the route can be chosen at all. */
  when?: (ctx: Context) => boolean;
  examples: string[];
}

const pending = (c: Context) => !!c.pending;
const hasPlan = (c: Context) => !!c.routes?.length;
const stopRoute = (kind: PlaceKind, examples: string[]): RouteDef => ({
  id: `route_stop_${kind}`, examples, when: hasPlan,
  command: (_c, u) => {
    const d = minutes(u.toLowerCase());
    return cmd('route_stop', d ? { kind, duration_min: d } : { kind });
  },
});
const avoidRoute = (kind: AvoidKind, examples: string[]): RouteDef => ({
  id: `route_avoid_${kind}`, examples, when: hasPlan, command: cmd('route_avoid', { kind }),
});

/** Examples are paraphrases, in both languages: the fixed grammar already knows the exact phrases. */
export const ROUTES: RouteDef[] = [
  { id: 'explore_forward', command: cmd('explore', { command: 'forward' }), examples: ['keep walking straight', 'carry on along this street',
    'move forward along the road', 'walk on', 'continue down the street', 'vai sempre avanti', 'prosegui su questa strada', 'continua a camminare dritto',
    'andiamo avanti per questa via', 'cammina ancora'] },
  { id: 'explore_left', command: cmd('explore', { command: 'left' }), examples: ['turn to my left', 'go down the street on the left',
    'I want to go left', 'take the left turn', 'giriamo verso sinistra', 'voglio andare a sinistra', 'prendi la strada a sinistra', 'svoltiamo a sinistra'] },
  { id: 'explore_right', command: cmd('explore', { command: 'right' }), examples: ['turn to my right', 'go down the street on the right',
    'I want to go right', 'take the right turn', 'giriamo verso destra', 'voglio andare a destra', 'prendi la strada a destra', 'svoltiamo a destra'] },
  { id: 'explore_back', command: cmd('explore', { command: 'back' }), examples: ['go back to the previous junction', 'undo that step',
    'return to where I was before', 'torna all\'incrocio di prima', 'annulla l\'ultimo passo', 'torniamo al punto di prima'] },
  { id: 'explore_home', command: cmd('explore', { command: 'home' }), examples: ['take me back to where the walk started',
    'return to the starting point of the walk', 'go back to the beginning', 'torna al punto da cui siamo partiti', 'riportami all\'inizio del giro'] },
  { id: 'explore_where', command: cmd('explore', { command: 'where' }), examples: ['where exactly am I standing', 'what is my position now',
    'tell me where I am', 'what street am I on', 'in che via sono', 'dimmi dove mi trovo', 'qual è la mia posizione adesso', 'su che strada sono'] },
  { id: 'explore_start', command: cmd('explore', { command: 'start' }), examples: ['let me explore the streets around here',
    'I want to walk around virtually', 'start a virtual walk', 'voglio esplorare le strade qui intorno', 'facciamo una passeggiata virtuale',
    'iniziamo a esplorare la zona'] },
  { id: 'overview', command: cmd('overview', {}), examples: ['describe the neighbourhood for me', 'what is there around here',
    'tell me about this area', 'what is near me', 'give me a picture of the surroundings', 'descrivimi il quartiere', 'cosa c\'è nei dintorni',
    'com\'è fatta questa zona', 'raccontami cosa c\'è qui vicino', 'che cosa ho attorno'] },
  { id: 'more', command: cmd('more', {}), examples: ['give me more details', 'can you say more about that', 'I want the full description',
    'dammi più informazioni', 'voglio la descrizione completa', 'approfondisci'] },
  { id: 'unknowns', command: cmd('unknowns', {}), examples: ['what is the map missing', 'what are you not sure about',
    'what information is unknown', 'cosa manca nella mappa', 'di cosa non sei sicuro', 'quali informazioni non conosci'] },
  { id: 'sources', command: cmd('sources', {}), examples: ['where does your data come from', 'what is the source of this',
    'how do you know that', 'da dove prendi queste informazioni', 'qual è la fonte', 'come fai a saperlo'] },
  { id: 'repeat', command: cmd('repeat', {}), examples: ['I did not catch that', 'can you say it one more time', 'what did you say',
    'sorry, again please', 'non ho sentito', 'me lo ridici', 'puoi ridirlo', 'scusa, di nuovo'] },
  { id: 'stop', command: cmd('stop', {}), examples: ['stop talking', 'be quiet for a moment', 'that is enough, thanks', 'silence please',
    'smetti di parlare', 'stai zitto un attimo', 'ok basta così', 'fai silenzio'] },
  { id: 'help', command: cmd('help', {}), examples: ['what commands are there', 'how do I use this app', 'what are my options',
    'I need help', 'quali comandi ci sono', 'come si usa questa app', 'non so cosa dire', 'ho bisogno di aiuto'] },
  { id: 'speed_faster', command: cmd('speed', { change: 'faster' }), examples: ['talk a bit quicker', 'you are speaking too slowly',
    'increase the speech rate', 'parla un po\' più velocemente', 'parli troppo lentamente', 'aumenta la velocità della voce'] },
  { id: 'speed_slower', command: cmd('speed', { change: 'slower' }), examples: ['talk a bit slower', 'you are speaking too fast',
    'decrease the speech rate', 'parla un po\' più lentamente', 'parli troppo veloce', 'diminuisci la velocità della voce'] },
  { id: 'start_over', command: cmd('start_over', {}), examples: ['let us begin from scratch', 'reset everything', 'forget all this and restart',
    'ricominciamo tutto da zero', 'cancella tutto e ricomincia', 'resetta tutto'] },
  { id: 'set_origin_here', command: cmd('set_origin_here', {}), examples: ['start from where I am standing', 'use the GPS',
    'my current position is the start', 'parti dalla mia posizione attuale', 'usa il gps', 'la partenza è dove mi trovo'] },
  { id: 'route', command: cmd('route', {}), examples: ['how can I reach it', 'what is the way there', 'plan the walk for me',
    'tell me the way', 'qual è la strada per arrivarci', 'come faccio ad arrivarci', 'dimmi la strada', 'pianifica il percorso'],
  when: (c) => !!c.has_destination },
  { id: 'routes', command: cmd('routes', {}), examples: ['what other options do I have', 'are there other ways', 'compare the routes for me',
    'ci sono altre strade', 'quali altre possibilità ho', 'confrontami i percorsi'], when: hasPlan },
  { id: 'progress', command: cmd('progress', {}), examples: ['how much is left', 'are we nearly there', 'how many metres to go',
    'quanta strada manca', 'siamo quasi arrivati', 'quanti metri mancano'], when: (c) => !!c.guidance },
  { id: 'navigate_start', command: cmd('navigate', { state: 'start' }), examples: ['could you get the guidance going', 'start walking me there',
    'begin turn by turn directions', 'take me there step by step', 'avvia le indicazioni passo passo', 'accompagnami fin là', 'iniziamo a camminare verso la meta',
    'fammi da guida'], when: (c) => !!c.has_destination },
  { id: 'navigate_stop', command: cmd('navigate', { state: 'stop' }), examples: ['stop giving me directions', 'I do not need guidance anymore',
    'end the turn by turn', 'non mi servono più le indicazioni', 'smetti di darmi indicazioni', 'chiudi la navigazione'], when: (c) => !!c.guidance },
  { id: 'confirm_yes', command: cmd('confirm', { answer: 'yes' }), examples: ['yes that is the one', 'that is correct', 'absolutely right',
    'yes exactly that place', 'sì è proprio quello', 'è corretto', 'esattamente quello', 'sì va benissimo'], when: pending },
  { id: 'confirm_no', command: cmd('confirm', { answer: 'no' }), examples: ['no that is wrong', 'that is not the place I meant', 'not that one',
    'no, try another', 'no non è quello', 'non è il posto giusto', 'no, un altro', 'sbagliato'], when: pending },
  avoidRoute('steps', ['I cannot use stairs', 'no staircases please', 'I use a wheelchair', 'non posso fare le scale', 'niente gradini per favore',
    'sono in carrozzina']),
  avoidRoute('unsignalled_crossings', ['only cross where there are traffic lights', 'I want crossings with lights', 'attraversa solo con il semaforo',
    'voglio attraversamenti con semaforo']),
  avoidRoute('signals_without_sound', ['I need traffic lights that beep', 'only crossings with audible signals', 'voglio semafori sonori',
    'solo semafori con il segnale acustico']),
  avoidRoute('main_roads', ['I would rather avoid the busy stuff', 'keep me away from heavy traffic', 'a quieter way please',
    'preferisco evitare il traffico', 'una strada più tranquilla', 'lontano dalle strade trafficate']),
  avoidRoute('construction', ['keep away from the roadworks', 'avoid building sites', 'stai lontano dai lavori in corso', 'evita i lavori stradali']),
  avoidRoute('transfers', ['I do not want to change buses', 'one bus only', 'non voglio cambiare autobus', 'un solo mezzo']),
  stopRoute('supermarket', ['I need to do some grocery shopping on the way', 'can we pass by a supermarket', 'devo fare la spesa lungo la strada',
    'passiamo da un supermercato']),
  stopRoute('pharmacy', ['can we pop into a chemist along the route', 'I need medicine on the way', 'passiamo da una farmacia',
    'devo prendere delle medicine per strada']),
  stopRoute('cafe', ['I would love an espresso somewhere', 'let us grab a coffee on the way', 'mi prenderei un caffè per strada',
    'fermiamoci a bere un caffè']),
  stopRoute('bakery', ['I want to buy bread on the way', 'can we stop at a bakery', 'devo comprare il pane', 'passiamo dal fornaio']),
  stopRoute('atm', ['I need to withdraw money', 'is there a cash point on the way', 'devo prelevare dei soldi', 'mi serve un bancomat lungo la strada']),
  stopRoute('shop', ['I need to buy something', 'can we stop at a shop', 'devo comprare una cosa', 'fermiamoci in un negozio']),
  { id: 'language_en', command: cmd('language', { lang: 'en' }), examples: ['can you speak English', 'switch to English', 'passa all\'inglese',
    'parlami in inglese'] },
  { id: 'language_it', command: cmd('language', { lang: 'it' }), examples: ['can you speak Italian', 'switch to Italian', 'passa all\'italiano',
    'parlami in italiano'] },
  // what the app does not do: routed here, then left to the language model (chat)
  { id: 'none', command: () => null, examples: ['what is the weather today', 'tell me a joke', 'what time is it', 'who won the match',
    'book me a taxi', 'che tempo fa oggi', 'raccontami una barzelletta', 'che ore sono', 'chi ha vinto la partita', 'chiamami un taxi',
    'what is this building famous for', 'search online for the museum hours', 'cos\'è questo monumento', 'cerca su internet gli orari del museo'] },
];

export interface RouterOptions {
  /** Least similarity to route (calibrated per embedding model by the NLU eval). */
  threshold?: number;
  /** Least lead over the best other action. */
  margin?: number;
}

export interface Routed {
  command: Command;
  id: string;
  score: number;
}

/** Stored example vectors, so the phone embeds the examples once per model. */
export interface VectorCache {
  get(key: string): Promise<number[][] | null | undefined>;
  set(key: string, vectors: number[][]): Promise<void>;
}

function unit(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  const out = new Float32Array(v.length);
  const k = n > 0 ? 1 / Math.sqrt(n) : 0;
  for (let i = 0; i < v.length; i++) out[i] = v[i] * k;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export class SemanticRouter {
  private vectors: Float32Array[] | null = null;
  private owners: number[] = [];
  readonly threshold: number;
  readonly margin: number;

  constructor(readonly embedder: Embedder, readonly routes: RouteDef[] = ROUTES, opts: RouterOptions = {}) {
    this.threshold = opts.threshold ?? 0.86;
    this.margin = opts.margin ?? 0.02;
  }

  /** Embeds the examples (or loads them from the cache). */
  async init(cache?: VectorCache): Promise<void> {
    const texts: string[] = [];
    this.owners = [];
    this.routes.forEach((r, i) => r.examples.forEach((e) => {
      texts.push(e);
      this.owners.push(i);
    }));
    const key = `router:${this.embedder.id}:${hash(texts.join('\n'))}`;
    let vs = await cache?.get(key);
    if (!vs || vs.length !== texts.length) {
      vs = (await this.embedder.embed(texts, 'passage')).map((v) => Array.from(v));
      await cache?.set(key, vs);
    }
    this.vectors = vs.map(unit);
  }

  /** Similarity to each route's nearest example, best first (routes not allowed in this context left out). */
  async scores(utterance: string, ctx: Context = {}): Promise<{ id: string; index: number; score: number }[]> {
    if (!this.vectors) await this.init();
    const [q] = (await this.embedder.embed([utterance], 'query')).map(unit);
    const best = new Map<number, number>();
    this.vectors!.forEach((v, i) => {
      const r = this.owners[i];
      const s = dot(q, v);
      if (s > (best.get(r) ?? -2)) best.set(r, s);
    });
    return [...best.entries()].filter(([r]) => this.routes[r].when?.(ctx) ?? true)
      .map(([r, score]) => ({ id: this.routes[r].id, index: r, score })).sort((a, b) => b.score - a.score);
  }

  async route(utterance: string, ctx: Context = {}): Promise<Routed | null> {
    const s = await this.scores(utterance, ctx);
    if (!s.length || s[0].score < this.threshold || (s.length > 1 && s[0].score - s[1].score < this.margin)) return null;
    const r = this.routes[s[0].index];
    const command = typeof r.command === 'function' ? r.command(ctx, utterance) : r.command;
    return command ? { command, id: r.id, score: s[0].score } : null;
  }
}
