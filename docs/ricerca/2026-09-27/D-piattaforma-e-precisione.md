# D: Platform research for Milo (September 2026)

Baseline: Expo SDK 57 / React Native 0.86 ([changelog](https://expo.dev/changelog/sdk-57)).

## Recommendations
1. **Guidance speech uses Milo's own TTS, not screen-reader announcements.** Announcements aren't guaranteed on a locked phone, Android 16 deprecated them, and only iOS can queue them. Keep them for foreground UI feedback.
2. **Replace stock expo-speech with a small native Expo module.** On Android it sets no audio attributes or focus; on iOS it ignores VoiceOver's voice and rate.
3. **Run guidance natively and event-driven** inside an Android `location` foreground service (FGS) or an iOS background-location session; expo-location's background path is buggy.
4. **Hands-free:** push-to-talk from the headset/TalkBack media key and the iOS magic tap. No volume-key tricks, no always-on wake word in v1.
5. **Without the camera, never say "now" or "the crosswalk is here"** unless the 95% error radius is small. Pick wording from uncertainty tiers. Offer an opt-in camera "precision mode" (VPS).

## 1. VoiceOver and TalkBack in React Native

**Props** ([RN docs](https://reactnative.dev/docs/accessibility)): `role` overrides `accessibilityRole` (use `adjustable`, `header`, `switch`, `radio`); `accessibilityState`; `accessibilityValue` (`{min,max,now}` or `{text}`); `accessibilityHint` (TalkBack hints "cannot be turned off", so keep them short). `accessibilityActions` + `onAccessibilityAction`: `activate`/`increment`/`decrement` on both platforms, `magicTap`/`escape` iOS-only, `longpress`/`expand`/`collapse` Android-only. `onMagicTap`/`onAccessibilityEscape` are iOS-only and bubble to ancestors; `accessibilityLiveRegion` is Android-only.

**AccessibilityInfo** ([docs](https://reactnative.dev/docs/accessibilityinfo)): `announceForAccessibility` interrupts; `announceForAccessibilityWithOptions(msg,{queue:true})` queues on iOS only; `announcementFinished` (iOS) reports success; `isScreenReaderEnabled()` + `screenReaderChanged`; `setAccessibilityFocus` is deprecated in favour of `sendAccessibilityEvent(ref,'focus')`. RN doesn't expose iOS 17 announcement priorities ([UIAccessibilityPriority](https://developer.apple.com/documentation/uikit/uiaccessibilitypriority)).

**Android 16** deprecates `announceForAccessibility`/`TYPE_ANNOUNCEMENT` in favour of live regions, pane titles and `setError` ([behavior changes](https://developer.android.com/about/versions/16/behavior-changes-all)). RN still calls the old API; migration is undecided ([discussion #848](https://github.com/react-native-community/discussions-and-proposals/discussions/848)).

**Magic tap.** iOS: Apple calls it "a salient action", such as play/pause ([doc](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/accessibilityperformmagictap())). Put `onMagicTap` on every screen and modal root. Android has no app API, but TalkBack's default two-finger double tap ("media control or voice input") sends `GLOBAL_ACTION_KEYCODE_HEADSETHOOK` unless a text field has focus (verified in [TalkBack source](https://github.com/google/talkback), `GestureController.java`). That reaches Milo when it owns the media-button session (§2): the practical equivalent.

**Pitfalls:** `accessible` containers swallow nested touchables; delay Android focus moves after navigation; don't re-announce what role/state already speaks; `accessibilityViewIsModal` is iOS-only.

| | Announcement | Milo TTS |
|---|---|---|
| Voice/rate | User's screen-reader settings | iOS can adopt them via `prefersAssistiveTechnologySettings` ([WWDC20](https://developer.apple.com/videos/play/wwdc2020/10022/)) |
| Locked/background | Not guaranteed | Works |
| Queueing | iOS flag only; Android interrupts | Full control |
| Ducking | Screen reader's own setting | Milo controls focus/session |

**expo-speech today** ([source](https://github.com/expo/expo/tree/main/packages/expo-speech)): Android always `QUEUE_ADD`, no `AudioAttributes`, no audio focus, and TTS shuts down when the Activity is destroyed. iOS is silent in silent mode and lacks `prefersAssistiveTechnologySettings`.

**Native module:**
- iOS: `AVSpeechSynthesizer` with `prefersAssistiveTechnologySettings = true`; session `.playback`, mode `.voicePrompt`, options `.duckOthers` + `.interruptSpokenAudioAndMixWithOthers` (Apple's turn-by-turn recipe, [doc](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voiceprompt)); deactivate with `.notifyOthersOnDeactivation`.
- Android: `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` + `CONTENT_TYPE_SPEECH`, focus `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` ([audio focus](https://developer.android.com/media/optimize/audio-focus)). From Android 15, focus requests fail unless the app is on top or runs an FGS.
- Policy: guidance via Milo TTS after a short earcon; UI feedback via the screen reader; never both (Apple: synthesis "is not a replacement for the UIAccessibility APIs").

**Settings screen:** one swipe stop per setting, value in the label. Toggles: `role="switch"` + `checked`. Rate/verbosity/units: `role="adjustable"` + increment/decrement + `accessibilityValue.text` ("1,5×"); users swipe up/down (VoiceOver, TalkBack 9.1+). Short option lists adjustable, long ones a radio sub-screen. Section titles `role="header"` for heading navigation. The Expo UI Slider lacks `accessibilityIncrements`/`Units` ([doc](https://docs.expo.dev/versions/latest/sdk/ui/drop-in-replacements/slider/)). Android guidance: merge content, use headings, live regions "sparingly" ([principles](https://developer.android.com/guide/topics/ui/accessibility/principles)).

## 2. Hands-free input

**Media buttons.**
- Android 8+: "the system tries to find the last app with a MediaSession that played audio locally" ([doc](https://developer.android.com/media/legacy/media-buttons)). TTS plays in the engine's process, so Milo must play audio itself (prompts pre-rendered with `synthesizeToFile` into Media3, or earcons) to own the session; verify on devices. expo-audio 55+ reportedly creates a session per player ([#50501](https://github.com/expo/expo/issues/50501)) but documents no remote-command events for JS: use Media3 in a custom module or react-native-track-player.
- iOS: `MPRemoteCommandCenter` works only for the Now Playing app, which needs a non-mixable session ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/110338/)). That excludes ducking, so make it an opt-in "exclusive audio" mode.
- Voice capture from a press: on Android, start the FGS from the foreground with types `location|microphone|mediaPlayback`; while-in-use permissions can't be gained from background ([rules](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)). A headset mic forces Bluetooth HFP (low quality); prefer the phone mic with A2DP output (iOS `playAndRecord` + `.allowBluetoothA2DP`; HFP wins if also allowed, [doc](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/allowbluetootha2dp)).

**Volume keys: avoid.** App Review 2.5.9 rejects apps altering them ([guidelines](https://developer.apple.com/app-store/review/guidelines/)); Android background `VolumeProvider` capture broke in Android 12 ([issue](https://issuetracker.google.com/issues/201546605)); TalkBack uses them.

**Wake word.**
- openWakeWord: Apache-2.0 code, but pretrained models are CC BY-NC-SA 4.0; English-only; targets <5% false rejects and <0.5 false accepts/hour ([repo](https://github.com/dscripka/openWakeWord)).
- sherpa-onnx keyword spotting: Apache-2.0, open vocabulary, 3 MB models, English/Chinese only ([docs](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)).
- Vosk `small-it-0.22`: 48 MB, 16.9% WER (CommonVoice), Apache-2.0 ([models](https://alphacephei.com/vosk/models)); fits grammar-limited commands.
- Porcupine: Picovoice sells B2B only; one-time trial, no personal plan, AccessKey validated online ([FAQ](https://picovoice.ai/docs/faq/general/)). A public app needs a paid licence.

**On-device recognition.**
- Android: `createOnDeviceSpeechRecognizer` (API 31), `checkRecognitionSupport`/`triggerModelDownload` (API 33); "not intended to be used for continuous recognition" ([reference](https://developer.android.com/reference/android/speech/SpeechRecognizer)). Check and download Italian at runtime.
- iOS: `requiresOnDeviceRecognition`; Apple lists Italian for on-device dictation ([availability](https://www.apple.com/ios/feature-availability/)), and iOS 26 `SpeechTranscriber` covers it.
- expo-speech-recognition 57.1.0 ([README](https://github.com/jamsch/expo-speech-recognition)): continuous (Android 13+), on-device, `contextualStrings`, offline model download, `iosCategory`, volume metering; no SpeechAnalyzer.
- sherpa-onnx: Parakeet-TDT-0.6B-v3 int8 covers 25 European languages incl. Italian; 640 MB, ~1.2 GB RAM on iOS ([#2626](https://github.com/k2-fsa/sherpa-onnx/issues/2626)). Same-size v2 runs at real-time factor 0.22 on one Cortex-A76 core ([docs](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html)). Whisper tiny int8: 12 MB encoder + 105 MB decoder, RTF 0.39–0.55 on a Raspberry Pi 4.
- Use platform recognition for push-to-talk; sherpa-onnx as offline fallback.

## 3. Background operation (screen locked)
- **Android:** `foregroundServiceType="location"` (+`microphone`, `mediaPlayback`), started from a visible activity; then `ACCESS_BACKGROUND_LOCATION` is unnecessary ([types](https://developer.android.com/develop/background-work/services/fgs/service-types)).
- **iOS:** `UIBackgroundModes` `location` + `audio`. When-In-Use suffices if updates start in the foreground (`CLBackgroundActivitySession`, iOS 17+, [doc](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)). Set `activityType = .fitness` and `pausesLocationUpdatesAutomatically = false`: users stand still at crossings.
- **expo-location:** the docs still demand "Always" permission, but the source checks only foreground permission (Android: with `foregroundService`, started in foreground). `watchPositionAsync` stops in background. Android background fixes pass through JobScheduler into headless JS. Open 2026 bugs: intervals ignored ([#46788](https://github.com/expo/expo/issues/46788)), FGS frozen after app update ([#47595](https://github.com/expo/expo/issues/47595)), crashes on API 28–30 ([#47571](https://github.com/expo/expo/issues/47571)). Write Milo's own location module.
- **Battery:** Google's I/O 2013 figure: high-accuracy fixes every 5 s cost 7.25%/hour on phones of that era ([TNW](https://thenextweb.com/google/2013/05/16/inside-googles-new-location-apis-for-android)). Dual-frequency GNSS costs 37% more power outdoors, 28% indoors ([Karki & Won](https://arxiv.org/abs/1910.13041)). My estimate for 1 Hz screen-off guidance on a current phone: ~2–5%/hour. Measure it.
- **Audio:** see §1. HIG: on headphone disconnect people "expect playback to pause immediately"; pause, vibrate, offer the speaker.
- **Haptics:** expo-haptics has no custom patterns and is disabled in iOS Low Power Mode ([doc](https://docs.expo.dev/versions/latest/sdk/haptics/)). Core Haptics stops when the app is suspended, so a locked iPhone can't give haptic cues. Android background apps may vibrate only with ringtone/notification/alarm usage ([Vibrator](https://developer.android.com/reference/android/os/Vibrator)); AOSP counts an FGS app as foreground, but Battery Saver drops all but ringtone/alarm-class vibrations ([AOSP](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/vibrator/VibrationSettings.java)). Haptics only duplicate audio: short `VibrationEffect.createWaveform` rhythms (<1 s), one per cue.

## 4. Positioning precision
- **Open sky:** phones are "typically accurate to within a 4.9 m (16 ft.) radius under open sky" ([GPS.gov](https://www.gps.gov/gps-accuracy)).
- **Campus with buildings and trees** (iPhone 6, [Merry & Bettinger 2019](https://doi.org/10.1371/journal.pone.0219890)): RMSE 9.9 m, average 7–13 m, max 99.7 m.
- **Urban canyons:** multipath can exceed 50 m; L5 cut one satellite's pseudorange error from 6.32 to 1.46 m; 3D-mapping-aided L1/L5 averaged within 10 m ([Ng et al. 2021](https://navi.ion.org/content/68/4/727)). Google's pedestrian-only fused-location corrections (3,850+ cities) cut wrong-side-of-street fixes 50–75% ([blog](https://android-developers.googleblog.com/2020/12/improving-urban-gps-accuracy-for-your.html)). Sidewalk matching reached <5 m and the correct street side ([Weng et al. 2025](https://doi.org/10.1186/s43020-025-00159-8)).
- **L1/L5 phones:** "most flagship" Androids ([Android](https://developer.android.com/develop/sensors-and-location/sensors/gnss)); iPhone 14 Pro/15 Pro/16 Pro/17, not 15/16/16e (Apple spec pages).
- **Accuracy values:** Android `getAccuracy()` is a 68% radius ([doc](https://developer.android.com/reference/android/location/Location#getAccuracy())); iOS gives a "radius of uncertainty" with no stated level. ×1.6 gives 95% if Gaussian; urban tails are heavier, so use ≥2×. Detect approximate-only permission.
- **Heading:** compass errors reach "up to 180 degrees" ([Google 2019](https://research.google/blog/using-global-localization-to-improve-navigation/)); GNSS course needs walking.
- **ARCore Geospatial (VPS):** Street View-based, "over 87 countries", localizes "in less than a second", the tech behind Live View since 2019 ([blog](https://developers.googleblog.com/2022/05/Make-the-world-your-canvas-ARCore-Geospatial-API.html)). Needs an ARCore device, camera, internet and Google Cloud auth; check with `checkVpsAvailabilityAsync` ([doc](https://developers.google.com/ar/develop/java/geospatial/check-vps-availability)). Reported accuracies are 68% values; Google's sample accepts 10 m/15° ([sample](https://github.com/google-ar/arcore-android-sdk)). Independent test: 0.75–0.80 m mean vs 7.2–7.3 m GPS+compass ([Brata et al. 2024](https://doi.org/10.3390/s24041161)). Milan's dense Street View makes coverage likely; verify per street and porticoes.
- **ARKit location anchors:** A12+ and GPS; Apple only says "over 20 countries", incl. Europe, with no city list ([doc](https://developer.apple.com/documentation/arkit/argeotrackingconfiguration)). Apple Maps' AR walking directions list Milan, Rome, Turin, Florence, Naples, Venice; confirm with `checkAvailability(at:)`.
- **Dead reckoning:** sighted walkers get >98.6% step detection ([Lee 2015](https://doi.org/10.3390/s151027230)) and 1.43% distance error ([Wang 2019](https://doi.org/10.3390/s19040840)). Blind walkers differ: mean stride 0.55 m (cane), 0.62 m (dog), 0.74 m (sighted), and sighted-trained models fail for cane users ([Ren et al. 2021](https://doi.org/10.3390/s21124033)). With 7 blind participants, a phone-in-pocket backtracking app lost track in 6 of 21 trials ([Tsai et al. 2024](https://doi.org/10.1145/3696005)). Calibrate stride per user.
- **Others' claims:** Google publishes no Live View figures ("much more accurate" than GPS). Waymap's "SmartStep" is AI dead reckoning from motion sensors, per-user gait learning and CAD-based venue models, with no published error figure ([tech](https://www.waymapnav.com/how-it-works)).

## Conclusion: realistic precision and architecture

| Cue | Without camera | With camera (VPS localized) |
|---|---|---|
| "Turn now" | Open sky, dual-frequency, map-matched: 95% radius ~5–10 m, so say "at the next corner" and "now" only under 5 m. Milan canyons/porticoes: 10–30 m plus wrong-side errors: never "now"; count steps down, confirm turns by gyroscope. | ~1 m and a few degrees: "now" is OK. |
| "The crosswalk is here" | Not achievable (needs 1–2 m plus heading). Say a crossing should be within ~15 m; find the curb. | Plausible; add on-device crossing detection. Cane or dog confirms. |

**Architecture**
1. **Native Expo module (Kotlin/Swift)** inside the FGS / background session: 1 Hz fused location, step detector, heading, fusion and HMM sidewalk map matching ([Newson & Krumm 2009](https://doi.org/10.1145/1653771.1653818)), TTS/earcons/haptics, media session.
2. **`packages/engine` (TypeScript):** pure cue decisions from (fix, uncertainty, map); event-driven, no background timers.
3. **React Native UI** for planning and settings.
4. **Opt-in precision mode:** ARCore Geospatial (Android and iOS) or ARKit, phone on a chest mount.
5. **Web:** planning only.

**Honest wording by 95% radius r:**
- r ≤ 5 m: "Svolta a sinistra adesso."
- 5–15 m: "Al prossimo incrocio, tra circa 30 metri, svolta a sinistra."
- r > 15 m: "Segnale GPS debole, posizione incerta di circa 40 metri. Prosegui su via Dante; ti avviso appena migliora."
- Crossing without camera: "Dovresti trovare un attraversamento entro 15 metri: cerca il bordo del marciapiede." Never "sei sulle strisce".
- Announce tier changes; "Dove sono?" states precision.
