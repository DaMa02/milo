# Comportamenti da conservare dall'hackathon

Regole di interazione del prototipo dell'hackathon (commit `ed9c4bf`) che la nuova versione deve tenere, o abbandonare con un motivo. I riferimenti `file:riga` valgono per quel commit: `git show ed9c4bf:<file>`.

## Da conservare

| Regola | Fonte | Destinazione |
|---|---|---|
| **«Stop» è sempre locale e immediato.** Non passa dall'interprete, non aspetta la rete, annulla ciò che è in corso e zittisce la lettura | `web/src/hooks/useVoiceCommands.ts:32-33`, `web/src/App.tsx:214`, `web/src/App.tsx:269` | `packages/dialogue` (grammatica), `apps/web` |
| **Un'interpretazione superata non agisce.** Ogni richiesta ha un numero di generazione; una risposta arrivata dopo una più nuova viene scartata | `web/src/hooks/useVoiceCommands.ts:17-28`, `:39`, `:47` | `packages/dialogue` |
| **Mentre un comando è in corso, gli altri vengono rifiutati** con un avviso, tranne «stop» | `web/src/hooks/useVoiceCommands.ts:35`, `:48` | `packages/dialogue`, `apps/web` |
| **Cambiare partenza o arrivo annulla la tappa in sospeso e la guida** | `web/src/App.tsx:288-290` | `packages/dialogue` (applicatore del modulo di viaggio) |
| **Milo non parla mentre l'utente parla.** Un messaggio di guida arrivato durante l'ascolto aspetta la fine, salvo quelli urgenti | `web/src/App.tsx:136-147` | `apps/web` (coda di uscita) |
| **Velocità della voce a passi di ±0,15** | `web/src/App.tsx:286` | `apps/web` (impostazioni) |
| **Mai un vicolo cieco.** Una frase che non corrisponde a nessuna azione diventa una risposta di chat; senza chiave, `none` con motivo `model_unavailable` | `server-py/interpret_api.py:6`, `:204-234` | `packages/dialogue` (ultimo gradino dei chiarimenti, piano D10) |
| **Storico della chat: ultimi 6 turni**, più i fatti del viaggio | `server-py/interpret_api.py:166`, `:204-206` | `packages/dialogue` (memoria, card DIA-3) |
| **Le risposte generali non danno mai indicazioni** (niente direzioni, distanze, tempi, percorsi, attraversamenti). Iniziano con «From general knowledge,» o «According to <sito>,», al massimo 3 frasi | `server-py/lotl/chat.py:25-30` | `packages/dialogue` (card DIA-6) |
| **Correzione dei nomi capiti male.** Se la ricerca non trova niente, il modello propone fino a 2 nomi che il riconoscimento può aver storpiato («Baconi» → «Bocconi»), e si cercano quelli | `server-py/places_api.py:32`, `:78-79`, `:136-138` | `packages/dialogue`: da confrontare con la corrispondenza fonetica sui nomi della zona (card DIA-5) |
| **«N m» letto come «N metri»** | `server-py/tts_api.py:29-31` | Modelli di frase del motore (card MOT-5) |
| **Ogni numero del modello controllato sul risultato del motore**; se il modello sbaglia o tarda più di 3 s, si usa la frase del motore | `server-py/lotl/speak.py:1-4`, `:88-92` | `packages/dialogue/src/speak.ts` (esiste già) |
| **Contesto passato all'interprete**: vista, domanda in sospeso (partenza, arrivo, tappa), candidati, candidati per la tappa, ultima azione, se c'è una destinazione, percorsi offerti | `server-py/interpret_api.py:82-87` | `packages/dialogue` (modulo di viaggio e registro, card DIA-1) |

## Abbandonati, con il motivo

| Regola | Fonte | Motivo |
|---|---|---|
| Suggerimento fisso dopo ogni risposta («Say 'let's go' to start…») | `server-py/lotl/speak.py:9-22`, `:74`, `:92` | Piano v1 A3: suggerimenti solo le prime volte |
| Livello Jev (TypeSafe, API proprietaria) | `server-py/interpret_api.py:17` | Servizio esterno non necessario; la grammatica e il modello bastano |
| Riconoscimento vocale Parakeet su Mac e voce di macOS `say` | `server-py/voice_api.py`, `server-py/tts_api.py` | Sul web: lettore di schermo dell'utente e voce del browser (piano D4) |
| Guida dal vivo: una richiesta al server al secondo, posizioni raggruppate dietro una sola richiesta, avviso quando la pagina è nascosta, blocco dello schermo acceso | `web/src/hooks/useLiveGuidance.ts:32-39`, `:85-114` | Fase 3. Le regole valgono ancora come riferimento, ma la guida girerà nel motore sul dispositivo |

## Flussi dei test Playwright da riscrivere come scenari del dialogo

I test del vecchio `web/tests/` erano per l'interfaccia dell'hackathon. Questi comportamenti restano validi e vanno riscritti come scenari di `packages/dialogue` o di `apps/web`:

- **Comandi e annullamento:**
  - un «stop» locale resta immediato anche mentre l'interprete lavora (`chat-commands.spec.ts:83`);
  - una ricerca annullata non consegna una risposta tardiva (`chat-commands.spec.ts:94`);
  - una risposta superata non parla (`spoken-result.spec.ts:92`, `audio-playback.spec.ts:70`).
- **Luoghi:**
  - una ricerca superata non sostituisce l'elenco più recente (`places.spec.ts:103`);
  - conferma, rifiuto e risultati vuoti non rovinano la sessione (`places.spec.ts:87`).
- **Partenza:**
  - un GPS preciso non chiede conferma, uno impreciso sì (`origin-continuity.spec.ts:39`, `:48`);
  - un GPS negato chiede un punto di partenza (`origin-continuity.spec.ts:60`, `origin-flow.spec.ts:174`).
- **Percorso:**
  - si sceglie solo tra i percorsi offerti (`route-voice.spec.ts:178`);
  - «percorsi alternativi» li rilegge senza ricalcolare (`route-voice.spec.ts:161`);
  - senza destinazione confermata non si crea un percorso (`route-voice.spec.ts:141`);
  - un vincolo obbligatorio non viene mai ammorbidito in silenzio (`plan.spec.ts:244`).
- **Piano e rete:**
  - una modifica rifiutata o incerta tiene l'ultimo piano confermato (`plan.spec.ts:257`);
  - un errore dopo una modifica applicata non la rimanda due volte (`plan.spec.ts:440`).
- **Domande:**
  - una domanda non riconosciuta riceve un chiarimento, non un errore (`ask.spec.ts:214`);
  - un errore conserva la domanda per riprovare (`ask.spec.ts:157`, `natural-questions.spec.ts:47`).
- **Tastiera e accessibilità:**
  - una risposta tardiva non sposta il focus (`ask.spec.ts:189`, `explore.spec.ts:201`, `natural-questions.spec.ts:28`);
  - riflusso a 320 px (`explore.spec.ts:236`, `shell.spec.ts:4`).
- **Passeggiata virtuale:**
  - la posizione e il percorso di ritorno restano coerenti tra «take», «where», «back» e «home» (`explore.spec.ts:37`, `live-engine.spec.ts:80`).
- **Lettura:**
  - aprire la zona ferma la lettura precedente (`speech.spec.ts:132`);
  - una lettura di dettaglio si ferma con il comando da tastiera che segue (`speech.spec.ts:160`);
  - la parola di Milo si interrompe prima di aprire il microfono (`concise-voice-flow.spec.ts:243`).
