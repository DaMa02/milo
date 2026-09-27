/**
 * Messaggi italiani del motore. Stessa forma di en.ts: ogni frase che il motore pronuncia nasce qui.
 * I numeri restano cifre senza separatore delle migliaia ("1080 m"), così la sintesi vocale li legge bene
 * e ogni numero detto resta confrontabile con i fatti che lo sostengono.
 */
import { type Label, type Lang, cap, lc } from './common';
import { en, type Messages } from './en';

const plural = (n: number, one: string, many = one) => `${n} ${n === 1 ? one : many}`;

function joinWith(items: string[], word: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

const COMPASS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];

function label(l: Label): string {
  switch (l.kind) {
    case 'street':
      return lc(l.name!);
    case 'pavement':
      return l.name ? `il marciapiede di ${lc(l.name)}` : 'un marciapiede';
    case 'crossing':
      return l.name ? `l'attraversamento di ${lc(l.name)}` : 'un attraversamento';
    case 'steps':
      return 'una scalinata';
    default:
      return 'un percorso pedonale';
  }
}

/** "su via Brembo", "sul marciapiede di via Brembo", "sull'attraversamento di viale Isonzo" */
function onLabel(l: Label): string {
  switch (l.kind) {
    case 'street':
      return `su ${lc(l.name!)}`;
    case 'pavement':
      return l.name ? `sul marciapiede di ${lc(l.name)}` : 'su un marciapiede';
    case 'crossing':
      return l.name ? `sull'attraversamento di ${lc(l.name)}` : 'su un attraversamento';
    case 'steps':
      return 'su una scalinata';
    default:
      return 'su un percorso pedonale';
  }
}

const num = (n: number) => String(n).replace('.', ',');
const minutes = (n: number) => plural(n, 'minuto', 'minuti');

/** Preposizione articolata: prep('da', 'il supermercato') -> 'dal supermercato'. */
function prep(p: 'a' | 'da' | 'di' | 'in' | 'su', phrase: string): string {
  const table: Record<string, Record<string, string>> = {
    a: { 'il ': 'al ', 'lo ': 'allo ', 'la ': 'alla ', "l'": "all'", 'i ': 'ai ', 'gli ': 'agli ', 'le ': 'alle ' },
    da: { 'il ': 'dal ', 'lo ': 'dallo ', 'la ': 'dalla ', "l'": "dall'", 'i ': 'dai ', 'gli ': 'dagli ', 'le ': 'dalle ' },
    di: { 'il ': 'del ', 'lo ': 'dello ', 'la ': 'della ', "l'": "dell'", 'i ': 'dei ', 'gli ': 'degli ', 'le ': 'delle ' },
    in: { 'il ': 'nel ', 'lo ': 'nello ', 'la ': 'nella ', "l'": "nell'", 'i ': 'nei ', 'gli ': 'negli ', 'le ': 'nelle ' },
    su: { 'il ': 'sul ', 'lo ': 'sullo ', 'la ': 'sulla ', "l'": "sull'", 'i ': 'sui ', 'gli ': 'sugli ', 'le ': 'sulle ' },
  };
  for (const [art, merged] of Object.entries(table[p])) if (phrase.startsWith(art)) return merged + phrase.slice(art.length);
  return `${p} ${phrase}`;
}

const KIND_NOUN: Record<string, string> = {
  street: 'una via', supermarket: 'un supermercato', pharmacy: 'una farmacia', cafe: 'un bar', bakery: 'una panetteria', atm: 'un bancomat',
  shop: 'un negozio', park: 'un parco', garden: 'un giardino', 'construction site': 'un cantiere', railway: 'una ferrovia',
  waterway: "un corso d'acqua", 'railway land': "un'area ferroviaria", place: 'un luogo',
};
const FEMININE = new Set(['pharmacy', 'bakery']);
const DAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];


export const it: Messages = {
  lang: 'it' as Lang,
  num,
  metres: (m: number) => `${num(m)} m`,
  plural,
  joinAnd: (items: string[]) => joinWith(items, 'e'),
  joinOr: (items: string[]) => joinWith(items, 'o'),
  cap,
  compass: (i: number) => COMPASS[i],
  clock: (hour: number) => ({ 0: 'davanti', 3: 'a destra', 6: 'dietro', 9: 'a sinistra' } as Record<number, string>)[hour] ?? `a ore ${hour}`,
  distanceAt: (metres: string, clock: string) => `a ${metres}, ${clock}`,
  label,
  onLabel,
  alongLabel: (l: Label) => `lungo ${label(l)}`,
  street: (name: string) => lc(name),
  bridge: (road: string | null) => (road ? `il ponte di ${lc(road)}` : 'un ponte senza nome'),
  bridgePhrase: (road: string | null, underpass: boolean) =>
    (road ? `il ponte di ${lc(road)}` : 'un ponte senza nome') + (underpass ? ', con un sottopasso accanto' : ''),

  overview: {
    railwayName: (name: string | null) =>
      name === 'Cintura sud di Milano' ? 'la cintura ferroviaria sud' : name ? `la ferrovia ${name}` : 'la ferrovia',
    facing: (facing: string, name: string) => `Da ${name}, sei rivolto verso ${facing}.`,
    across: (leftRight: boolean) => (leftRight ? 'da sinistra a destra' : 'da davanti a dietro di te'),
    split: (parts: number, side: string) =>
      parts === 2 ? `divide la zona in due; sei sul lato ${side}`
        : parts > 2 ? `divide la zona in ${parts} parti; sei sul lato ${side}` : 'non divide la zona',
    railway: (spoken: string, across: string, where: string, split: string) => `${cap(spoken)} corre ${across}, ${where}, e ${split}.`,
    within: (radius: string, center: string | null) => (center ? `${radius} da ${center}` : radius),
    crossPlaces: (within: string, n: number, nearest: string, where: string) =>
      `Entro ${within} puoi attraversarla a piedi in ${plural(n, 'punto', 'punti')}; il più vicino è ${nearest}, ${where}.`,
    noCrossPlace: (within: string) => `Entro ${within} la mappa non mostra punti per attraversarla a piedi.`,
    railUnknown: (radius: string, center: string) =>
      `Gli attraversamenti della ferrovia sono contati solo entro ${radius} da ${center}; più lontano potrebbero essercene altri.`,
    construction: (between: boolean, name: string | null, where: string) =>
      `${between ? 'Tra te e la ferrovia c\'è' : 'C\'è'} un cantiere${name ? `, ${name},` : ''} ${where}`,
    moreConstruction: (n: number, within: string, where: string) =>
      `; ${plural(n, 'altro cantiere', 'altri cantieri')} entro ${within}, il più vicino ${where}`,
    mainRoads: (items: string[]) => `Strade principali che sentirai: ${items.join('; ')}.`,
    roadItem: (name: string, where: string) => `${name}, ${where}`,
    crossings: (items: string[]) => `Attraversamenti della ferrovia a piedi: ${items.join('; ')}.`,
    nothing: 'La mappa non mostra ferrovie né cantieri vicino a te.',
    reference: (name: string, street: string | null, facing: string) =>
      `Sei a ${name}${street ? `, su ${street}` : ''}, rivolto verso ${facing}.`,
    nothingMore: 'Nient\'altro sulla mappa vicino a te.',
    constructionSite: 'un cantiere',
  },

  explore: {
    noWay: (where: 'forward' | 'left' | 'right' | 'name' | 'number') =>
      `Non c'è nessuna via ${{ forward: 'davanti', left: 'alla tua sinistra', right: 'alla tua destra', name: 'con quel nome o numero qui', number: 'con quel numero qui' }[where]}. `,
    fewMetres: 'pochi metri',
    another: (l: Label) => {
      if (l.kind === 'footpath') return 'un altro percorso pedonale';
      if (l.kind === 'pavement' && !l.name) return 'un altro marciapiede';
      if (l.kind === 'crossing' && !l.name) return 'un altro attraversamento';
      return `un'altra via lungo ${label(l)}`;
    },
    leadsTo: (k: { kind: string; others?: string[] }) =>
      k.kind === 'loop' ? 'un anello che torna a questo incrocio' : k.kind === 'edge' ? 'il bordo dell\'area mappata'
        : k.kind === 'dead_end' ? 'un vicolo cieco' : k.others?.length ? `un incrocio con ${joinWith(k.others, 'e')}` : 'un incrocio',
    branch: (name: string, dir: string, distance: string, leadsTo: string) =>
      `${name}, ${dir}, ${distance} fino ${leadsTo.startsWith('il ') ? `al ${leadsTo.slice(3)}` : `a ${leadsTo}`}`,
    crossingKind: (signals: string, sound: string, many: boolean) => {
      if (signals === 'no') return 'senza semaforo';
      if (signals === 'yes' && sound === 'yes') return 'con semaforo e segnale sonoro';
      if (signals === 'yes' && sound === 'no') return 'con semaforo ma senza segnale sonoro';
      if (signals === 'yes') return many ? 'con semaforo, ma la mappa non dice se hanno il segnale sonoro'
        : 'con semaforo, ma la mappa non dice se ha il segnale sonoro';
      return many ? 'per cui la mappa non dice se hanno il semaforo' : 'per cui la mappa non dice se ha il semaforo';
    },
    crossingsAll: (total: number, kind: string) => `; ${total} attraversamenti lungo la via, ${total === 2 ? 'entrambi' : 'tutti'} ${kind}`,
    crossingsMixed: (total: number, parts: string[]) => `; ${total} attraversamenti lungo la via: ${joinWith(parts, 'e')}`,
    crossingsPart: (n: number, kind: string) => `${n} ${kind}`,
    crossingUnknown: '; la mappa non dice se il suo attraversamento ha il semaforo',
    crossingSignal: (sound: string) =>
      `; il suo attraversamento ha il semaforo${{ yes: ', con segnale sonoro', no: ', senza segnale sonoro', unknown: ', ma la mappa non dice se ha il segnale sonoro' }[sound]}`,
    crossingNoSignal: '; il suo attraversamento non ha il semaforo',
    noOtherWay: 'Da qui non c\'è nessun\'altra via.',
    deadEnd: ' È un vicolo cieco.',
    oneWay: (b: string) => `1 via: ${b}.`,
    ways: (n: number, items: string[]) => `${n} vie, da sinistra a destra: ${items.join('; ')}.`,
    edge: ' Qui finisce l\'area mappata: le vie potrebbero continuare oltre.',
    behind: (l: string) => ` Dietro di te: ${l}, da dove arrivi.`,
    start: (name: string, cardinal: string, on: string) => `Partenza da ${name}, rivolto verso ${cardinal}. Sei ${on}. `,
    startOffset: (kind: 'junction' | 'dead end' | 'mapped point', d: string) =>
      `La passeggiata parte ${{ junction: 'dall\'incrocio', 'dead end': 'dal vicolo cieco', 'mapped point': 'dal punto mappato' }[kind]} più vicino, a ${d} lungo la via. `,
    walked: (d: string, along: string) => `Hai camminato per ${d} ${along} e ora sei rivolto nella direzione in cui camminavi. `,
    back: 'Di nuovo all\'incrocio precedente, rivolto come eri lì. ',
    atStart: 'Sei al punto di partenza; non c\'è un incrocio precedente. ',
    home: (name: string, cardinal: string) => `Di nuovo alla partenza, ${name}, rivolto di nuovo verso ${cardinal}. `,
    whereOn: (labels: string[], one: Label | null) => (one ? onLabel(one) : `dove si incontrano ${joinWith(labels, 'e')}`),
    whereFar: (d: string | null, name: string) => (d ? `a ${d} in linea d'aria da ${name}` : `proprio a ${name}`),
    where: (on: string, far: string) => `Sei ${on}, ${far}. `,
  },

  hours: {
    always: 'aperto 24 ore su 24',
    openUntil: (hm: string) => `aperto fino alle ${hm}`,
    opens: (when: 'today' | 'tomorrow' | number, hm: string) =>
      `chiuso ora, apre ${when === 'today' ? 'oggi' : when === 'tomorrow' ? 'domani' : DAYS[when]} alle ${hm}`,
    closed: 'chiuso ora',
    unknown: 'la mappa non dice quando è aperto',
    unreadable: 'la mappa indica gli orari, ma non riesco a leggerli',
  },

  places: {
    here: ['qui', 'qua', 'me', 'mia posizione', 'posizione', 'dove sono', 'partenza', 'inizio', 'here', 'me', 'start'],
    startWords: ['partenza', 'inizio', 'start'],
    destination: ['destinazione', 'meta', 'là', 'lì', 'arrivo', 'festa', 'destination', 'there'],
    articles: ['il ', 'lo ', 'la ', "l'", 'i ', 'gli ', 'le ', 'un ', 'uno ', 'una ', "un'", 'the ', 'a ', 'an '],
    kindWords: {
      cantiere: ['construction site'], cantieri: ['construction site'], lavori: ['construction site'],
      ferrovia: ['railway'], binari: ['railway'], 'linea ferroviaria': ['railway'],
      parco: ['park', 'garden'], giardino: ['park', 'garden'], giardini: ['park', 'garden'], giardinetti: ['park', 'garden'],
      supermercato: ['supermarket'], farmacia: ['pharmacy'], bar: ['cafe'], caffè: ['cafe'], caffe: ['cafe'], caffetteria: ['cafe'],
      panetteria: ['bakery'], panificio: ['bakery'], forno: ['bakery'], bancomat: ['atm'], banca: ['atm'], sportello: ['atm'],
      negozio: ['shop'],
      // the kind words the grammar and the models write, in English
      ...en.places.kindWords,
    } as Record<string, string[]>,
    cashMachine: (operator: string | null) => (operator ? `Bancomat ${operator}` : 'Bancomat'),
    onStreet: (name: string, street: string) => `${name} in ${lc(street)}`,
    pointOn: (road: string | null) => (road ? `un punto in ${lc(road)}` : 'quel punto'),
    walkPosition: 'la tua posizione nella passeggiata',
    which: 'Quale luogo intendi?',
    whichStreet: 'Quale via intendi?',
    notGiven: 'Non è stato indicato nessun luogo.',
    noDestination: 'Non è stata indicata nessuna destinazione.',
    noStreet: 'Non è stata indicata nessuna via.',
    unusable: 'Il luogo non è indicato in una forma che posso usare.',
    notFound: (q: string) => `Non trovo ${q} sulla mappa di questa zona. Puoi dirmi una via o un luogo vicino?`,
    notFoundUnknown: (q: string) => `La mappa di questa zona non ha nessun luogo chiamato ${q}.`,
    wrongKind: (label: string, kind: string, what: string) => `${cap(label)} è ${kind}, non ${what}.`,
    wrongKindUnknown: (what: string) => `Posso rispondere solo per ${what}.`,
    whatPlace: 'un luogo',
    whatStreet: 'una via',
    whatArea: 'un parco, un giardino, un cantiere o una via',
    outside: (what: string | null, radius: string, center: string) =>
      `${what ? `${cap(what)} è` : 'È'} fuori dall'area che ho mappato: ${radius} intorno a ${center}.`,
    outsideUnknown: (radius: string, center: string) => `La mappa da cui rispondo finisce a ${radius} da ${center}.`,
    ambiguous: (labels: string[]) => `Quale intendi: ${joinWith(labels, 'o')}?`,
    ambiguousUnknown: 'Il nome corrisponde a più di un luogo sulla mappa.',
    samePlace: (a: string, b: string) => (a === b ? `Entrambi i luoghi sono ${a}.` : `${cap(a)} e ${b} sono lo stesso punto sulla mappa.`),
    whichOther: ' Quale altro luogo intendi?',
    samePlaceUnknown: 'I due luoghi indicati sono lo stesso.',
  },

  tools: {
    railway: (name: string | null) =>
      name === 'Cintura sud di Milano' ? ['la cintura ferroviaria sud, Cintura sud di Milano', 'la cintura ferroviaria sud']
        : name ? [`la ferrovia ${name}`, `la ferrovia ${name}`] : ['una ferrovia', 'una ferrovia'],
    waterway: (name: string | null, type: string | undefined) => {
      const wt = ({ canal: 'canale', river: 'fiume', stream: 'torrente' } as Record<string, string>)[type ?? ''] ?? "corso d'acqua";
      return name ? `il ${wt} ${name}` : `un ${wt}`;
    },
    constructionSite: (name: string | null) => (name ? `il cantiere ${name}` : 'un cantiere'),
    sameSpot: (a: string, b: string) => `${cap(a)} e ${b} sono nello stesso punto sulla mappa.`,
    noRoute: (crow: string, a: string, b: string) =>
      `${crow} in linea d'aria, ma non trovo un percorso a piedi tra ${a} e ${b} sulla mappa. Potrebbe esserci una via fuori dall'area mappata.`,
    noRouteUnknown: 'La mappa non mostra collegamenti a piedi tra i due.',
    walking: (crow: string, detour: boolean, walk: string, n: number) =>
      `${crow} in linea d'aria, ${detour ? 'ma' : 'e'} ${walk} a piedi, circa ${minutes(n)}`,
    inBetween: (barrier: string) => `: in mezzo c'è ${barrier}.`,
    crossOn: (isRailway: boolean, places: string[]) =>
      ` A piedi ${isRailway ? 'la attraversi' : 'attraversi la ferrovia'} ${joinWith(places.map((p) => prep('su', p)), 'e')}.`,
    ratio: (ratio: number) => (ratio >= 1.1 ? ` Il percorso a piedi è ${num(ratio)} volte la distanza in linea d'aria.`
      : ' Il percorso a piedi è lungo circa quanto la linea d\'aria.'),
    snapUnknown: (items: string[]) => `Le distanze partono e arrivano al percorso pedonale mappato più vicino: ${joinWith(items, 'e')}.`,
    snapItem: (d: string, name: string) => `${d} da ${name}`,
    noBarrier: (a: string, b: string) => `No. La mappa non mostra ferrovie, acqua o cantieri sulla linea retta tra ${a} e ${b}.`,
    noBarrierUnknown: 'Controllo solo ferrovie, acqua e cantieri; edifici, recinzioni e muri no.',
    barriers: (items: string[]) => {
      const longs = [...items];
      if (longs.length > 1 && longs[longs.length - 2].includes(',')) longs[longs.length - 2] += ',';
      return `Sì. In linea retta attraverseresti ${joinWith(longs, 'e')}.`;
    },
    railPlaces: (radius: string, center: string, items: string[]) =>
      ` Entro ${radius} da ${center} la ferrovia si può attraversare a piedi in ${plural(items.length, 'punto', 'punti')}: ${items.join(' e ')}.`,
    railPlaceItem: (phrase: string, d: string) => `${phrase}, a ${d} in linea d'aria`,
    noRailPlace: (radius: string, center: string) => ` Entro ${radius} da ${center} non c'è nessun punto per attraversare a piedi la ferrovia.`,
    railPlacesUnknown: (radius: string, center: string) => `Gli attraversamenti oltre ${radius} da ${center} non sono contati: potrebbero essercene altri.`,
    edgeNote: ' Un capo arriva al bordo della mappa scaricata, quindi potrebbe non essere tutto.',
    edgeUnknown: 'Un capo della via è sul bordo della mappa scaricata.',
    beyondNote: (radius: string, center: string) =>
      ` Un capo è a più di ${radius} da ${center}, oltre l'area per cui rispondo, quindi potrebbe non essere tutto.`,
    beyondUnknown: 'Un capo della via è oltre l\'area per cui rispondo.',
    openedUnknown: 'In alcuni punti la mappa non permette di camminare sulla carreggiata; lì considero che la via continui lungo i marciapiedi.',
    connections: (names: string[]) =>
      names.length ? (names.length <= 5 ? joinWith(names, 'e') : `${names.slice(0, 5).join(', ')} e altre vie`) : 'solo percorsi pedonali',
    loop: (street: string, length: string) => `A piedi, ${street} forma un anello: misura circa ${length}.`,
    deadEnds: (street: string, length: string, dead: number, allDead: boolean, conn: string) =>
      `A piedi, ${street} non prosegue: misura circa ${length}, ha ${dead === 1 ? 'un vicolo cieco' : `${dead} vicoli ciechi`}, e ${allDead ? 'nessun capo si collega ad altre vie' : `gli altri capi si collegano a ${conn}`}.`,
    goesThrough: (street: string, length: string, conn: string) => `A piedi, ${street} prosegue: misura circa ${length}, e i suoi capi si collegano a ${conn}.`,
    noexitUnknown: 'La mappa non segna il vicolo cieco come tale: il percorso pedonale semplicemente finisce lì.',
    pavementsUnknown: 'La mappa non dice se la via ha marciapiedi su entrambi i lati.',
    corner: (a: string, b: string) => `l'angolo tra ${a} e ${b}`,
    footpath: 'un percorso pedonale',
    samePlaceWays: (a: string, b: string) =>
      `${cap(a)} e ${b} sono praticamente lo stesso punto sulla mappa, quindi non ci sono vie separate da contare.`,
    noWay: (a: string, b: string) => `Non trovo nessuna via a piedi tra ${a} e ${b} sulla mappa.`,
    oneWay: (a: string, b: string, through: string) => `C'è una sola via tra ${a} e ${b}: ogni percorso passa per ${through}.`,
    twoSame: (a: string, b: string, along: string) =>
      `Ci sono 2 vie indipendenti tra ${a} e ${b}, senza incroci in comune: entrambe passano lungo ${along}, una da ciascun capo.`,
    two: (a: string, b: string, one: string, other: string) =>
      `Ci sono 2 vie indipendenti tra ${a} e ${b}, senza incroci in comune: una passa per ${one}, l'altra per ${other}.`,
    many: (k: number, a: string, b: string) => `Ci sono ${k} vie indipendenti tra ${a} e ${b}, senza incroci in comune.`,
    outsideMore: ' Una via fuori dall\'area mappata potrebbe aggiungerne altre.',
    outsideAny: ' Potrebbe esserci una via fuori dall\'area mappata.',
    leaveUnknown: 'Le vie che escono dall\'area mappata non sono contate.',
    pavementSidesUnknown: 'I marciapiedi sui due lati di una strada contano come una sola via solo dove li unisce un attraversamento mappato.',
    streetExtent: (street: string, length: string, n: number, conn: string, note: string) =>
      `${cap(street)} misura circa ${length}, circa ${minutes(n)} a piedi; i suoi capi si collegano a ${conn}.${note}`,
    areaName: (name: string, construction: boolean) => (construction ? `il cantiere ${name}` : name),
    extentWhere: (labels: string[], fills: boolean) =>
      labels.length > 1 ? `${fills ? "occupa l'isolato tra" : 'si trova lungo'} ${joinWith(labels, 'e')}`
        : labels.length ? `si trova lungo ${labels[0]}` : 'sulla mappa non è delimitato da vie con un nome',
    extent: (spoken: string, where: string, sideMin: number, side: string, aroundMin: number) =>
      `${cap(spoken)} ${where}; il lato più lungo richiede circa ${minutes(sideMin)} a piedi, ${side}; fare tutto il giro richiede circa ${minutes(aroundMin)}.`,
    entrancesUnknown: 'La mappa non dice dove sono gli ingressi.',
    kindNoun: (kind: string) => KIND_NOUN[kind] ?? 'un luogo',
    kindName: (kind: string) => KIND_NOUN[kind] ?? 'un luogo',
    placeInfo: (name: string, addr: string | null, noun: string, d: string) => `${name}${addr ? `, ${addr}` : ''}: ${noun} a ${d} da qui in linea d'aria.`,
    hoursSentence: (phrase: string) => `${cap(phrase)}.`,
    wheelchair: (w: string) => `Accesso in sedia a rotelle: ${w}, secondo la mappa.`,
    wheelchairValue: (w: string) => ({ yes: 'sì', limited: 'limitato', no: 'no' } as Record<string, string>)[w] ?? w,
    hoursUnknown: 'La mappa non dice quando è aperto.',
    wheelchairUnknown: 'La mappa non dice se è accessibile in sedia a rotelle.',
    question: (tool: string) => ({ walking_vs_straight_line: 'quanto dista a piedi', barrier_between: "cosa c'è in mezzo",
      street_continuity: 'la via prosegue', independent_connections: 'quante vie indipendenti', extent: 'quanto è grande',
      place_info: 'informazioni sul luogo' } as Record<string, string>)[tool] ?? tool.replace(/_/g, ' '),
  },

  plan: {
    say: {
      unsignalled_crossings: ['attraversamenti senza semaforo', 'il semaforo a ogni attraversamento', 'il semaforo a ogni attraversamento',
        'attraversamenti noti senza semaforo', 'ha almeno un attraversamento senza semaforo'],
      signals_without_sound: ['semafori senza segnale sonoro', 'il segnale sonoro a ogni semaforo', 'il segnale sonoro a ogni semaforo',
        'semafori noti senza segnale sonoro', 'ha almeno un semaforo senza segnale sonoro'],
      steps: ['le scale', 'un percorso senza scale', 'un percorso senza scale', 'scale', 'ha delle scale'],
      main_roads: ['le strade principali', 'un percorso lontano dalle strade principali', 'un percorso lontano dalle strade principali',
        'tratti lungo strade principali', 'costeggia una strada principale'],
      construction: ['i cantieri', 'un percorso che non passa da cantieri', 'un percorso che non passa da cantieri', 'cantieri',
        'passa accanto a un cantiere'],
      transfers: ['i cambi', 'nessun cambio', 'un viaggio senza cambi', 'cambi', null],
      walking_over_min: ['più di {v} minuti a piedi', 'al massimo {v} minuti a piedi', 'al massimo {v} minuti a piedi', 'troppo cammino', null],
    } as Record<string, (string | null)[]>,
    unmapped: 'Non conto gli attraversamenti in punti dove la mappa non ne segna.',
    badCrossings: (kind: 'unsignalled_crossings' | 'signals_without_sound', n: number, u: number) =>
      (kind === 'unsignalled_crossings'
        ? (n ? `${plural(n, 'attraversamento', 'attraversamenti')} senza semaforo` : 'nessun attraversamento senza semaforo')
        : (n ? `${plural(n, 'semaforo', 'semafori')} senza segnale sonoro` : 'nessun semaforo senza segnale sonoro'))
      + (u ? ` e ${u} per cui la mappa non lo dice` : ''),
    steps: (n: number) => (n ? `${plural(n, 'rampa', 'rampe')} di scale` : 'nessuna scala'),
    mainRoads: (n: number, metres: string) => (n ? `${metres} lungo strade principali` : 'nessun tratto lungo strade principali'),
    construction: (n: number) => (n ? `accanto a ${plural(n, 'cantiere', 'cantieri')}` : 'nessun cantiere'),
    transfers: (n: number) => (n ? plural(n, 'cambio', 'cambi') : 'nessun cambio'),
    warnUnsignalled: (n: number) => `${plural(n, 'attraversamento', 'attraversamenti')} senza semaforo.`,
    warnUnsignalledUnknown: (u: number) => `${plural(u, 'attraversamento', 'attraversamenti')} per cui la mappa non dice se c'è il semaforo.`,
    warnSilent: (n: number) => `${plural(n, 'semaforo', 'semafori')} senza segnale sonoro.`,
    warnSilentUnknown: (u: number) => `${plural(u, 'attraversamento', 'attraversamenti')} per cui la mappa non dice se il semaforo ha il segnale sonoro.`,
    warnWalking: (walk: number, limit: number) => `${minutes(walk)} a piedi, più di ${num(limit)}.`,
    duration: (min: number, withStop: string | null) => `${minutes(min)}${withStop ? ` ${withStop}` : ''}`,
    shortest: (id: string, alsoMain: boolean, dur: string, phr: string) =>
      `Percorso ${id}, a piedi, il più breve${alsoMain ? ', che è anche quello lungo le strade principali' : ''}, ${dur}: ${phr}.`,
    mainStreets: (id: string, dur: string, extra: number, phr: string, fewest: boolean) =>
      `Percorso ${id}, a piedi, lungo le strade principali, ${dur}${extra === 0 ? ', lo stesso tempo del più breve, che usa vie secondarie'
        : extra > 0 ? `, ${minutes(extra)} più del più breve, che usa vie secondarie` : ', meno del più breve'}: ${phr}${fewest ? ", il minimo tra tutti i percorsi dell'area mappata" : ''}.`,
    foot: (id: string, dur: string, extra: number, phr: string, fewest: boolean) =>
      `Percorso ${id}, a piedi, ${dur}${extra === 0 ? ', lo stesso tempo del più breve' : extra > 0 ? `, ${extra} in più del più breve` : ', meno del più breve'}: ${phr}${fewest ? ", il minimo tra tutti i percorsi dell'area mappata" : ''}.`,
    transitAfterStop: (stopName: string, line: string, from: string, dur: string, wait: number, walk: number, phr: string) =>
      `Percorso C, a piedi fino a ${stopName}, poi ${line} da ${from}: ${dur}${wait ? ` e ${minutes(wait)} di attesa dopo` : ''}, di cui ${walk} a piedi, con ${phr}.`,
    transit: (line: string, from: string, wait: number, dur: number, walk: number, phr: string) =>
      `Percorso C, ${line} da ${from}: ${wait ? `parti ${minutes(wait)} dopo l'orario indicato` : "parti all'orario indicato"} e arrivi ${minutes(dur)} dopo, di cui ${walk} a piedi, con ${phr}.`,
    transitCompare: (id: string, min: number) => `; il percorso ${id} a piedi richiede ${min}.`,
    lineWord: { bus: 'autobus', tram: 'tram', subway: 'metro', rail: 'treno', other: 'linea' } as Record<string, string>,
    lines: (items: string[]) => items.join(', poi '),
    every: (dest: string, items: string[]) => `Nell'area mappata, ogni via per ${dest} ${joinWith(items, 'e')}.`,
    noneMeets: (walkingOnly: boolean, so: boolean, reqs: string | null, busUnknown: boolean) =>
      `${so ? `Quindi nessun ${walkingOnly ? 'percorso a piedi' : 'percorso'} lì soddisfa ` : `Nessun ${walkingOnly ? 'percorso a piedi' : 'percorso'} nell'area mappata soddisfa `}${reqs ? `questo requisito: ${reqs}` : 'tutti i vincoli'}${busUnknown ? "; non ho potuto verificare l'autobus." : '.'}`,
    withStop: (at: string, min: number) => `Con una sosta ${at} per ${minutes(min)}:`,
    shortestWalk: (id: string, dur: string) => `Il percorso a piedi più breve, il ${id}, richiede ${dur}.`,
    fewest: (id: string, dur: string, phr: string) => `Il percorso con meno problemi è il ${id}, ${dur}, con ${phr}.`,
    relax: 'Vuoi che rilassi il requisito, evitandolo quando possibile?',
    notVerified: (walkingOnly: boolean, dest: string, unsure: boolean, busUnknown: boolean) =>
      `Nell'area mappata, nessun ${walkingOnly ? 'percorso a piedi' : 'percorso'} per ${dest} ${unsure ? 'risulta verificato per' : 'soddisfa'} tutti i vincoli${busUnknown ? "; non ho potuto verificare l'autobus." : '.'}`,
    chose: (id: string) => `Hai scelto il percorso ${id}.`,
    tradeOff: (extra: number, pa: string, pb: string) => `Il percorso A richiede ${minutes(extra)} più del B${pa && pb ? `, con ${pa} invece di ${pb}.` : '.'}`,
    whichOne: 'Quale scegli?',
    wantRoute: (id: string) => `Vuoi il percorso ${id}?`,
    farther: (radius: string, where: string) => `Non ho considerato percorsi che vanno oltre ${radius} da ${where}.`,
    busOffline: 'Gli autobus per questo orario non sono disponibili offline.',
    busFailed: 'Non sono riuscito a recuperare gli autobus per questo orario.',
    busNone: (fromStop: string | null) => `Transitous non ha trovato collegamenti in autobus ${fromStop ?? 'per questo viaggio'}, quindi il percorso C non è proposto.`,
    stopHours: (noun: string) => `La mappa non dice se ${noun} sarà aperto a quell'ora.`,
    soundMostly: 'Per la maggior parte degli attraversamenti la mappa non dice se il semaforo ha il segnale sonoro.',
    stopPlace: (name: string | null, kind: 'supermarket' | 'shop' | 'place') => {
      const shop = kind !== 'place';
      const it = { supermarket: 'supermercato', shop: 'negozio', place: 'luogo' }[kind];
      const nm = name ?? `un ${it} senza nome`;
      const noun = shop ? `il ${it}` : 'la sosta';
      const phrase = !name ? nm : shop ? `il ${it} ${nm}` : nm;
      return { name: nm, noun, phrase, at: !name ? `in ${nm}` : shop ? prep('a', phrase) : `a ${nm}`, from: prep('da', noun),
        with: shop ? 'con la spesa' : 'con la sosta', doing: shop ? 'di spesa' : 'di sosta', after: shop ? 'la spesa' : 'la sosta' };
    },
    diffLeave: (h: number, m: number, later: boolean) => {
      const said = [...(h ? [plural(h, 'ora', 'ore')] : []), ...(m ? [minutes(m)] : [])];
      return `Ora parti ${said.length ? joinWith(said, 'e') : 'meno di un minuto'} ${later ? 'più tardi' : 'prima'} di prima.`;
    },
    diffRequired: (subject: string, gone: string[], because: string) =>
      `Requisito aggiunto: ${subject}${gone.length ? `. ${gone.length === 1 ? `Il percorso ${gone[0]} non è più proposto` : `I percorsi ${joinWith(gone, 'e')} non sono più proposti`}, a causa di ${because}` : ''}.`,
    diffRelaxed: (subject: string, avoided: string) => `Requisito tolto: ${subject}; ora evito ${avoided} quando possibile.`,
    diffAvoid: (avoided: string) => `Ora evito ${avoided} quando possibile.`,
    diffNotRequired: (subject: string) => `Requisito tolto: ${subject}.`,
    diffNotAvoided: (avoided: string) => `Non evito più ${avoided}.`,
    diffTolerance: (n: number) => (n ? `Ora accetti una deviazione fino a ${plural(n, 'minuto', 'minuti').replace('.', ',')}.` : 'Ora non accetti deviazioni.'),
    diffStopAdded: (place: string, old: string | null) => (old ? `La sosta ora è a ${place} invece che a ${old}` : `Sosta aggiunta a ${place}`),
    diffStopRoute: (id: string, now: number, was: number, detour: number, stay: number, doing: string) =>
      `: il percorso ${id} ora richiede ${minutes(now)} invece di ${was}, ${minutes(detour)} in più a piedi e ${minutes(stay)} ${doing}`,
    diffBusAfterStop: (after: string) => `Ho ricalcolato il percorso C: la parte in autobus ora parte dopo ${after}.`,
    diffStopUnknown: (_noun: string, from: string, n: number) =>
      `L'andata e il ritorno ${from} aggiungono ${plural(n, 'attraversamento', 'attraversamenti')} per cui la mappa non dice se c'è il semaforo.`,
    diffStopDuration: (place: string, now: number, was: number) => `La sosta a ${place} ora dura ${minutes(now)} invece di ${was}`,
    diffStopRemoved: (place: string) => `La sosta a ${place} è stata tolta`,
    diffRouteTakes: (id: string, now: number, was: number) => `: il percorso ${id} ora richiede ${minutes(now)} invece di ${was}`,
    diffOffered: (id: string) => `Ora è proposto il percorso ${id}.`,
    diffTakes: (id: string, now: number, was: number) => `Il percorso ${id} ora richiede ${minutes(now)} invece di ${was}.`,
    diffChosenGone: (id: string) => `Il percorso ${id}, che avevi scelto, non è più proposto.`,
    diffGone: (id: string) => `Il percorso ${id} non è più proposto.`,
    nouns: { supermarket: 'supermercati', pharmacy: 'farmacie', cafe: 'bar', bakery: 'panetterie', atm: 'bancomat', shop: 'negozi' } as Record<string, string>,
    noun: { supermarket: 'supermercato', pharmacy: 'farmacia', cafe: 'bar', bakery: 'panetteria', atm: 'bancomat', shop: 'negozio' } as Record<string, string>,
    candidates: (many: string, near: string, items: string[], busFromChoice: boolean) =>
      `${cap(many)} vicino ${near}: ${items.join('; ')}${busFromChoice ? ". Il percorso C prenderebbe l'autobus da quello che scegli" : ''}. Quale, e per quanto tempo?`,
    candidate: (place: string, detour: number, hours: string) => `${place}, ${minutes(detour)} in più a piedi, ${hours}`,
    nearRoute: (sel: string) => (sel === 'C' ? 'al percorso a piedi più breve' : `al percorso ${sel}`),
    noCandidate: (kind: string, noun: string, near: string) => `Non ho trovato ${FEMININE.has(kind) ? 'nessuna' : 'nessun'} ${noun} vicino ${near} nell'area mappata.`,
    candidatesOpen: (_many: string) => 'Per questi luoghi la mappa non dice se saranno aperti a quell\'ora.',
    unnamedCandidate: (noun: string) => `${['farmacia', 'panetteria'].includes(noun) ? 'una' : 'un'} ${noun}`,
    onStreet: (name: string, street: string) => `${name} in ${lc(street)}`,
    errors: {
      noPlan: 'Non c\'è ancora un percorso: dimmi dove vuoi andare.',
      stale: 'Il percorso è cambiato nel frattempo: ascolta prima quello attuale.',
      noWalk: 'Non trovo un percorso a piedi tra questi due punti sulla mappa.',
      departure: "Non ho capito l'orario di partenza: dammi una data e un'ora con il fuso orario.",
      constraints: 'Non ho capito i vincoli.',
      kinds: 'Posso evitare attraversamenti senza semaforo, semafori senza segnale sonoro, scale, cantieri, strade principali, cambi e troppo cammino, e basta.',
      strength: 'Un vincolo si evita quando possibile oppure è obbligatorio.',
      walkingLimit: 'Quanti minuti a piedi al massimo?',
      tolerance: 'Non ho capito la deviazione che accetti: dimmi i minuti e una percentuale.',
      place: 'Non ho capito quel luogo: dimmi un nome, oppure latitudine e longitudine.',
      whereTo: 'Dove vuoi andare?',
      samePlace: (o: string, d: string) => (o === d ? `Entrambi i luoghi sono ${d}.` : `${cap(o)} e ${d} sono lo stesso punto sulla mappa.`) + ' Dove vuoi andare?',
      noSuchRoute: (id: string, any: boolean) => (any ? `In questo piano non c'è il percorso ${id}.` : 'In questo piano non c\'è nessun percorso da scegliere.'),
      lookFor: (nouns: string[]) => `Posso cercare ${joinWith(nouns, 'e')}.`,
      chooseFirstLook: (many: string) => `Scegli prima un percorso: poi posso cercare ${many} lungo la strada.`,
      chooseFirstStop: 'Scegli prima un percorso: poi posso aggiungere una sosta lungo la strada.',
      howLongAt: (name: string) => `Quanti minuti ti fermerai a ${name}?`,
      howLong: 'Quanti minuti ti fermerai lì?',
      stopNotFound: 'Non trovo quel luogo sulla mappa di questa zona.',
      stopOutside: (radius: string, where: string) => `Quel luogo è fuori dall'area che ho mappato: ${radius} intorno a ${where}.`,
    },
  },

  navigate: {
    noPlan: 'Prima chiedimi come arrivarci.',
    notFoot: 'La guida funziona sui percorsi a piedi: scegli prima un percorso a piedi.',
    yourDestination: 'la tua destinazione',
    metres: (m: number) => `${m} metri`,
    side: (sides: { sharp: boolean; right: boolean }[]) => sides.map((s) => `${s.sharp ? 'decisamente ' : ''}a ${s.right ? 'destra' : 'sinistra'}`).join(', poi '),
    onto: (l: Label) => (l.kind === 'crossing' ? (l.name ? `per attraversare ${lc(l.name)}` : 'per attraversare')
      : l.kind === 'street' ? `in ${lc(l.name!)}` : onLabel(l)),
    where: (bearing: number, hour: number | null) =>
      hour === null ? `verso ${COMPASS[Math.floor((bearing + 22.5) / 45) % 8]}` : hour === 0 ? 'dritto davanti a te' : `a ore ${hour}`,
    theRoute: 'il percorso',
    along: (verb: 'walk' | 'keep going', street: string | null) => `${verb === 'walk' ? 'Cammina' : 'Continua'} ${street ? `lungo ${street}` : 'dritto'}`,
    firstCross: (road: string | null) => `Prima attraversa ${road ? lc(road) : 'la strada'}: fermati sul bordo del marciapiede e ascolta. Poi `,
    walkTo: (walk: string, d: string, name: string) => `${walk} per ${d} fino a ${name}.`,
    walkThenTurn: (walk: string, d: string, side: string, onto: string) => `${walk} per ${d}, poi gira ${side} ${onto}.`,
    crossingWords: (signals: string, sound: string) =>
      signals === 'yes' ? `un attraversamento con semaforo, ${sound === 'yes' ? 'con segnale sonoro' : sound === 'no' ? 'senza segnale sonoro' : 'la mappa non dice se ha il segnale sonoro'}.`
        : signals === 'no' ? 'un attraversamento senza semaforo: fermati sul bordo del marciapiede e ascolta prima di attraversare.'
          : 'un attraversamento; la mappa non dice se ha il semaforo: fermati sul bordo del marciapiede e ascolta.',
    nextTurn: (side: string, onto: string) => `Gira ${side} ${onto}.`,
    nextArrive: (name: string) => `Arrivo: ${name}.`,
    nowOn: (street: string | null, d: string) => (street ? `Ora sei su ${street}. Continua per ${d}.` : `Ora continua dritto per ${d}.`),
    turnNow: (side: string, onto: string) => `Gira ${side} ora, ${onto}`,
    thenCrossing: (d: string, words: string) => ` Poi tra ${d}, ${words}`,
    thenTurn: (d: string, side: string, onto: string) => ` Poi tra ${d}, gira ${side} ${onto}`,
    inTurn: (d: string, afterCrossing: boolean, side: string, onto: string) => `Tra ${d}, ${afterCrossing ? "dopo l'attraversamento, " : ''}gira ${side} ${onto}`,
    inCrossing: (d: string, words: string) => `Tra ${d}, ${words}`,
    crossingHere: (words: string) => `Attraversamento qui: ${words}`,
    crossingNow: 'Attraversamento ora.',
    started: (name: string, d: string, n: number) => `Guida avviata verso ${name}: ${d}, circa ${minutes(n)}.`,
    turnAround: 'Girati: il percorso è dietro di te.',
    routeStarts: (where: string, right: boolean) => `Il percorso parte ${where}: girati verso ${right ? 'destra' : 'sinistra'}.`,
    goodStraight: 'Bene, cammina dritto.',
    arrived: (name: string, where: string | null, d: string | null) => `Destinazione raggiunta: ${name}.${where ? ` È ${where}, a circa ${d}.` : ''}`,
    offRoute: (d: string, where: string) => `Sei fuori percorso, a circa ${d}. Il percorso è ${where}.`,
    stillOff: (d: string, where: string) => `Sei ancora fuori percorso, a circa ${d}. Il percorso è ${where}.`,
    newRoute: 'Nuovo percorso. ',
    backOn: 'Di nuovo sul percorso. ',
    wrongWay: 'Stai andando nella direzione sbagliata. Girati.',
    rightWay: 'Bene, ora vai nella direzione giusta.',
    keepGoingTurn: (along: string, d: string) => `${along}: ${d} alla prossima svolta.`,
    keepGoingArrive: (along: string, d: string, name: string) => `${along}: ${d} fino a ${name}.`,
  },
};
