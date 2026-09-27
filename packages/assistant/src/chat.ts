/**
 * The answer for an utterance that is not an app action: a question about the destination or a place, a web search
 * the user asks for, or how to use the app. The model answers in plain speech, never with movement instructions,
 * distances or routes: those only come from the engine.
 */
import type { Lang } from '@milo/engine';
import { LLMUnavailable, type LLM, type LLMMessage } from './llm/types';
import { strings } from './strings';

const WEB_WORDS = /\b(?:search|look (?:it |this |that )?up|google|online|on the web|on the internet|internet|website|cerca|cercami|cercalo|in rete|su internet|sul web|online)\b/i;

export const wantsWeb = (utterance: string) => WEB_WORDS.test(utterance);

const USAGE: Record<Lang, string> = {
  en: `What the user can say to the app (voice only, one Talk button):
- Start: "use my location", "start from <place>". Destination: "take me to <place>", "I'm going to <place>". The app finds the place and asks "Is that right?": "yes", "no", "the second one".
- Area: "what's around me", "where am I", "more", "what don't you know", "where does this come from", "repeat", "stop", "faster", "slower", "start over", "help", "speak Italian".
- Virtual walk through the streets: "explore", "turn left", "turn right", "take via Brembo", "take the second one", "go back", "back to the start".
- Questions answered from the map: "how far is <place>", "is there anything between me and <place>", "does <street> go through", "how big is the park", "how many ways are there to <place>", "is the pharmacy open".
- Route: "how do I get there", "other routes", "take the shortest", "take the main streets", "take the bus", "avoid crossings without signals", "avoid steps", "stop at a supermarket for 15 minutes", then "the first one".
- Guidance while walking: "let's go" or "guide me" to start, "how far is it", "stop guidance" to end. The app warns at once when the user leaves the route.`,
  it: `Cosa l'utente può dire all'app (solo voce, un pulsante Parla):
- Partenza: "usa la mia posizione", "parto da <luogo>". Destinazione: "portami a <luogo>", "vado a <luogo>". L'app trova il luogo e chiede "È giusto?": "sì", "no", "il secondo".
- Zona: "cosa c'è intorno a me", "dove sono", "più dettagli", "cosa non sai", "quali sono le fonti", "ripeti", "basta", "più veloce", "più piano", "ricomincia", "aiuto", "parla inglese".
- Passeggiata virtuale per le strade: "esplora", "gira a sinistra", "gira a destra", "prendi via Brembo", "prendi la seconda", "torna indietro", "torna all'inizio".
- Domande con risposta dalla mappa: "quanto dista <luogo>", "c'è qualcosa tra me e <luogo>", "<via> è senza uscita", "quanto è grande il parco", "in quanti modi posso arrivare a <luogo>", "la farmacia è aperta".
- Percorso: "come ci arrivo", "altri percorsi", "prendi il più breve", "prendi le strade principali", "prendi l'autobus", "evita gli attraversamenti senza semaforo", "evita le scale", "fermati al supermercato per 15 minuti", poi "il primo".
- Navigazione mentre si cammina: "andiamo" o "guidami" per partire, "quanto manca", "ferma la navigazione" per finire. L'app avvisa subito se l'utente esce dal percorso.`,
};

export function chatSystem(lang: Lang): string {
  const it = lang === 'it';
  return `You are the voice of Milo, a walking app for blind and low-vision people. The user's words reach you only when they are not one of the app's commands: a general question about a place or the destination, a request to search the web, or a question on how to use the app. Answer in ${it ? 'Italian' : 'English'}.

${USAGE[lang]}

Rules:
- Never give movement instructions, directions, distances, walking times, routes, crossings or anything about how to get somewhere or whether a way is safe. The app's map engine gives those. Instead, say the exact phrase to use, for example ${it ? '"Di\' come ci arrivo."' : '"Say how do I get there."'}
- For how to use the app, answer from the list above with the exact phrases.
- For a general question (what a place is, what it is known for, what is there), answer from general knowledge and start with ${it ? '"Da quel che so,"' : '"From general knowledge,"'} unless you searched the web; then say ${it ? '"Secondo <nome del sito>,"' : '"According to <site name>,"'} and never read out a URL.
- Use the facts given about the user's trip (start, destination, chosen route) only to know what they mean; do not repeat numbers from them.
- If you do not know or are unsure, say so in one sentence.
- Plain speech for the ear: at most three short sentences, no lists, no markdown, no emoji.
- If the request is really one of the app's actions, say the phrase that does it.`;
}

export interface ChatArgs {
  lang: Lang;
  utterance: string;
  trip?: Record<string, unknown>;
  history?: [string, string][];
  /** Allow the web search tool (default: only when the user asks for a search). */
  web?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The model's spoken answer and whether it searched the web. Throws LLMUnavailable when there is no answer. */
export async function answer(llm: LLM, a: ChatArgs): Promise<{ text: string; web: boolean }> {
  const S = strings(a.lang);
  const web = (a.web ?? wantsWeb(a.utterance)) && llm.canSearch;
  const messages: LLMMessage[] = [];
  for (const [u, r] of a.history ?? []) messages.push({ role: 'user', content: u }, { role: 'assistant', content: r });
  const facts = a.lang === 'it' ? 'Informazioni sul viaggio' : 'Facts about the trip';
  const said = a.lang === 'it' ? "L'utente ha detto" : 'The user said';
  messages.push({ role: 'user', content: `${facts}: ${JSON.stringify(a.trip ?? {})}\n\n${said}: ${a.utterance}` });
  try {
    const r = await llm.complete({ system: chatSystem(a.lang), messages, maxTokens: 600, webSearch: web, signal: a.signal,
      timeoutMs: a.timeoutMs ?? (web ? 30_000 : 15_000) });
    const text = r.text.replace(/[*_#`]|\bhttps?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    return { text: text || S.notSure, web: r.usedWeb };
  } catch (e) {
    if (e instanceof LLMUnavailable && /declined/.test(e.message)) return { text: S.declined, web: false };
    throw e;
  }
}
