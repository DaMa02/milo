# Milo: piano di lavoro

Versione 1 del 27 settembre 2026, da approvare prima di toccare il codice.

Le fonti di ogni affermazione sono nei sei rapporti di ricerca in [`docs/ricerca/2026-09-27/`](ricerca/2026-09-27/):
- [A: studi scientifici](ricerca/2026-09-27/A-studi-scientifici.md)
- [B: cosa dicono gli utenti ciechi](ricerca/2026-09-27/B-voci-degli-utenti.md)
- [C: soluzioni esistenti](ricerca/2026-09-27/C-soluzioni-esistenti.md)
- [D: piattaforma e precisione](ricerca/2026-09-27/D-piattaforma-e-precisione.md)
- [E: conversazione](ricerca/2026-09-27/E-conversazione.md)
- [F: contesto italiano](ricerca/2026-09-27/F-contesto-italiano.md)

Lo stato attuale è preso dal codice, con i numeri veri.

---

## In breve

**Cosa manca oggi a un cieco che usa Milo**, in ordine di gravità:

1. **Non può dire tutto in una frase.** «Voglio andare al Duomo fermandomi a una farmacia lungo il percorso, senza prendere mezzi pubblici» non funziona per tre motivi:
   - Milo capisce una sola azione per frase;
   - il motore accetta una sola tappa;
   - il vincolo «niente mezzi» non esiste.

   Per partire servono 5 turni; una tappa ne aggiunge altri 4.
2. **Gli annunci dichiarano una precisione che non c'è.**
   - «Gira ora» scatta circa 11 m prima della svolta.
   - «Sei arrivato» scatta fino a 25 m prima.
   - L'incertezza della posizione non viene mai detta.
3. **Degli attraversamenti dice troppo poco.** Non dice:
   - dove sono le strisce rispetto all'angolo;
   - se c'è l'isola spartitraffico;
   - quante corsie ci sono;
   - se ci sono il tram o la ciclabile;
   - se c'è il percorso tattile (lo legge dalla mappa ma non lo dice mai).
4. **Parla troppo.**
   - In esplorazione un incrocio produce 156 parole di fila, circa un minuto.
   - I nomi dei luoghi sono letti come sono in mappa («San Luigi snc»).
5. **Non funziona a mani libere né a schermo bloccato**, e non si coordina con VoiceOver e TalkBack. L'app per telefono non esiste ancora.
6. **Non ricorda niente**: né preferenze («evito sempre le scale») né luoghi (casa, lavoro).

**Cosa non cambia:**
- il motore gira sul telefono;
- i dati vengono da OpenStreetMap;
- vale la regola dei numeri: ogni numero detto è un fatto con la sua prova;
- open source, gratuito, senza account.

**Una verità da mettere agli atti.** Il GPS di un telefono in città sbaglia di 5–15 m, con punte oltre i 30 m tra palazzi alti. A Londra indovina il lato della strada 1 volta su 4 (Wang 2015). Nessuna app può dire «gira adesso» con precisione al metro usando il solo GPS. Si possono però fare tre cose:
- ancorare gli annunci a riferimenti fisici (angolo, fine dell'isolato, bordo del marciapiede);
- dire l'incertezza;
- nei punti critici, usare la fotocamera (posizionamento visivo, circa 0,8 m).

---

## 0. Metodo

### 0.1 Controllo «impatto su un cieco», obbligatorio per ogni modifica

Ogni proposta di modifica risponde per iscritto a queste domande prima di essere scritta, e di nuovo prima di essere accettata:

1. **Mani.** Serve toccare lo schermo mentre cammina? Tutto ciò che serve in strada deve funzionare col telefono in tasca.
2. **Orecchie.** Aggiunge parlato? Quando, e si può interrompere? Copre il traffico? Al bordo del marciapiede si tace.
3. **Lettore di schermo.** Funziona con VoiceOver e TalkBack, accesi e spenti? La voce di Milo si sovrappone al lettore?
4. **Precisione.** Dichiara una precisione che non abbiamo? Dice cosa non sa?
5. **Errore.** Cosa succede se il riconoscimento vocale sbaglia, se manca la rete, se il GPS è scarso, se la mappa è incompleta?
6. **Sicurezza.** Può spingere a un'azione pericolosa? Al bordo del marciapiede Milo informa, non comanda.
7. **Carico.** Quante parole dice, quante cose bisogna ricordare?
8. **Controllo.** L'utente può ripetere, fermare, annullare, chiedere di più?
9. **Personalizzazione.** Si può regolare a voce e dalle impostazioni?
10. **Italiano vero.** Frasi naturali, preposizioni corrette, nomi delle vie pronunciabili.

### 0.2 Prima le evidenze, poi il progetto

Per ogni area:
- studi scientifici;
- voci degli utenti (forum, recensioni, podcast, UICI);
- soluzioni esistenti e codice riusabile.

La ricerca iniziale è in `docs/ricerca/`. Ogni area, quando la si apre, ne aggiunge una mirata.

### 0.3 Con persone cieche, non per persone cieche

Le associazioni italiane (INMACI per UICI e ADV) considerano il percorso tattile «l'ausilio primario». Accettano il GPS solo come informazione aggiuntiva ([F](ricerca/2026-09-27/F-contesto-italiano.md)). Tra i principali motivi per cui un ausilio viene abbandonato c'è non aver consultato gli utenti (Phillips & Zhao 1993, [A](ricerca/2026-09-27/A-studi-scientifici.md)). Quindi:
- Milo si presenta come complemento a bastone, cane e addestramento all'orientamento e mobilità (O&M);
- si coinvolgono UICI Milano, l'Istituto dei Ciechi di Milano e gli istruttori O&M (ANIOMAP) prima di ogni rilascio.

### 0.4 Criteri misurabili

Ogni area ha criteri di accettazione. Senza, un'area non è «fatta».

---

## 1. Scope

### 1.1 Per chi

- **Chi:** persone cieche che usano il bastone o il cane guida, e persone ipovedenti.
- **Esperienza:** sia esperte sia principianti. Le preferenze sui messaggi cambiano con l'esperienza (Ahmetovic 2019), quindi il dettaglio si regola.
- **Lettore di schermo:** quasi tutte hanno VoiceOver o TalkBack sempre attivi.
- **Età:** molte hanno più di 49 anni (81% nei campioni esaminati da Real & Araujo 2019). Serve una curva di apprendimento dolce.
- **Lingua:** prima l'italiano, poi l'inglese.

### 1.2 Fase A: esplorazione prima del viaggio

- **Scopo:** costruirsi la mappa mentale e decidere il percorso.
- **Dove:** a casa o da fermi, anche al computer (versione web, con NVDA, JAWS o VoiceOver per macOS).
- **Contiene:**
  - panoramica della zona;
  - domande sulla mappa;
  - passeggiata virtuale libera;
  - **prova del percorso pianificato**, a salti di svolta in svolta oppure passo passo. È la funzione con più evidenza a favore: dopo tre giorni di prova, 12 utenti su 14 hanno percorso da soli un percorso reale (Guerreiro 2017/2020). È anche un vuoto di mercato ([C](ricerca/2026-09-27/C-soluzioni-esistenti.md));
  - pianificazione con vincoli, tappe, mezzi e orari;
  - luoghi e percorsi salvati.

### 1.3 Fase B: navigazione in strada

- **Scopo:** arrivare, con il telefono in tasca e le mani occupate dal bastone o dal cane.
- **Contiene:**
  - partenza e orientamento iniziale;
  - svolte;
  - attraversamenti;
  - conferme di essere sul percorso;
  - uscita dal percorso e ricalcolo;
  - tappe;
  - tratte con i mezzi: fermata, linea, fermate da contare, discesa;
  - arrivo e ultimi metri;
  - «dove sono» e «cosa c'è intorno» in qualsiasi momento;
  - pausa.

### 1.4 Trasversali

- Comunicazione: voce, gesti, pulsanti.
- Impostazioni.
- Dati e trasparenza.
- Offline e batteria.
- Sicurezza, responsabilità, privacy.

### 1.5 Fuori scope, dichiarato

- **Rilevare gli ostacoli.** È il lavoro del bastone e del cane.
- **Dire «attraversa adesso» in base alla fotocamera: mai.** Il rilevamento affidabile dei semafori è un problema aperto (El-taher 2021), e Oko funziona solo negli USA.
- **Navigazione indoor.** Per le stazioni solo informazioni: uscite, ascensori, percorsi tattili.
- **Auto e bici.**
- **Sostituire l'aiuto umano.** Deve invece essere facile passare a Be My Eyes, a una chiamata a un contatto o a condividere la posizione.

---

## 2. L'app

### 2.1 Piattaforme

- **Android per primo** (React Native + Expo). **iOS dallo stesso codice.** Nessuna scelta di design vale solo per Android: ogni funzione è progettata e provata sia con TalkBack sia con VoiceOver.
- **Web** (Expo web) solo per la Fase A, cioè per pianificare al computer.

### 2.2 Architettura dell'app ([D](ricerca/2026-09-27/D-piattaforma-e-precisione.md))

1. **Modulo nativo (Kotlin e Swift)** per ciò che deve girare a schermo bloccato:
   - posizione a 1 Hz fusa con passi, giroscopio e bussola;
   - sintesi vocale con le giuste proprietà audio;
   - suoni e vibrazioni;
   - sessione media per il tasto delle cuffie.

   I moduli Expo standard hanno limiti documentati:
   - `expo-location` in background è fragile, con bug aperti nel 2026;
   - `expo-speech` su Android non chiede il focus audio;
   - `expo-speech` su iOS ignora la voce e la velocità di VoiceOver.
2. **Motore TypeScript** (`packages/engine`, già portato con parità esatta): decisioni pure e testabili.
3. **Interfaccia React Native** per la Fase A, le impostazioni e lo stato.

### 2.3 Come si parla a Milo

- **Senza toccare lo schermo:**
  - il **tasto delle cuffie** avvia l'ascolto;
  - su iOS la **magic tap** (doppio tocco a due dita con VoiceOver, il gesto standard per l'azione principale);
  - su Android il **doppio tocco a due dita di TalkBack** arriva come tasto delle cuffie: stesso gesto, stessa funzione.
- **Pulsante grande sullo schermo**, per chi preferisce toccare.
- **Scorciatoie** Siri e Android.
- **Tastiera**, sul web e per chi preferisce scrivere.
- **Niente tasti del volume**: vietati da Apple, instabili su Android, e TalkBack li usa.
- **Niente parola di attivazione nella prima versione.** I modelli liberi sono solo in inglese o hanno licenze non commerciali; Porcupine è a pagamento.

### 2.4 Come parla Milo

- **La guida usa la voce propria di Milo**, che funziona a schermo bloccato e gestisce coda e attenuazione degli altri audio. Su iOS usa la voce e la velocità scelte dall'utente in VoiceOver.
- **Gli annunci del lettore di schermo servono solo come riscontro dell'interfaccia.** Mai le due voci insieme. Gli utenti lo chiedono esplicitamente ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §8).
- **Pochi suoni, sempre insieme alla voce.** Voce e «spearcon» (frasi accelerate) battono i suoni astratti (Nees & Liebman 2023).
- **Vibrazioni brevi e opzionali.** Hanno limiti: iPhone bloccato, risparmio energetico su Android.
- **Mezzo secondo di silenzio prima di parlare**, per svegliare le cuffie Bluetooth (lamentela ricorrente degli utenti).
- **Per gli ipovedenti:** caratteri grandi, alto contrasto, tema scuro, mappa per chi accompagna.

---

## 3. Collegamenti tra app e servizi esterni

**Principio:**
- tutto sul telefono;
- verso l'esterno solo ciò che non si può fare in locale, con il minimo di dati;
- nessun server nostro che riceva dati degli utenti.

**Perché:** il solo fatto di usare Milo rivela una disabilità, e per il GDPR è un dato particolare (Corte di giustizia UE, C-184/20; [F](ricerca/2026-09-27/F-contesto-italiano.md) §6).

**Cosa esce dal telefono, funzione per funzione:**

- **Calcoli** (percorsi, esplorazione, domande, guida): girano sul telefono. Non esce niente e funzionano offline.
- **Mappa:** oggi viene dai server pubblici Overpass e resta in cache sul telefono; la proposta è passare a pacchetti città precompilati.
  - Esce: il rettangolo della zona del viaggio (con i pacchetti, il nome della città).
  - Offline: funziona se la zona è già scaricata.
- **Ricerca dei luoghi:** Photon (komoot), con ripiego sui nomi della mappa scaricata.
  - Esce: il testo cercato e la posizione approssimata.
  - Offline: solo i nomi presenti nella mappa scaricata.
- **Mezzi pubblici:** Transitous.
  - Esce: partenza, arrivo e orario.
  - Offline: solo quanto già in cache.
- **Riconoscimento vocale:** sul telefono (Android e iOS in modalità locale), oppure con il modello scaricato Parakeet v3.
  - Esce: niente, se la modalità locale è forzata.
  - Offline: funziona.
- **Voce:** sul telefono. Non esce niente e funziona offline.
- **Frasi complesse e domande generali:** modello cloud con la chiave dell'utente, oppure modello sul telefono.
  - Esce: la frase e il contesto del viaggio (nomi dei luoghi).
  - Offline: modello sul telefono e grammatica.
- **Modelli** (voce, riconoscimento, linguaggio): Hugging Face o nostra pubblicazione. Si scaricano una volta, e non esce niente.
- **Precisione con fotocamera** (opzionale): ARCore Geospatial di Google.
  - Esce: i dati visivi per la localizzazione.
  - Offline: non disponibile.

**Problemi da correggere:**

1. **Server russo.** Tra i server Overpass predefiniti c'è `maps.mail.ru` (VK, Russia), che riceve la zona dell'utente. Va tolto.
2. **Primo caricamento lento.** Una zona nuova impiega circa un minuto, dipende da server pubblici instabili e da scaricare una zona per ogni viaggio. La proposta:
   - pacchetti città precompilati (Milano per prima), pubblicati come file statici e aggiornati ogni settimana;
   - Overpass solo come ripiego.

   Soundscape ha fatto la stessa scelta dopo che il vecchio server si è rivelato «molto costoso da gestire» ([C](ricerca/2026-09-27/C-soluzioni-esistenti.md)).
3. **Chiave API dell'utente.** È una barriera enorme per un cieco non tecnico: procurarsi una chiave è complicato e le pagine dei fornitori non sono pensate per lui. Le alternative, tutte con costi:
   - un **server nostro** con quota: costi, abusi, obblighi GDPR, e servirebbe un soggetto giuridico responsabile;
   - **solo il modello sul telefono**, più debole.

   → Decisione 2.

---

## 4. Aree di intervento

Ogni area riporta: stato attuale, problemi con le evidenze, migliorie, aggiunte, criteri. La prima è la comunicazione, come hai chiesto.

### 4.1 Comunicazione con il sistema: cosa dice l'utente

**Stato attuale**
- **Una frase, una sola azione.** La catena è: grammatica di frasi esatte → router → modello con schema a un'azione → chat.
- **Esempio del Duomo:** nel migliore dei casi capisce la destinazione; la tappa e il vincolo si perdono.
- **Per partire servono 5 turni:**
  1. partenza;
  2. destinazione + «È giusto?»;
  3. «come ci arrivo»;
  4. scelta del percorso;
  5. «andiamo».

  Una tappa aggiunge 4 turni: tipo, candidati, scelta, durata.
- **Conferme esplicite per ogni luogo**, con i candidati letti uno per volta.
- **Nessun riferimento al contesto** («lì», «l'altra», «come prima»), nessuna correzione a metà, nessun «annulla».
- **Niente preferenze salvate, niente luoghi salvati.**
- **Lo stesso suggerimento fisso** chiude ogni risposta.
- **Si attiva solo con un pulsante sullo schermo.**

**Problemi, con le evidenze**
- **Assistenti vocali e utenti ciechi.** Sono utenti esperti che vogliono efficienza e controllo. Gli assistenti vocali li penalizzano con:
  - turni «da conversazione umana»;
  - risposte che non si possono controllare;
  - poco tempo per parlare;
  - nomi impossibili da correggere.

  Fonti: Abdolrahmani 2018; Branham & Roy 2019. Dettando, l'80% del tempo va a correggere errori (Azenkot & Lee 2013).
- **Modelli linguistici come interfaccia:** ChitChatGuide (MobileHCI 2024) funziona bene per richieste vaghe, ma sui dati del suo registro:
  - 6 volte «il secondo» è finito sull'oggetto sbagliato (5 errori notati dagli utenti), ci sono state 3 invenzioni, e 14 risposte di pianificazione su 143 sono fallite per il riconoscimento vocale;
  - solo il 16,7% delle richieste di risposte più brevi è stato rispettato;
  - pianificare a voce ha richiesto 99 s, contro 26 s con i pulsanti ([E](ricerca/2026-09-27/E-conversazione.md)).
- **Utenti:** chi viene frainteso abbandona l'app. I nomi delle vie italiane vengono storpiati dal riconoscimento ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §9).

**Migliorie**

**M1. Richiesta di viaggio componibile.** Un solo modulo di viaggio con questi campi:
- destinazione e partenza;
- tappe: per tipo o per nome, dove (lungo il percorso, vicino alla partenza, vicino all'arrivo), durata, ordine;
- cose da evitare;
- mezzi: nessuno, permessi o preferiti; tipi; cambi massimi; minuti massimi a piedi;
- orario: partenza oppure arrivo entro.

Ogni frase produce da 1 a 4 comandi: nuovo viaggio, modifica (aggiungi, togli, sostituisci), conferma, rifiuta, annulla, avvia, ripeti, altro. Il codice:
- applica i comandi in blocco;
- risolve i riferimenti;
- cerca i luoghi;
- calcola un solo piano;
- decide cosa chiedere.

Il modello non calcola mai niente e non sceglie percorsi. Lo schema completo è in [E](ricerca/2026-09-27/E-conversazione.md) §2.

*Esempio (numeri inventati):* «Voglio andare al Duomo fermandomi a una farmacia lungo il percorso, senza mezzi pubblici» diventa:
- un comando: destinazione Duomo; tappa farmacia lungo il percorso; mezzi nessuno;
- una risposta: «Al Duomo di Milano a piedi, 25 minuti, con la farmacia San Luigi lungo la strada, 3 minuti in più. Partiamo?».

Due turni invece di nove.

**M2. Riferimenti risolti dal codice, non dal modello.** Il modello dice solo «ordinale 2», «l'altra», «l'ultimo luogo». Il codice tiene il registro dei luoghi citati e dell'ultimo elenco letto. È ciò che elimina gli errori alla ChitChatGuide.

**M3. Conferme proporzionate al rischio.**
- **Esplicite:**
  - avvio della guida verso una nuova destinazione, con una sola lettura finale di tutto;
  - rimozione di un vincolo di sicurezza (scale, attraversamenti senza semaforo o senza sonoro, strade principali);
  - attivazione dei mezzi;
  - luogo incerto, o con un concorrente vicino;
  - il turno dopo una correzione;
  - destinazione fuori dalla zona.
- **Implicite**, cioè Milo dice cosa ha cambiato e quanto costa: aggiunta di un vincolo, durata di una tappa, candidato unico, nuovo orario.
- **Nessuna:** ripeti, altro, velocità, basta.
- **Mai una domanda mentre l'utente è al bordo del marciapiede:** aspetta.

**M4. Chiedere solo ciò che manca, una cosa per volta.** Valori predefiniti:
- partenza = qui;
- orario = adesso;
- vincoli = preferenze salvate.

**M5. «Annulla» e «cosa hai capito?» sempre disponibili.** Il modulo tiene le versioni precedenti.

**M6. Preferenze e luoghi salvati, a voce:**
- «evita sempre le scale»;
- «salva questo posto come casa»;
- «portami a casa».

**M7. Interrompere Milo.** Parlare o premere il tasto lo zittisce subito.

**M8. Nomi delle vie.**
- Il riconoscimento vocale viene guidato con i nomi delle vie vicine (parole suggerite o *hotword*).
- Il nome capito viene riletto quando c'è un dubbio.
- La verifica avviene sull'elenco dei nomi della zona, per somiglianza di suono.

**M9. Tre livelli di comprensione, tutti capaci di frasi composte:**
1. **Grammatica fissa:** istantanea e offline. Diventa componibile spezzando la frase ai connettori: «e», «poi», «fermandomi», «passando da», «senza», «evitando».
2. **Router semantico:** solo per i comandi senza nomi, come «parla più piano» o «dove sono».
3. **Modello:** cloud o sul telefono, compila i comandi con uno schema vincolato.

**Aggiunte**
- **A1. Corpus di prova.** Circa 400 frasi reali in italiano e inglese, oggi assenti:
  - richieste composte;
  - correzioni;
  - riferimenti;
  - nomi di vie;
  - una parte registrata all'aperto.

  Il criterio è la corrispondenza esatta del modulo. Il corpus decide i modelli e le soglie.
- **A2. Aiuto contestuale breve** («cosa posso dire adesso?») e **tutorial vocale** alla prima apertura.
- **A3. Suggerimenti solo le prime volte**, non in coda a ogni risposta.

**Scelte tecniche da verificare sul corpus** ([E](ricerca/2026-09-27/E-conversazione.md) §3–5)
- **Modello cloud.** Secondo la classifica BFCL V4 (aprile 2026), Claude Haiku 4.5 è il più preciso tra quelli che rispondono in meno di 2 s (68,7%, 1,7 s). Oggi il predefinito è Opus 5.5: più capace, più lento. Si decide misurandoli entrambi sul corpus.
- **Modello sul telefono.**
  - Proposta: Qwen3.5-2B (1,28 GB), con uno schema grammaticale che vincola l'uscita, addestrato con LoRA su frasi italiane.
  - Da confrontare con Gemma 4 E2B.
  - Il riferimento di partenza è Qwen3-1.7B.
  - Su un telefono di fascia media i tempi vanno misurati: un solo test pubblico riporta 7 token/s e 11 s di attesa per la prima parola.
- **Embedding per il router.** Il modello che avevo scelto (multilingual-e5-small) in italiano è debole: 57,7 sul test MASSIVE-it. Le alternative:
  - EmbeddingGemma-300m: 76,3;
  - Qwen3-Embedding-0.6B: 74,0, con licenza Apache.
- **Riconoscimento vocale.**
  - **Parakeet-TDT-0.6b-v3** tramite sherpa-onnx: errore sulle parole in italiano del 3% sul test FLEURS, da 670 MB.
  - **Riconoscitore di sistema** come ripiego sui telefoni con poca memoria.
  - **Whisper tiny/base** sono troppo deboli in italiano: 30% e 18% di errore sulle parole.

**Criteri**
- La frase del Duomo produce il modulo corretto in 1 turno. Con un luogo univoco la guida parte in 2 turni.
- Sul corpus:
  - almeno 90% di moduli esatti con il modello cloud;
  - almeno 75% offline, con grammatica e modello sul telefono;
  - 0 azioni rischiose senza conferma.
- Tempi mediani di comprensione:
  - grammatica sotto 50 ms;
  - modello sul telefono sotto 3 s su fascia media, da verificare;
  - cloud sotto 2 s.
- Un nome capito male si corregge in un turno.

### 4.2 La voce di Milo: cosa e come dice

**Stato attuale**
- **Testi lunghi.** Esempi reali in italiano sui dati di Porta Romana:
  - panoramica: 55 parole;
  - inizio della passeggiata virtuale: 94 parole;
  - un passo avanti: **156 parole di fila**.
- **Riformulazione in due frasi dal modello cloud** (numeri controllati) solo con la rete. Senza rete, le prime frasi del testo.
- **Nomi presi dalla mappa così come sono**: «San Luigi snc», senza dire che è una farmacia.
- **Frasi che confondono**: «Cammina lungo via Brembo per 200 metri, poi gira a destra in via Brembo». Il marciapiede e l'attraversamento della stessa via hanno lo stesso nome.
- **Nessuna priorità tra messaggi, nessuna coda, nessun controllo del dettaglio.**
- **La voce del vecchio server era `say` di macOS**, da sostituire.

**Problemi, con le evidenze**
- **Utenti:** «troppe chiacchiere» e «manca l'informazione che serve» sono entrambe lamentele frequenti. Ci sono due regole comuni:
  - le istruzioni hanno sempre la precedenza sui luoghi di interesse;
  - la via va detta in ogni istruzione ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §3).
- **Studi sul dettaglio:** discordi, l'unica costante è poterlo regolare.
  - Mascetti 2025: istruzioni essenziali, più chiare e sicure.
  - Kacorri 2018: la modalità prolissa è la più usata.
- **Velocità:** i ciechi ascoltano più veloce dei vedenti (Bragg 2018). La velocità va alta e regolabile.
- **Ascolto dei suoni reali:** le cuffie a conduzione ossea lo riducono comunque (May & Walker 2017). Al bordo del marciapiede, silenzio.

**Migliorie**
- **Tre livelli di dettaglio** (breve, normale, dettagliato), regolabili a voce («più breve», «dimmi tutto») e nelle impostazioni. Predefinito: breve. «Altro» dà il livello successivo.
- **Esplorazione a strati.** Prima il riassunto, per esempio «Incrocio a 4 vie. Via Brembo a sinistra e a destra, via Calabiana dritto. Semaforo senza sonoro», poi i dettagli su richiesta.
- **Nomi puliti per l'ascolto:**
  - tipo più nome («la farmacia San Luigi»);
  - senza «snc», «srl», «spa»;
  - abbreviazioni sciolte («V.le» diventa «viale»).
- **Priorità e coda:** sicurezza, poi guida, poi conferme, poi informazioni. I messaggi urgenti interrompono. Niente messaggi mentre l'utente parla.
- **Direzioni:**
  - sinistra e destra per le svolte (evidenza: Jain 2024; le istruzioni INMACI);
  - le ore dell'orologio solo per i rami obliqui;
  - mai «leggermente a sinistra», perché le svolte «leggere» sono quelle eseguite peggio;
  - metri oppure passi, con il passo calibrato;
  - tutto configurabile.

  Va aggiornata la regola 3 di [`speaking-rules.md`](speaking-rules.md), che oggi preferisce le ore.
- **Frasi di guida da modelli fissi:** deterministiche, istantanee, verificate. Il modello linguistico solo per le domande generali.

**Criteri**
- Al livello breve, nessun messaggio di guida supera 20 parole e nessun riassunto di incrocio supera 25.
- Nei test, nessuna istruzione persa per sovrapposizione con il lettore di schermo.

### 4.3 Posizione e momento degli annunci: «gira adesso» nel punto giusto

**Stato attuale** (`packages/engine/src/navigate.ts`)
- **Preavvisi** a 60 m e a 25 m.
- **«Gira ora»** a 8 m, più un anticipo per la latenza della voce (2,5 s × velocità): circa **11 m prima** del punto di svolta a 1,3 m/s.
- **«Sei arrivato»** entro max(15, min(precisione, 25)) m, cioè **fino a 25 m prima**.
- **Fuori percorso** oltre max(20, min(precisione, 40)) m; ricalcolo dopo 25 s o 80 m.
- **Direzione:** bussola da fermi, direzione di marcia in movimento. Nessun conteggio dei passi, nessun aggancio al marciapiede.
- **L'incertezza della posizione non viene mai detta.**

**Problemi, con le evidenze**
- **Errore del GPS del telefono:**
  - 4,9 m a cielo aperto;
  - 7–13 m in città (Merry & Bettinger 2019), con massimi oltre 30 m;
  - oltre 50 m nei canyon urbani.
- **Lato della strada:** a Londra il GPS lo indovina nel 24,8% dei casi, il 54,5% con tecniche 3D (Wang 2015).
- **Due frequenze (L1/L5):** molti Android recenti e iPhone Pro dal 14. Aiuta, ma nei canyon non basta.
- **Rimedi documentati:**
  - le correzioni di Google per i pedoni riducono del 50–75% gli errori di lato della strada;
  - l'aggancio al marciapiede porta sotto i 5 m, con il lato corretto (Weng 2025).
- **Posizionamento visivo** (ARCore Geospatial, VPS):
  - circa 0,8 m, contro circa 7 m di GPS e bussola (Brata 2024);
  - servono fotocamera, rete e un servizio Google;
  - la copertura di Milano è probabile, da verificare via per via.
- **Passi:** con il bastone il passo medio è 0,55 m (col cane 0,62, un vedente 0,74), e i modelli tarati sui vedenti falliscono (Ren 2021). Il passo va calibrato su ogni utente.
- **Schema in tre tempi** di NavCog3 (errore di 1,65 m, al chiuso): dopo ogni svolta distanza e prossima azione, poi «in avvicinamento», poi «gira». Riescono il 93,8% delle svolte.
- **Utenti:** «dice che sono arrivato ma sono dall'altra parte della strada» è la lamentela numero 1 ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §1).

**Migliorie**

**Annunci per livello di incertezza** (r = raggio al 95%):
- **r ≤ 5 m:** «Gira a sinistra adesso».
- **5–15 m:** «Al prossimo incrocio, tra circa 30 metri, gira a sinistra in via Brembo». L'annuncio è legato all'incrocio, non al metro.
- **r > 15 m:** «Segnale GPS debole, posizione incerta di circa 40 metri. Prosegui su via Dante, ti avviso appena migliora».
- Ogni cambio di livello viene detto, e «dove sono?» riporta anche la precisione.

**Altre migliorie:**
- **Riferimenti fisici al posto dei metri:**
  - «alla fine dell'isolato»;
  - «dopo l'attraversamento»;
  - «se arrivi a via X l'hai superata». Le indicazioni scritte dai ciechi stessi contengono questo avviso (Scheuerman 2017).
- **Fusione dei sensori nel modulo nativo:**
  - GPS a 1 Hz;
  - passi calibrati sull'utente;
  - giroscopio e bussola;
  - aggancio al grafo dei marciapiedi;
  - uso degli attraversamenti come punti di riferimento, che dimezza l'errore (Daniş 2025).
- **Conferma della svolta dal giroscopio:** «sei su via Brembo» quando l'utente ha davvero girato, non quando lo dice il GPS.
- **«Adesso» calcolato sulla latenza reale della voce**, misurata sul telefono, non con una costante.
- **Arrivo:** mai «sei arrivato» dentro l'errore del GPS. Si dice «in avvicinamento» e si passa alla modalità arrivo (§4.7).
- **Modalità precisione con fotocamera**, opzionale, per attraversamenti e ingresso della destinazione, con il telefono al petto o in mano (→ decisione 4).

**Criteri** (misurati sul campo, registrando GPS, passi e annunci, e confrontando con la verità a terra)
- «Adesso» detto solo con r ≤ 5 m. In quei casi l'errore sul momento dell'annuncio è al massimo 2 m nel caso mediano e 5 m al 95° percentile.
- Nessun «sei arrivato» con r > 10 m. In modalità precisione, al massimo 5 m dall'ingresso.
- Zero falsi «fuori percorso» in 30 minuti di cammino in centro.

### 4.4 Attraversamenti e incroci: dove sono le strisce

**Stato attuale**
- **Cosa conosce il motore:** semaforo (sì, no, ignoto), sonoro (sì, no, ignoto), percorso tattile (letto ma mai detto).
- **Annunci:**
  - a 30 m: «Tra 20 metri, attraversamento con semaforo, senza segnale sonoro»;
  - a 5 m più l'anticipo: «attraversamento qui».
- **Cosa non conosce e non dice:**
  - posizione delle strisce rispetto all'angolo;
  - isola spartitraffico;
  - corsie e lunghezza;
  - senso di marcia;
  - binari del tram;
  - pista ciclabile;
  - bordo ribassato;
  - pulsante, e dove si trova;
  - vibrazione;
  - codici LOGES.
- **Percorsi:** evitano, se richiesto, i semafori senza sonoro e gli attraversamenti senza semaforo. Non preferiscono le strisce e non penalizzano tram e ciclabili.

**Problemi, con le evidenze**
- **Senza semaforo sonoro:** solo il 48,6% degli attraversamenti parte con il verde, con 6,4 s di ritardo medio (Barlow 2005). Con il sonoro il ritardo scende di circa 2 s (Scott 2008).
- **Le descrizioni a voce dell'incrocio** aiutano a decidere quando attraversare, non a restare sulle strisce (Guth 2019). L'allineamento e il momento restano compito di bastone, O&M, sonoro e percorso tattile. **Milo informa, non comanda.**
- **Italia:** gli istruttori O&M preferiscono gli attraversamenti con le strisce, a differenza degli USA (Ahmetovic 2017).
- **Utenti:** la mancanza di informazioni su incroci e attraversamenti è la seconda lamentela per gravità. A Torino i semafori sonori coprono circa 80 attraversamenti su 600 incroci (UICI 2020).
- **Dati OSM di Milano** (conteggi del 27/09/2026, [F](ricerca/2026-09-27/F-contesto-italiano.md) §4):
  - 22.660 attraversamenti: l'85% con il tipo, il 49% con la segnaletica, il 41% con il percorso tattile indicato (841 «sì»);
  - 5.532 semafori pedonali: il 40% con il sonoro rilevato (1.409 sì, 827 no), 463 con la vibrazione;
  - 37.108 bordi del marciapiede;
  - 2.442 km di marciapiedi mappati a sé.

  Sono dati ricchi, ma il motore ne usa una parte.
- **Semafori e LOGES in Italia:**
  - nessun open data comunale sui semafori sonori a Milano (Firenze lo pubblica);
  - ai semafori il percorso LOGES passa a 40–60 cm dal palo del pulsante;
  - il «pulsante per non vedenti» attiva il suono, non necessariamente il verde. Occhio al tag `button_operated`.

**Migliorie**
- **Descrizione prima di ogni attraversamento**, a distanza utile e non al bordo:
  - tipo (semaforo, strisce, niente);
  - sonoro, pulsante (e dove) e vibrazione;
  - isola;
  - corsie e lunghezza;
  - senso di marcia;
  - tram e ciclabile;
  - percorso tattile;
  - bordo ribassato;
  - e cosa la mappa non sa.
- **Posizione delle strisce rispetto a un riferimento fisico**, calcolata dalla geometria OSM: «le strisce sono circa 5 metri prima dell'angolo, sulla tua destra». Senza fotocamera, mai «sei sulle strisce».
- **Silenzio al bordo del marciapiede.**
- **Percorsi che scelgono gli attraversamenti:**
  - costo: sonoro < semaforo < strisce < nessuno, regolabile;
  - penalità per tram e ciclabili;
  - preferenza per le strisce, che in Italia è la scelta indicata dagli istruttori O&M.
- **«Descrivi questo incrocio»** su richiesta, in entrambe le fasi.
- **Segnalazioni:** «qui il sonoro non funziona» diventa una nota sul telefono e, se l'utente vuole, una nota OSM.
- **Dati in più:**
  - open data dove esistono (Firenze);
  - scavi e manomissioni del suolo di Milano, un elenco quotidiano (dataset ds925);
  - una convenzione OSM per i codici LOGES da proporre alla comunità italiana, perché oggi `tactile_paving:type` in Italia è usato 0 volte.

**Criteri**
- **Informazioni corrette:** su 50 attraversamenti reali a Milano, quanto viene detto corrisponde al terreno in almeno il 95% dei casi in cui la mappa ha il dato. Quando non lo ha, Milo lo dice.
- **Posizione delle strisce:** rispetto all'angolo, corretta entro 2 m sullo stesso campione.

### 4.5 Pianificazione del percorso

**Stato attuale**
- **Percorsi:** A (strade principali o meno problemi), B (il più breve), C (mezzi pubblici).
- **Vincoli:** attraversamenti senza semaforo, semafori senza sonoro, scale, cantieri, strade principali, cambi, minuti massimi a piedi.
- **Una sola tappa**, solo per tipo (supermercato, farmacia, bar, panetteria, bancomat, negozio), scelta fra 3 candidati.
- **Mancano:**
  - il vincolo «niente mezzi»;
  - più tappe;
  - la tappa per nome («alla farmacia Ripamonti»);
  - i passaggi obbligati («passando dal parco»);
  - «arrivare entro»;
  - la scelta del tipo di mezzo;
  - tram e ciclabili nel costo.
- **Sui mezzi nessuna guida:** quale fermata, quante fermate, quando scendere. A Milano non c'è tempo reale aperto: ATM non pubblica GTFS-RT.

**Problemi, con le evidenze**
- **Percorso migliore:** quello «sicuro e ben servito», con meno svolte e più semafori, non il più breve. Si calcola su marciapiedi e attraversamenti, non sull'asse della strada (El-taher 2021).
- **Utenti:** un ricalcolo che riporta soltanto al percorso originale fa abbandonare l'app ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §15).

**Migliorie**
- **Motore:**
  - vincolo mezzi (nessuno, permessi, preferiti; tipi; cambi massimi; minuti massimi a piedi);
  - fino a 3 tappe ordinate;
  - tappa per nome o per tipo;
  - passaggi obbligati;
  - «arrivare entro».
- **Costo di sicurezza, secondo il profilo dell'utente:** numero di svolte, attraversamenti per tipo, tram, ciclabili, strade principali.
- **Tratte con i mezzi:**
  - fermata descritta (pensilina, palo);
  - linea;
  - fermate contate e avviso prima di scendere;
  - uscita dalla stazione, dai dati OSM;
  - tempo reale dove esiste: Roma, Torino e Venezia hanno GTFS-RT; a Milano c'è solo l'API regionale E015, che ha vincoli d'uso.
- **Piano:** riassunto breve, dettagli su richiesta.

**Criteri**
- La frase del Duomo produce un percorso a piedi con una farmacia lungo la strada (deviazione minima) e zero tratte con i mezzi.
- Test differenziali e nuovi casi per tappe multiple e vincoli sui mezzi.

### 4.6 Esplorazione prima del viaggio (Fase A)

**Stato attuale**
- **Panoramica:** ferrovia, cantieri, strade principali, ponti.
- **Passeggiata virtuale libera:** da incrocio a incrocio con le ore dell'orologio, da 94 a 156 parole per incrocio.
- **6 domande sulla mappa:**
  - distanza a piedi contro linea d'aria;
  - cosa c'è in mezzo;
  - se una via continua o è chiusa;
  - quanto è grande un luogo;
  - quanti modi indipendenti ci sono per arrivarci;
  - orari e accessibilità di un luogo.
- **Mancano:**
  - la prova del percorso pianificato;
  - la descrizione degli incroci con i loro attraversamenti;
  - «cosa c'è su questa via»;
  - il salvataggio.

**Problemi, con le evidenze**
- **Prova virtuale:** funziona. Ci sono due modalità: «salto», di svolta in svolta, e «passo», passo passo (Guerreiro 2017/2020, 14 utenti).
- **Esplorazione libera:** aiuta a scoprire scorciatoie (Connors 2014).
- **Girarsi fisicamente** verso ogni tratto aiuta (Giudice 2010).
- **Nessuna app** fa provare un percorso calcolato, incrocio per incrocio, con i dettagli degli attraversamenti ([C](ricerca/2026-09-27/C-soluzioni-esistenti.md)).
- **Utenti:** vogliono simulare percorsi che partono da un punto diverso dalla posizione attuale ([B](ricerca/2026-09-27/B-voci-degli-utenti.md)).

**Migliorie**
- **«Fammi provare il percorso»**, a salti o passo passo:
  - le stesse frasi della guida reale, con la descrizione di ogni attraversamento;
  - l'utente si gira davvero, telefono in mano, verso ogni tratto;
  - il punto di partenza può essere diverso dalla posizione attuale.
- **Esplorazione a strati:** riassunto, poi dettagli.
- **«Cosa c'è su questa via»:** luoghi per categoria, lato della strada, distanza.
- **Domande sulla mappa anche con frasi libere e composte.**
- **Luoghi e percorsi salvati**, con esportazione GPX (compatibile con Soundscape e VoiceVista).

**Criteri**
- Dopo la prova, gli utenti ripetono la sequenza delle svolte.
- Confronto sul campo in una fase successiva.

### 4.7 Navigazione in strada (Fase B)

**Stato attuale:**
- soglie come in §4.3;
- ricalcolo sul percorso A;
- «dove sono» durante la guida dice la prossima istruzione e la distanza che resta;
- nessuna modalità arrivo, nessuna pausa, nessuna guida sui mezzi;
- l'app, e quindi il funzionamento in background, non esiste ancora.

**Migliorie**
- **Tutto a schermo bloccato, col telefono in tasca:**
  - su Android un servizio in primo piano di tipo «location», con «microphone» e «mediaPlayback»;
  - su iOS posizione e audio in background;
  - aiuto per i telefoni che chiudono le app in background (Samsung e altri).
- **Schema in tre tempi** più la conferma dopo la svolta (§4.3).
- **«Dove sono?» in qualsiasi momento:** la via, il lato della strada (solo se affidabile), il prossimo incrocio e la precisione.
- **«Pausa» e «riprendi».**
- **Modalità arrivo:**
  - lato della strada;
  - ingresso, dai nodi `entrance` di OSM;
  - negozi vicini come riferimenti;
  - conto alla rovescia (50, 25, 10 m) solo se la precisione lo permette;
  - poi fotocamera o aiuto umano (Be My Eyes, chiamata a un contatto).

  Evidenza: per 11 persone su 22 trovare la porta giusta è la parte più difficile (Saha 2019).
- **Ricalcolo** che rispetta vincoli e preferenze e sceglie il percorso migliore da dove si è, non solo «torna al percorso».
- **Avvisi:** GPS debole o perso, batteria bassa, cuffie scollegate (pausa e vibrazione).
- **Batteria:** frequenza del GPS adattiva e modalità sospensione.
- **Emergenza:** «condividi la mia posizione», «chiama [contatto]».

**Criteri**
- 60 minuti di guida a schermo bloccato, senza interruzioni, su 3 telefoni Android (almeno un Samsung).
- Consumo misurato: obiettivo sotto il 5% l'ora, oggi solo una stima da verificare.

### 4.8 App, accessibilità e impostazioni

**Stato attuale:** la vecchia web app ha alcune buone pratiche (regione live, collegamento «salta al contenuto») e va sostituita. L'app per telefono non esiste ancora.

**Requisiti di accessibilità** (VoiceOver e TalkBack, [D](ricerca/2026-09-27/D-piattaforma-e-precisione.md) §1)
- **Ogni controllo** ha etichetta, ruolo e stato.
- **Lettura:** ordine logico, intestazioni per sezione, nessun limite di tempo, focus gestito dopo ogni cambio di schermata.
- **Magic tap su ogni schermata di iOS** = parla oppure zittisci.
- **Lo stato vocale non ripete ciò che dice già la voce di Milo.**
- **A ogni rilascio:** test automatici e prove manuali con VoiceOver e TalkBack. Gli utenti abbandonano le app quando un aggiornamento rompe l'accessibilità ([B](ricerca/2026-09-27/B-voci-degli-utenti.md) §15).

**Impostazioni: due strade per ogni opzione**
- **A voce:**
  - «parla più piano»;
  - «dettaglio breve»;
  - «usa i passi»;
  - «evita sempre le scale»;
  - «salva questo posto come casa»;
  - «usa la voce di VoiceOver».

  Milo conferma il nuovo valore.
- **Schermata classica**, da scorrere con VoiceOver o TalkBack:
  - una riga per impostazione, con il valore nell'etichetta;
  - interruttori veri («switch»);
  - velocità, dettaglio e unità come controlli regolabili (scorri su e giù);
  - elenchi lunghi in sottoschermate;
  - sezioni con intestazione, per saltare da una all'altra.

**Elenco delle impostazioni (bozza)**
1. Lingua.
2. Voce: del sistema, di VoiceOver su iOS, oppure scaricata. Poi velocità, volume della guida, suoni, vibrazioni.
3. Dettaglio: breve, normale o dettagliato; suggerimenti sì o no.
4. Direzioni: sinistra/destra, ore o gradi; metri o passi, con la calibrazione del passo.
5. Guida:
   - anticipo dei preavvisi;
   - attraversamenti: sempre, oppure solo senza semaforo;
   - promemoria nei silenzi;
   - modalità precisione con fotocamera.
6. Percorsi predefiniti: scale, attraversamenti senza semaforo, semafori senza sonoro, strade principali, mezzi, massimo a piedi.
7. Luoghi salvati.
8. Comandi: tasto delle cuffie, magic tap, scorciatoie.
9. Intelligenza artificiale: nessuna, sul telefono (con il download del modello), oppure cloud (fornitore e chiave).
10. Mappe offline: città scaricate, aggiornamento.
11. Privacy: cosa esce dal telefono, cancella tutto.
12. Aiuto e tutorial.

### 4.9 Dati della mappa e trasparenza

**Stato attuale**
- Mappa OSM scaricata per zona.
- Regola dei numeri e «cosa non so» già presenti.
- Le fonti del vecchio sistema erano identificativi OSM letti ad alta voce: inutili per chi ascolta.

**Migliorie**
- **Pacchetti città con statistiche di completezza**, per dirle all'utente. Per esempio: «qui il sonoro dei semafori è rilevato in 4 casi su 10».
- **Fonti leggibili:** «mappa OpenStreetMap del 20 settembre», al posto degli identificativi.
- **Dati comunali aperti** (scavi del giorno a Milano, semafori a Firenze), con la loro fonte.
- **Convenzione OSM per i codici LOGES** da proporre alla comunità italiana.
- **Segnalazioni degli utenti**, che diventano note OSM.

### 4.10 Sicurezza, responsabilità, privacy

- **Sicurezza:**
  - complemento, mai sostituto: lo si dice al primo avvio e nel testo di presentazione;
  - mai «puoi attraversare»;
  - «sei arrivato» solo con prudenza.
- **Responsabilità** ([F](ricerca/2026-09-27/F-contesto-italiano.md) §6):
  - dal 9 dicembre 2026 il software è un «prodotto» per la direttiva UE 2024/2853;
  - il software open source non commerciale è escluso, ma non se ottenuto in cambio di dati personali;
  - uno scopo dichiarato come «compensare una disabilità» può rendere l'app un dispositivo medico di classe I (regolamento MDR).

  Il testo va scritto con attenzione e fatto vedere a un legale (→ decisione 5).
- **Privacy:**
  - niente account;
  - niente telemetria di posizione;
  - niente registro delle frasi;
  - valutazione d'impatto (DPIA) prima del rilascio pubblico.

### 4.11 Prove con persone cieche

- **Co-progettazione:** UICI Milano, Istituto dei Ciechi di Milano, istruttori O&M (ANIOMAP).
- **Tre livelli di prova:**
  1. corpus di frasi, automatico;
  2. prove in laboratorio con VoiceOver e TalkBack;
  3. prove sul campo a Milano, registrando posizione, passi e annunci e confrontandoli con la verità a terra.
- **Misure:**
  - turni per partire;
  - errori di comprensione;
  - momento degli annunci rispetto al punto reale;
  - falsi «fuori percorso»;
  - attraversamenti descritti correttamente;
  - consumo di batteria;
  - soddisfazione (questionario SUS).

---

## 5. Ordine di lavoro proposto

Ogni fase finisce con una prova con utenti ciechi, prima di passare alla successiva.

1. **Fase 1: comunicazione e fondamenta dell'app** (la tua priorità)
   1. Corpus di frasi in italiano e inglese, e sistema di valutazione.
   2. Modulo di viaggio componibile, gestione del dialogo, riferimenti, conferme, preferenze e luoghi salvati.
   3. Motore:
      - vincolo sui mezzi;
      - più tappe, anche per nome;
      - nomi puliti;
      - testi a strati (riassunto e dettagli);
      - attraversamenti con tutti i dati OSM disponibili.
   4. App Android per parlare con Milo:
      - tasto delle cuffie e magic tap;
      - voce propria coordinata col lettore di schermo;
      - impostazioni a voce e classiche;
      - funzionamento a schermo bloccato.
2. **Fase 2: guida precisa e attraversamenti.** Fusione dei sensori, livelli di incertezza, posizione delle strisce, prove sul campo a Milano.
3. **Fase 3: prova del percorso ed esplorazione a strati.**
4. **Fase 4: offline completo** (pacchetti città, modelli sul telefono), **iOS e web.**
5. **Fase 5: mezzi pubblici guidati e modalità arrivo**, con la fotocamera.

---

## 6. Decisioni che servono da te

1. **Ordine delle fasi:** va bene così, o si cambia?
2. **Server:** tre possibilità:
   - nessun server nostro, con la chiave dell'utente e il modello sul telefono;
   - un server nostro con quota;
   - solo file statici (pacchetti città e modelli).
3. **Prove con persone cieche:** hai contatti (UICI Milano, Istituto dei Ciechi, istruttori O&M) o li cerchiamo?
4. **Fotocamera** (posizionamento visivo, modalità arrivo): dalla Fase 2 o più avanti?
5. **Testo di presentazione e rischio dispositivo medico:** lo vediamo con un legale prima del primo rilascio pubblico?
6. **Modello cloud predefinito:** lo decide il corpus (il più veloce che raggiunge i criteri), o preferisci fissarlo ora?
