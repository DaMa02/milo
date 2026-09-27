/**
 * Fixed phrases -> action, no model, well under a millisecond. Italian and English, in any mix: a user may answer
 * an Italian question with "yes". parse(utterance, context) returns a Command, or null when the phrase is not in the
 * grammar (the semantic router or a language model decides then).
 *
 * Every phrase must match the whole utterance (after polite words are dropped), or a pattern anchored at both ends:
 * the grammar may miss a sentence, it must not misread one. Indexes (branch, confirm, route) count from 0, like the
 * engine's branches. Matching ignores case and accents ("piu" is "più", "si" is "sì"); names are copied as said.
 */
import { AVOID_KINDS, cmd, PLACE_KINDS, type AvoidKind, type Command, type Context, type PlaceKind } from './commands';

// ---------- normalisation ----------

/** Lower case without accents, with the same length as the input (so a match in it can be cut out of the input). */
export function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

const LEAD = /^(?:(?:hey |ok |ciao )?milo|ok(?:ay)?|so|and|please|now|well|hey|um+|uh+|alright|can you tell me|could you tell me|can you|could you|would you|will you|do you know|allora|ecco|per favore|per piacere|senti|scusa(?:mi)?|dai|ehm+|eh|beh|bene|quindi|ma|adesso|ora|mi puoi dire|puoi dirmi|mi dici|sai dirmi|potresti dirmi|vorrei sapere|puoi|potresti|riesci a)\s+(?=\S)/;
const TRAIL = /\s+(?:please|now|then|instead|thanks|thank you|per favore|per piacere|grazie|invece|adesso|ora|subito|milo)$/;

/** The utterance without punctuation and polite words, case and accents kept. */
export function clean(text: string): string {
  let t = text.normalize('NFC').replace(/[’‘`´]/g, "'").replace(/[.!?,;:¿¡"«»“”…]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const f = fold(t);
    const lead = LEAD.exec(f);
    if (lead) {
      t = t.slice(lead[0].length);
      continue;
    }
    const trail = TRAIL.exec(f);
    if (trail) {
      t = t.slice(0, trail.index).trim();
      continue;
    }
    break;
  }
  return t.trim();
}

const set = (s: string) => new Set(s.split('|').map(fold));
const alt = (s: string) => s.split('|').map((x) => fold(x).replace(/[.*+?^${}()[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');

/** A leading article dropped: "the Duomo" -> "Duomo", "la stazione" -> "stazione", "l'università" -> "università". */
export function query(s: string): string {
  return s.trim().replace(/^(?:(?:the|il|lo|la|i|gli|le|un|uno|una)\s+|(?:l|un)'\s*)/i, '').trim();
}

// ---------- tables ----------

const ORD: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4, last: -1, one: 0, two: 1, three: 2, four: 3, five: 4,
  primo: 0, prima: 0, secondo: 1, seconda: 1, terzo: 2, terza: 2, quarto: 3, quarta: 3, quinto: 4, quinta: 4, ultimo: -1, ultima: -1,
  uno: 0, due: 1, tre: 2, quattro: 3, cinque: 4,
};

type Fixed = [Command, Set<string>];
const FIXED: Fixed[] = [
  [cmd('explore', { command: 'forward' }), set("forward|ahead|go ahead|go forward|go on|keep going|let's walk|lets walk|let's go|walk|continue|"
    + "go straight|straight on|straight ahead|avanti|vai avanti|andiamo avanti|andiamo|continua|prosegui|proseguiamo|vai dritto|dritto|"
    + 'sempre dritto|cammina|camminiamo|andare avanti|proseguire|continuare')],
  [cmd('explore', { command: 'left' }), set('left|turn left|go left|go to the left|to the left|take a left|sinistra|a sinistra|gira a sinistra|'
    + 'vai a sinistra|svolta a sinistra|giriamo a sinistra|andiamo a sinistra|girare a sinistra|andare a sinistra')],
  [cmd('explore', { command: 'right' }), set('right|turn right|go right|go to the right|to the right|take a right|destra|a destra|gira a destra|'
    + 'vai a destra|svolta a destra|giriamo a destra|andiamo a destra|girare a destra|andare a destra')],
  [cmd('explore', { command: 'back' }), set('back|go back|step back|indietro|torna indietro|torniamo indietro|vai indietro|tornare indietro|andare indietro')],
  [cmd('explore', { command: 'home' }), set("home|go home|back to the start|go back to the start|back to start|back to the beginning|"
    + "torna all'inizio|torna all inizio|all'inizio|torna al punto di partenza|torna alla partenza|torniamo all'inizio")],
  [cmd('explore', { command: 'where' }), set('where am i|where am i now|where are we|dove sono|dove mi trovo|dove siamo|dove sono adesso|'
    + 'dove mi trovo adesso|dove sono ora')],
  [cmd('explore', { command: 'start' }), set("explore|start exploring|let's explore|lets explore|explore the streets|esplora|esploriamo|"
    + 'inizia a esplorare|esplora le strade|inizia')],
  [cmd('repeat', {}), set("repeat|repeat that|say again|say that again|again|pardon|what|sorry what|come again|ripeti|puoi ripetere|"
    + 'come|cosa hai detto|ripeti per favore|ancora una volta|non ho capito|ripetere|ripetermelo')],
  [cmd('stop', {}), set('stop|quiet|be quiet|shut up|silence|enough|stop talking|basta|zitto|zitta|silenzio|fermati|taci|stai zitto|'
    + 'smettila|basta parlare|cancel|never mind|nevermind|forget it|annulla|lascia stare|lascia perdere|stare zitto|fare silenzio')],
  [cmd('more', {}), set('more|more detail|more details|tell me more|go on telling|details|più dettagli|dimmi di più|dettagli|altri dettagli|'
    + 'dimmi altro|raccontami di più')],
  [cmd('unknowns', {}), set("what don't you know|what do you not know|what don't you know about|what are you unsure about|what is unknown|"
    + "what's unknown|cosa non sai|che cosa non sai|cosa non sa la mappa|cosa manca alla mappa")],
  [cmd('sources', {}), set('sources|source|where does this come from|what are your sources|where is this from|fonti|le fonti|'
    + 'quali sono le fonti|da dove vengono i dati|da dove prendi i dati')],
  [cmd('help', {}), set('help|what can i say|what can i do|what can i ask|how does this work|aiuto|aiutami|cosa posso dire|'
    + 'cosa posso chiedere|cosa posso fare|come funziona|che cosa posso dire')],
  [cmd('speed', { change: 'faster' }), set('faster|speak faster|talk faster|speed up|quicker|talk quicker|più veloce|parla più veloce|'
    + 'più in fretta|velocizza|accelera|parla più in fretta|parlare più veloce')],
  [cmd('speed', { change: 'slower' }), set('slower|speak slower|talk slower|slow down|more slowly|più lento|più piano|parla più piano|'
    + 'parla più lentamente|rallenta|più lentamente|parla piano|parlare più piano|parlare più lentamente')],
  [cmd('start_over', {}), set('start over|restart|reset|start again|begin again|ricomincia|ricominciamo|da capo|ricomincia da capo|'
    + 'ricominciamo da capo|azzera')],
  [cmd('overview', {}), set("overview|give me the overview|describe the area|what's around me|what is around me|what's around|"
    + "what's around here|what is around here|what's nearby|what is nearby|describe my surroundings|panoramica|descrivi la zona|"
    + "cosa c'è intorno|cosa c'è qui intorno|cosa c'è intorno a me|cosa ho intorno|com'è la zona|descrivimi la zona|"
    + "dimmi cosa c'è intorno|cosa c'è vicino|cosa c'è qui vicino")],
  [cmd('set_origin_here', {}), set("use my location|use my current location|use my position|use where i am|i'm here|i am here|"
    + 'start here|start from here|from here|usa la mia posizione|usa la posizione|sono qui|parto da qui|partiamo da qui|parti da qui|da qui')],
  [cmd('route', {}), set('how do i get there|how do we get there|how can i get there|route|the route|directions|give me directions|'
    + 'get directions|plan the route|plan a route|show me the way|how do i get to my destination|come ci arrivo|come arrivo|'
    + 'come ci arriviamo|percorso|il percorso|indicazioni|dammi le indicazioni|calcola il percorso|che strada faccio')],
  [cmd('routes', {}), set('other routes|the other routes|other options|alternatives|the alternatives|compare routes|what are the options|'
    + 'altri percorsi|gli altri percorsi|le alternative|alternative|altre opzioni|confronta i percorsi|quali sono le opzioni')],
  [cmd('progress', {}), set('how far is it|how far to go|how much further|how much farther|how much longer|how long to go|are we there yet|'
    + 'quanto manca|quanto manca ancora|quanto ci vuole ancora|manca tanto|manca molto|quanto è lontano|siamo arrivati')],
  [cmd('language', { lang: 'en' }), set('speak english|in english|english please|english|parla inglese|in inglese|parla in inglese')],
  [cmd('language', { lang: 'it' }), set('parla italiano|in italiano|italiano|parla in italiano|speak italian|in italian|italian please')],
];
const FORWARD = FIXED[0][1];

const NAV: [Command, Set<string>][] = [
  [cmd('navigate', { state: 'start' }), set("start navigation|start navigating|start the navigation|start guiding|start guidance|guide me|"
    + "guide me there|let's go|lets go|take me there now|go now|portami|andiamo|avvia la navigazione|inizia la navigazione|guidami|"
    + 'partiamo|avvia|iniziamo|accompagnami|guidami tu|naviga|avvia la guida|inizia la guida')],
  [cmd('navigate', { state: 'stop' }), set('stop navigation|stop navigating|stop the navigation|stop guiding|stop guiding me|stop guidance|'
    + 'end navigation|cancel navigation|end guidance|ferma la navigazione|interrompi la navigazione|stop la navigazione|stop navigazione|'
    + 'termina la navigazione|fine navigazione|smetti di guidarmi|basta navigazione|ferma la guida|interrompi la guida')],
];
/** "take me there" means go when there is somewhere to go. */
const THERE = set('take me there|get me there|lead me there|portami lì|portami là|portaci lì|andiamo lì|andiamo là');

const YES = set("yes|yeah|yep|yup|correct|that's right|thats right|right|exactly|that one|ok|okay|sure|yes please|that's it|"
  + "sì|esatto|giusto|certo|va bene|quello|quella|perfetto|confermo|proprio quello|proprio quella|sì grazie|d'accordo|certamente|"
  + 'sì esatto|sì giusto|sì è quello|sì è quella|è quello|è quella|bene');
const NO = set("no|nope|not that|not that one|wrong|no thanks|neither|none of them|not really|"
  + 'non è quello|non è quella|sbagliato|sbagliata|no grazie|nessuno|nessuna|nessuno dei due|non quello|non quella|'
  + "un altro|un'altra|il prossimo|la prossima|next|the next one|another one");
const YES_HEAD = /^(?:yes|yeah|yep|si|certo|esatto)\b/;
const NO_HEAD = /^(?:no|nope)\b/;

const ORIGIN = new RegExp(`^(?:(?:${alt("start from|starting from|start at|starting at|i'm at|i am at|i'm in|i am in|i'm near|i am near|"
  + "i'm on|i am on|i'm starting from|i am starting from|parto da|parto dal|parto dalla|parto dallo|parto dai|parto dalle|partenza da|"
  + 'partiamo da|partiamo dal|partiamo dalla|sono a|sono al|sono alla|sono allo|sono ai|sono in|sono nel|sono nella|sono vicino a|'
  + 'sono vicino al|sono vicino alla|mi trovo a|mi trovo al|mi trovo alla|mi trovo in|mi trovo nel|mi trovo nella|mi trovo vicino a|'
  + 'mi trovo vicino al|mi trovo vicino alla|sono davanti a|sono davanti al|sono davanti alla|sono di fronte a|sono di fronte al|'
  + 'sono di fronte alla')})\\s+|(?:${alt("parto dall'|partiamo dall'|sono all'|sono vicino all'|mi trovo all'|mi trovo vicino all'|sono davanti all'|sono di fronte all'")})\\s*)(.+)$`);

type Then = 'route' | 'navigate' | undefined;
const DEST_WORDS: [Then, string, string][] = [
  // [then, before a space, before an apostrophe]
  [undefined, "i'm going to|i am going to|i want to go to|i'd like to go to|i would like to go to|i need to go to|go to|my destination is|"
    + 'the destination is|destination|set destination to|vado a|vado al|vado alla|vado allo|vado ai|vado alle|vado agli|vado in|vado da|'
    + 'vado dal|vado dalla|vado verso|voglio andare a|voglio andare al|voglio andare alla|voglio andare allo|voglio andare in|'
    + 'voglio andare da|voglio andare dal|voglio andare dalla|devo andare a|devo andare al|devo andare alla|devo andare allo|'
    + 'devo andare in|devo andare da|devo andare dal|devo andare dalla|la mia destinazione è|la destinazione è|destinazione',
  "vado all'|voglio andare all'|devo andare all'"],
  ['route', 'take me to|get me to|bring me to|how do i get to|how can i get to|how to get to|how do we get to|directions to|the way to|'
    + 'route to|portami a|portami al|portami alla|portami allo|portami ai|portami alle|portami in|portami da|portami dal|portami dalla|'
    + 'portami verso|come arrivo a|come arrivo al|come arrivo alla|come arrivo allo|come arrivo in|come si arriva a|come si arriva al|'
    + 'come si arriva alla|come si arriva in|come faccio ad arrivare a|come faccio ad arrivare al|come faccio ad arrivare alla|'
    + 'indicazioni per|percorso per|strada per|andiamo a|andiamo al|andiamo alla|andiamo in|andiamo da',
  "portami all'|come arrivo all'|come si arriva all'|come faccio ad arrivare all'|andiamo all'"],
  ['navigate', 'guide me to|walk me to|lead me to|navigate to|start navigation to|guidami a|guidami al|guidami alla|guidami in|guidami verso|'
    + 'accompagnami a|accompagnami al|accompagnami alla|accompagnami in|accompagnami da|naviga verso|naviga a|naviga fino a',
  "guidami all'|accompagnami all'"],
];
const DEST: [Then, RegExp][] = DEST_WORDS.map(([then, sp, ap]) => [then, new RegExp(`^(?:(?:${alt(sp)})\\s+|(?:${alt(ap)})\\s*)(.+)$`)]);

const AVOID = new RegExp(`^(?:${alt("avoid|no|without|never|don't use|do not use|no more|avoiding|evita|evitare|evitiamo|niente|senza|"
  + 'non voglio|mai|nessun|nessuna|voglio evitare|non usare|non passare per|non fare')})\\s+(.+)$`);
const KIND: [AvoidKind, RegExp][] = [
  ['signals_without_sound', /(?:signal|light)s? without (?:sound|audio)|silent (?:signal|light)|semafor[oi] (?:senza (?:suono|segnale acustico|audio)|mut[oi]|non sonor[oi])/],
  ['unsignalled_crossings', /crossings? without (?:signal|light)|unsignal|uncontrolled crossing|attraversament[oi] senza semafor|strisce senza semafor|incroci senza semafor|attraversament[oi] non regolat/],
  ['steps', /\b(?:steps|stairs|staircase|scale|scalini|gradini)\b/],
  ['construction', /construction|roadworks|road works|cantier|\blavori\b/],
  ['main_roads', /main (?:road|street)|busy (?:road|street)|big (?:road|street)|traffic|strade principali|vie principali|strade trafficate|strade grandi|traffico/],
  ['transfers', /transfer|chang(?:e|ing) (?:bus|line)|\bcambi\b|cambiare mezzo|trasbord|cambi di linea/],
];
const SIDE_ONLY = /only (?:side|quiet|small|secondary) (?:streets|roads)|side streets only|solo (?:strade|vie) (?:secondarie|tranquille|piccole)/;

/** Place kinds for stops on the way; the order settles "coffee shop" (cafe) and "buy bread" (bakery). */
const PLACES: [PlaceKind, RegExp][] = [
  ['supermarket', /supermarket|grocer|groceries|supermercat|\bspesa\b|alimentari|minimarket/],
  ['pharmacy', /pharmac|chemist|drugstore|farmaci/],
  ['cafe', /\bcafes?\b|coffee|espresso|cappuccin|\bbar\b|\bcaffe\b|caffetteria/],
  ['bakery', /baker|bread|panetteri|panific|\bforno\b|\bpane\b|focacc/],
  ['atm', /\batms?\b|cash|bancomat|money|\bsoldi\b|contanti|prelev|sportello/],
  ['shop', /\bshop|store|\bbuy\b|negozi|comprar|acquist/],
];
const STOP_AT = /\b(?:stop|add|buy|get|grab|need|want|pass by|stop by|on the way|along the way|on my way|fermati|fermarmi|fermarci|fermiamoci|ferma|aggiungi|passa|passare|passiamo|comprare|comprarmi|prendere|prendermi|tappa|sosta|lungo la strada|per strada|sulla strada|strada facendo|devo|voglio|ho bisogno)\b/;
const WAY = /on the way|along the way|on my way|lungo la strada|per strada|sulla strada|strada facendo|lungo il percorso|sul percorso|nel tragitto/;

const NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, 'twenty-five': 25, thirty: 30, forty: 40,
  'forty five': 45, 'forty-five': 45, sixty: 60, ninety: 90,
  uno: 1, due: 2, tre: 3, cinque: 5, dieci: 10, quindici: 15, venti: 20, venticinque: 25, trenta: 30, quaranta: 40, quarantacinque: 45,
  sessanta: 60, novanta: 90,
};
const NUM_ALT = Object.keys(NUM).sort((a, b) => b.length - a.length).join('|');
const MINUTES = new RegExp(`(?:^|[^\\p{L}\\p{N}_-])(\\d+|${NUM_ALT})\\s*(?:min|mins|minute|minutes|minuto|minuti)\\b`, 'u');
const BARE_MINUTES = new RegExp(`^(?:for |per )?(\\d+|${NUM_ALT})$`);

/** A preposition before a name: "alla stazione" -> "stazione"; "all'università" needs no space. */
const prep = (words: string, apos = '') => `(?:(?:${alt(words)})\\s+${apos ? `|(?:${alt(apos)})\\s*` : ''})`;
const A = prep('a|al|alla|allo|ai|alle|agli|in|nel|nella|nello|nei|nelle', "all'|nell'");
const DA = prep('da|dal|dalla|dallo|dai|dalle|dagli', "dall'");
const DI = prep('di|del|della|dello|dei|delle|degli', "dell'|d'");
const rx = (s: string) => new RegExp(s);

const PLACE_WORDS = String.raw`route|way|path|percorso|strada|area|neighbou?rhood|here|it|this|that|you|yourself|street|road|crossing|zona|quartiere|qui|questo|questa|tu|te|lei|piu`;
/** Captures that are not a place name: the question is about something else. */
const NOT_A_PLACE = new RegExp(`^(?:the |il |la |lo |l')?(?:${PLACE_WORDS})\\b`);
const THERE_WORDS = /^(?:it|there|that|that place|la|li|quello|quella|ci|my destination|the destination|la destinazione|la mia destinazione)$/;

const INFO: RegExp[] = [
  /^(?:is|are) (.+?) (?:still )?open(?: now| today| right now| tonight)?$/, /^when does (.+?) (?:open|close)$/,
  /^what time does (.+?) (?:open|close)$/, /^(?:opening hours|hours|opening times) (?:of|for|at) (.+)$/,
  /^(?:tell me about|what do you know about|information about|info about) (.+)$/,
  /^is there (?:wheelchair|step-free|disabled) access (?:at|to|in|for) (.+)$/, /^is (.+?) (?:wheelchair accessible|accessible|step-free)$/,
  /^(?:e|sono) apert[oiae] (.+)$/, /^(.+?) (?:e|sono) apert[oiae](?: adesso| ora| oggi| stasera| ancora)?$/,
  /^(?:a che ora|quando) (?:apre|chiude|aprono|chiudono) (.+)$/,
  rx(`^(?:gli )?(?:orari|orario|l'orario) ${DI}(.+)$`),
  rx(`^(?:parlami|dimmi|cosa sai|che cosa sai) ${DI}(.+)$`),
  /^(.+?) (?:e|sono) accessibil[ei](?: in carrozzina| con la carrozzina| con la sedia a rotelle| ai disabili)?$/,
  rx(`^c'e (?:l')?accesso (?:per disabili|in carrozzina|senza gradini|per la carrozzina|per sedie a rotelle) ${A}(.+)$`),
];

const STREET_TYPE = /\b(?:via|viale|corso|piazza|piazzale|largo|vicolo|strada|stradone|lungo\w*|ripa|alzaia|galleria|passaggio|salita|discesa|vico|contrada|borgo|street|road|avenue|lane|boulevard|drive|way|place|square|st|rd|ave)\b/;

type Ask = { tool: 'walking_vs_straight_line' | 'barrier_between' | 'independent_connections' | 'street_continuity' | 'extent';
  rx: RegExp; from?: number; to?: number; street?: number; place?: number };
const ASK: Ask[] = [
  // how far (the one or two places are group numbers of the pattern)
  { tool: 'walking_vs_straight_line', rx: /^how far is (.+?) from (.+)$/, to: 1, from: 2 },
  { tool: 'walking_vs_straight_line', rx: /^how far (?:is|are|away is) (.+?)(?: from here| on foot| walking| away| from me)?$/, to: 1 },
  { tool: 'walking_vs_straight_line', rx: /^how (?:long|many minutes) (?:does it take |will it take |is it )?(?:to walk |on foot )?to (.+)$/, to: 1 },
  { tool: 'walking_vs_straight_line', rx: /^is (.+?) (?:near|close|far|nearby|far away|within walking distance)(?: from here| to here| from me)?$/, to: 1 },
  { tool: 'walking_vs_straight_line', rx: rx(`^quanto dista (.+?) ${DA}(.+)$`), to: 1, from: 2 },
  { tool: 'walking_vs_straight_line', rx: rx(`^quanto (?:dista|e lontan[oa]|e distante)\\s+(.+?)(?: da qui| a piedi)?$`), to: 1 },
  { tool: 'walking_vs_straight_line', rx: rx(`^quanto (?:ci metto (?:ad arrivare |a piedi )?|ci vuole (?:a piedi )?per (?:arrivare|andare) |manca )${A}(.+?)(?: da qui| a piedi)?$`), to: 1 },
  { tool: 'walking_vs_straight_line', rx: /^(.+?) e (?:vicin[oa]|lontan[oa]|distante|raggiungibile a piedi)(?: da qui| a piedi)?$/, to: 1 },
  // between
  { tool: 'barrier_between', rx: /^(?:is there anything|what(?:'s| is)|is there something|are there obstacles) between (?:me|here|us) and (.+)$/, to: 1 },
  { tool: 'barrier_between', rx: /^(?:is there anything|what(?:'s| is)|is there something|are there obstacles) between (.+?) and (.+)$/, from: 1, to: 2 },
  { tool: 'barrier_between', rx: /^what separates (?:me|us|here) from (.+)$/, to: 1 },
  { tool: 'barrier_between', rx: /^(?:c'e qualcosa|cosa c'e|che cosa c'e|c'e qualche ostacolo|ci sono ostacoli|cosa si trova) (?:tra|fra) (?:me|qui|noi) e (.+)$/, to: 1 },
  { tool: 'barrier_between', rx: /^(?:c'e qualcosa|cosa c'e|che cosa c'e|c'e qualche ostacolo|ci sono ostacoli|cosa si trova) (?:tra|fra) (.+?) e (.+)$/, from: 1, to: 2 },
  { tool: 'barrier_between', rx: rx(`^cosa (?:mi |ci )?separa ${DA}(.+)$`), to: 1 },
  // ways
  { tool: 'independent_connections', rx: /^how many (?:ways|routes|different ways|independent ways|paths|different routes) (?:are there )?(?:to get |to go )?to (.+)$/, to: 1 },
  { tool: 'independent_connections', rx: rx(`^(?:quant[ie] (?:modi|strade|percorsi|vie) (?:ci sono )?(?:diversi |diverse |indipendenti )?per (?:arrivare|andare)|in quanti modi (?:posso arrivare|si arriva|arrivo|posso andare)) ${A}(.+)$`), to: 1 },
  // streets
  { tool: 'street_continuity', rx: /^does (.+?) (?:go through|go on|continue|end|lead anywhere)$/, street: 1 },
  { tool: 'street_continuity', rx: /^is (.+?) a (?:dead end|cul-de-sac|through street|through road)$/, street: 1 },
  { tool: 'street_continuity', rx: /^where does (.+?) (?:end|go|lead)$/, street: 1 },
  { tool: 'street_continuity', rx: /^(.+?) (?:e|è) (?:un vicolo cieco|una strada senza uscita|senza uscita|cieca|chiusa in fondo)$/, street: 1 },
  { tool: 'street_continuity', rx: /^(.+?) (?:continua|prosegue|finisce|va avanti|e passante)$/, street: 1 },
  { tool: 'street_continuity', rx: /^dove (?:finisce|porta|va|sbuca) (.+)$/, street: 1 },
  // size
  { tool: 'extent', rx: /^how (?:big|large|long|wide) is (.+)$/, place: 1 },
  { tool: 'extent', rx: /^how far does (.+?) (?:extend|go|stretch|reach)$/, place: 1 },
  { tool: 'extent', rx: /^quanto (?:e|sono) (?:grand[ei]|lung[oa]|estes[oa]|larg[oa]) (.+)$/, place: 1 },
  { tool: 'extent', rx: /^fin dove (?:arriva|si estende|va) (.+)$/, place: 1 },
];

const TAKE = new RegExp(`^(?:${alt("take|use|choose|pick|go with|i'll take|let's take|prendi|scegli|prendiamo|prendo|scelgo|vada per|"
  + 'facciamo|imbocca|imbocchiamo|gira in|gira su|svolta in|vai su|vai in')})\\s+(.+)$`);
/** Route ids are fixed by the engine's plan: B the shortest on foot, A main streets or fewest problems, C public transport. */
const HINTS: [string, RegExp][] = [
  ['B', /\b(?:shortest|quickest|fastest)\b|piu (?:corto|breve|veloce|rapido)/],
  ['A', /\bmain (?:streets?|roads?)\b|(?:strade|vie) principali|strade grandi/],
  ['C', /\b(?:bus|tram|metro|subway|transit|public transport|autobus|mezzi|metropolitana|trasporto pubblico|pullman)\b/],
];
const STOP = new Set(['the', 'a', 'an', 'one', 'route', 'way', 'option', 'il', 'la', 'lo', "l'", 'quella', 'quello', 'strada', 'via',
  'percorso', 'opzione', 'del', 'della', 'di', 'on', 'with', 'con', 'sulle', 'per']);

// ---------- helpers ----------

/** "the second one", "number 2", "2", "il secondo", "l'ultimo" -> 1 (-1 for the last); null when it is not an ordinal. */
export function ordinal(s: string): number | null {
  let t = fold(s).trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^(?:the|il|la|lo|number|numero|option|opzione|route|percorso|la numero|il numero|quello|quella)\s+|^l'\s*/, '');
    if (next === t) break;
    t = next;
  }
  t = t.replace(/\s+(?:one|route|option|way|opzione|percorso|strada|via)$/, '');
  if (/^\d+$/.test(t) && Number(t) > 0 && Number(t) < 20) return Number(t) - 1;
  return t in ORD ? ORD[t] : null;
}

export function placeKind(t: string): PlaceKind | null {
  return PLACES.find(([, rx]) => rx.test(t))?.[0] ?? null;
}

/** "la farmacia", "the chemist" -> "the pharmacy" (the engine's nearest of that kind); a name stays as said. */
export function placeRef(s: string): string {
  const one = /^(?:(?:the|a|an|la|il|lo|una|un|uno)\s+|(?:l|un)'\s*)?\S+$/i.test(s.trim());
  const k = one ? placeKind(fold(s)) : null;
  return k ? `the ${k}` : s;
}

/** "for 15 minutes", "ten minutes", "a quarter of an hour", "mezz'ora" -> minutes; null without a duration. */
export function minutes(t: string): number | null {
  const m = MINUTES.exec(t);
  if (m) return NUM[m[1]] ?? Number(m[1]);
  if (/quarter of an hour|quarter hour|quarto d'ora/.test(t)) return 15;
  if (/half an hour|half hour|mezz'?ora|mezza ora/.test(t)) return 30;
  if (/\ban hour\b|\bone hour\b|\bun'?\s?ora\b|\buna ora\b/.test(t)) return 60;
  return null;
}

const PREFIX = new Map<string, RegExp>();

/** Where group `gi` of a match of `rx` on `t` starts: after the pattern's fixed beginning, or at the end of `t`. */
function groupStart(rx: RegExp, t: string, m: RegExpExecArray, gi: number): number {
  const src = rx.source;
  if (gi === m.length - 1 && src.endsWith('(.+)$')) return t.length - m[gi].length;
  if (gi === 1) {
    let pre = PREFIX.get(src);
    if (!pre) {
      let k = 0;
      while ((k = src.indexOf('(', k)) >= 0 && (src[k + 1] === '?' || src[k - 1] === '\\')) k++;
      pre = new RegExp(src.slice(0, Math.max(0, k)));
      PREFIX.set(src, pre);
    }
    return pre.exec(t)?.[0].length ?? 0;
  }
  return t.lastIndexOf(m[gi]);
}

/** The part of `raw` that group `gi` matched in `t` (same length): names keep their case and accents. */
function cut(raw: string, t: string, rx: RegExp, m: RegExpExecArray, gi: number): string {
  const i = groupStart(rx, t, m, gi);
  return raw.slice(i, i + m[gi].length).trim();
}

function routeMatch(phrase: string, routes: { id: string; label?: string }[], strict = false): string | null {
  const ids = new Map(routes.map((r) => [r.id.toLowerCase(), r.id]));
  const bare = phrase.replace(/^(?:the |il |la )?(?:route |percorso |option |opzione )?/, '');
  if (ids.has(bare)) return ids.get(bare)!;
  const words = new Set((phrase.match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => !STOP.has(w)));
  const scored = routes.map((r) => {
    const label = new Set((fold(r.label ?? '').match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => !STOP.has(w)));
    return [[...words].filter((w) => label.has(w)).length, r.id] as [number, string];
  }).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : -1));
  if (scored.length && scored[0][0] && (scored.length === 1 || scored[1][0] < scored[0][0]) && !(strict && scored[0][0] < words.size)) {
    return scored[0][1];
  }
  for (const [rid, rx] of HINTS) if (rx.test(phrase) && ids.has(rid.toLowerCase())) return ids.get(rid.toLowerCase())!;
  return null;
}

function askCommand(a: Ask, m: RegExpExecArray, raw: string, t: string, ctx: Context): Command | null {
  const g = (i: number | undefined) => (i === undefined ? '' : cut(raw, t, a.rx, m, i));
  const place = (s: string) => {
    const f = fold(query(s));
    if (!s || /^(?:me|here|us|qui|noi|where i am|dove sono)$/.test(f)) return null;
    if (THERE_WORDS.test(f)) return ctx.has_destination ? 'destination' : undefined;
    return NOT_A_PLACE.test(fold(s)) ? undefined : s;
  };
  if (a.tool === 'street_continuity') {
    const s = g(a.street);
    if (!STREET_TYPE.test(fold(s)) || NOT_A_PLACE.test(fold(s))) return null;
    return cmd('ask', { tool: a.tool, params: { street: s } });
  }
  if (a.tool === 'extent') {
    const p = place(g(a.place));
    return p ? cmd('ask', { tool: a.tool, params: { place: p } }) : null;
  }
  const to = place(g(a.to));
  const from = a.from ? place(g(a.from)) : null;
  if (!to || from === undefined) return null;
  return cmd('ask', { tool: a.tool, params: { ...(from ? { from: { name: from } } : {}), to: { name: to } } });
}

// ---------- the parser ----------

export function parse(utterance: string, ctx: Context = {}): Command | null {
  const raw = clean(utterance);
  const t = fold(raw);
  if (!t) return null;
  const routes = (ctx.routes ?? []).filter((r) => r.id);
  const explore = ctx.view === 'explore';

  if ((ctx.pending === 'stop' || ctx.last_action === 'route_stop' || ctx.awaiting === 'minutes') && t.split(' ').length <= 7) {
    const n = minutes(t) ?? (ctx.awaiting === 'minutes' ? bare(t) : null);
    if (n && !placeKind(t)) return cmd('stop_duration', { minutes: n });
  }
  if (ctx.pending) {
    const cands = (ctx.pending === 'stop' ? ctx.stop_candidates : ctx.candidates) ?? [];
    const takeM = TAKE.exec(t);
    const name = fold(query(takeM ? takeM[1] : t));
    const hits = cands.map((c, i) => [fold(c), i] as const)
      .filter(([c]) => name.length > 2 && new RegExp(`(?:^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'u').test(c));
    if (hits.length === 1 && !YES.has(name) && !NO.has(name)) return cmd('confirm', { answer: 'yes', index: hits[0][1] });
    const head = /^(?:yes|yeah|si|no|nope)\b\s*(.+)$/.exec(t);
    const i = ordinal(head ? head[1] : t); // "no, the second one" picks the second
    if (i !== null) {
      const j = i < 0 ? i + cands.length : i;
      return cmd('confirm', j >= 0 ? { answer: 'yes', index: j } : { answer: 'yes' });
    }
    if (head) {
      // "no, take me to the station": the new request, not a no
      const rest = parse(raw.slice(t.length - head[1].length), { ...ctx, pending: null });
      if (rest && (rest.action === 'set_destination' || rest.action === 'set_origin')) return rest;
    }
    if (YES.has(t) || YES_HEAD.test(t)) return cmd('confirm', { answer: 'yes' });
    if (NO.has(t) || NO_HEAD.test(t)) return cmd('confirm', { answer: 'no' });
  }
  if (SIDE_ONLY.test(t)) return cmd('route_avoid', { kind: 'main_roads', strength: 'require' });
  const av = AVOID.exec(t);
  if (av) {
    for (const [kind, rx] of KIND) {
      if (rx.test(av[1])) {
        const strong = /^(?:never|mai)\b/.test(t) || /\bat all\b|\bassolutamente\b|\bper niente\b|\bdel tutto\b|\bin nessun caso\b/.test(t);
        return cmd('route_avoid', strong ? { kind, strength: 'require' } : { kind });
      }
    }
  }
  if (THERE.has(t)) return ctx.has_destination ? cmd('navigate', { state: 'start' }) : cmd('route', {});
  for (const [command, phrases] of NAV) {
    if (phrases.has(t) && !(explore && FORWARD.has(t))) return command;
  }
  for (const [command, phrases] of FIXED) if (phrases.has(t)) return command;
  for (const rx of INFO) {
    const m = rx.exec(t);
    if (m && !NOT_A_PLACE.test(m[1]) && !THERE_WORDS.test(m[1])) {
      const name = cut(raw, t, rx, m, 1);
      return cmd('ask', { tool: 'place_info', params: { place: { name: placeRef(name) } } });
    }
  }
  for (const a of ASK) {
    const m = a.rx.exec(t);
    if (m) {
      const c = askCommand(a, m, raw, t, ctx);
      if (c) return c;
    }
  }
  const kind = STOP_AT.test(t) ? placeKind(t) : null;
  const dest = DEST.map(([then, rx]) => [then, rx, rx.exec(t)] as const).find(([, , m]) => m);
  if (kind && (WAY.test(t) || !dest)) {
    const d = minutes(t);
    return cmd('route_stop', d ? { kind, duration_min: d } : { kind });
  }
  if (dest) {
    const [then, rx, m] = dest;
    const q = query(cut(raw, t, rx, m!, 1));
    if (q && ordinal(q) === null && !/^(?:there|here|qui|qua|li|la)$/.test(fold(q))) {
      return cmd('set_destination', then ? { query: q, then } : { query: q });
    }
  }
  const og = ORIGIN.exec(t);
  if (og) {
    const q = query(cut(raw, t, ORIGIN, og, 1));
    if (q && !/^(?:here|qui|qua)$/.test(fold(q))) return cmd('set_origin', { query: q });
  }
  const tk = TAKE.exec(t);
  const phrase = tk ? tk[1] : t;
  if (routes.length && !explore && (tk || t.split(' ').length <= 3)) {
    let rid = routeMatch(phrase, routes, !tk);
    const i = ordinal(phrase);
    if (rid === null && i !== null && -routes.length <= i && i < routes.length) rid = routes[i < 0 ? i + routes.length : i].id;
    if (rid) return cmd('route_select', { route_id: rid });
  }
  if (tk) {
    const i = ordinal(phrase);
    if (i !== null) return cmd('explore', { command: 'take', branch: i });
    if (routes.length) {
      const rid = routeMatch(phrase, routes);
      if (rid) return cmd('route_select', { route_id: rid });
    }
    const branch = query(raw.slice(raw.length - phrase.length));
    const f = fold(branch);
    if (explore || STREET_TYPE.test(f) || (ctx.branches ?? []).some((b) => fold(b).includes(f))) return cmd('explore', { command: 'take', branch });
  }
  if (explore) {
    const i = ordinal(t);
    if (i !== null) return cmd('explore', { command: 'take', branch: i });
  }
  if (ctx.awaiting === 'origin' || ctx.awaiting === 'destination') {
    // the app asked for a place: the answer is its name
    const q = query(raw);
    if (q && !YES.has(fold(q)) && !NO.has(fold(q))) {
      return ctx.awaiting === 'origin' ? cmd('set_origin', { query: q }) : cmd('set_destination', { query: q });
    }
  }
  return null;
}

function bare(t: string): number | null {
  const m = BARE_MINUTES.exec(t);
  return m ? (NUM[m[1]] ?? Number(m[1])) : null;
}

export { AVOID_KINDS, PLACE_KINDS };
