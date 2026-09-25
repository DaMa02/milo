# Ricerca Track 1 · When the Interface Goes Silent

Fonte: ricerca web con agente Claude, 25/09/2026. I punti non verificati sono segnalati in fondo.

## 1. Problema

**Cosa resta inaccessibile**
- **Grafici e dashboard.** Chi usa lo screen reader sui grafici online è il 61% meno accurato e impiega il 211% di tempo in più ([Sharif 2021](https://faculty.washington.edu/wobbrock/pubs/assets-21.01.pdf)).
- **Slide e schermi condivisi.** Nelle presentazioni il 72% degli elementi visivi viene descritto male a voce ([Peng 2021](https://arxiv.org/abs/2103.14491)).
- **Mappe, planimetrie, diagrammi (anche STEM) e interfacce su canvas.** Il canvas non espone semantica agli screen reader ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)).

**Ciechi**
- Trovano grafici che lo screen reader non vede e alt text generici.
- Vogliono tabelle, statistiche e trend. Il 63% rifiuta le interpretazioni soggettive ([Lundgard & Satyanarayan](https://vis.csail.mit.edu/pubs/vis-text-model/)).

**Ipovedenti**
- Quando ingrandiscono perdono assi, legenda e visione d'insieme ([Wang 2024](https://dl.acm.org/doi/10.1145/3613904.3642188), [Sechayk 2026](https://arxiv.org/abs/2603.02498)).
- Il testo a basso contrasto è presente sull'83,9% delle home page ([WebAIM 2026](https://webaim.org/projects/million/)).

**Numeri**
- Almeno 2,2 miliardi di persone hanno un deficit visivo, anche correggibile ([OMS 2026](https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment)).
- Le persone cieche sono 43 milioni, quelle con ipovisione moderata o grave 295 milioni: circa 7 a 1 ([IAPB 2020](https://www.iapb.org/wp-content/uploads/2021/02/Vision-Atlas_Evidence-Series_Magnitude-of-VIsion-Loss_24022021.pdf)).
- Chi progetta solo per lo screen reader ignora la maggioranza.

## 2. Stato dell'arte

**MIT**
- Le descrizioni hanno 4 livelli: L1 encoding, L2 statistiche, L3 trend, L4 contesto. I lettori ciechi preferiscono L2 e L3 ([VIS 2021](https://arxiv.org/abs/2110.04406)).
- [Olli](https://umwelt-data.github.io/olli/docs/entry-points) (`npm install olli`) trasforma uno spec Vega-Lite in un albero navigabile da tastiera. Per i diagrammi c'è `olliDiagram`.
- [Umwelt](https://arxiv.org/abs/2403.00106) mette alla pari grafico, testo e suono.
- Hanno già integrato un LLM in Olli ([2025](https://arxiv.org/abs/2506.15883)).

**Stanford**
- Racconti audio dei dati, co-progettati con utenti di screen reader ([Siu 2022](https://hci.stanford.edu/publications/2022/siu2022datanarratives.pdf)).
- La descrizione giusta cambia con il contesto ([Kreiss 2022](https://hai.stanford.edu/news/creating-more-accessible-internet-context-matters)).

**Altri lavori**
- [MAIDR](https://arxiv.org/abs/2403.00717) rende i grafici in braille, testo e suono.
- La sonificazione aiuta sui trend, meno sui singoli valori ([W4A 2025](https://faculty.washington.edu/wobbrock/pubs/w4a-25.01.pdf)).
- L'estrazione di dati da immagini esiste già ([Chart4Blind](https://arxiv.org/abs/2403.06693), [ChartParser](https://arxiv.org/abs/2211.08863)).

**Prodotti**
- Esistono Be My AI, Seeing AI, TalkBack con Gemini, gli Audio Graphs di VoiceOver e Highcharts.
- Picture Smart AI di JAWS ha sostituito Gemini con Claude per "significantly fewer hallucinations" ([Freedom Scientific](https://www.freedomscientific.com/training/jaws/new-and-improved-features/)).
- Descrivere un grafico con l'AI è quindi già commodity.

**Standard**
- [WCAG 2.2](https://www.w3.org/WAI/news/2025-10-21/wcag22-iso), criteri rilevanti:
  - 1.1.1 e 1.3.1;
  - 1.4.1 colore;
  - 1.4.10 reflow, che esenta mappe e diagrammi;
  - 1.4.11 contrasto 3:1 per linee e barre;
  - 1.4.13 tooltip;
  - 2.1.1 tastiera;
  - 4.1.3 messaggi di stato.
- [EAA](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882) (in Italia D.Lgs. 82/2022), in vigore dal 28/6/2025:
  - copre prodotti come PC, smartphone e terminali;
  - copre servizi di telecomunicazioni, audiovisivi, trasporti, banca retail, e-book ed e-commerce;
  - esenta le microimprese di servizi e le mappe online, se le informazioni essenziali sono accessibili;
  - la transizione dura fino al 2030.

**Gap aperti**
1. Gli strumenti partono dai dati dell'autore, ma all'utente arrivano PDF e screenshot.
2. Verificare l'AI senza vista è difficile ([ASSETS 2024](https://jayl.in/papers/2024_ASSETS_misfitting.pdf)). Confrontare più risposte fa scoprire 4,9 volte più affermazioni inaffidabili ([2025](https://arxiv.org/abs/2507.15692)).
3. L'ipovisione è trascurata ([CHI 2026](https://arxiv.org/abs/2603.02498)).
4. Contenuti in tempo reale e spaziali.

## 3. Lessico e trappole

- **Disability dongle** ([Liz Jackson](https://eejackson.medium.com/a-community-response-to-a-disabilitydongle-d0a37703d7c2)): una soluzione elegante ma inutile per un problema che le persone disabili non sapevano di avere.
- **Nothing about us without us** ([Charlton](https://www.ucpress.edu/books/nothing-about-us-without-us/paper)): dite chi avete coinvolto. Se non avete coinvolto nessuno, citate studi con partecipanti ciechi e ipovedenti.
- **Linguaggio**
  - In inglese si dice "blind people" ([NFB](https://nfb.org/convention-resolutions-93)).
  - In italiano "persone cieche" e "ipovedenti".
  - Mai "affetto da", mai "utenti normali".
- **Braille e screen reader**
  - Il braille lo usa solo il 38% degli utenti di screen reader.
  - Su desktop dominano JAWS e NVDA; VoiceOver è al 9,7% ([WebAIM](https://webaim.org/projects/screenreadersurvey10/)).
- **Demo a occhi chiusi**
  - Simulare la cecità peggiora il giudizio sulle capacità delle persone cieche ([Silverman 2015](https://journals.sagepub.com/doi/abs/10.1177/1948550614559650)).
  - Presentatela come "provate senza vista", non come "ecco cosa prova un cieco".
- **Allucinazioni**
  - Sono un rischio per la sicurezza.
  - Be My Eyes vieta di usarlo per i farmaci ([ToS](https://www.bemyeyes.com/terms-of-service/)).
  - Anthropic chiede verifiche nei casi critici ([docs](https://platform.claude.com/docs/en/build-with-claude/vision)).
- **Overlay**: la FTC ha imposto ad accessiBe di pagare 1 milione di dollari perché prometteva conformità WCAG automatica ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million)).

## 4. Cosa premiano i giudici

**Tutti**
- Un bisogno documentato.
- Un prodotto a sua volta accessibile: lo proveranno da tastiera.
- Onestà sui limiti.
- Una micro-valutazione: poche domande concrete, confrontando il prodotto con le soluzioni esistenti.

**Anthropic**
- Claude usato dove serve, con l'incertezza dichiarata.
- Al suo hackathon ha premiato chi era più vicino al problema ([ETIH](https://www.edtechinnovationhub.com/news/a-doctor-a-carpenter-and-a-teacher-win-anthropics-global-opus-47-hackathon)).
- Se in sala c'è una persona cieca o ipovedente, fatele provare il prodotto.

**Generali**
- Puntava a rendere accessibili tutti i prodotti digitali entro il 2025, seguendo l'EAA ([Gruppo](https://www.generali.com/info/accessibility)).
- Pubblica dichiarazioni di accessibilità anche per l'app MyGenerali e per il fondo pensione ([Italia](https://www.generali.it/accessibilita/)).

**MIT e Stanford**: vogliono una novità dichiarata con onestà.

**Non verificato**
- I criteri di giudizio e quale partner segue quale track: non c'è nulla di pubblico.
- Che l'EAA copra le assicurazioni tramite la voce e-commerce: è un'interpretazione.
- Che Claude allucini meno: lo afferma il produttore di JAWS, non un test indipendente.
- I sondaggi WebAIM usano campioni autoselezionati.
