# Ricerca · casi d'uso dai partner, gap reali, cliché degli altri team

Fonte: ricerca web con agente Claude, 25/09/2026. NV = non verificato. Le fonti sono state lette direttamente oppure da ricerche di agenti controllate a campione.

## 0. Premessa e tesi

- **"Non premiano problemi già risolti": d'accordo a metà.**
  - Il brief del Track 2 considera già la trascrizione il punto di partenza ("beyond simple transcription").
  - Però dire "nessuno lo fa" è quasi sempre falso. Se un giudice MIT o Anthropic risponde "c'è già Olli" o "c'è già Ava", la demo è finita.
  - La formula che regge è: "X esiste, ma fallisce in questo momento preciso (ecco la prova), noi risolviamo quel momento".
  - Criteri di giudizio e abbinamento partner-track: non trovati online (NV).
- **La tesi "mostrare le prove e dichiarare l'incertezza" è sostenuta dai dati.**
  - Estrarre in un solo passaggio la tabella dati da un grafico: Claude Opus 4.6 fa 60,99 di RMSF1 (punteggio di accuratezza della tabella estratta, su 100). Un VLM specializzato rilanciato 20 volte restituisce almeno una tabella diversa sul 99,4% dei grafici ([arXiv](https://arxiv.org/abs/2605.27298)).
  - Su grafici senza etichette GPT-4o legge il valore entro ±2% solo nel 20,87% dei casi ([arXiv](https://arxiv.org/abs/2509.04457)).
  - Un'app che descrive immagini sbaglia il 22,2% delle volte, ma gli utenti le danno comunque 3,76/5 di fiducia ([arXiv](https://arxiv.org/abs/2602.13469)).
  - Le Citations di Claude citano solo testo, non immagini ([docs](https://platform.claude.com/docs/en/build-with-claude/citations)).
- **L'aggancio Generali più forte sono i processi che funzionano solo con la voce o solo con la vista, ammessi dalle sue stesse dichiarazioni di accessibilità.**
  - Le dichiarazioni sono tutte "parzialmente conformi" ([generali.it](https://www.generali.it/accessibilita/)).
  - Quella dell'app (01/09/2025) dice che i PDF sono "parzialmente leggibili" con screen reader, che alcuni video non hanno didascalie e che in alcuni casi manca il testo alternativo degli elementi grafici.
  - Generali è cliente Anthropic ([anthropic](https://www.anthropic.com/news/milan-office-opening)).

## 1. Cosa costruiranno gli altri (previsione)

- **Track 1:** app che descrivono foto a voce, navigazione e ostacoli, bastone smart, lettori di documenti, generatori di alt-text. Nel 2026 probabilmente anche l'"agente browser per ciechi", visto che Claude in Chrome è disponibile a tutti dal 26/8 ([blog](https://claude.com/blog/claude-in-chrome-generally-available)).
- **Track 2:** sottotitoli + riassunto, traduzione della lingua dei segni (guanti, camera, avatar), notifiche dei suoni.
- **Su Devpost** (risultati ordinati per rilevanza, quindi solo indicativi):
  - cercando "sign language glove", 14 risultati su 24 sono guanti o wearable;
  - cercando "deaf", 6 progetti su 13 traducono la lingua dei segni e nessuno ricostruisce il contesto;
  - cercando "blind navigation", dei 7 progetti pertinenti 4 sono di navigazione e 3 di descrizione ([devpost](https://devpost.com/software/search?query=deaf)).
- Occhio alla critica del "disability dongle": tecnologia fatta "per" le persone disabili senza di loro ([castac](https://blog.castac.org/2022/04/disability-dongle/)).

## 2. Use case dai partner

| Partner | T1 Real | T1 Screen | T2 Real | T2 Screen |
|---|---|---|---|---|
| **Generali** | Foto di danni o fatture per sinistri e rimborsi; inquadrare in videoperizia | Andamento investimenti in app; KID di GenerAzione: rischio in 7 caselle con la classe segnata solo dal colore, 85 pagine ([KID](https://www.generali.it/risparmio-investimenti/investimento/generazione-investimento-polizza-assicurativa)) | Dopo un crash la scatola nera Jeniot fa richiamare la centrale in vivavoce ([jeniot](https://www.jeniot.it/contatti/auto-connessa/auto-generali-italia/)); assistenza stradale pensata prima di tutto per il telefono | Videoperizia guidata a voce dal perito ([viperpro](https://www.viperpro.it/video-perizia/); per Generali NV); alcuni video dell'app senza didascalie |
| **Anthropic** | Vision con posizioni e conteggi "approssimativi" ([docs](https://platform.claude.com/docs/en/build-with-claude/vision)), quindi va verificata | Tool browser-use disponibile, legge l'accessibility tree ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)) | Niente input audio nell'API ([docs](https://platform.claude.com/docs/en/about-claude/models/overview)): serve un ASR esterno | Citations "custom content": si può citare ogni singolo enunciato |
| **Openapi** | Dalla targa: modello, compagnia, polizza, scadenza ([products](https://openapi.com/products)) | Bollettini PagoPA; dati aziendali per smascherare lettere truffa | SMS, PEC, raccomandata: trasformano un canale solo a voce in testo tracciabile | Marca temporale; server MCP per Claude ([mcp](https://openapi.com/mcp/claude)); sandbox gratuita; nessun programma hackathon trovato |
| **Databricks** | — | La Genie Conversation API restituisce SQL e risultati ([docs](https://docs.databricks.com/aws/en/genie/conversation-api)), quindi valori esatti; Free Edition con dashboard e Genie ([docs](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations)); nessuna VPAT pubblica | — | Aggancio debole |
| **MIT** | Tactile Vega-Lite ([repo](https://github.com/mitvis/tactile-vega-lite)) | Olli: su npm, licenza BSD-3, legge Vega-Lite ([repo](https://github.com/umwelt-data/olli)); Umwelt ([paper](https://arxiv.org/abs/2403.00106)) | Nessun lavoro su utenti sordi trovato | — |
| **Stanford** | SHAPE Lab: display a pin, feedback aptico per grafici ([profilo](https://profiles.stanford.edu/sean-follmer)) | Grant HAI 2023 sulle descrizioni di grafici fatte con AI ([HAI](https://hai.stanford.edu/research/grant-programs/hai-accelerator-for-learning-partnership-grant?section=2023-recipients)) | Nessun lavoro su utenti sordi trovato | — |

- **Anthropic:** non trovate aziende di tecnologie assistive che usano Claude (Aira usa Project Astra di Google; NV). Per Anthropic è uno spazio libero.
- **Ipotesi (NV):** MIT e Stanford sembrano più vicini al Track 1.

## 3. Esiste già? I gap reali

| Caso | Già coperto da | Gap che resta |
|---|---|---|
| Conversazione di gruppo | Live Transcribe: italiano, etichetta "Laughing", vibra quando dicono il tuo nome, ma niente riassunti né chi parla ([help](https://support.google.com/accessibility/android/answer/9158064)). Ava: riassunto a fine conversazione ([ava](https://www.ava.me/pricing)). Even G2: riassunto dopo, ma servono gli occhiali ([even](https://www.evenrealities.com/conversate)). Live Captions di Apple non c'è in italiano ([apple](https://www.apple.com/ios/feature-availability/)) | Nessun recap verificabile a metà conversazione; le domande rivolte a te senza il tuo nome non vengono segnalate; le risate restano senza contesto |
| Meeting online | Teams: riepilogo per chi entra con più di 5 minuti di ritardo, con licenza ([learn](https://learn.microsoft.com/en-us/microsoftteams/intelligent-recap-calls-meetings)). Meet: "Summary so far" in italiano ([meet](https://support.google.com/meet/answer/14754931)) | Tutto quello che sta fuori da licenze e organizzazione. Per chi non vede: Microsoft ha cancellato le domande in diretta sullo schermo condiviso (5/8/2025, [fonte](https://supersimple365.com/microsoft-copilot-to-analyse-content-shared-onscreen-in-a-teams-meeting/)) |
| Telefonate | Pedius: italiano, clienti BNL/ENEL/TIM/AXA, niente riassunti ([pedius](https://www.pedius.org/it/business)). La trascrizione chiamate di Apple non c'è in italiano. 112 Where ARE U copre solo il 112 (NV) | Chiamate automatiche in arrivo scoperte; nessuna risposta rapida alle domande; numeri non verificabili |
| Annunci in stazione | Trenitalia Smart Caring manda il binario in tempo reale ([smart caring](https://www.trenitalia.com/it/informazioni/smart-caring.html)); totem LIS/IS con avatar AI fatto con l'ENS ([faq](https://www.trenitalia.com/it/informazioni/domande-frequenti.html)) | Solo gli annunci senza un feed dati: a bordo, emergenze, sale d'attesa |
| Grafici | Be My AI, Seeing AI e iOS descrivono in prosa, non verificabile. Olli e Umwelt richiedono i dati. Da foto a grafico accessibile esistono solo prototipi di ricerca (NV) | Da foto o PDF non si arriva a un grafico navigabile con valori verificabili |
| Foto per sinistri | Guide solo visive ([Qapter](https://www.qapter.com/solutions/claims/)); guida audio solo per documenti ([Envision](https://www.applevis.com/apps/ios/productivity/envision-ai)); Aira non è venduta in Italia ([aira](https://aira.io/subscriptions/)) | Nessuna guida allo scatto basata sui requisiti della pratica |

## 4. Non verificato

- Abbinamento partner-track e criteri di giudizio.
- La piattaforma di videoperizia di Generali. Il flusso "istruzioni a voce del perito" è documentato da Verti ([verti](https://www.verti.it/sinistri/servizio-sinistri/video-perizia/)).
- Il supporto dell'italiano in Ava ed Even G2.
- L'assenza di un prodotto commerciale che trasformi la foto di un grafico in un grafico navigabile.
- L'accuratezza dei modelli attuali: i benchmark citati usano modelli precedenti.
- Le previsioni su cosa faranno gli altri team.
- Le funzioni di Pedius oltre a sintesi vocale e trascrizione.
