# Ricerca · strumenti agentici (Jev, computer use, Pi, opencode)

Fonte: ricerca web con agente Claude, 25/09/2026. [NV] = non verificato o dedotto; il resto è stato verificato su fonti primarie.

## 0. Prerequisiti

1. **Accesso a Jev.** TypeSafe ha sospeso le nuove iscrizioni dal 22/9 (https://x.com/typesafeai/status/2102281508950307159). Oggi le segnalazioni sono contrastanti (https://jevainews.com/news/typesafe-signups-paused/). Gli account già aperti funzionano. Senza account, lo stesso SDK funziona anche da:
   - Vercel AI Gateway, con `baseURL https://ai-gateway.vercel.sh/typesafe` (https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-http-api-for-jev);
   - OpenRouter, su `/api/v1/systemone`, in beta (https://openrouter.ai/docs/guides/community/jev).
2. **API key Anthropic con credito.** Il Max non copre le chiamate fatte dal prodotto (https://code.claude.com/docs/en/agent-sdk/overview).
3. **Test in italiano.**
   - Jev: la doc dice inglese primario, le altre lingue "not equally well" (https://docs.typesafe.ai/models.md). Instructions in inglese, state in italiano.
   - Speech-to-text (STT) con diarizzazione live, provato con rumore di fondo.

## 1. Tool

**TypeSafe Jev (jev-1.13)**
- **Cosa fa.** Prende uno state (testo o JSON) e domande tipizzate:
  - Choice: fino a 255 opzioni;
  - Score: da 2 a 10 livelli;
  - Noul: probabilità che la risposta sia sì.
  - Choice e Score restituiscono anche una `confidence` (https://docs.typesafe.ai/api.md).
- **Latenza.**
  - Dichiarata: 70–500 ms, con server sulla West Coast (https://typesafe.ai/blog/introducing-system-one-models-and-jev).
  - Nel cookbook: 13 domande su circa 12k token in 0,27 s (https://docs.typesafe.ai/cookbooks/parallel_questions.md).
  - Misurata da questo Mac: RTT di circa 0,2 s. Con la connessione riusata contare 0,3–0,8 s a chiamata [NV].
- **Prezzo e limiti** (https://docs.typesafe.ai/models.md):
  - $0,042 per milione di token in input, output gratis;
  - 250k token/s e 1.200 richieste al minuto, ma i limiti sono "dinamici";
  - contesto di 64k token, di cui 32k per state più la domanda più lunga;
  - solo testo in input;
  - credito di $5 al mese [NV].
- **Chiave e SDK.** La chiave si crea su console.typesafe.ai/keys e va tenuta solo lato server. SDK: `typesafe-sdk` per Python, `@typesafe-ai/sdk` per Node 20+.
- **Punti deboli** (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md):
  - legge le domande alla lettera;
  - è debole su numeri, conteggi, date e ragionamenti indiretti;
  - peggiora con state lunghi;
  - si lascia manipolare da contenuti ostili;
  - rifacendo la stessa chiamata le probabilità variano fino a 0,08 (https://openrouter.ai/docs/cookbook/building-agents/gate-tool-calls-with-jev).
- **Cookbook utili:**
  - `citation_check`: dice se un bullet è supportato, contraddetto o non trattato dalla fonte. Sotto 0,8 va marcato "incerto".
  - `semantic_find`: una Choice sugli ID degli enunciati trova la prova, una Noul dice se la risposta esiste.
  - `fan-out`: in una sola chiamata chiede se l'enunciato è rivolto all'utente, se è una domanda o una scadenza, quanto è importante.
  - `pre_parsed_value_extraction`: l'OCR propone i candidati, Jev sceglie, il codice copia il valore esatto.
  - `function_calling`: comandi vocali tradotti in chiamate a funzioni.
  - Gate di OpenRouter: se tutte le probabilità sono ≥0,9 agisce, se una è ≤0,1 blocca, altrimenti chiede conferma all'utente.
- **Workflow.** Esiste una skill TypeSafe per Claude Code.

**Claude**
- **Computer use: `computer_toolset_20260801`.** GA senza beta header dal 19/8 (https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool).
  - Modelli: Opus 5.5 e 5, Sonnet 5, Fable 5.x, Opus 4.8. Haiku 4.5 resta sulla vecchia versione beta.
  - Costo per step: uno screenshot vale 1–1,8k token, più circa 4,5k di overhead che si può mettere in cache.
  - Latenza: nessun dato ufficiale, stima 3–10 s per step [NV].
- **Browser toolset, più adatto.** `browser_toolset_20260801` (GA) gira sul proprio browser Playwright o CDP, e `read_page` restituisce l'accessibility tree (https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool).
- **Modelli:**
  - Opus 5.5: $4/$20 per milione di token, uscito il 22/9, 89% su Chartography con tool (https://www.anthropic.com/news/claude-opus-5-5);
  - Sonnet 5: $2/$10;
  - Haiku 4.5: $1/$5.
- **Claude in Chrome.** È GA ma non ha API: serve solo per sviluppo e test.
- **Agent SDK.** Nel prodotto richiede una API key. Per la demo bastano Messages API e tool runner.

**OpenAI**
- **Computer use.** Tool `computer` GA nella Responses API; gpt-6-sol costa $2/$10 (https://developers.openai.com/api/docs/guides/tools-computer-use).
- **Agents SDK.** Python 0.22.3 e TypeScript 0.18.0, con RealtimeAgent.
- **Realtime.** `gpt-realtime-2.1` va bene per un'interfaccia vocale. `gpt-live-transcribe` ($0,017/min) però non distingue chi parla, e in Realtime la diarizzazione non c'è (https://developers.openai.com/api/docs/guides/realtime-transcription).
- **STT per la Track 2**, latenze [NV]:
  - meglio Deepgram Nova-3: italiano, diarizzazione in streaming, $200 di credito (https://developers.deepgram.com/docs/diarization);
  - in alternativa AssemblyAI Multilingual con `speaker_labels` live (https://www.assemblyai.com/pricing).

**Pi e opencode**
- **Pi** ora è earendil-works/pi (MIT). `pi-ai` è un'API unica per più provider; `pi-agent-core` è un loop di agente con l'hook `beforeToolCall` (https://github.com/earendil-works/pi).
- **opencode** ora è anomalyco/opencode, con architettura client/server.
- **Abbonamenti.** Entrambi accettano il login ChatGPT. Il login Claude Pro/Max è vietato da Anthropic (https://opencode.ai/docs/providers/).

**Altri**
- **Per un target web dentro il prodotto:**
  - Stagehand, con `observe` → conferma → `act` (https://github.com/browserbase/stagehand);
  - browser-use, libreria Python con un modello suo;
  - Playwright MCP, che lavora sull'accessibility tree.
- **Da scartare:**
  - OmniParser, perché serve una GPU;
  - UI-TARS, ospitato solo in Cina o da installare in proprio;
  - Goose e OpenHands.
- **Per lo sviluppo:**
  - Chrome DevTools MCP, con Lighthouse per l'accessibilità;
  - mcp-accessibility-scanner (axe);
  - Guidepup, che pilota VoiceOver e NVDA e restituisce quello che dicono (https://github.com/guidepup/guidepup).

## 2. Pattern di verifica

**Principio comune.** Il pattern "System One / System Two" non è un prodotto a sé: è uno scheletro riusabile.
- Claude genera.
- Il codice verifica quello che si può verificare: match esatti e aritmetica.
- Jev dà giudizi veloci con probabilità calibrate.
- Per chi non vede la provenienza va detta a voce ("letto", "stimato").
- Le associazioni spaziali (coordinate, bounding box) le fa il codice: la geometria è il punto debole di Jev, a cui resta il giudizio semantico.

## 3. Workflow multi-agente

- **In locale** (tutto quello che usa microfono o schermo, più l'integrazione):
  - `claude -w <nome>` (https://code.claude.com/docs/en/worktrees);
  - Codex CLI, che ha i worktree nativi.
- **In cloud** (task isolati, solo su fixture, senza segreti):
  - `claude --cloud`, dopo aver fatto push (https://code.claude.com/docs/en/claude-code-on-the-web);
  - `codex cloud exec --env <id> --attempts 2-4` per generare più tentativi e tenere il migliore (https://developers.openai.com/codex/cloud/environments).
- **AGENTS.md**: Codex ne legge fino a 32 KiB (https://developers.openai.com/codex/guides/agents-md); `CLAUDE.md` contiene solo `@AGENTS.md` (https://code.claude.com/docs/en/memory).
- **Revisione incrociata**: `@codex review` in un commento della PR.
- **opencode e pi** non aggiungono niente: il Max lì non si può usare e il setup costa tempo. Avrebbero senso solo per un terzo modello come revisore, con una API key.
