# O: Open-source repos: React Native/Expo modules, on-device speech and AI, camera/VPS, accessibility testing
Research date: 27 Sep 2026. Tags: [V] verified in a primary source I fetched (repo file, registry, official docs, API); [P] secondary source; [U] could not verify; [M] my own estimate or reading of Milo's code. Bracketed numbers point to Sources; letters point to the other reports in this folder. Versions and dates come from the npm registry [1] and activity ("last push") from the GitHub search API [2], both queried on 27 Sep 2026. Effort is in developer-days and is my estimate [M].

## Key findings

1. **The two mature modules for Milo's hardest jobs now cost money.**
   - **Transistor's `react-native-background-geolocation` v5** (5.6.0, 7 Sep 2026) needs a licence key for release builds on both iOS and Android. It is free only in debug builds, plus a free 30-day trial key for testing release builds; v4 keys do not work with v5 [V 3]. The native core ships as a binary (`TSLocationManager.xcframework`) [V 5]. Keys cost $399 (one app id), $599 (5), $749 (25) or $999 (100), perpetual with one year of updates, one purchase covering iOS and Android; the last three are shown as discounts from $649/$849/$1,249 [V 4].
   - **`react-native-track-player` v5** is commercial: €99/month or €999/year for one production app (Studio: €2,499/year for up to 5) [V 12]. v4.1.2 is still Apache-2.0 [V 11], but its last release was 12 Aug 2025 [V 1].
   - Neither suits an MIT app that others must be able to build. Write the guidance core as Milo's own Expo module (D's plan). Borrow code from **Tracelet** (Apache-2.0; implements `CLBackgroundActivitySession` and `CLServiceSession`) [V 7] and from **react-native-audio-api** (MIT; audio-session and focus options) [V 13].
2. **Speech input: use `expo-speech-recognition` 57.1.0 now** (MIT, versioned with Expo, persists audio for the corpus) [V 17].
   - **`react-native-nitro-speech` 0.4.9** (MIT, created Jan 2026, 19 stars) is the only RN library I found that implements iOS 26 `SpeechAnalyzer` with `DictationTranscriber` and contextual strings [V 18]. L says this is the transcriber to use for commands. Spike it before writing our own.
   - `@react-native-voice/voice` is archived [V 2].
3. **Report L's verdict on `whisper.rn` needs updating.** Version 0.7.x also runs **NVIDIA Parakeet-TDT-0.6B-v3** (English plus 24 European languages, Italian included; q4_0 model 356 MB) and **Silero VAD**, in one MIT package [V 19].
   - That makes it the best offline fallback once Italian returns.
   - Avoid `react-native-sherpa-onnx` 0.4.4. It bundles FFmpeg (LGPL-2.1) and Shine (LGPL) by default, pins sherpa-onnx 1.12.35 (upstream is 1.13.8), and has no VAD until its 0.7.0 [V 20, 22]. FFmpeg can be switched off at build time (`sherpaOnnxDisableFfmpeg`, `SHERPA_ONNX_DISABLE_FFMPEG`) [V 20]; I did not verify that Shine goes with it [U].
4. **On-device LLM: keep `llama.rn` as the single runtime.** Milo's `local.ts` already targets it. It turns a JSON Schema into a GBNF grammar and does tool calling [V 23].
   - **Pin a stable version:** npm's `latest` tag points to `0.13.0-rc.6`; the last stable release is 0.12.9 (4 Aug 2026) [V 1].
   - Do not ship an on-device LLM in the MVP (G, E).
   - **Rejected:**
     - Cactus: its licence ends for organisations above $2 M of funding or revenue [V 27]. npm lists `cactus-react-native` as MIT, but the LICENSE inside the 1.13.1 tarball is the same custom licence [V 1].
     - ExecuTorch: documents tool calling but no constrained decoding [V 15].
     - `react-native-litert-lm`: claims constrained decoding, but it has a single maintainer and 62 stars [V 2, 25].
5. **Camera: nothing is ready for production.** An npm search found no React Native module for ARKit geotracking [V 1]. ARCore Geospatial is reachable only through **ViroReact** (MIT, a 3D engine, `provider="arcore"`) [V 29].
   - Viro's docs call the pose accuracies "95% confidence" [V 29]. Google defines them as the 68th percentile [V 30]. If Milo trusted Viro's label, it would understate the 95% radius by about 1.6× for the horizontal radius and about 2× for heading/yaw (Gaussian assumption) [M].
   - Use Viro for a 2–3 d measurement spike in Milan. Production "precision mode" is a custom native module that owns the AR session and runs the crossing detector on the AR frames.
6. **Crossing detection must be trained.**
   - **Licences to avoid:** Ultralytics YOLO is AGPL-3.0 or a paid Enterprise licence [V 37]. The one crosswalk/signal repo for blind users built on YOLOv5 (`kairess`) is GPL-3.0 [V 40].
   - **Permissive models:** RF-DETR N/S/M/L are Apache-2.0; only XL/2XL are PML 1.0 [V 36]. D-FINE and LW-DETR are Apache-2.0 [V 36].
   - **Labelled data:** ImVisible's PTL set (MIT repo, 5,059 images) [V 38]. The PTL-Crosswalk set states no licence [V 39].
   - ML Kit's default detector knows only five coarse classes [V 41], so it is useless here.
7. **Screen readers cannot be scripted end to end in CI, but most checks can be automated:**
   - unit-level accessibility assertions (React Native Testing Library, `react-native-accessibility-engine`);
   - runtime checks in dev builds (AMA) [V 50];
   - Maestro flows on EAS [V 47];
   - Apple's XCTest accessibility audit through Appium (`mobile: performAccessibilityAudit`, iOS 17+) [V 46];
   - **TalkBack speech capture on an Android emulator.** A logging TTS engine records every utterance to logcat, and the Tab key moves TalkBack's focus. It works on API 33, 35 and 36; API 34 images have no TalkBack [V 49]. The same fake engine records Milo's own Android guidance speech, because Milo speaks through the platform TTS.
8. **Storage:**
   - Use `expo-sqlite` for trip memory and city packs (J, N).
   - Use `expo-secure-store` for the gateway install token and the database key, with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Guidance runs with the screen locked, and the default `WHEN_UNLOCKED` makes those reads fail [V 43].
9. **Platform churn:** Expo SDK 58 is in preview (`58.0.0-preview.7`, 25 Sep 2026), and React Native 0.87.1 is the latest release [V 1]. SDK 58 preview.7 bundles React Native 0.88.0-rc.1 and `react-native-worklets` 0.13.0 [V 1]. ExecuTorch 0.10 requires `react-native-worklets` ≥0.10 and <0.13 [V 15, 1], so ExecuTorch 0.10.x cannot run on SDK 58 until Software Mansion widens that range. Budget one SDK upgrade (about 3 d) before the pilot.

## 1. Baseline

Milo targets Expo SDK 57 / RN 0.86 (D). Everything below needs a development build, not Expo Go, and the New Architecture:
- llama.rn has required the New Architecture since v0.10 [V 23];
- ExecuTorch lists New Architecture, RN 0.83+, iOS 17+ and Android 13+ [V 15].

**Proposed OS floor [M]:** iOS 17 (`CLBackgroundActivitySession`, ExecuTorch) and Android 10 (API 29, the `location` foreground-service type [V 8]). On-device recognition with biasing strings needs Android 13 (D, E). Below Android 13, recognition falls back to Google's cloud recogniser, so a privacy notice is needed there.

**No repository in this report is a Milo dependency today.** The repo has `packages/engine` and `packages/assistant` (Node/TS), whose only runtime dependency is `@anthropic-ai/sdk`. It has no `apps/` mobile app yet [M]. Everything here is a choice for the new app.

## 2. Location and background operation

| Module | Licence | Latest / activity | Fit for Milo | Verdict |
|---|---|---|---|---|
| `expo-location` 57.0.20 | MIT | 24 Sep 2026 [V 1] | Background via TaskManager / headless JS. Open bugs: ignored intervals, frozen foreground service after an update, crashes on API 28–30 (D) | Permissions UI and foreground fixes only |
| `react-native-background-geolocation` 5.6.0 (Transistor) | MIT wrapper; closed native binary; **paid key for release builds on both platforms** [V 3, 5] | 7 Sep 2026; 2.9k stars [V 1, 2] | Motion state machine that turns GPS off when stationary; `changePace(true)` forces "moving"; headless task on Android [V 6]. Milo users stand still at crossings | **No**: cost, closed core, no F-Droid, optimised for fleet tracking |
| `react-native-geolocation-service` 5.3.1 | MIT | Last release Sep 2022, last push Jul 2024 [V 1, 2] | Foreground only | No (stale) |
| `@react-native-community/geolocation` 3.4.0 | MIT | Sep 2024 [V 1] | Foreground only | No |
| `react-native-background-actions` 4.1.0 | MIT | Apr 2026 [V 1] | Android foreground service with `foregroundServiceType: ['location','microphone']`, running headless JS. On iOS only `beginBackgroundTask`, which "won't keep your app in the background forever". Cannot start from the background on Android 12+ [V 8] | Prototype only; guidance must not depend on the JS thread (D) |
| `@notifee/react-native` 9.1.8 | Apache-2.0 | **Archived**; README: "no longer actively maintained" [V 2, 9] | Was the usual foreground-service helper | No |
| **Tracelet** 3.8.8 (Flutter; Kotlin, Swift, Rust core) | Apache-2.0 [V 7] | 18 Sep 2026; 62 stars [V 7, 2] | Implements `CLBackgroundActivitySession` (iOS 17+) and `CLServiceSession` (iOS 18+); motion-gated wakelock; SQLite logs. Expo wrapper `@rapide-om/expo-tracelet` 0.1.5 (May 2026) [V 1] | **Reference code** for Milo's module (Apache: keep the NOTICE) |

**iOS session wrappers.** GitHub code search finds no `CLBackgroundActivitySession` in `expo/expo`. Among published code, Tracelet is the closest reference [V 53]. Code search may miss files, but the `expo-location` 57.0.20 npm tarball contains neither `CLBackgroundActivitySession` nor `CLServiceSession` [V 1].

**Google Play.** Apps targeting Android 14+ must declare each foreground-service type in Play Console, with a description, the user impact and **a video**, for `location` and `mediaPlayback` alike, and for `microphone`, which `milo-guidance` also declares (§11) [V 10]. Record the video during the first field test.

**Decision:** location lives in Milo's native module (§10), as D proposed. From `expo-location`, use only `requestForegroundPermissionsAsync` and the accuracy-authorization checks.

## 3. Speech output, earcons, audio session and headset keys

| Module | Licence | Latest | What it offers | Gap for Milo |
|---|---|---|---|---|
| `expo-speech` 57.0.3 | MIT | Sep 2026 [V 1] | Platform TTS | No audio attributes, focus or `prefersAssistiveTechnologySettings` (D) |
| `react-native-tts` 4.1.1 | MIT on npm; no licence file on GitHub [V 2] | Jun 2024; 138 open issues [V 2] | Platform TTS | Stale |
| `expo-audio` 57.0.5 | MIT | Sep 2026 [V 1] | `interruptionMode` `duckOthers`/`mixWithOthers`/`doNotMix`; `setActiveForLockScreen`; `useAudioStream()` gives PCM from the microphone [V 14] | Remote-command events (headset keys) not documented [V 14]; no `voicePrompt` mode |
| **`react-native-audio-api`** 0.13.6 (Software Mansion) | MIT | 23 Sep 2026; pushed 27 Sep [V 1, 2] | iOS `AVAudioSession` categories, mode `voicePrompt`, options `duckOthers` and `interruptSpokenAudioAndMixWithOthers`; Android focus `gainTransientMayDuck`; interruption and route-change events. `PlaybackNotificationManager` handles play, pause, next and previous [V 13] | Android `AudioAttributes` usage (`ASSISTANCE_NAVIGATION_GUIDANCE`) not documented [U]. iOS lock-screen controls appear "only when an active AudioContext is running" [V 13] |
| `react-native-track-player` 4.1.2 / v5 | Apache-2.0 (v4) / commercial (v5) | v4 Aug 2025; v5 €999/yr [V 11, 12] | Full media session | Paid or stale |
| `react-native-music-control`, `react-native-keyevent` | none / ISC | 2022 / 2023 [V 1] | – | Stale; key events only in the foreground |

**Neural TTS on the phone (update to L).** L found no clean path besides Moonshine. **React Native ExecuTorch** ships Kokoro with its own grapheme-to-phoneme library, `phonemis` (MIT) [V 15, 16]. Its third-party list names no espeak-ng [V 15]. Kokoro in ExecuTorch lists English (US/GB) and Italian among its languages [V 15].
- Keep L's default: the user's platform voice.
- ExecuTorch Kokoro is the fallback if a platform voice misbehaves, or for pre-rendering earcon phrases. On SDK 58 this fallback waits until ExecuTorch accepts worklets 0.13, because its 0.10.x peer range stops below it (Key findings, 9) [V 1].
- sherpa-onnx and Kitten TTS still pull in espeak-ng (GPL) (L).

**Headset keys and magic tap.** D's mechanism stands. On Android, the media session belongs to the app that last played audio. On iOS, remote commands reach only a non-mixable Now Playing app. TalkBack's two-finger double tap sends `HEADSETHOOK` (D).
- Nothing free and maintained exposes this cleanly.
- **Spike (1 d):** `react-native-audio-api`'s `PlaybackNotificationManager`, playing earcons through its `AudioContext`. Test whether a wired headset, AirPods and TalkBack's gesture reach it with the screen locked [U].
- If the spike fails, add Media3 `MediaSession` and `MPRemoteCommandCenter` to Milo's module (§10).
- Magic tap needs no library: RN's `onMagicTap` (D).

**One owner for the audio session [M].** Speech recognition (`playAndRecord`), guidance TTS (`playback` + `voicePrompt`) and earcons must not each reconfigure `AVAudioSession` or Android audio focus. Libraries that restore their own category after use are the usual source of "Milo went silent after I spoke" bugs. Milo's module should own the session. Configure the recognition library with `iosCategory` [V 17] so that it does not reset the session.

## 4. Speech recognition and voice activity detection

| Option | Licence | Latest / activity | Notes | Verdict |
|---|---|---|---|---|
| **`expo-speech-recognition`** 57.1.0 (jamsch) | MIT | 16 Sep 2026; 684 stars [V 1, 2] | Continuous; `requiresOnDeviceRecognition`; `contextualStrings` (Android: sent as `EXTRA_BIASING_STRINGS` only on API 33+, in on-device and cloud mode alike; the README table marks Android 12 ✅ but the code skips it there [V 1, 17]); `iosCategory`, `iosVoiceProcessingEnabled`; `recordingOptions.persist` saves audio (Android 13+, iOS); `volumechange` [V 17] | **Adopt for the MVP** |
| `react-native-nitro-speech` 0.4.9 | MIT | 18 Sep 2026; 19 stars, 1 open issue [V 1, 2] | iOS 26 `SpeechAnalyzer` with `SpeechTranscriber` or `DictationTranscriber`, falling back to `SFSpeechRecognizer`; silence auto-finish; contextual strings on both platforms; Nitro Modules [V 18] | **Spike (1 d)**; if it holds, it replaces our own SpeechAnalyzer code (L §3.1) |
| `@react-native-ai/apple` 0.12.0 (Callstack) | MIT | 28 Jan 2026 [V 1] | SpeechAnalyzer transcription through the Vercel AI SDK `transcribe` [V 26]; batch-oriented [U] | No (not streaming) |
| `@react-native-voice/voice` 3.2.4 | MIT | **Archived** [V 2] | – | No |
| **`whisper.rn`** 0.7.4 (mybigday) | MIT | 27 Aug 2026; pushed 17 Sep [V 1, 2] | Whisper, plus `ParakeetContext` for Parakeet-TDT-0.6B-v3 GGUF (q4_0 356 MB, q8_0 669 MB); input 16 kHz 16-bit PCM WAV or `ArrayBuffer`; Silero VAD (`ggml-silero-v6.2.0`); `RealtimeTranscriber` with VAD; Hexagon NPU on SM8450+ for Whisper only [V 19] | **Offline fallback** (English and Italian); Parakeet weights are CC-BY-4.0, 25 languages including `it` [V 54]: attribute. Parakeet and VAD run on the CPU only [V 19]. 0.8.0-rc.1 is out (17 Sep) [V 1]. WER of q4_0 unpublished [U] |
| Moonshine Voice (Maven `ai.moonshine:moonshine-voice` 0.1.5; Swift package) | MIT; models MIT in every language, except legacy non-streaming non-English models (non-commercial Moonshine Community License) [V 21] | Pushed 31 Aug 2026 [V 2] | Streaming, low latency (L); no RN binding [V 1] | Runner-up fallback for English (1 wk to wrap, §10) |
| `react-native-sherpa-onnx` 0.4.4 (third party) | MIT wrapper; bundles FFmpeg LGPL-2.1, Shine LGPL [V 20] | 8 Sep 2026; 40 stars [V 1, 2] | Streaming STT, TTS; VAD "scheduled for 0.7.0"; no keyword spotting listed; pinned to sherpa-onnx 1.12.35 [V 20] | **No.** Statically linking LGPL code into an iOS binary brings relinking obligations; FFmpeg can be disabled at build time [V 20], but the old pin and missing VAD remain. Use upstream sherpa-onnx (Apache-2.0, 1.13.8 [V 22]) in our own module if ever needed |
| React Native ExecuTorch STT/VAD | MIT | 0.10.3, 25 Sep 2026 [V 1] | Whisper Tiny/Base/Small only; FSMN-VAD at "~2–5 ms" [V 15] | No (Whisper only; FSMN licence unverified [U]) |
| Silero VAD 6.2.3 | MIT | 23 Sep 2026 [V 22] | Reach it through `whisper.rn` or `onnxruntime-react-native` 1.24.3 (MIT, Mar 2026) [V 1] | Use via `whisper.rn` when needed |

**MVP flow.** Push-to-talk → `expo-speech-recognition` on-device with the nearby street names as contextual strings, and audio persisted for the corpus (with consent) → the platform's own endpointing. Silero VAD and Smart Turn (G) are needed only once Milo records audio itself, for offline ASR or barge-in.

**`whisper.rn` next to `llama.rn` [U].** Both packages embed ggml. The Hexagon build is namespaced (`rnwhisper_…`) [V 19], but I did not verify that the two link cleanly in one app. Test this in the week the second one is added.

## 5. On-device LLMs

| Runtime (RN package) | Licence | Latest | Constrained JSON | Tool calls | Notes | Verdict |
|---|---|---|---|---|---|---|
| **llama.cpp (`llama.rn`)** | MIT | 0.12.9 stable (4 Aug 2026); `latest` tag = 0.13.0-rc.6 [V 1] | **Yes**: GBNF, built-in JSON-Schema→GBNF [V 23] | Yes, via Jinja templates; generic JSON fallback [V 23] | Metal; OpenCL (Adreno 700+); Hexagon NPU experimental (SM8450+); session files cache the prompt prefix [V 23] | **Keep** (post-MVP) |
| LiteRT-LM (`react-native-litert-lm` 0.7.0, third party) | Engine Apache-2.0; wrapper MIT | 31 Aug 2026; 62 stars [V 1, 2] | Wrapper claims JSON Schema/regex constrained decoding on both platforms [V 25] | Yes [V 25] | Upstream v0.16.0: Kotlin stable, Swift "Early Preview" [V 24]; Gemma 4 E2B download 2.58 GB [V 25] | Runner-up; race Gemma 4 against llama.rn (E) |
| ExecuTorch (`react-native-executorch` 0.10.3, Software Mansion) | MIT (+BSD/Apache deps) [V 15] | 25 Sep 2026 [V 1] | Not documented: the LLM page covers tool calling with pluggable tool parsers; the "schema validation" page checks model tensor shapes, not LLM output; the 0.10.3 package source has no grammar or structured-output helper [V 15, 1] | Yes, managed multi-turn [V 15] | Catalogue includes LFM 2.5, Qwen 3, Gemma 4 E2B, Hammer 2.1; Expo SDK 57 ✅; worklets pin <0.13, which excludes SDK 58's worklets 0.13.0 [V 15, 1] | No for the parser; possible for vision and TTS |
| MLC LLM (`@react-native-ai/mlc` 0.12.0) | Apache-2.0 / MIT | Engine pushed Aug 2026; RN package Jan 2026 [V 1, 2] | XGrammar (E) | Via AI SDK | Poor Mali prefill (E) | No |
| Apple Foundation Models (`@react-native-ai/apple`) | OS | Jan 2026 [V 1] | Guided generation, constrained decoding [P 28] | Yes [P 28] | ~3B, only on Apple Intelligence iPhones [P 28] | Watch; iOS-only |
| Cactus (`cactus-react-native` 1.13.1) | **Custom** (npm metadata says MIT, but the shipped LICENSE is custom [V 1]): free only for individuals for personal, educational, research or non-commercial use, educational institutions, registered non-profits, or organisations with <$2 M funding **and** <$2 M revenue [V 27] | Apr 2026 [V 1] | [U] | [U] | – | **No** (licence ends as Milo grows) |

**`react-native-ai` naming:** the unscoped npm package `react-native-ai` (ISC, 1.0.3, Sep 2025, no repository) is unrelated [V 1]. Callstack's packages are `@react-native-ai/*`, compatible with AI SDK v6 from 0.12 [V 26]. They would give one interface for on-device and gateway models. G recommends Pi's loop instead, so skip them.

## 6. Camera, visual positioning and crossings

### 6.1 Runtimes

| Option | Licence | Activity | What it gives | Verdict |
|---|---|---|---|---|
| **ViroReact** `@reactvision/react-viro` 3.0.1 | MIT [V 29] | 21 Sep 2026; 1.8k stars [V 1, 2] | `provider="arcore"` gives `getCameraGeospatialPose()` (lat, lng, altitude, heading, accuracies), `checkVPSAvailability`, earth state. The default provider is ReactVision's own platform, which needs `rvApiKey` [V 29]. iOS needs "ARCore SDK for iOS" [V 29] | **Spike only** (2–3 d): measure VPS accuracy and localisation time on Milan streets and under porticoes. A full 3D engine is too heavy for production. Convert its accuracies with Google's 68% definition [V 30] |
| ARCore Geospatial (native) | Apache-2.0 SDK; Google service | iOS SDK pushed Sep 2026 [V 2] | Quota 1,000 sessions started per minute or 100,000 requests per minute per project; no price stated [V 31]. iOS: pod `ARCore/Geospatial`, keyless authorisation preferred, when-in-use location with full accuracy [V 32]. Android shared camera: ARCore and the app can both read frames (CPU 640×480, GPU ~1080p) [V 33] | **Production path**, inside Milo's module |
| ARKit `ARGeoTrackingConfiguration` | OS | – | No RN wrapper on npm [V 1]. The closest is `munim-xr` 0.3.1 (Apache-2.0, Nitro, 19 Sep 2026): plain ARKit/ARCore sessions, camera poses and frames, with no geospatial or geotracking API [V 1] | Custom, if Apple coverage in Milan is better than ARCore's (D) |
| `react-native-vision-camera` 5.2.3 | MIT | 20 Aug 2026 [V 1] | v5 released; v4 unmaintained; frame processors [V 34] | For camera features **without** AR (reading signs, arrival photo) |
| `react-native-fast-tflite` 3.0.1 | MIT | Apr 2026 [V 1] | LiteRT models with CoreML, Metal, GPU and NNAPI delegates; Expo config plugin [V 35] | Pair with VisionCamera |
| ML Kit (`@infinitered/react-native-mlkit-*` 5.0.0) | MIT wrapper; Google SDK terms | Nov 2025 [V 1] | Default detector: "home goods, fashion goods, food, plants, and places" [V 41] | No |

**Precision mode shape [M]:**
1. One native module opens the AR session (ARCore Geospatial on both platforms, D).
2. It reads the CPU image from each frame (Android shared camera [V 33]; iOS `ARFrame.capturedImage` [P]).
3. It runs the crossing/signal model with LiteRT or Core ML at 2–5 Hz.
4. It emits only `{pose, accuracy68, crossing?, signal?}` to JS.

VisionCamera and an AR session would compete for the same camera, so do not combine them. Apple's Magnifier door detection and Google Lookout have no public API [U].

### 6.2 Crossing and signal models and data

| Asset | Licence | What to reuse | Caveat |
|---|---|---|---|
| **RF-DETR** (`rfdetr` 1.11.0) | N/S/M/L Apache-2.0; XL/2XL PML 1.0 [V 36] | Fine-tune N (30.5 M params, 384 px) or S on crossing classes | Latency figures are T4 GPU (2.3 ms for N) [V 36]; phone latency unknown [U]; DINOv2 backbone may be heavy for mid-range phones |
| D-FINE-N/S, LW-DETR-T | Apache-2.0 [V 36] | Smaller alternatives (D-FINE-N 3.8 M params) | Same export work |
| **ImVisible PTL + LytNet** | MIT (repo) [V 38] | 5,059 images labelled with signal state and crosswalk endpoints; MobileNetV2-based LytNet at "21 fps" [V 38] | Dataset served from Google Drive; the licence is the repo's [U] |
| PTL-Crosswalk (Brazil/France) + Cheng's Crosswalk/PTLR (China, **Italy**) | Not stated [V 39] | Italian intersections are valuable | Ask the authors before training on it |
| Ultralytics YOLO (8.4.163) | **AGPL-3.0 or Enterprise** [V 37] | – | Avoid, including its export tools |
| `kairess/crosswalk-traffic-light-detection-yolov5` | **GPL-3.0** [V 40] | Idea only | – |

**Plan [M].** Start from LytNet's task definition (signal state plus crosswalk direction), then:
- train RF-DETR-N or D-FINE-S on PTL and our own Milan captures from chest height;
- export to LiteRT and Core ML;
- **never announce "green"**: the model only helps find the crossing and aim the body; the cane, the dog and traffic sounds decide (D, A).

Budget 2–3 wk, in phase 2.

## 7. Maps for the helper view on the phone

K covers this. In short:
- **`@maplibre/maplibre-react-native` 11.4.0** (MIT, 19 Sep 2026) with self-hosted PMTiles [V 1] (K §7).
- **`react-native-maps` 1.29.8** (MIT, Sep 2026) [V 1] uses Google's SDK on Android. "All mobile usage of the Maps SDK for Android is unlimited" [V 42], but it needs a Google key and billing account. Google's base map would not match the OSM geometry Milo routes on. Runner-up only.
- **`expo-maps` 57.0.3** (Apple/Google maps) [V 1] has the same mismatch.

## 8. Secure storage and local database

- **`expo-sqlite` 57.0.3** (MIT): FTS5 on by default, SQLCipher option (J, N). Use it for the `TripStore` (J) and city packs, opened read-only.
- **`@op-engineering/op-sqlite` 18.2.5** (MIT, 20 Sep 2026): adds an R*Tree plugin, sqlite-vec, custom tokenizers and `db.interrupt()` [V 44]. Switch only if spatial queries move into SQL or write speed matters. `flatbush` (N) covers the spatial index in memory.
- **`expo-secure-store` 57.0.4** (MIT): Keychain on iOS; Android Keystore-encrypted SharedPreferences. Rules:
  - some iOS versions rejected values above ~2,048 bytes;
  - use `AFTER_FIRST_UNLOCK(_THIS_DEVICE_ONLY)` for access while the phone is locked;
  - on iOS, items survive reinstall;
  - `requireAuthentication` keys are lost when biometrics change [V 43].

  Store only the install token (I, G) and the SQLCipher key. Never protect them with biometrics, or guidance breaks after a new fingerprint is added.
- **`react-native-mmkv` 4.3.2** (MIT, Jun 2026) [V 1]: not needed; SQLite's key-value store is enough.

## 9. Accessibility testing and developer tooling

| Tool | Licence | Activity | What it checks | Use in Milo |
|---|---|---|---|---|
| React Native Testing Library 14.0.1 | MIT | Jun 2026 [V 1] | Queries by role and label in Jest | Every screen: role, label, state |
| `react-native-accessibility-engine` 3.2.0 | MIT | npm Nov 2022; repo pushed 24 Sep 2026 [V 1, 2] | `toBeAccessible()` rules on test instances [V 51] | Add to Jest; check its RN 0.86 compatibility [U] |
| `eslint-plugin-react-native-a11y` 3.5.1 | MIT | Nov 2024; peer `eslint` ^3–^8 [V 52] | Lint rules | Needs a flat-config compatibility shim on ESLint 9 [U]; low value |
| **AMA** `@react-native-ama/*` 1.2.1 | MIT | npm Aug 2025; repo pushed Sep 2026 [V 1, 2] | Runtime scan in dev builds; highlights failing components; WCAG checks [V 50] | Dev builds only |
| **Maestro** | Apache-2.0 | Pushed 25 Sep 2026; 15.8k stars [V 2] | Flows on the accessibility tree; Expo documents it for EAS Workflows on emulator and simulator [V 47]. Cannot turn on VoiceOver or TalkBack [P 48] | Journey smoke tests; assert labels |
| Detox 20.51.4 | MIT | Jun 2026 [V 1] | Grey-box E2E | Skip (Maestro is enough) |
| **Appium XCUITest** 12.13.2 | Apache-2.0 | 23 Sep 2026 [V 1] | `mobile: performAccessibilityAudit` wraps XCTest's audit (contrast, element detection, hit region, description, Dynamic Type, clipped text, traits); Xcode 15 / iOS 17+ [V 46] | One CI job per release on the iOS simulator |
| AccessibilitySnapshot | Apache-2.0 | Pushed 17 Sep 2026 [V 2] | Snapshots of the iOS accessibility hierarchy; needs an XCTest host app [V 45] | Later, for the native "now playing" card |
| Android Accessibility Test Framework | Apache-2.0 | Last push Apr 2024 [V 2] | Espresso `AccessibilityChecks` | Optional: one instrumentation test |
| **TalkBack speech capture** (technique from `iray-tno/hozo`) | – | PR merged 15 Sep 2026 [V 49] | Enable TalkBack with adb; a logging TTS engine becomes the default; Tab moves focus; read logcat. API 33/35/36 only; UIAutomator turns TalkBack off; TalkBack gestures cannot be driven from adb [V 49] | **Adopt**: it records TalkBack's reading order **and Milo's own guidance utterances** on Android |

**What stays manual:** VoiceOver rotor and gestures, magic tap, headset keys, locked-screen guidance, and speech over traffic noise. These need the blind testers' script (L §2), not CI.

## 10. Recommended module list for the MVP app

| Need | Module | Why |
|---|---|---|
| Framework | Expo SDK 57 → 58 dev builds, New Architecture, EAS Build + Workflows | Current baseline (D); SDK 58 imminent, on RN 0.88 and worklets 0.13 [V 1] |
| Guidance core | **`milo-guidance`** (own Expo module, §11) | Nothing adequate exists |
| Permissions, heading in the foreground | `expo-location` | Permission UI only |
| Speech input | `expo-speech-recognition` (+ `react-native-nitro-speech` if the spike passes) | §4 |
| Earcons in the foreground, simple playback | `expo-audio` (or `react-native-audio-api` if its media-session spike passes) | §3 |
| Haptics in the foreground | `expo-haptics` | Background haptics live in the native module (D) |
| Screen awake for the helper card | `expo-keep-awake` | K |
| Memory, city packs | `expo-sqlite` (FTS5, SQLCipher) | J, N |
| Secrets | `expo-secure-store` (after-first-unlock) | §8 |
| Live share | `expo-crypto`, `react-native-qrcode-svg` | K |
| Map card (K2) | `@maplibre/maplibre-react-native` | K |
| Tests | Vitest (engine, assistant), Jest + RNTL + accessibility engine, AMA (dev), Maestro, Appium audit, TalkBack logcat job | §9 |

Not in the MVP: `llama.rn`, `whisper.rn`, ViroReact, VisionCamera, `react-native-fast-tflite`, ExecuTorch.

## 11. Custom native Expo modules (Kotlin/Swift)

| Module | Contents | Why no library | Effort [M] | Phase |
|---|---|---|---|---|
| **`milo-guidance`** | Android: foreground service `location|microphone|mediaPlayback`, fused 1 Hz fixes, step detector, heading. iOS: `CLBackgroundActivitySession`, `.fitness`, no auto-pause. Both: event stream to `packages/engine`, which is pure TS (D) | Transistor is paid and closed; `expo-location`'s background path is buggy (D) | 8–12 d (reference: Tracelet [V 7]) | MVP |
| **`milo-voice-out`** (in the same module) | Owns the audio session. iOS `AVSpeechSynthesizer` with `prefersAssistiveTechnologySettings`, `.voicePrompt`, duck + interrupt-spoken-audio. Android `TextToSpeech` with `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` and `GAIN_TRANSIENT_MAY_DUCK`. Earcons; background haptics; an it-IT voice for Italian names (L) | `expo-speech` lacks all of it (D); no library sets the navigation usage [U] | 5–7 d | MVP |
| **`milo-media-keys`** (only if the audio-api spike fails) | Media3 `MediaSession`; `MPRemoteCommandCenter` in the opt-in "exclusive audio" mode (D) | RNTP v5 is paid, v4 stale | 3–5 d | MVP |
| `milo-speech-analyzer` (only if nitro-speech fails) | iOS 26 `DictationTranscriber` with contextual strings | `expo-speech-recognition` lacks it [V 17] | 3–4 d | MVP+ |
| `milo-moonshine` (only if Parakeet via whisper.rn is too slow or big) | Moonshine streaming ASR | No RN binding [V 1] | 4–6 d | Later |
| **`milo-precision`** | ARCore Geospatial (Android; iOS via the `ARCore/Geospatial` pod), VPS availability, crossing/signal model on AR frames, 68%→95% conversion | Only Viro exposes Geospatial, inside a 3D engine [V 29] | 10–15 d + model 10–15 d | Phase 2 |

## 12. Corrections to initial assumptions

- **"Reuse, don't rebuild" does not hold for the guidance core.** The two mature modules became paid products in 2025–26 [V 3, 4, 12]. The open alternatives are stale or archived [V 2, 9]. About 2–4 weeks of Kotlin and Swift is unavoidable. That is where Milo differs from a map app.
- **"Camera from phase 2" is realistic only as a native module.** A Viro demo will look finished after a few days. But Viro mislabels accuracy [V 29, 30], and it cannot run a crossing detector on the same frames without work in its native layer [U].
- **Earlier reports need two corrections.** `whisper.rn` is now a good offline path, through Parakeet and Silero [V 19] (L said "not recommended"). A clean neural-TTS path exists in ExecuTorch's Kokoro with MIT G2P [V 15, 16] (L said Moonshine was the only one).
- **"sherpa-onnx for React Native" is not a drop-in.** The only active wrapper bundles LGPL code and lags upstream [V 20].

## 13. Open questions

1. Minimum OS: is iOS 17 / Android 10 acceptable for the pilot? Android 13 is needed for on-device recognition with biasing.
2. Should Milo stay buildable by third parties, for example on F-Droid? That rules out closed binaries such as Transistor, and even ARCore and ML Kit in the core build.
3. The headset "previous track" button: repeat, or push-to-talk (J §8)? It decides whether `milo-media-keys` is needed in the MVP.
4. Which phones will the Milan testers carry? Adreno/Hexagon versus Mali decides whether any on-device LLM is worth shipping (E).
5. May we record chest-height street video in Milan to train the crossing model? That needs a GDPR note for faces and number plates (W).

## Sources

1. npm registry metadata (versions, dates, licences, dist-tags) and npm search, 27 Sep 2026, for every package named. https://registry.npmjs.org/<package> ; https://registry.npmjs.org/-/v1/search
2. GitHub repository search API via the GitHub MCP server (pushed_at, stars, licence, archived), 27 Sep 2026. https://api.github.com/search/repositories
3. Transistor `react-native-background-geolocation` README (v5, licensing) and LICENSE. https://raw.githubusercontent.com/transistorsoft/react-native-background-geolocation/master/README.md
4. Transistor pricing page. https://docs.transistorsoft.com/purchase/?platform=react-native
5. Transistor native SDK README (`TSLocationManager.xcframework`; licence for App Store and Release builds). https://raw.githubusercontent.com/transistorsoft/native-background-geolocation/master/README.md
6. Transistor API reference. https://docs.transistorsoft.com/react-native/BackgroundGeolocation/
7. Tracelet README and pub.dev API; `@rapide-om/expo-tracelet` on npm. https://raw.githubusercontent.com/Ikolvi/Tracelet/main/README.md ; https://pub.dev/api/packages/tracelet
8. react-native-background-actions README. https://raw.githubusercontent.com/Rapsssito/react-native-background-actions/master/README.md
9. Notifee README (maintenance notice). https://raw.githubusercontent.com/invertase/notifee/main/README.md
10. Google Play Console Help: foreground service declarations. https://support.google.com/googleplay/android-developer/answer/13392821
11. react-native-track-player LICENSE (dev branch, Apache-2.0) and README. https://raw.githubusercontent.com/doublesymmetry/react-native-track-player/dev/LICENSE
12. RNTP site and V5 pricing. https://www.rntp.dev/ ; https://www.rntp.dev/pricing
13. react-native-audio-api README; AudioManager and PlaybackNotificationManager docs. https://raw.githubusercontent.com/software-mansion/react-native-audio-api/main/README.md ; https://docs.swmansion.com/react-native-audio-api/docs/system/audio-manager ; https://docs.swmansion.com/react-native-audio-api/docs/system/playback-notification-manager
14. Expo Audio docs (SDK 57). https://docs.expo.dev/versions/latest/sdk/audio/
15. React Native ExecuTorch README, LICENSE (third-party list), compatibility, LLM, TTS, STT, VAD and schema-validation docs. https://raw.githubusercontent.com/software-mansion/react-native-executorch/main/README.md ; https://raw.githubusercontent.com/software-mansion/react-native-executorch/main/LICENSE ; https://docs.swmansion.com/react-native-executorch/docs/other/compatibility ; https://docs.swmansion.com/react-native-executorch/docs/extensions/llm-chat-and-generation ; https://docs.swmansion.com/react-native-executorch/docs/extensions/text-to-speech ; https://docs.swmansion.com/react-native-executorch/docs/extensions/speech-to-text ; https://docs.swmansion.com/react-native-executorch/docs/extensions/voice-activity-detection ; https://docs.swmansion.com/react-native-executorch/docs/core-and-advanced/schema-validation
16. Phonemis (MIT G2P) repository metadata. https://github.com/IgorSwat/Phonemis
17. expo-speech-recognition README. https://raw.githubusercontent.com/jamsch/expo-speech-recognition/main/README.md
18. react-native-nitro-speech README. https://raw.githubusercontent.com/NotGeorgeMessier/nitro-speech/main/README.md
19. whisper.rn README (Parakeet, VAD, Hexagon). https://raw.githubusercontent.com/mybigday/whisper.rn/main/README.md
20. react-native-sherpa-onnx README (features, third-party licences). https://raw.githubusercontent.com/XDcobra/react-native-sherpa-onnx/main/README.md
21. Moonshine README (licence); Maven metadata. https://raw.githubusercontent.com/moonshine-ai/moonshine/main/README.md ; https://repo1.maven.org/maven2/ai/moonshine/moonshine-voice/maven-metadata.xml
22. PyPI JSON: silero-vad 6.2.3, sherpa-onnx 1.13.8. https://pypi.org/pypi/silero-vad/json ; https://pypi.org/pypi/sherpa-onnx/json
23. llama.rn README (GPU/NPU, tool calling, grammar, sessions). https://raw.githubusercontent.com/mybigday/llama.rn/main/README.md
24. LiteRT-LM README (v0.16.0, language APIs). https://raw.githubusercontent.com/google-ai-edge/LiteRT-LM/main/README.md
25. react-native-litert-lm README. https://raw.githubusercontent.com/hung-yueh/react-native-litert-lm/main/README.md
26. Callstack React Native AI README. https://raw.githubusercontent.com/callstackincubator/ai/main/README.md
27. Cactus LICENSE. https://raw.githubusercontent.com/cactus-compute/cactus/main/LICENSE
28. Apple, "Meet the Foundation Models framework", WWDC25 (via search summary). https://developer.apple.com/videos/play/wwdc2025/286/
29. ViroReact README and Geospatial docs. https://raw.githubusercontent.com/ReactVision/viro/main/README.md ; https://viro-community.readme.io/docs/geospatial
30. ARCore `GeospatialPose` reference (68th percentile). https://developers.google.com/ar/reference/java/com/google/ar/core/GeospatialPose
31. ARCore Geospatial API usage quota. https://developers.google.com/ar/develop/c/geospatial/api-usage-quota
32. ARCore iOS: enable the Geospatial API. https://developers.google.com/ar/develop/ios/geospatial/enable
33. ARCore shared camera access. https://developers.google.com/ar/develop/java/camera-sharing
34. VisionCamera README. https://raw.githubusercontent.com/mrousavy/react-native-vision-camera/main/README.md
35. react-native-fast-tflite README. https://raw.githubusercontent.com/mrousavy/react-native-fast-tflite/main/README.md
36. RF-DETR README (benchmarks, licences); PyPI `rfdetr` 1.11.0. https://raw.githubusercontent.com/roboflow/rf-detr/develop/README.md
37. Ultralytics README (licensing); PyPI `ultralytics` 8.4.163. https://raw.githubusercontent.com/ultralytics/ultralytics/main/README.md
38. ImVisible README and LICENSE. https://raw.githubusercontent.com/samuelyu2002/ImVisible/master/README.md
39. PTL-Crosswalk README. https://raw.githubusercontent.com/ronaldosm/PedestrianTrafficLightsAndCrosswalkDetection/master/README.md
40. kairess crosswalk-traffic-light-detection-yolov5 LICENSE (GPL-3.0). https://raw.githubusercontent.com/kairess/crosswalk-traffic-light-detection-yolov5/master/LICENSE
41. ML Kit Object Detection overview. https://developers.google.com/ml-kit/vision/object-detection
42. Maps SDK for Android, usage and billing. https://developers.google.com/maps/documentation/android-sdk/usage-and-billing
43. Expo SecureStore docs. https://docs.expo.dev/versions/latest/sdk/securestore/
44. op-sqlite README. https://raw.githubusercontent.com/OP-Engineering/op-sqlite/main/README.md
45. AccessibilitySnapshot README. https://raw.githubusercontent.com/cashapp/AccessibilitySnapshot/main/README.md
46. Appium XCUITest driver, execute methods (`mobile: performAccessibilityAudit`). https://raw.githubusercontent.com/appium/appium-xcuitest-driver/master/docs/reference/execute-methods.md
47. Expo docs: E2E tests on EAS Workflows with Maestro. https://docs.expo.dev/eas/workflows/examples/e2e-tests/
48. expo-boilerplate PR #142 (Maestro cannot enable VoiceOver/TalkBack; via search result). https://github.com/seandillon1224/expo-boilerplate/pull/142
49. iray-tno/hozo PR #452: reading what TalkBack says on the Android emulator. https://github.com/iray-tno/hozo/pull/452
50. React Native AMA README. https://raw.githubusercontent.com/FormidableLabs/react-native-ama/main/README.md
51. react-native-accessibility-engine README. https://raw.githubusercontent.com/aryella-lacerda/react-native-accessibility-engine/main/README.md
52. npm metadata for eslint-plugin-react-native-a11y 3.5.1 (peer dependencies). https://registry.npmjs.org/eslint-plugin-react-native-a11y/3.5.1
53. GitHub code search, `CLBackgroundActivitySession` (0 hits in `expo/expo`; hits in Tracelet and others), 27 Sep 2026. https://github.com/search?q=CLBackgroundActivitySession&type=code
54. Hugging Face model API: `nvidia/parakeet-tdt-0.6b-v3` (licence cc-by-4.0; language tags), 27 Sep 2026. https://huggingface.co/api/models/nvidia/parakeet-tdt-0.6b-v3

## Verification (27 Sep 2026)

An adversarial check re-fetched the primary sources for 30 claims (npm registry and tarballs, raw READMEs and LICENSE files, the GitHub API, PyPI, the Hugging Face API, Google, Expo and Software Mansion docs, Transistor and RNTP pricing pages, and hozo PR #452).

**Confirmed as written:** Transistor v5 licensing (release-only key, v4 keys invalid) and prices; RNTP V5 prices and npm `latest` 4.1.2 (Apache-2.0); `whisper.rn` Parakeet (English + 24 European languages, q4_0 356 MB, q8_0 669 MB) and `ggml-silero-v6.2.0`; nitro-speech 0.4.9 (MIT, SpeechAnalyzer with SpeechTranscriber or DictationTranscriber, contextual strings on both platforms; repo created 16 Jan 2026, 19 stars); sherpa-onnx wrapper (FFmpeg LGPL-2.1, Shine LGPL, pin 1.12.35, VAD "scheduled for 0.7.0"); llama.rn dist-tags (0.13.0-rc.6 on 26 Sep; last stable 0.12.9 on 4 Aug), JSON-Schema→GBNF, tool calling, New Architecture since v0.10; Cactus licence terms; ExecuTorch 0.10.x compatibility (SDK 57 ✅, worklets ≥0.10 <0.13), phonemis MIT, no espeak-ng, Kokoro Italian; Viro "95% confidence" versus Google's 68th percentile; ARCore quota (1,000 sessions or 100,000 requests per minute; no price); RF-DETR licences and N figures (30.5 M, 384×384, 2.3 ms T4 TensorRT FP16); hozo TalkBack technique (API 33/35/36, not 34; UIAutomator turns TalkBack off); Appium `performAccessibilityAudit` (Xcode 15 / iOS 17); Expo `next` 58.0.0-preview.7 and RN `latest` 0.87.1; voice and Notifee archived; Play Console foreground-service declaration with video; ImVisible (MIT, 5,059 images, 21 fps); kairess GPL-3.0; Ultralytics AGPL-3.0 8.4.163; ML Kit five classes; SecureStore behaviour; Maps SDK "unlimited" quote.

**Corrected or added:**
- `expo-speech-recognition` `contextualStrings`: the report said "Android 13+ only on-device". The on-device restriction belongs to `addsPunctuation`. The code sends biasing strings on API 33+ in either mode.
- `react-native-sherpa-onnx`: FFmpeg can be disabled at build time. The verdict stays "No", on the old pin and the missing VAD.
- ExecuTorch structured output: the cited "schema validation" page covers tensor shapes, not LLM output. "No constrained decoding" still holds.
- Moonshine licence: the models are MIT in every language except the legacy non-streaming non-English ones, not "English models MIT" only.
- Cactus: npm metadata says MIT, but the shipped LICENSE is the custom one.
- Expo SDK 58 preview bundles RN 0.88.0-rc.1 and worklets 0.13.0, outside ExecuTorch 0.10's range. This adds a condition to the ExecuTorch-Kokoro TTS fallback. MVP choices are unchanged, because ExecuTorch is not in the MVP.
- Also added: the Transistor 30-day trial and STUDIO tier; that the Play declaration applies to `microphone` too; that `expo-location` 57.0.20 has no iOS session APIs (tarball check); Parakeet CC-BY-4.0 verified [54]; `munim-xr` as a non-geospatial AR session module; heading conversion ≈2×; the hozo PR merge date.

No recommendation changed: every correction either strengthens an existing "No" or narrows a post-MVP option.
