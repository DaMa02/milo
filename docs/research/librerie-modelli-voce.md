# Ricerca · librerie open source, modelli e stack vocale a bassa latenza

Fonte: ricerca web con agente Claude, 25/09/2026, verificata su GitHub, PyPI, npm, API di Hugging Face e fonti primarie. Legenda: ✓ = verificato · ~ = dichiarato dal vendor o non verificato · ✗ = assente.

## Decisioni rapide

- **Voce primaria (API): Gemini 3.8 Live.** Il browser si collega direttamente all'API con un token effimero. Un solo socket porta audio, video e trascrizione. Italiano ✓, free tier ✓.
- **Fallback locale:** vad-web → parakeet-mlx → Gemma 4 E2B (mlx-vlm) → voce di sistema macOS o Piper.
- **Track 2:** il speech-to-speech non serve. Deepgram Nova-3 `multi` con diarization live, un LLM per il recap e YAMNet per i suoni.
- **Screen:** prima l'albero AX (etichette esatte), poi il VLM sullo screenshot. OmniParser solo dove l'AX manca.
- **Utente cieco su screen:** far parlare VoiceOver tramite `aria-live`, non un TTS parallelo.

## A. Screen

| Bisogno | Scelta (stato 09/2026) | Licenza | Note |
|---|---|---|---|
| Cattura | `getDisplayMedia`: audio di sistema su Mac da Chrome 141 + macOS 14.2 ✓ https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/ | – | L'audio del tab (Meet/YouTube) funziona sempre. Nativo: ScreenCaptureKit via `pyobjc-framework-ScreenCaptureKit` 12.2.2 (MIT) |
| Albero AX | `macapptree` (Python, JSON+bbox) · AXorcist 0.2.0 (Swift, 23/09) · `macos-vision` 1.8.2 (Node, `axTree()`, progetto piccolissimo) | MIT | Serve il permesso Accessibilità |
| GUI parsing | OmniParser v2: `icon_detect_v3` + caption Florence-2, pesi aggiornati il 23/09 https://huggingface.co/microsoft/OmniParser-v2.0 | MIT (il vecchio `icon_detect` è AGPL) | 0,6 s/frame su A100 ~; su Mac non misurato |
| Set-of-Mark | Tecnica: numeri sui bbox AX/OCR + VLM. Repo fermo al 2024 | MIT | Niente da scaricare |
| OCR | Apple Vision via `ocrmac` 1.0.1: it-IT ✓ (provato su macOS 27, modalità fast e accurate). Da macOS 26 `RecognizeDocumentsRequest` restituisce tabelle e liste | MIT | Alternative: PaddleOCR 3.7.0 (Apache, pesante), Tesseract 5.5.3 (pacchetto `ita`) |
| PDF | Docling 2.130.0 (22/09): layout, ordine di lettura, tabelle, grafici→tabella ✓ | MIT | PyMuPDF 1.28.2 (AGPL) per testo+bbox veloce; pdf.js 6.3.289 (Apache) nel browser |
| Grafici→dati | VLM via API con JSON schema (Gemini 3.8 Flash, free tier) | – | DePlot (2023) e ChartGemma (2024, ~12 GB) sono superati; non trovato uno specialista open più recente chiaramente migliore ~ |
| Grafici accessibili | Olli 3.1.4 (BSD-3); MAIDR 4.10.0 (GPL-3.0: braille/testo/sonificazione, dati live, adapter per Recharts/Plotly/Vega-Lite/D3/Chart.js/ECharts) https://github.com/xability/maidr | | Sonificazione di Highcharts 13: gratis solo per uso non commerciale ~. Umwelt non dichiara una licenza |
| Audit | axe-core 4.13.0 | MPL-2.0 | |

## B. Real world (Track 1)

| Bisogno | Scelta | Dim. | Licenza |
|---|---|---|---|
| Detection | MediaPipe tasks-vision 1.0.1 + EfficientDet-Lite0, nel browser | 7,3 MB | Apache |
| Detection più precisa | YOLO26n (Ultralytics 8.4.163) · RF-DETR 1.11.0 | ~5 MB / ONNX 10 MB | AGPL-3.0 · Apache |
| Segmentazione | MediaPipe DeepLab v3 · SAM 2.1 tiny | 2,8 MB · 156 MB | Apache |
| | SAM 3/3.1: gated con approvazione manuale, ~3,4 GB → non contarci per l'evento https://huggingface.co/facebook/sam3 | | |
| Profondità (relativa) | Depth Anything V2 Small ONNX q4 con transformers.js 4.3.0 · DA3-SMALL | 27 MB · 137 MB | Apache |
| OCR di scena | Apple Vision sui frame, oppure direttamente il modello live | 0 | – |
| Audio spaziale | `PannerNode` HRTF di Web Audio. Il SDK web di Resonance Audio è archiviato dal 2022 | 0 | nativo |
| Telefono→laptop | Continuity Camera: iPhone XR o successivo come webcam, via cavo o wireless, macOS 13+/iOS 16+, stesso Apple Account ✓ https://support.apple.com/en-us/102546 | 0 | |
| | In alternativa: pagina aperta sul telefono tramite `cloudflared tunnel --url http://localhost:5173` (serve HTTPS per `getUserMedia`; in Vite va impostato `server.allowedHosts`) + PeerJS 1.5.5 | | |
| Multimodale realtime | Gemini 3.8 Live: frame ≤1 fps; senza compression le sessioni durano 15 min solo audio e 2 min con audio+video ✓ https://ai.google.dev/gemini-api/docs/live-api/capabilities | | |
| | gpt-realtime-2.1: accetta immagini, non video | | |

## C. Audio (Track 2)

STT in streaming con italiano, via API:

| Servizio | IT | Diarization live | Prezzo | Credito free |
|---|---|---|---|---|
| Deepgram Nova-3 `multi` | ✓ | ✓ +$0,002/min | $0,0058/min (promo) | $200 https://deepgram.com/pricing |
| AssemblyAI `universal-streaming-multilingual` | ✓ | beta, +$0,12/h | $0,15/h | $50 https://www.assemblyai.com/pricing |
| Speechmatics RT | ✓ | ✓ | ~$0,0067/min ~ | a crediti da agosto 2026, importo ~ |
| ElevenLabs Scribe v2 Realtime | ✓ | non documentata | $0,39/h | – |
| Mistral Voxtral Realtime | ✓ (WER IT 3,27% su FLEURS a 480 ms) | ✗ | $0,006/min | pesi aperti Apache-2.0 |
| OpenAI `gpt-live-transcribe` | l'italiano non è in lista ~ | ✗ | $0,017/min (`gpt-4o-transcribe` $0,006/min, a turni) | – |
| Gemini 3.5 Transcribe (Live) | 85+ lingue ~ | ✗ (niente timestamp per parola, sessioni da 10 min) | solo a pagamento | – |

Sulle latenze STT ci sono solo claim dei vendor (Scribe ~150 ms ~). Nessun benchmark indipendente in italiano trovato. Per Track 2 Screen: audio del tab da `getDisplayMedia` → stessa pipeline.

In locale su Mac:

| Componente | Scelta | Dim. | Licenza |
|---|---|---|---|
| VAD | Silero VAD 6.2.3 (23/09); nel browser `@ricky0123/vad-web` 0.0.31. In sala rumorosa: push-to-talk | ~2 MB | MIT / ISC |
| STT | `parakeet-mlx` 0.5.2 + parakeet-tdt-0.6b-v3 (25 lingue, WER IT 3,0% su FLEURS), con `transcribe_stream` | 2,5 GB | Apache / CC-BY-4.0 |
| STT con risultati parziali | `mlx-audio` 0.5.6 + Nemotron 3.5 ASR streaming (it-IT, chunk da 80 ms a 1,12 s) | 0,76 GB (8 bit) | OpenMDW-1.1 |
| STT alternativo | whisper.cpp 1.9.4 + large-v3-turbo q5_0 (`whisper-stream`) | 574 MB | MIT |
| Scartati | faster-whisper (su Mac gira solo su CPU); Moonshine v2 e Kyutai STT (niente italiano) | | |
| Diarization in streaming | Nemotron 3 Diarization via mlx-audio (23/09/2026, fino a 8 speaker, latenza 0,32–1,04 s) | 107 MB (8 bit) | OpenMDW-1.1 |
| | Ripiego: Sortformer 4spk v2.1 (471 MB). diart è fermo a febbraio 2025; pyannote 4.0.7 con community-1 lavora solo offline | | |
| Speaker ID | SpeechBrain 1.1.1 + ECAPA (enrollment delle voci) | 83 MB | Apache |
| Eventi sonori | MediaPipe tasks-audio + YAMNet, 521 classi AudioSet (risate incluse). PANNs e BEATs sono più pesanti e non servono | 4,1 MB | Apache |
| Zero-shot | CLAP `Xenova/clap-htsat-unfused` quantizzato (transformers.js) | 288 MB | Apache |
| Emozione | emotion2vec+ base/large (FunASR 1.4.16), 9 classi | 1,1/1,9 GB | "other" su HF ~ |

## D. Voce

Latenze misurate da terzi, probabilmente da datacenter USA. Da Milano va aggiunta la rete, che non è misurata.

- **Speech-to-speech, TTFA di Artificial Analysis:** gpt-realtime-2.1 0,97 s (minimal) / 1,21 s (high); gpt-realtime-2.1-mini 0,85 s (minimal) / 4,28 s (high); Gemini 3.8 Live 1,18 s. https://artificialanalysis.ai/speech-to-speech
- **TTS, p50 di Coval sugli ultimi 30 giorni:** ElevenLabs Flash v2.5 185 ms; Cartesia Sonic-3.6 357 ms; gpt-4o-mini-tts 563 ms (p99 5,5 s). https://benchmarks.coval.ai/benchmarks/time-to-first-audio

| TTS | IT | Claim vendor | Prezzo | Free |
|---|---|---|---|---|
| ElevenLabs `eleven_flash_v2_5` | ✓ | ~75 ms | ~$0,05 ogni 1k caratteri ~ | 10k crediti/mese |
| Cartesia `sonic-3.6` | ✓ | <90 ms | ~$49 per 1M caratteri ~ | 20k crediti |
| OpenAI `gpt-4o-mini-tts` | ✓ | – | $0,60/1M token di testo + $12/1M di audio | – |
| Voci macOS (`say -v Alice`, `speechSynthesis`) | ✓ già installate | – | 0 | locale |
| Piper `it_IT-paola-medium` (piper-tts 1.8.0) | ✓ | – | 64 MB, GPL-3.0 | locale |
| Kokoro-82M `if_sara`/`im_nicola` | voto C | – | Apache | sconsigliato per l'italiano |

**Framework:** Pipecat 1.11.0 (BSD-2) e LiveKit Agents 1.8.3 (Apache-2.0) integrano già Gemini Live e OpenAI Realtime. Il turn detector multilingue di LiveKit include l'italiano ~. Con 7 ore conviene saltarli e collegare il browser direttamente all'API.

**Stack primario (API): Gemini 3.8 Live** (`gemini-3.8-live`, uscito il 15/09/2026)
- `@google/genai` 2.24 nel browser. Il backend Node crea il token effimero con `authTokens.create`: vale 1 min per aprire la sessione e 30 min per usarla. https://ai.google.dev/gemini-api/docs/ephemeral-tokens
- Audio PCM a 16 kHz in ingresso e 24 kHz in uscita. Frame JPEG a ≤1 fps da camera o schermo. Trascrizione di input e output, quindi sottotitoli già inclusi.
- VAD automatico, oppure manuale con `activityStart/End` (push-to-talk).
- Attivare context-window compression e session resumption per superare il limite di 2 min con il video.
- TTFA misurato 1,18 s. Free tier ✓, ma i limiti RPM non sono pubblicati ~. A pagamento: $0,005/min per l'audio in ingresso e $0,018/min in uscita.
- Piano B con la stessa architettura: `gpt-realtime-2.1-mini` via WebRTC (`@openai/agents-realtime` 0.18, client secret da `/v1/realtime/client_secrets`), TTFA 0,85 s. Costa $10/$20 per 1M token audio, senza free tier. https://developers.openai.com/api/docs/pricing

**Fallback locale (M-series):** vad-web → WebSocket → Python con parakeet-mlx → `mlx-vlm` 0.7.3 con Gemma 4 E2B-it a 4 bit → `say -v Alice` o Piper.
- Gemma 4 E2B-it: Apache-2.0, accetta testo, immagini e audio, 5,25 GB. Se la RAM basta, E4B (7,5 GB).
- La latenza voce→voce non è misurata: stima ~1–2 s ~, da cronometrare.

## E. Download

| # | Cosa | Dim. | Licenza | Comando | |
|---|---|---|---|---|---|
| 1 | SDK web | ~75 MB + onnxruntime-web (~140 MB) | Apache/ISC | `npm i @google/genai @ricky0123/vad-web @mediapipe/tasks-vision @mediapipe/tasks-audio` | essenziale |
| 2 | Modelli MediaPipe | 11 MB | Apache | `curl -O https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite && curl -O https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite` | essenziale |
| 3 | Python + STT | 2,5 GB | Apache/CC-BY | `uv venv -p 3.12 && source .venv/bin/activate && uv pip install parakeet-mlx mlx-audio && hf download mlx-community/parakeet-tdt-0.6b-v3` | essenziale |
| 4 | Screen/PDF | ~1 GB ~ | MIT | `uv pip install ocrmac macapptree docling && docling-tools models download` | essenziale se Screen |
| 5 | Grafici/audit | ~65 MB | BSD/GPL/MPL/Apache | `npm i olli maidr axe-core pdfjs-dist` | essenziale se Screen |
| 6 | Parziali + diarization MLX | 0,87 GB | OpenMDW | `hf download mlx-community/nemotron-3.5-asr-streaming-0.6b-8bit && hf download mlx-community/Nemotron-3-Diarization-8bit` | opzionale (Track 2) |
| 7 | VLM locale | 5,25 GB | Apache | `uv pip install mlx-vlm && hf download mlx-community/gemma-4-e2b-it-qat-OptiQ-4bit` | opzionale |
| 8 | Piper IT | 64 MB | GPL-3.0 | `uv pip install piper-tts && python -m piper.download_voices it_IT-paola-medium` | opzionale |
| 9 | Profondità nel browser | 27 MB | Apache | `npm i @huggingface/transformers && hf download onnx-community/depth-anything-v2-small --include "onnx/model_q4.onnx" "*.json"` | opzionale |
| 10 | whisper.cpp | 574 MB | MIT | `brew install whisper-cpp && curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin` | opzionale |
| 11 | OmniParser v2 | ~1,4 GB | MIT | `hf download microsoft/OmniParser-v2.0 --include "icon_detect_v3/*" "icon_caption/*"` | opzionale |
| 12 | Speaker ID | 89 MB | Apache | `uv pip install speechbrain && hf download speechbrain/spkrec-ecapa-voxceleb` | opzionale |
| 13 | STT on-device di Chrome | ~60 MB ~ | – | `SpeechRecognition.install({langs:['it-IT'], processLocally:true})` (Chrome 139+) | opzionale |

**Per lavorare offline:**
- I wasm di MediaPipe (`node_modules/@mediapipe/tasks-*/wasm`) e gli asset di vad-web (`baseAssetPath`, `onnxWASMBasePath`) arrivano da CDN di default: vanno serviti in locale.
- Aprire almeno una volta, prima dell'evento, le pagine che usano transformers.js, così la cache si riempie.
- Per Ollama serve l'app 0.34.x: un vecchio client Python nel PATH non basta.

**Non verificato:**
- Le latenze dichiarate dai vendor (Flash, Sonic, Scribe, OmniParser).
- I limiti del free tier di Gemini 3.8 Live.
- Il supporto all'italiano di `gpt-live-transcribe` e la qualità in italiano di Gemma 4 E2B.
- L'importo dei crediti free di Speechmatics.
- Nemotron 3 Diarization e il suo port MLX sono usciti da due giorni.
