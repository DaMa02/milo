/**
 * English messages of the engine. Every sentence the engine says is built here or in it.ts; the modules
 * only decide what to say. A new language is a new file with the same shape (see docs/languages.md).
 */
import { type Label, type Lang, cap, groupThousands, lc } from './common';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function joinWith(items: string[], word: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function label(l: Label): string {
  switch (l.kind) {
    case 'street':
      return lc(l.name!);
    case 'pavement':
      return l.name ? `the pavement of ${lc(l.name)}` : 'a pavement';
    case 'crossing':
      return l.name ? `the crossing of ${lc(l.name)}` : 'a crossing';
    case 'steps':
      return 'steps';
    default:
      return 'a footpath';
  }
}

export const en = {
  lang: 'en' as Lang,
  /** A number as written in a sentence. */
  num: (n: number) => (Number.isInteger(n) ? groupThousands(n) : String(n)),
  metres: (m: number) => `${groupThousands(m)} m`,
  plural,
  joinAnd: (items: string[]) => joinWith(items, 'and'),
  joinOr: (items: string[]) => joinWith(items, 'or'),
  cap,
  compass: (i: number) => COMPASS[i],
  /** A clock position (0 = ahead) as said after a distance: "350 m at 2 o'clock", "20 m ahead". */
  clock: (hour: number) => ({ 0: 'ahead', 3: 'right', 6: 'behind', 9: 'left' } as Record<number, string>)[hour] ?? `at ${hour} o'clock`,
  /** "350 m at 2 o'clock" */
  distanceAt: (metres: string, clock: string) => `${metres} ${clock}`,
  label,
  /** "on via Brembo", "on the pavement of via Brembo" */
  onLabel: (l: Label) => `on ${label(l)}`,
  alongLabel: (l: Label) => `along ${label(l)}`,
  /** The street a label belongs to, spoken: "via Brembo"; null for an unnamed way. */
  street: (name: string) => lc(name),
  bridge: (road: string | null) => (road ? `the ${lc(road)} bridge` : 'an unnamed bridge'),
  bridgePhrase: (road: string | null, underpass: boolean) =>
    (road ? `the ${lc(road)} bridge` : 'an unnamed bridge') + (underpass ? ', with an underpass beside it' : ''),

  overview: {
    railwayName: (name: string | null) =>
      name === 'Cintura sud di Milano' ? 'the southern belt railway' : name ? `the railway ${name}` : 'the railway',
    facing: (facing: string, name: string) => `Facing ${facing} from ${name}.`,
    across: (leftRight: boolean) => (leftRight ? 'from your left to your right' : 'from ahead of you to behind you'),
    split: (parts: number, side: string) =>
      parts === 2 ? `splits the area in two; you are on the ${side} side`
        : parts > 2 ? `splits the area in ${parts} parts; you are on the ${side} side` : 'does not split the area',
    railway: (spoken: string, across: string, where: string, split: string) => `${cap(spoken)} runs ${across}, ${where}, and ${split}.`,
    within: (radius: string, center: string | null) => (center ? `${radius} of ${center}` : radius),
    crossPlaces: (within: string, n: number, nearest: string, where: string) =>
      `Within ${within} you can cross it on foot in ${plural(n, 'place')}, the nearest is ${nearest}, ${where}.`,
    noCrossPlace: (within: string) => `Within ${within} the map shows no place to cross it on foot.`,
    railUnknown: (radius: string, center: string) =>
      `Railway crossings are counted only within ${radius} of ${center}; there may be more farther away.`,
    construction: (between: boolean, name: string | null, where: string) =>
      `${between ? 'Between you and the railway there is' : 'There is'} a construction site${name ? `, ${name},` : ''} ${where}`,
    moreConstruction: (n: number, within: string, where: string) =>
      `; ${plural(n, 'other construction site')} within ${within}, the nearest ${where}`,
    mainRoads: (items: string[]) => `Main roads you will hear: ${items.join('; ')}.`,
    roadItem: (name: string, where: string) => `${name}, ${where}`,
    crossings: (items: string[]) => `Railway crossings on foot: ${items.join('; ')}.`,
    nothing: 'The map shows no railway or construction site near you.',
    reference: (name: string, street: string | null, facing: string) =>
      `Standing at ${name}${street ? ` on ${street}` : ''}, facing ${facing}.`,
    nothingMore: 'Nothing more on the map near you.',
    constructionSite: 'a construction site',
  },

  explore: {
    noWay: (where: 'forward' | 'left' | 'right' | 'name' | 'number') =>
      `There is no way ${{ forward: 'ahead', left: 'to your left', right: 'to your right', name: 'with that name or number here', number: 'with that number here' }[where]}. `,
    fewMetres: 'a few metres',
    another: (l: Label) => {
      const s = label(l);
      return s.startsWith('a ') ? `another ${s.slice(2)}` : `another way along ${s}`;
    },
    leadsTo: (k: { kind: string; others?: string[] }) =>
      k.kind === 'loop' ? 'a loop back to this junction' : k.kind === 'edge' ? 'the edge of the mapped area'
        : k.kind === 'dead_end' ? 'a dead end' : k.others?.length ? `a junction with ${joinWith(k.others, 'and')}` : 'a junction',
    branch: (name: string, dir: string, distance: string, leadsTo: string) => `${name}, ${dir}, ${distance} to ${leadsTo}`,
    crossingKind: (signals: string, sound: string, many: boolean) => {
      const has = many ? 'they have' : 'it has';
      if (signals === 'no') return 'without a signal';
      if (signals === 'yes' && sound === 'yes') return 'with a signal and sound';
      if (signals === 'yes' && sound === 'no') return 'with a signal but no sound';
      if (signals === 'yes') return `with a signal where the map does not say whether ${has} sound`;
      return `where the map does not say whether ${has} a signal`;
    },
    crossingsAll: (total: number, kind: string) => `; ${total} crossings on the way, ${total === 2 ? 'both' : 'all'} ${kind}`,
    crossingsMixed: (total: number, parts: string[]) => `; ${total} crossings on the way: ${joinWith(parts, 'and')}`,
    crossingsPart: (n: number, kind: string) => `${n} ${kind}`,
    crossingUnknown: '; the map does not say whether its crossing has a signal',
    crossingSignal: (sound: string) =>
      `; its crossing has a signal${{ yes: ', with sound', no: ', without sound', unknown: ', the map does not say whether it has sound' }[sound]}`,
    crossingNoSignal: '; its crossing has no signal',
    noOtherWay: 'There is no other way from here.',
    deadEnd: ' This is a dead end.',
    oneWay: (b: string) => `1 way: ${b}.`,
    ways: (n: number, items: string[]) => `${n} ways, from left to right: ${items.join('; ')}.`,
    edge: ' This is the edge of the mapped area: ways may continue beyond it.',
    behind: (l: string) => ` Behind you: ${l}, where you came from.`,
    start: (name: string, cardinal: string, on: string) => `Start at ${name}, facing ${cardinal}. You are ${on}. `,
    startOffset: (kind: 'junction' | 'dead end' | 'mapped point', d: string) => `The walk starts at the nearest ${kind}, ${d} along it. `,
    walked: (d: string, along: string) => `You walked ${d} ${along} and now face the way you walked. `,
    back: 'Back at the previous junction, facing the way you faced there. ',
    atStart: 'You are at the start; there is no earlier junction. ',
    home: (name: string, cardinal: string) => `Back at the start, ${name}, facing ${cardinal} again. `,
    whereOn: (labels: string[], one: Label | null) => (one ? `on ${label(one)}` : `where ${joinWith(labels, 'and')} meet`),
    whereFar: (d: string | null, name: string) => (d ? `${d} in a straight line from ${name}` : `right at ${name}`),
    where: (on: string, far: string) => `You are ${on}, ${far}. `,
  },

  hours: {
    always: 'open 24 hours a day',
    openUntil: (hm: string) => `open until ${hm}`,
    opens: (when: 'today' | 'tomorrow' | number, hm: string) =>
      `closed now, it opens ${when === 'today' ? 'today' : when === 'tomorrow' ? 'tomorrow' : `on ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][when]}`} at ${hm}`,
    closed: 'closed now',
    unknown: 'the map does not say when it is open',
    unreadable: 'the map gives its hours, but I cannot read them',
  },

  places: {
    /** Words that mean "where I am" and "the destination", after an article is dropped. */
    here: ['here', 'me', 'my position', 'where i am', 'start'],
    /** Words for the start itself, never the walk position. */
    startWords: ['start'],
    destination: ['destination', 'there', 'party'],
    articles: ['the ', 'a ', 'an '],
    /** A kind of place instead of a name ("the pharmacy") means the nearest one of that kind. */
    kindWords: {
      'construction site': ['construction site'], construction: ['construction site'], 'building site': ['construction site'],
      railway: ['railway'], 'railway line': ['railway'], 'train tracks': ['railway'], tracks: ['railway'],
      park: ['park', 'garden'], garden: ['park', 'garden'], supermarket: ['supermarket'], pharmacy: ['pharmacy'],
      chemist: ['pharmacy'], café: ['cafe'], cafe: ['cafe'], coffee: ['cafe'], bar: ['cafe'], bakery: ['bakery'],
      'cash machine': ['atm'], atm: ['atm'], bank: ['atm'], shop: ['shop'],
    } as Record<string, string[]>,
    cashMachine: (operator: string | null) => (operator ? `${operator} cash machine` : 'Cash machine'),
    onStreet: (name: string, street: string) => `${name} on ${lc(street)}`,
    pointOn: (road: string | null) => (road ? `a point on ${lc(road)}` : 'that point'),
    walkPosition: 'your position on the walk',
    which: 'Which place do you mean?',
    whichStreet: 'Which street do you mean?',
    notGiven: 'No place was given.',
    noDestination: 'No destination was given.',
    noStreet: 'No street was given.',
    unusable: 'The place was not given in a form I can use.',
    notFound: (q: string) => `I cannot find ${q} on the map of this area. Can you name a street or a place near it?`,
    notFoundUnknown: (q: string) => `The map of this area has no place called ${q}.`,
    wrongKind: (label: string, kind: string, what: string) => `${cap(label)} is a ${kind}, not ${what}.`,
    wrongKindUnknown: (what: string) => `I can answer this for ${what} only.`,
    whatPlace: 'a place',
    whatStreet: 'a street',
    whatArea: 'a park, a garden, a construction site or a street',
    outside: (what: string | null, radius: string, center: string) =>
      `${what ? `${cap(what)} is` : 'That is'} outside the area I have mapped: ${radius} around ${center}.`,
    outsideUnknown: (radius: string, center: string) => `The map I answer from ends ${radius} from ${center}.`,
    ambiguous: (labels: string[]) => `Which one do you mean: ${joinWith(labels, 'or')}?`,
    ambiguousUnknown: 'The name fits more than one place on the map.',
    samePlace: (a: string, b: string) => (a === b ? `Both places are ${a}.` : `${cap(a)} and ${b} are the same place on the map.`),
    whichOther: ' Which other place do you mean?',
    samePlaceUnknown: 'The two places given are the same.',
  },

  tools: {
    railway: (name: string | null) =>
      name === 'Cintura sud di Milano' ? ['the southern belt railway, Cintura sud di Milano', 'the southern belt railway']
        : name ? [`the ${name} railway`, `the ${name} railway`] : ['a railway', 'a railway'],
    waterway: (name: string | null, type: string | undefined) => {
      const wt = ({ canal: 'canal', river: 'river', stream: 'stream' } as Record<string, string>)[type ?? ''] ?? 'water channel';
      return name ? `the ${name} ${wt}` : `a ${wt}`;
    },
    constructionSite: (name: string | null) => (name ? `the construction site ${name}` : 'a construction site'),
    sameSpot: (a: string, b: string) => `${cap(a)} and ${b} are at the same spot on the map.`,
    noRoute: (crow: string, a: string, b: string) =>
      `${crow} in a straight line, but I find no walking route between ${a} and ${b} on the map. A way may exist outside the mapped area.`,
    noRouteUnknown: 'The map shows no walking connection between them.',
    walking: (crow: string, detour: boolean, walk: string, minutes: number) =>
      `${crow} in a straight line, ${detour ? 'but' : 'and'} ${walk} on foot, about ${plural(minutes, 'minute')}`,
    inBetween: (barrier: string) => `: ${barrier} is in between.`,
    crossOn: (isRailway: boolean, places: string[]) => ` On foot you cross ${isRailway ? 'it' : 'the railway'} on ${joinWith(places, 'and')}.`,
    ratio: (ratio: number) => (ratio >= 1.1 ? ` The walk is ${ratio} times the straight-line distance.` : ' The walk is about as long as the straight line.'),
    snapUnknown: (items: string[]) => `Distances start and end at the nearest mapped footpath: ${joinWith(items, 'and')}.`,
    snapItem: (d: string, name: string) => `${d} from ${name}`,
    noBarrier: (a: string, b: string) => `No. The map shows no railway, water or construction site on the straight line between ${a} and ${b}.`,
    noBarrierUnknown: 'Only railways, water and construction sites are checked; buildings, fences and walls are not.',
    barriers: (items: string[]) => {
      const longs = [...items];
      if (longs.length > 1 && longs[longs.length - 2].includes(',')) longs[longs.length - 2] += ',';
      return `Yes. In a straight line you would cross ${joinWith(longs, 'and')}.`;
    },
    railPlaces: (radius: string, center: string, items: string[]) =>
      ` Within ${radius} of ${center} the railway can be crossed on foot in ${plural(items.length, 'place')}: ${items.join(' and ')}.`,
    railPlaceItem: (phrase: string, d: string) => `${phrase}, ${d} away in a straight line`,
    noRailPlace: (radius: string, center: string) => ` Within ${radius} of ${center} there is no place to cross the railway on foot.`,
    railPlacesUnknown: (radius: string, center: string) => `Crossings farther than ${radius} from ${center} are not counted, so there may be more.`,
    edgeNote: ' One end reaches the edge of the downloaded map, so this may not be the whole story.',
    edgeUnknown: 'One end of the street is at the edge of the downloaded map.',
    beyondNote: (radius: string, center: string) =>
      ` One end is more than ${radius} from ${center}, beyond the area I answer for, so this may not be the whole story.`,
    beyondUnknown: 'One end of the street is beyond the area I answer for.',
    openedUnknown: 'In places the map allows no walking on the roadway; there I count the street as going on along its pavements.',
    connections: (names: string[]) =>
      names.length ? (names.length <= 5 ? joinWith(names, 'and') : `${names.slice(0, 5).join(', ')} and other streets`) : 'footpaths only',
    loop: (street: string, length: string) => `On foot, ${street} forms a loop: it is about ${length} long.`,
    deadEnds: (street: string, length: string, dead: number, allDead: boolean, conn: string) =>
      `On foot, ${street} does not go through: it is about ${length} long, it has ${dead === 1 ? 'a dead end' : `${dead} dead ends`}, and ${allDead ? 'no end connects to another way' : `its other ends connect to ${conn}`}.`,
    goesThrough: (street: string, length: string, conn: string) => `On foot, ${street} goes through: it is about ${length} long, and its ends connect to ${conn}.`,
    noexitUnknown: 'The map does not mark the dead end as such: the walkable way simply stops there.',
    pavementsUnknown: 'The map does not say whether the street has pavements on both sides.',
    corner: (a: string, b: string) => `the corner of ${a} and ${b}`,
    footpath: 'a footpath',
    samePlaceWays: (a: string, b: string) =>
      `${cap(a)} and ${b} are practically the same place on the map, so there are no separate ways between them to count.`,
    noWay: (a: string, b: string) => `I find no walking way between ${a} and ${b} on the map.`,
    oneWay: (a: string, b: string, through: string) => `There is only 1 way between ${a} and ${b}: every route passes through ${through}.`,
    twoSame: (a: string, b: string, along: string) =>
      `There are 2 independent ways between ${a} and ${b}, sharing no junction: both pass along ${along}, one from each end.`,
    two: (a: string, b: string, one: string, other: string) =>
      `There are 2 independent ways between ${a} and ${b}, sharing no junction: one through ${one}, the other through ${other}.`,
    many: (k: number, a: string, b: string) => `There are ${k} independent ways between ${a} and ${b}, sharing no junction.`,
    outsideMore: ' A way outside the mapped area could add more.',
    outsideAny: ' A way may exist outside the mapped area.',
    leaveUnknown: 'Ways that leave the mapped area are not counted.',
    pavementSidesUnknown: 'The pavements on the two sides of a street count as one way only where a mapped crossing joins them.',
    streetExtent: (street: string, length: string, minutes: number, conn: string, note: string) =>
      `${cap(street)} is about ${length} long, about ${plural(minutes, 'minute')} on foot; its ends connect to ${conn}.${note}`,
    areaName: (name: string, construction: boolean) => (construction ? `the construction site ${name}` : name),
    extentWhere: (labels: string[], fills: boolean) =>
      labels.length > 1 ? `${fills ? 'takes the block between' : 'lies along'} ${joinWith(labels, 'and')}`
        : labels.length ? `lies along ${labels[0]}` : 'is not bounded by a named street on the map',
    extent: (spoken: string, where: string, sideMin: number, side: string, aroundMin: number) =>
      `${cap(spoken)} ${where}; its longest side is about ${plural(sideMin, 'minute')} on foot, ${side}; walking all around it takes about ${plural(aroundMin, 'minute')}.`,
    entrancesUnknown: 'The map does not say where the entrances are.',
    kindNoun: (kind: string) => (kind === 'street' ? 'a street' : `a ${({ supermarket: 'supermarket', pharmacy: 'pharmacy', cafe: 'café', bakery: 'bakery', atm: 'cash machine', shop: 'shop' } as Record<string, string>)[kind] ?? kind}`),
    /** The kind as named when a place is the wrong kind ("is a park, not a street"). */
    kindName: (kind: string) => kind,
    placeInfo: (name: string, addr: string | null, noun: string, d: string) => `${name}${addr ? `, ${addr}` : ''}: ${noun} ${d} from here in a straight line.`,
    hoursSentence: (phrase: string) => `${cap(phrase)}.`,
    wheelchair: (w: string) => `Wheelchair access: ${w}, according to the map.`,
    wheelchairValue: (w: string) => w,
    hoursUnknown: 'The map does not say when it is open.',
    wheelchairUnknown: 'The map does not say whether it has wheelchair access.',
    question: (tool: string) => tool.replace(/_/g, ' '),
  },

  plan: {
    /** kind -> what is avoided, what is required, "X is/are" (now required), why a route is dropped, "every way ..." */
    say: {
      unsignalled_crossings: ['crossings without a signal', 'signals at every crossing', 'Signals at every crossing are',
        'crossings known to have no signal', 'has at least one crossing without a signal'],
      signals_without_sound: ['signals without sound', 'sound at every signalled crossing', 'Sound at every signalled crossing is',
        'signals known to have no sound', 'has at least one signalled crossing without sound'],
      steps: ['steps', 'a way without steps', 'A way without steps is', 'steps', 'has steps'],
      main_roads: ['walking along main roads', 'a way off main roads', 'A way off main roads is', 'walking along main roads', 'runs along a main road'],
      construction: ['construction sites', 'a way past no construction site', 'A way past no construction site is', 'construction sites', 'passes a construction site'],
      transfers: ['transfers', 'no transfers', 'A trip without transfers is', 'transfers', null],
      walking_over_min: ['more than {v} minutes of walking', 'at most {v} minutes of walking', 'At most {v} minutes of walking are', 'more walking than that', null],
    } as Record<string, (string | null)[]>,
    unmapped: 'Crossings at points where the map has no crossing are not counted.',
    badCrossings: (kind: 'unsignalled_crossings' | 'signals_without_sound', n: number, u: number) => {
      const what = kind === 'unsignalled_crossings' ? 'crossing' : 'signalled crossing';
      return (n ? plural(n, what) : `no ${what}`) + (kind === 'unsignalled_crossings' ? ' without a signal' : ' without sound')
        + (u ? ` and ${u} where the map does not say` : '');
    },
    steps: (n: number) => (n ? `${plural(n, 'flight')} of steps` : 'no steps'),
    mainRoads: (n: number, metres: string) => (n ? `${metres} along main roads` : 'no walking along main roads'),
    construction: (n: number) => (n ? `past ${plural(n, 'construction site')}` : 'no construction site'),
    transfers: (n: number) => (n ? plural(n, 'transfer') : 'no transfers'),
    warnUnsignalled: (n: number) => `${plural(n, 'crossing')} without a signal.`,
    warnUnsignalledUnknown: (u: number) => `${plural(u, 'crossing')} where the map does not say whether there is a signal.`,
    warnSilent: (n: number) => `${plural(n, 'signalled crossing')} without sound.`,
    warnSilentUnknown: (u: number) => `${plural(u, 'crossing')} where the map does not say whether the signal has sound.`,
    warnWalking: (walk: number, limit: number) => `${plural(walk, 'minute')} of walking, more than ${limit}.`,
    duration: (min: number, withStop: string | null) => `${plural(min, 'minute')}${withStop ? ` ${withStop}` : ''}`,
    shortest: (id: string, alsoMain: boolean, dur: string, phr: string) =>
      `Route ${id}, on foot, the shortest${alsoMain ? ', which is also the way along main streets' : ''}, ${dur}: ${phr}.`,
    mainStreets: (id: string, dur: string, extra: number, phr: string, fewest: boolean) =>
      `Route ${id}, on foot, along main streets, ${dur}${extra === 0 ? ', the same time as the shortest way, which uses side streets'
        : extra > 0 ? `, ${plural(extra, 'minute')} longer than the shortest way, which uses side streets` : ', less than the shortest'}: ${phr}${fewest ? ', the fewest of any route in the mapped area' : ''}.`,
    foot: (id: string, dur: string, extra: number, phr: string, fewest: boolean) =>
      `Route ${id}, on foot, ${dur}${extra === 0 ? ', the same time as the shortest' : extra > 0 ? `, ${extra} more than the shortest` : ', less than the shortest'}: ${phr}${fewest ? ', the fewest of any route in the mapped area' : ''}.`,
    transitAfterStop: (stopName: string, line: string, from: string, dur: string, wait: number, walk: number, phr: string) =>
      `Route C, on foot to ${stopName}, then ${line} from ${from}: ${dur}${wait ? ` and ${plural(wait, 'minute')} of waiting after it` : ''}, ${walk} of them on foot, with ${phr}.`,
    transit: (line: string, from: string, wait: number, dur: number, walk: number, phr: string) =>
      `Route C, ${line} from ${from}: ${wait ? `you leave ${plural(wait, 'minute')} after the time you gave` : 'you leave at the time you gave'} and arrive ${plural(dur, 'minute')} after it, ${walk} of them on foot, with ${phr}.`,
    transitCompare: (id: string, min: number) => `; route ${id} on foot takes ${min}.`,
    lineWord: { bus: 'bus', tram: 'tram', subway: 'metro', rail: 'train', other: 'line' } as Record<string, string>,
    lines: (items: string[]) => items.join(', then '),
    every: (dest: string, items: string[]) => `In the mapped area, every way to ${dest} ${joinWith(items, 'and')}.`,
    noneMeets: (walkingOnly: boolean, so: boolean, reqs: string | null, busUnknown: boolean) =>
      `${so ? `So no ${walkingOnly ? 'walking route' : 'route'} there meets ` : `No ${walkingOnly ? 'walking route' : 'route'} in the mapped area meets `}${reqs ? `the requirement of ${reqs}` : 'every constraint'}${busUnknown ? '; the bus could not be checked.' : '.'}`,
    withStop: (at: string, min: number) => `With a stop ${at} for ${plural(min, 'minute')}:`,
    shortestWalk: (id: string, dur: string) => `The shortest walk, route ${id}, takes ${dur}.`,
    fewest: (id: string, dur: string, phr: string) => `The route with the fewest is route ${id}, ${dur}, with ${phr}.`,
    relax: 'Do you want me to relax the requirement to avoid when possible?',
    notVerified: (walkingOnly: boolean, dest: string, unsure: boolean, busUnknown: boolean) =>
      `In the mapped area, no ${walkingOnly ? 'walking route' : 'route'} to ${dest} ${unsure ? 'is verified to meet' : 'meets'} every constraint${busUnknown ? '; the bus could not be checked.' : '.'}`,
    chose: (id: string) => `You chose route ${id}.`,
    tradeOff: (extra: number, pa: string, pb: string) => `Route A takes ${plural(extra, 'minute')} more than route B${pa && pb ? `, with ${pa} instead of ${pb}.` : '.'}`,
    whichOne: 'Which one?',
    wantRoute: (id: string) => `Do you want route ${id}?`,
    farther: (radius: string, where: string) => `Routes that go farther than ${radius} from ${where} were not considered.`,
    busOffline: 'Bus routes for this departure time are not available offline.',
    busFailed: 'Bus routes for this departure time could not be retrieved.',
    busNone: (fromStop: string | null) => `Transitous returned no bus connection ${fromStop ?? 'for this trip'}, so route C is not offered.`,
    stopHours: (noun: string) => `The map does not say whether ${noun} is open at that time.`,
    soundMostly: 'For most crossings the map does not say whether the signal has sound.',
    stopPlace: (name: string | null, kind: 'supermarket' | 'shop' | 'place') => {
      const shop = kind !== 'place';
      const nm = name ?? `an unnamed ${kind}`;
      const noun = shop ? `the ${kind}` : 'the stop';
      const phrase = !name ? nm : shop ? `the ${kind} ${nm}` : nm;
      return { name: nm, noun, phrase, at: `at ${phrase}`, from: `from ${noun}`,
        with: shop ? 'with the shopping' : 'with the stop', doing: shop ? 'of shopping' : 'at the stop', after: shop ? 'the shopping' : 'the stop' };
    },
    diffLeave: (h: number, m: number, later: boolean) => {
      const said = [...(h ? [plural(h, 'hour')] : []), ...(m ? [plural(m, 'minute')] : [])];
      return `You now leave ${said.length ? joinWith(said, 'and') : 'less than a minute'} ${later ? 'later' : 'earlier'} than before.`;
    },
    diffRequired: (subject: string, gone: string[], because: string) =>
      `${subject} now required${gone.length ? `: ${joinWith(gone.map((r) => `route ${r}`), 'and')} ${gone.length === 1 ? 'is' : 'are'} no longer offered, because of ${because}` : ''}.`,
    diffRelaxed: (subject: string, avoided: string) => `${subject} no longer required; now avoiding ${avoided} when possible.`,
    diffAvoid: (avoided: string) => `Now avoiding ${avoided} when possible.`,
    diffNotRequired: (subject: string) => `${subject} no longer required.`,
    diffNotAvoided: (avoided: string) => `No longer avoiding ${avoided}.`,
    diffTolerance: (n: number) => (n ? `You now accept a detour of up to ${plural(n, 'minute')}.` : 'You now accept no detour.'),
    diffStopAdded: (place: string, old: string | null) => (old ? `The stop is now at ${place} instead of ${old}` : `Stop added at ${place}`),
    diffStopRoute: (id: string, now: number, was: number, detour: number, stay: number, doing: string) =>
      `: route ${id} now takes ${plural(now, 'minute')} instead of ${was}, ${plural(detour, 'minute')} more on foot and ${plural(stay, 'minute')} ${doing}`,
    diffBusAfterStop: (after: string) => `Route C was recomputed: its bus part now starts after ${after}.`,
    diffStopUnknown: (noun: string, _from: string, n: number) => `The way to and from ${noun} adds ${plural(n, 'crossing')} where the map does not say whether there is a signal.`,
    diffStopDuration: (place: string, now: number, was: number) => `The stop at ${place} now lasts ${plural(now, 'minute')} instead of ${was}`,
    diffStopRemoved: (place: string) => `The stop at ${place} was removed`,
    diffRouteTakes: (id: string, now: number, was: number) => `: route ${id} now takes ${plural(now, 'minute')} instead of ${was}`,
    diffOffered: (id: string) => `Route ${id} is now offered.`,
    diffTakes: (id: string, now: number, was: number) => `Route ${id} now takes ${plural(now, 'minute')} instead of ${was}.`,
    diffChosenGone: (id: string) => `Route ${id}, which you chose, is no longer offered.`,
    diffGone: (id: string) => `Route ${id} is no longer offered.`,
    nouns: { supermarket: 'supermarkets', pharmacy: 'pharmacies', cafe: 'cafés', bakery: 'bakeries', atm: 'cash machines', shop: 'shops' } as Record<string, string>,
    noun: { supermarket: 'supermarket', pharmacy: 'pharmacy', cafe: 'café', bakery: 'bakery', atm: 'cash machine', shop: 'shop' } as Record<string, string>,
    candidates: (many: string, near: string, items: string[], busFromChoice: boolean) =>
      `${cap(many)} near ${near}: ${items.join('; ')}${busFromChoice ? '. Route C would take the bus from the one you choose' : ''}. Which one, and for how long?`,
    candidate: (place: string, detour: number, hours: string) => `${place}, ${plural(detour, 'minute')} more on foot, ${hours}`,
    nearRoute: (sel: string) => (sel === 'C' ? 'the shortest walk' : `route ${sel}`),
    noCandidate: (kind: string, noun: string, near: string) => `I found no ${noun} near ${near} in the mapped area.`,
    candidatesOpen: (many: string) => `The map does not say whether these ${many} are open at that time.`,
    unnamedCandidate: (noun: string) => `a ${noun}`,
    onStreet: (name: string, street: string) => `${name} on ${lc(street)}`,
    errors: {
      noPlan: 'There is no plan yet: tell me where you want to go.',
      stale: 'The plan changed in the meantime: listen to the current plan first.',
      noWalk: 'I cannot find a walking route between these two points on the map.',
      departure: 'I did not understand the departure time: give a date and a time with its time zone.',
      constraints: 'I did not understand the constraints.',
      kinds: 'I can plan around crossings without a signal, signals without sound, steps, construction sites, main roads, transfers and walking time only.',
      strength: 'A constraint is either avoided when possible or required.',
      walkingLimit: 'How many minutes of walking at most?',
      tolerance: 'I did not understand the detour you accept: give minutes and a percentage.',
      place: 'I did not understand that place: give a name, or a latitude and a longitude.',
      whereTo: 'Where do you want to go?',
      samePlace: (o: string, d: string) => (o === d ? `Both places are ${d}.` : `${cap(o)} and ${d} are the same place on the map.`) + ' Where do you want to go?',
      noSuchRoute: (id: string, any: boolean) => (any ? `There is no route ${id} in this plan.` : 'There is no route to choose in this plan.'),
      lookFor: (nouns: string[]) => `I can look for ${joinWith(nouns, 'and')}.`,
      chooseFirstLook: (many: string) => `Choose a route first: then I can look for ${many} along it.`,
      chooseFirstStop: 'Choose a route first: then I can add a stop along it.',
      howLongAt: (name: string) => `How many minutes will you spend at ${name}?`,
      howLong: 'How many minutes will you spend there?',
      stopNotFound: 'I cannot find that place on the map of this area.',
      stopOutside: (radius: string, where: string) => `That place is outside the area I have mapped: ${radius} around ${where}.`,
    },
  },

  navigate: {
    noPlan: 'Ask me how to get there first.',
    notFoot: 'Live guidance works on walking routes: choose a route on foot first.',
    yourDestination: 'your destination',
    metres: (m: number) => `${groupThousands(m)} metres`,
    side: (sides: { sharp: boolean; right: boolean }[]) => sides.map((s) => `${s.sharp ? 'sharp ' : ''}${s.right ? 'right' : 'left'}`).join(', then '),
    /** "onto via Brembo", "to cross viale Isonzo", "to cross" */
    onto: (l: Label) => (l.kind === 'crossing' ? (l.name ? `to cross ${lc(l.name)}` : 'to cross') : `onto ${label(l)}`),
    where: (bearing: number, hour: number | null) =>
      hour === null ? `to the ${COMPASS[Math.floor((bearing + 22.5) / 45) % 8]}` : hour === 0 ? 'straight ahead' : `at ${hour} o'clock`,
    theRoute: 'the route',
    /** "Walk along via Brembo" or, for an unnamed way (null), "Walk straight ahead" */
    along: (verb: 'walk' | 'keep going', street: string | null) =>
      `${verb === 'walk' ? 'Walk' : 'Keep going'} ${street ? `along ${street}` : 'straight ahead'}`,
    firstCross: (road: string | null) => `First cross ${road ? lc(road) : 'the road'}: stop at the kerb and listen. Then `,
    walkTo: (walk: string, d: string, name: string) => `${walk} for ${d} to ${name}.`,
    walkThenTurn: (walk: string, d: string, side: string, onto: string) => `${walk} for ${d}, then turn ${side} ${onto}.`,
    crossingWords: (signals: string, sound: string) =>
      signals === 'yes' ? `a crossing with traffic lights, ${sound === 'yes' ? 'with a sound signal' : sound === 'no' ? 'without a sound signal' : 'the map does not say if it has a sound signal'}.`
        : signals === 'no' ? 'a crossing without signals: stop at the kerb and listen before you cross.'
          : 'a crossing; the map does not say if it has signals: stop at the kerb and listen.',
    nextTurn: (side: string, onto: string) => `Turn ${side} ${onto}.`,
    nextArrive: (name: string) => `Arrive at ${name}.`,
    nowOn: (street: string | null, d: string) => (street ? `Now on ${street}. Continue for ${d}.` : `Now continue straight ahead for ${d}.`),
    turnNow: (side: string, onto: string) => `Turn ${side} now, ${onto}`,
    thenCrossing: (d: string, words: string) => ` Then in ${d}, ${words}`,
    thenTurn: (d: string, side: string, onto: string) => ` Then in ${d}, turn ${side} ${onto}`,
    inTurn: (d: string, afterCrossing: boolean, side: string, onto: string) => `In ${d}, ${afterCrossing ? 'after the crossing, ' : ''}turn ${side} ${onto}`,
    inCrossing: (d: string, words: string) => `In ${d}, ${words}`,
    crossingHere: (words: string) => `Crossing here: ${words}`,
    crossingNow: 'Crossing now.',
    started: (name: string, d: string, minutes: number) => `Guidance started to ${name}: ${d}, about ${plural(minutes, 'minute')}.`,
    turnAround: 'Turn around: the route is behind you.',
    routeStarts: (where: string, right: boolean) => `The route starts ${where}: turn to your ${right ? 'right' : 'left'}.`,
    goodStraight: 'Good, walk straight ahead.',
    arrived: (name: string, where: string | null, d: string | null) => `You have arrived at ${name}.${where ? ` It is ${where}, about ${d}.` : ''}`,
    offRoute: (d: string, where: string) => `You are off the route, about ${d} from it. The route is ${where}.`,
    stillOff: (d: string, where: string) => `You are still off the route, about ${d} from it. The route is ${where}.`,
    newRoute: 'New route. ',
    backOn: 'Back on the route. ',
    wrongWay: 'You are going the wrong way. Turn around.',
    rightWay: 'Good, now you are heading the right way.',
    keepGoingTurn: (along: string, d: string) => `${along}: ${d} to the next turn.`,
    keepGoingArrive: (along: string, d: string, name: string) => `${along}: ${d} to ${name}.`,
  },
};

/** The shape every language implements: the English catalog with its literal strings widened. */
type Widen<T> = T extends string ? string
  : T extends (...args: infer A) => infer R ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[] ? Widen<U>[]
      : T extends object ? { [K in keyof T]: Widen<T[K]> } : T;

export type Messages = Omit<Widen<typeof en>, 'lang'> & { lang: Lang };
