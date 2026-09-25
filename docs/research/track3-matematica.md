# Ricerca Track 3 · Climbing to the Frontier

Fonte: ricerca con Codex (web search), 25/09/2026. Alcuni riferimenti del 2026 non sono stati verificati in modo indipendente.


**Cosa vuol dire auto-research nel 2026.** Non è “chiedere a un LLM di risolvere un teorema”: è un ciclo chiuso in cui l’agente propone codice/ipotesi, un valutatore oggettivo misura o invalida, e i risultati migliori diventano contesto per il giro successivo. Il repository [autoresearch di Karpathy](https://github.com/karpathy/autoresearch) ne è la versione minimale: un agente modifica esperimenti e conserva solo miglioramenti misurabili. In matematica il riferimento è [FunSearch di DeepMind](https://deepmind.google/blog/funsearch-making-new-discoveries-in-mathematical-sciences-using-large-language-models/): LLM come generatore di programmi, evaluator come selezione evolutiva; [AlphaEvolve](https://deepmind.google/science/) estende l’idea a ottimizzazione scientifica e algoritmica. Esistono implementazioni open, fra cui [OpenEvolve](https://github.com/algorithmicsuperintelligence/openevolve) e [ShinkaEvolve](https://arxiv.org/abs/2509.19349), ma in un giorno conviene copiarne il pattern, non integrare framework pesanti.

Il panorama è reale ma va letto con freddezza. AlphaProof ha dimostrato ragionamento formale a livello olimpiadico e usa Lean; Lean verifica i proof term nel kernel, quindi un file compilato è una garanzia molto più forte di una spiegazione ben scritta ([documentazione Lean](https://lean-lang.org/doc/reference/latest)). Mathlib è l’ecosistema che rende ciò praticabile, ma imparare Lean e modellare un problema nuovo in 7 ore è probabilmente un errore di scope.

Gli Erdős problems sono diventati il caso-scuola: ci sono contributi AI verificati e una documentazione pubblica delle attribuzioni ([registro](https://github.com/teorth/erdosproblems/wiki/AI-contributions-to-Erd%C5%91s-problems/6fa267bc86fa320eb1d8772b1dfe4374e755a0a3)); nel 2026 è arrivato anche un controesempio verificato alla congettura delle distanze unitarie di Erdős ([Nature](https://www.nature.com/articles/d41586-026-01651-0)). Ma molte prime “soluzioni” erano letteratura già esistente o claim troppo ottimistici: Tao descrive il successo come esplorazione sistematica della long tail di problemi relativamente facili, non come conquista automatica del frontier ([intervista](https://www.theatlantic.com/technology/2026/02/ai-math-terrance-tao/686107/)). Il benchmark [OEIS Open](https://arxiv.org/abs/2608.11941) conferma il limite: accesso a molta letteratura e loop agentici più sofisticati non hanno automaticamente alzato le performance. Il messaggio giusto per la giuria è quindi: **research system verificabile, non “abbiamo risolto un problema aperto”.**

**Cosa è realistico in 7–7,5 ore.** Scegliere problemi finiti con verifica economica:

- ricerca di grafi che falsificano una proprietà/congettura parametrica; la ricerca di controesempi in graph theory ha precedenti concreti ([Wagner, 2021](https://mathscholar.org/2021/05/ai-system-finds-counterexamples-to-graph-theory-conjectures/));
- costruzioni per lower bound in Ramsey/cap-set/packing/covering, dove un certificato è un insieme di punti o archi e il checker controlla tutte le coppie/sotto-strutture;
- sequenze e congetture OEIS, ma con test out-of-sample e ricerca della letteratura prima di rivendicare novità;
- disuguaglianze discrete/autocorrelazione su domini finiti, purché il verificatore faccia enumerazione esatta o aritmetica razionale.

Un risultato credibile è: “nuovo best known *entro il dominio esplorato*”, un controesempio minimo certificato, oppure una congettura empirica con tabella esaustiva. Non è credibile: un presunto teorema generale in prosa. Se il dominio è finito, exhaustive check = risultato dimostrato per quel dominio; se è euristico/randomizzato, chiamatelo esplicitamente evidence.

**Architettura da costruire.** Un repository piccolo, con quattro moduli:

`generator → verifier/scorer → archive/evolution → report`

Il generator propone una costruzione codificata (matrice, edge list, set di vettori), mai una prova libera. Il verifier è deterministico, indipendente dal generator, salva seed/input/output e restituisce score, vincoli violati e certificato. L’archive conserva Pareto frontier e fallimenti utili; l’evolution usa i migliori candidati come prompt/context. Il report genera automaticamente grafici, migliori certificati e comando di riproduzione.

Parallelizzate le sessioni: una definisce formalmente il problema e il checker; 3–6 esplorano famiglie diverse di costruzioni; una fa adversarial review e tenta di rompere il verifier; una cura demo/report. Merge solo di candidati rieseguiti dal checker centrale. Non fate dipendere la demo dalla latenza di un agente.

**Rischi.** Il principale è un verifier sbagliato, non il modello: testarlo su casi banali e controesempi noti. Il secondo è l’hallucinated proof; non presentarla. Il terzo è compute: limite rigoroso di budget, cache e timeout. Infine, il fit con “accessibility” è debole: Track 3 sembra accessibilità della ricerca matematica, non inclusione diretta di persone con disabilità. Va esplicitato come democratizzazione dell’accesso a ricerca verificabile, ma è una connessione meno immediata delle altre tracce.

