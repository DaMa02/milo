# Ricerca Track 2 · I Missed That

Fonte: ricerca web con agente Claude, 25/09/2026. I punti non verificati sono segnalati in fondo.

## 1. Problema

- **Gruppi** (cena, riunione): i turni si prendono con segnali che si sentono, non che si vedono. Chi non sente perde il filo, i cambi di argomento e le domande rivolte a lui ([dinner table syndrome](https://nsuworks.nova.edu/tqr/vol25/iss6/16/)).
- **Fatica**: sulle labbra si vede solo il 20–30% di quello che si dice (stima sull'inglese, [CHA](https://centerforhearingaccess.org/glossary/speechreading/)). Lo sforzo prolungato stanca ([Hornsby 2013](https://pubmed.ncbi.nlm.nih.gov/23426091/)) e prima o poi l'attenzione cala.
- **Rumore, lezioni, call**: lo sguardo si divide tra slide, persona e didascalie, che arrivano in ritardo. Un "come vedete qui" non si capisce a cosa si riferisca.
- **Annunci**: il servizio LIS di [Trenitalia](https://www.trenitalia.com/it/informazioni/servizio-lis.html) copre biglietteria e assistenza, non gli annunci.
- **Oltre le parole**: allarmi, risate, ironia, chi sta parlando.

**Due gruppi di utenti diversi**
- **Sordi segnanti**: la LIS è riconosciuta per legge dal [2021](https://www.brocardi.it/decreto-sostegni/titolo-v/art34ter.html). Secondo l'[ENS](https://www.ens.it/lingua-dei-segni/), per molti di loro "la lingua parlata rimane sempre una lingua straniera o seconda lingua". Quindi anche l'italiano scritto può essere una seconda lingua, e un testo non sostituisce l'interprete.
- **Ipoacusici e persone diventate sorde da adulte**: spesso anziani, con l'italiano come prima lingua. Sono la maggioranza e i principali utenti delle didascalie.

**Numeri**
- Nel mondo oltre 1,5 miliardi di persone hanno una perdita uditiva ([OMS](https://cdn.who.int/media/docs/default-source/documents/health-topics/deafness-and-hearing-loss/world-report-on-hearing/wrh-executive-summary.en.pdf)), 430 milioni in forma disabilitante. Nel 2050 saranno 2,5 miliardi ([OMS](https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss)).
- In Italia circa 7,2 milioni di ipoacusici ([AIRS 2018](https://www.pioistitutodeisordi.org/sordita-7-milioni-ne-soffrono-ma-pochi-corrono-ai-ripari/)) e circa 40.000 sordi segnanti ([EUD](https://eud.eu/member-countries/italy/)). Le stime però non concordano: altre fonti parlano di 3,5 milioni.

## 2. Stato dell'arte

**Google**
- [Live Transcribe](https://www.android.com/accessibility/live-transcribe/) avvisa quando qualcuno dice il tuo nome e segnala le sirene.
- [Live Caption](https://support.google.com/accessibility/android/answer/9350862?hl=en) funziona anche in italiano.
- [Expressive Captions](https://blog.google/products-and-platforms/platforms/android/google-android-expressive-captions/) esiste solo in inglese.

**Apple**
- Sound Recognition, Name Recognition e Live Listen esistono già, ma le Live Captions **non sono disponibili in italiano** ([Apple](https://www.apple.com/ios/feature-availability/)).
- Il 9 settembre 2026 ha annunciato **Live Rewind** (gli ultimi 15 secondi mostrati come testo) e **Siri Recap** per Watch Series 12 ([MacRumors](https://www.macrumors.com/2026/09/09/audio-intelligence-features/)). Usciranno in beta entro fine 2026, all'inizio solo in inglese e non subito in UE.
- Questo annuncio conferma che il problema esiste, ma alza l'asticella.

**Altri prodotti**
- [Ava](https://help.ava.me/en/articles/9715516-speakerid-for-live-captioning-on-mobile-beta): didascalie di gruppo con un colore per ogni persona che parla.
- [Otter](https://help.otter.ai/hc/en-us/articles/360047247414-Supported-languages): non supporta l'italiano.
- [Zoom](https://library.zoom.com/zoom-workplace/artificial-intelligence/artificial-intelligence-bluepaper/ai-companion/ai-companion-features/zoom-meetings): ha già "Catch me up" per le riunioni online.
- Occhiali con didascalie: AirCaps (co-fondata da uno studente di [Stanford](https://stanforddaily.com/2023/02/06/stanford-startup-transcribeglass-seeks-to-bring-ease-and-affordability-to-assistive-technology/)) e XRAI ([rassegna](https://www.hearingtracker.com/hearing-glasses/hear-with-your-eyes-five-ar-live-captioning-glasses)).

**Ricerca**
- SoundWatch ([Jain, Findlater](https://dl.acm.org/doi/10.1145/3373625.3416991)), avvisi sui suoni da smartwatch.
- SoundWeaver: combina le informazioni di più sistemi AI in base a cosa l'utente vuole sapere ([CHI 2025](https://doi.org/10.1145/3706598.3714268)).
- SpeechBubbles: didascalie ancorate a chi parla ([CHI 2018](https://dl.acm.org/doi/abs/10.1145/3173574.3173867)).
- Tono e intonazione resi con la grafica del testo ([CHI 2023](https://dl.acm.org/doi/10.1145/3544548.3581511)).
- Nei piccoli gruppi i problemi principali sono il ritardo e capire chi ha detto cosa ([CSCW 2021](https://arxiv.org/abs/2109.10412)).

**Cosa resta aperto**
- un riepilogo di ciò che ti sei perso in una conversazione dal vivo, in italiano;
- le domande rivolte a te;
- risate e ironia dentro il testo;
- i riferimenti a cose che si vedono;
- **la verificabilità**: chi non sente non può riascoltare l'audio, quindi se un riassunto è sbagliato non se ne accorge.

## 3. Fattibilità in un giorno

Servizi di trascrizione in tempo reale:

| Servizio | Italiano | Distingue chi parla | Note |
|---|---|---|---|
| [Deepgram Nova-3](https://deepgram.com/pricing) | sì | sì, anche con un [microfono per canale](https://developers.deepgram.com/docs/multichannel) | ritardo sotto i 300 ms (dato del fornitore), $200 di credito gratuito |
| [AssemblyAI](https://www.assemblyai.com/blog/introducing-multilingual-universal-streaming) | sì | [in beta](https://www.assemblyai.com/blog/streaming-speaker-diarization) | $0,15/h, $50 di credito |
| [Speechmatics](https://docs.speechmatics.com/speech-to-text/realtime/realtime-diarization) | sì | sì, per voce o per canale | $100 di credito |
| [OpenAI live](https://developers.openai.com/api/docs/guides/realtime-transcription) | sì | no | $0,017/min |
| [Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) | sì | no | gratis; in Chrome l'audio passa dai server Google |

- **Scelta consigliata**: Deepgram, con Web Speech come riserva. Gemini 3.5 Transcribe è ancora in [anteprima](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-5-transcribe/). I modelli da far girare in locale (Whisper, Parakeet) richiedono troppa configurazione per un giorno.
- **Riconoscimento dei suoni**: [YAMNet tramite MediaPipe](https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier) gira direttamente nel browser. Conviene limitarsi a risate, applausi e allarmi.
- **Modello linguistico**: Claude non accetta audio ([API](https://platform.claude.com/docs/en/api/messages)), quindi lavora sul testo prodotto dalla trascrizione.
  - Un modello veloce (Haiku) aggiorna l'argomento corrente ogni 20 secondi circa.
  - Un modello più forte scrive il riepilogo in JSON, indicando le frasi originali da cui prende ogni punto.
  - Con le immagini può leggere slide e biglietti.
- **Demo in una sala rumorosa**:
  - due microfoni a clip, uno sul canale sinistro e uno sul destro, così il sistema sa chi parla senza doverlo indovinare;
  - una conversazione registrata in anticipo da far passare nello stesso sistema;
  - un video di riserva;
  - consenso dei presenti e nessun audio salvato.

## 4. Lessico e trappole

- **Termini**:
  - Usate *persone sorde* e *ipoacusici*. In inglese *deaf*, *Deaf* (con la maiuscola indica l'identità culturale) e *hard of hearing*.
  - Evitate *hearing impaired* ([NDC](https://nationaldeafcenter.org/resources/deaf-awareness/)) e *sordomuto*, eliminato dalla legge nel 2006 ([Crusca](https://accademiadellacrusca.it/it/consulenza/sulla-distinzione-tra-sordi-e-sordomuti/22209)).
  - Evitate anche *non udente* e *linguaggio dei segni*: si dice *lingua dei segni* ([Pio Istituto](https://www.pioistitutodeisordi.org/sordita-e-lessico-facciamo-chiarezza-sulle-parole-da-usare/)).
- **"Disability dongle"** ([Liz Jackson](https://blog.castac.org/2022/04/disability-dongle/)): la soluzione tecnologica brillante a un problema che le persone disabili non sentono di avere. L'esempio classico sono i [guanti che "traducono" i segni](https://en.wikipedia.org/wiki/Sign_language_glove). Non promettete avatar che segnano in LIS ([WFD](https://wfdeaf.org/news/resources/wfd-wasli-statement-use-signing-avatars/)).
- **"Nothing about us without us"**: dite con chi avete parlato. Anche 15 minuti con una persona sorda fanno la differenza.
- **Niente simulazioni** del tipo "mettiti le cuffie e prova": aumentano lo stigma ([rassegna](https://link.springer.com/rwe/10.1007/978-3-031-40858-8_11-1)).
- **Le didascalie da sole non bastano**, e ai segnanti non servono quanto agli altri. Progettate anche per le persone udenti presenti, e parlate di accesso, non di cura.

## 5. Cosa premiano i giudici

- **Criteri**: non sono pubblicati. Di solito negli hackathon sull'accessibilità contano:
  - un problema confermato da chi lo vive ([UW CREATE](https://create.uw.edu/2026-create-accessibility-hackathon/));
  - una demo che funziona davvero;
  - l'onestà sui limiti.
- **Ricercatori**: cercano novità e test con utenti sordi. La percentuale di parole trascritte male conta poco, perché per le didascalie automatiche è poco legata al giudizio degli utenti ([ASSETS 2026](https://arxiv.org/abs/2609.11408)).
- **Anthropic** (è una deduzione): un uso di Claude con fonti citate, incertezza dichiarata e attenzione alla privacy.
- **Generali**: l'impatto su clienti e dipendenti. Offre già ai dipendenti un servizio di interpreti LIS in videochiamata ([VEASYT](https://www.veasyt.com/it/post/generali-lis-per-dipendenti-sordi.html)).

**Non verificato**
- criteri di giudizio e abbinamento tra track e partner;
- numeri italiani;
- ritardi dichiarati dai fornitori;
- lavori recenti di MIT e Stanford su questo tema.
