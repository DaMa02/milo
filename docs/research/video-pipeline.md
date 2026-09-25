# Ricerca · pipeline per il video demo

Fonte: Codex (web search), 25/09/2026.

La scelta pragmatica: fate un video **guidato dal prodotto reale**, non un “one-shot AI film”. Usate il codice per packaging, ritmo e accessibilità; usate registrazioni del prodotto per dimostrare che funziona davvero. Per una squadra di due persone con poche ore, sceglierei **HyperFrames** se volete massima resa da Claude/Codex, con Remotion come alternativa più matura.

Sul post Reddit: il contenuto originale non è stato leggibile direttamente. Le copie indicizzate riportano un unico prompt che chiedeva a Opus di “creare e renderizzare programmaticamente” un video surreale di un minuto, in circa 45 minuti; non indicano in modo affidabile un framework preciso. Un progetto Opus 5.5 correlato e verificabile, **PDoomVideo**, usa p5.js/p5.brush, Chrome headless e ffmpeg per dipingere frame e codificarli: bello come prova tecnica, ma non è il flusso giusto per una demo hackathon professionale. [Prompt ripubblicato](https://go.tabbit.ai/model/claude-opus-5-5/prompts/reddit-one-shot-creepy-workplace-video-prompt), [PDoomVideo](https://github.com/JohnHeibel/PDoomVideo).

## Tool da scegliere

| Opzione | Quando usarla | Avvio |
|---|---|---|
| **HyperFrames — consigliata** | Landing/video pitch con screenshot, clip UI, caption, lower third e animazioni web. È progettata esplicitamente per agenti: HTML/CSS/GSAP, skill per Claude Code e Codex, preview e render locale deterministico con Chrome+ffmpeg. Gratis/open source in locale, senza crediti HeyGen. | `npx skills add heygen-com/hyperframes`, poi `npx hyperframes init my-video`; render finale: `npx hyperframes render --quality high --fps 30 --output final.mp4`. [Quickstart](https://hyperframes.heygen.com/quickstart), [render/QA](https://hyperframes.heygen.com/guides/video-editor-cheatsheet) |
| **Remotion — alternativa solida** | Se uno di voi conosce React o vuole componenti più strutturati e riusabili. Per il vostro team di 2 la licenza Free è valida anche per uso commerciale e automazione, senza differenze funzionali. | `npx create-video@latest --yes --blank my-video`, `npm i`, `npx remotion skills add`, `npm run dev`. [Starter e agent skills](https://www.remotion.dev/docs), [licenza aggiornata](https://convert.remotion.dev/docs/license/faq) |
| Revideo | Buona alternativa TypeScript, moderna e MIT; ha player, audio/video e render headless. Meno collaudata per voi rispetto a Remotion/HyperFrames. | `npm init @revideo@latest`, preview `npm start`, render `npm run render`. [Docs](https://docs.re.video/installation-and-setup/), [repo/licenza](https://github.com/midrender/revideo) |
| Motion Canvas / Manim | Solo per una breve visualizzazione concettuale: diagramma animato, numeri, flusso. Non costruite il pitch intero qui. Motion Canvas è TypeScript con preview; Manim è ottimo ma introdurre Python/LaTeX durante l'evento è un rischio. | Motion Canvas: `npm init @motion-canvas@latest`; Manim è MIT e va installato in un ambiente Python dedicato. [Motion Canvas](https://motioncanvas.io/docs/quickstart/), [Manim](https://docs.manim.community/en/stable/) |

## Pipeline concreta

Durata obiettivo: **2:10–2:30**, non tre minuti pieni. Script di circa **290–330 parole in inglese**, oppure 260–300 in italiano, a seconda della velocità della voce.

1. **Struttura narrativa:** 0–8 s hook/problema; 8–30 s per chi è escluso e perché conta; 30–95 s demo in tre azioni; 95–125 s impatto/accessibilità; ultimi 10–15 s team, call to action e URL/QR.
2. **Voice-over:** per inglese naturale usate OpenAI `gpt-4o-mini-tts` con voce `marin` o `cedar`; supporta anche l’italiano, ma le voci sono ottimizzate per inglese. [Documentazione OpenAI TTS](https://developers.openai.com/api/docs/guides/text-to-speech). Per italiano più espressivo, ElevenLabs multilingual è una scommessa migliore e il suo endpoint TTS restituisce timing di allineamento, utile per creare sottotitoli accurati. [TTS con timestamp](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps). Kokoro locale è un fallback economico/open-weight, ma fate un test voce prima: non sacrificare naturalezza per gratuità.
3. **Demo reale:** registrate tre clip da 8–15 secondi con QuickTime/⌘⇧5, una finestra pulita, dati fittizi ma credibili, niente notifiche. QuickTime supporta “New Screen Recording”. [Apple Support](https://support.apple.com/en-ie/guide/quicktime-player/qtp97b08e666/mac). Registrate a risoluzione più alta del 1080p se possibile; poi l’agente può fare crop/zoom digitale pulito, cerchio del click e cursore evidenziato in composizione.
4. **Composizione:** intro/outro statici, massimo due font e tre colori; title card, 2–3 lower third, transizioni sobrie. Musica strumentale sotto il voice-over a volume molto basso, con fade-in/out.
5. **Accessibilità:** generate sia sottotitoli **burned-in** leggibili sia un file `.srt` separato; massimo due righe, contrasto alto, mai sovrapposti a elementi essenziali. Aggiungete nel parlato le informazioni visive decisive (“selezioniamo il profilo ad alto contrasto…”). Se potete, consegnate anche `final-accessible-AD.mp4`, con una traccia di audio-descrizione breve nelle pause, oppure un transcript descrittivo. WCAG tratta caption e audio-description/media alternative come requisiti distinti per media preregistrati. [W3C: descrizione visiva](https://www.w3.org/WAI/media/av/description/).

## Tempo

**Prima dell'evento, 60–90 minuti:** decidete lingua e messaggio; fate una brand sheet minima; create lo scaffold HyperFrames; preparate intro/outro/lower third/caption style; scegliete e testate una voce; fate un render di prova da 10 secondi in 1080p. Non costruite scene finali prima di conoscere l’interfaccia reale.

**Il giorno dell'evento, 15:00–16:30:**

- 15:00–15:12: congelate script e tre momenti demo.
- 15:12–15:32: una persona registra UI; l’altra genera voce, timestamp e caption.
- 15:32–15:55: inserite clip, titolo, metriche e CTA.
- 15:55–16:12: render draft + controllo completo senza audio e con audio.
- 16:12–16:25: correzioni minime, render finale e versione captionata.
- 16:25–16:30: controllate durata, apertura del file, leggibilità caption e upload. Tenete il buffer 16:30–17:00 per render/upload imprevisti.

## Rischi da evitare

- **Niente 4K:** 1080p/30fps è il compromesso giusto; ogni minuto è 1.800 frame. Un render frame-by-frame lungo può mangiare il buffer.
- Fate render “draft” durante l’iterazione e uno solo “high” finale; HyperFrames propone esplicitamente questo flusso.
- Includete i font nel progetto oppure scegliete font di sistema: font mancanti cambiano layout e spezzano caption.
- Usate solo musica con licenza esplicitamente idonea alla condivisione pubblica e conservate la prova; idem per voci/clone: mai imitare una persona senza consenso.
- Il limite di dimensione/formato del portale non è verificabile dal contesto: controllatelo al mattino. Esportate H.264/AAC MP4, `yuv420p`, con una copia compressa pronta se serve.