# L: English first: communities, platform share, recruitment, English speech stack
Research date: 27 Sep 2026. Tags: [V] verified in a primary source I fetched; [P] secondary source or search snippet; [U] could not verify, or my own estimate. Numbers in brackets point to the Sources list.

This report builds on D (platform, wake word, on-device recognition for Italian), E (Italian ASR table, confirmation policy), F (Milan OSM data), G (turn-taking, VAD), I (server, question "where do English testers live?") and J (clarification, per-word confidence). It does not repeat them.

## Recommendations

1. **iOS first for the English beta, Android second from the same Expo codebase.** Among screen-reader users, iOS has 84% in North America, 75% in Australia and 72% in Europe/UK [V 1]. TestFlight reaches 10,000 external testers through one public link [V 3]. Google Play makes new personal accounts run a 12-tester, 14-day closed test first [V 4]. This reverses the plan's "Android per primo", which was chosen for an Italian-first product.
2. **Anchor the first English cohort in the UK and Ireland, and take US and Australian TestFlight testers as they come.** The UK and Ireland are one hour from Milan. They have active charities and the Soundscape community. Their OSM crossing data is better than the US's: about 25% of signalised crossing nodes carry `traffic_signals:sound` in Great Britain, against about 10% in the US (§4.3).
3. **Recruit through AppleVis, Blind Android Users, Double Tap and the Mastodon/RBlind community**, with a TestFlight public link, in-app voice feedback and a one-page privacy statement. Approach NFB, RNIB and Guide Dogs only once there is a build to test (§2).
4. **Speech recognition: use the platform recognizers first.** On iOS 26 that means `DictationTranscriber` with contextual strings. On Android it means the on-device `SpeechRecognizer` with biasing strings. The fallback is **Moonshine Small Streaming** (MIT, 123M parameters, 7.84% average English WER, 234 ms on a Pixel 10a) [V 30, 31]. Parakeet-TDT-0.6b-v2 is the most accurate open English option, but at 0.6B parameters it is not worth shipping on the phone.
5. **No always-on "Hey Milo" in the MVP.** For hands-free use on iOS, ship **Siri App Shortcuts** ("Hey Siri, ask Milo where I am"). They use Apple's low-power hotword hardware. English-only models remove the language objection, but three blockers remain:
   - licences: openWakeWord's pretrained models and the default negative training data of both openWakeWord and microWakeWord are non-commercial [V 43, 44]. ESPHome's microWakeWord models are Apache-2.0 [V 69], but none of them is "Hey Milo", so a custom model is needed anyway;
   - battery: Home Assistant calls the cost "noticeable", and its Android wake word only works when the app is set as the default digital assistant [V 46];
   - iOS background rules [V 7].

   Revisit after the MVP with an Android-only, opt-in model trained on permissively licensed data (§3.2).
6. **Speech output: platform voices only.** On iOS, set `prefersAssistiveTechnologySettings` so Milo speaks with the user's own voice while VoiceOver (or another assistive technology) is on; with it off, the utterance's own settings apply [V 51]. Do not bundle neural TTS. Piper embeds espeak-ng (GPL-3.0), Kitten requires it, and Kokoro's G2P (misaki) uses it as the fallback for out-of-dictionary words [V 33, 54, 55, 56]; sherpa-onnx links espeak-ng whenever TTS is compiled in [V 39].
7. **Content: add an English lexicon layer (en-US, en-GB, en-AU) and CLDR unit rules**, and keep Italian templates alongside them with a key-parity test in CI (§4). The current `en.ts` is British and metric-only ("pavement", "kerb", `metres`), so a US tester would hear the wrong words and units.

## 1. Platform share and what it means for a two-person Expo team

| Source | Finding |
|---|---|
| WebAIM Screen Reader Survey #10 (Dec 2023–Jan 2024, 1,539 respondents; 47.2% North America, 30.7% Europe, 3.3% Oceania) | Primary mobile platform: iOS 70.6%, Android 27.6%. 91.3% use a screen reader on mobile. iOS share: North America 84%, Australia 75%, Europe/UK 72%, Asia 40%, Africa/Middle East 34%, South America 31%. Respondents with disabilities use iOS more (72.4% vs 56%) [V 1] |
| WebAIM #11 (survey dates not stated on the page) | Closed; results "will be posted here in the near future" (checked 27 Sep 2026) [V 2]. Re-check before finalising the plan |
| RNIB, AFB | No current iPhone/Android split for blind users found [U]. A market-research figure (53.2% iPhone "preference share") has no disclosed method, so ignore it [P] |

**What this means.** Roughly three in four to four in five English-speaking screen-reader users in WebAIM's sample are on iOS (72–84% by region; the sample is self-selected and skews towards North America). The iOS-first precedents in C (VoiceVista, Soundscape Community, BlindSquare) all built their communities on AppleVis and TestFlight. Android matters for three groups: blind users in Italy on cheaper phones, the Blind Android Users community, and anyone who later wants an always-on wake word (§3.2). It is not where the English beta testers are.

| | iOS (TestFlight) | Android (Play testing) |
|---|---|---|
| Reach | 100 internal, 10,000 external testers, public link [V 3] | Internal track for the team; new personal accounts need 12 testers opted in for 14 continuous days before production [V 4] |
| Gate | Beta App Review for the first build in a group [V 3] | None for internal testing [P]; the 14-day gate applies only to production access |
| Build life | 90 days [V 3] | No expiry |
| Feedback | TestFlight app or screenshot [V 3]; screenshots are useless to blind testers, so add voice feedback in the app (§2.3) | Email or in-app |
| Cost | Apple Developer Program, $99/year [P] | $25 once [P]. From 30 Sep 2026 app registration is required only in Brazil, Indonesia, Singapore and Thailand, and unregistered apps can still be sideloaded there "with Android Debug Bridge (adb) or advanced flow"; verification goes global "in 2027 and beyond" [V 6] |

**Expo specifics.**
- EAS Free gives 15 iOS and 15 Android builds a month on a low-priority queue with a 45-minute timeout. Starter costs $19/month plus usage [V 5].
- EAS Update pushes JavaScript-only fixes to up to 1,000 monthly active users for free [V 5]. Template and wording fixes can therefore reach testers without a new TestFlight build.
- iOS builds run in EAS's cloud without a Mac. Writing and debugging the Swift half of D's native module (TTS, location, media session) does need Xcode on a Mac [U: not a documented requirement, but practical].

**Recommendation.** Treat iOS as the release gate for the English MVP and Android as the second target of the same code. Build Android in CI from day one. Put it on a Play internal track for the founders' own phones and for Milan testers who use Android. The Android native module can trail by one milestone. What iOS costs, as documented in D:
- no haptics while locked;
- media-button control only in an exclusive-audio mode;
- no volume-key tricks;
- a mic that stays open in the background must show an indicator and be justified to App Review (guidelines 2.5.4 and 2.5.14) [V 7].

None of these blocks turn-by-turn guidance with the screen locked.

**Assumption to correct.** "English means more users and testers" is true. But it moves the natural first platform from Android to iOS, and the plan's line 153 still says Android first.

## 2. Where English-speaking blind users and testers gather

### 2.1 Channels

| Channel | Platform bias | How to use it | Status / evidence |
|---|---|---|---|
| **AppleVis** forums (App Development & Programming; iOS & iPadOS) and app directory | iOS | Post "beta testers wanted" with a TestFlight public link. Developers do this routinely, and users have proposed a standing tester pool [P 14]. Get Milo listed in the directory | Site blocks crawlers (403), so it was read through search snippets [P]. VoiceVista's developer recruited testers here and won Best Developer in AppleVis's 2024 Golden Apples [P 13] |
| **AppleVis Extra** podcast | iOS | Developer interviews, such as VoiceVista in #95 [P 13] | Active [P] |
| **Blind Android Users**: podcast, groups.io mailing list, Telegram, Facebook, YouTube | Android | "Meet the Developer" episodes (ep. 301); a good source for the 12 Play testers | Episode 303 published 26 Sep 2026 [V 15] |
| **Double Tap** (AMI-audio, Canada; hosts Steven Scott and Shaun Preece) | Both | Daily show; listed as a Soundscape partner [V 9]; covered the Soundscape Android beta [V 10] | Renewed for 2026-27, "daily at Noon Eastern" [V 18] |
| **Main Menu** (ACB Media) | Both | Two-hour technology show; recent episodes feature apps in development [P 19] | Active [P] |
| **Access On** (NFB, Jonathan Mosen) | Both | Weekly show with reviews and interviews [P 20] | Replaced Living Blindfully, which ended with episode 305 on 28 Sep 2024; Access On was announced on its feed in Nov 2024 [V 20] |
| **Blind Abilities** (Jeff Thompson) | Both | Interviews app developers [P 22] | Episodes in 2026 [P] |
| Talking Tech (Vision Australia Radio) | – | – | **Ended 6 May 2025** ("the final edition of this 13 year long weekly program") [V 21]. Remove it from the list |
| **Mastodon** (dragonscave.space and TweeseCake are run by and for blind people; tags #blind #a11y) and **RBlind** (a Lemmy forum) | Both | Short posts with a link; screen-reader-friendly clients | [P 17] |
| r/Blind | Both | Read the sidebar rules before posting; its moderators protested Reddit's 2023 API change [P] | Reddit blocks this crawler (B) [U] |
| Eyes-Free (Google Group) | Android | Largely superseded; reported to be moving to announcements only [P 16]. Use Top Tech Tidbits' list directory instead [P 16] | – |
| **NFB** research program | US | Online "research participant solicitation" form; NFB reviews each request [P 23] | Page returns 403 to crawlers [U] |
| **ACB** | US | Distributes approved studies through its mailing lists [P 24] | [P] |
| **RNIB** | UK | Paid, observed user testing with a panel [P 25]. Useful before a public UK launch, not for a free beta | [P] |
| **Guide Dogs UK**, Seescape | UK | Soundscape's charity partners [P 9] | [P] |
| Vision Australia, CNIB | AU, CA | Not researched in depth [U] | – |
| **O&M professionals** | – | US: ACVREP certifies COMS [P 26]; AER's O&M division [U]. UK: RWPN, with about 450 registered Vision Rehabilitation Specialists and about 120 habilitation specialists [P 26]. AU/NZ: OMAA [P 26] | – |
| **University labs** | – | **EveryWare Lab, Università degli Studi di Milano** (Mascetti, Ahmetovic), in Milan, with published work on O&M apps and crossings [P 27]. It is the obvious local partner for field tests and ethics review | – |

### 2.2 How comparable projects recruited

- **Soundscape Community (iOS, MIT):** a Discord server for feedback, TestFlight builds from a GitHub Actions workflow, and translations on Weblate [V 8].
- **Scottish Tech Army Soundscape (Android):**
  - an open beta on the Play Store;
  - one email address that feeds a help desk [V 11];
  - charity partners (Guide Dogs, Seescape) and a podcast partner (Double Tap) [V 9, 10];
  - a public call for help with "translation, testing, and user guides" [V 10];
  - developer field tests fed straight back into PRs [P 12].
- **VoiceVista:** a solo developer on AppleVis and TestFlight, praised for "continually listening to and acting upon feedback" (B).

I found no documented numbers of testers for any of them [U].

### 2.3 What makes blind testers engage

This combines B's evidence with the patterns above.
- **Zero-friction install:** a TestFlight public link and a Play opt-in link. No account in the app.
- **Feedback by voice, from inside the app:** a long press, or "Milo, report a problem", records up to 60 s. With a spoken consent, it attaches the last few minutes of the trip log and uploads to the VPS (see I). Screenshots, the TestFlight default, do not work for this audience.
- **A privacy statement short enough to read aloud:** no location tracking; trip logs only with each report; retention period; deletion on request. Also read it as the first onboarding screen.
- **A visible response loop:** a changelog in TestFlight's "What to Test" field, read aloud on first launch after an update, and replies within days (B §15).
- **Honest scope:** "a supplement to cane, dog and O&M, not a replacement" (F §1). Many testers are O&M-literate.
- **Paying for moderated field sessions** in Milan (gift cards): usual in research [U: I did not check local rates].

### 2.4 Recruitment sequence

| Step | When | Target |
|---|---|---|
| R1. Landing page, privacy page, TestFlight group, Play internal track, feedback endpoint | Before the MVP; in parallel with engine work | – |
| R2. Seed cohort: AppleVis post, Blind Android Users list and Telegram, Mastodon/RBlind | MVP build | 15–30 English testers, with at least 12 on Android for the Play gate |
| R3. Milan in-person cohort through EveryWare Lab and UICI Milano (Italian templates) | Same build | 5–8 testers |
| R4. Podcast pitches (Double Tap, Blind Android Users, AppleVis Extra, Main Menu, Access On) | After R2 feedback is fixed | Hundreds, depending on city data |
| R5. NFB and ACB solicitation; RNIB or Guide Dogs partnership | Before any public UK/US launch | Structured studies |

## 3. English speech stack on the phone

### 3.1 Speech recognition

| Option | Licence | Size | English accuracy | Speed | Verdict |
|---|---|---|---|---|---|
| iOS 26 SpeechAnalyzer: `SpeechTranscriber` and `DictationTranscriber` | OS | OS-managed | On a ~12 h earnings-call subset: SpeechTranscriber 14.0% WER, against WhisperKit small.en 12.8% and Parakeet v2 11.7% [V 35]. A single-file test gave 8% against Whisper Large v3 Turbo's 1% [P 36] | 70× real time on an M4 Mac [V 35] | **Default on iOS 26+.** An Apple engineer confirms that contextual strings "only help transcriptions from the `DictationTranscriber` module" [V 37], so use DictationTranscriber for commands; Apple also suggests an `SFSpeechLanguageModel` custom language model with it [V 37]. On older iOS, use `SFSpeechRecognizer` on-device with `contextualStrings` |
| Android on-device `SpeechRecognizer` | OS | OS-managed | No published WER (E) | Streaming partial results | **Default on Android 13+** with biasing strings (E, J) |
| **Moonshine v2 Streaming** (Moonshine AI) | **MIT for English** (only non-English non-streaming models are non-commercial) [V 29] | 34M (Tiny), 123M (Small), 245M (Medium) parameters, 8-bit | Open ASR average: 12.00 / 7.84 / 6.65%. Quantised LibriSpeech-clean: 4.83 / 2.61 / 2.17% [V 31] | Pixel 10a: 92 / 234 / 420 ms. Whisper Small, 1,940 ms on a MacBook Pro [V 30] | **Fallback of choice.** Native Swift package and Maven artifact `ai.moonshine:moonshine-voice:0.1.5`; no React Native binding, so wrap it in the Expo module [V 34]. A key-terms list or passage cuts errors on names by "up to 40%" [V 32]. **No Italian model** [V 31] |
| Parakeet-TDT-0.6b-v2 (NVIDIA, 1 May 2025) | CC-BY-4.0 [V 28] | 0.6B parameters; about 0.64 GB int8 (D) | Average 6.05%; LibriSpeech clean 1.69%; 11.88% at 0 dB SNR, 20.26% at −5 dB [V 28] | Real-time factor 0.22 on one A76 core (D) | Too heavy as the default download. A possible **VPS** fallback, but that sends voice off the phone (G) |
| Nemotron Speech Streaming EN 0.6B, ONNX int4 | [U] | 0.67 GB | 8.20% streaming average; 0.56 s algorithmic latency on CPU [V 68] | – | Watch; heavier than Moonshine for similar accuracy |
| whisper.cpp / `whisper.rn` 0.7.4 (MIT, 27 Aug 2026) [V 41] | MIT | tiny 39M to large 1.5B | Whisper Tiny 12.81%, Small 8.59% [V 30] | Fixed 30 s window; slow for live use [V 30]; inserts text that was never said (E) | Not recommended |
| sherpa-onnx 1.13.8 (10 Sep 2026) [V 39]; `react-native-sherpa-onnx` 0.4.4 (MIT, third party, first published Jan 2026) [V 40] | Apache-2.0 | – | Runs Parakeet v3 for Italian (E) | – | Keep for **Italian** offline recognition. Build with `SHERPA_ONNX_ENABLE_TTS=OFF`: when TTS is on, CMake downloads and links espeak-ng [V 39]. Check whether the RN wrapper does the same [U] |

`expo-speech-recognition` 57.1.0 (16 Sep 2026) exposes `contextualStrings` and `requiresOnDeviceRecognition` but does not mention SpeechAnalyzer [V 38]. DictationTranscriber therefore needs D's native module.

**Italian street names in English speech (Milan field tests).**
- Feed the recognizer the nearby OSM street names: DictationTranscriber contextual strings, Android biasing strings, or Moonshine key terms.
- Keep J's phonetic n-best matching against the local gazetteer.
- A Milan tester will say "Corso di Porta Ticinese" inside an English sentence. Add about 50 such recordings to G's S1 corpus.

### 3.2 Wake word "Hey Milo"

| Engine | Code | Pretrained models | Custom "Hey Milo" | Notes |
|---|---|---|---|---|
| openWakeWord 0.6.0 (last PyPI release Feb 2024) | Apache-2.0 | CC BY-NC-SA 4.0, English only [V 43] | Colab recipe "<1 hour". Its standard negative data (ACAV100M features, ~2,000 h) is **CC BY-NC-SA 4.0** [V 43] | Aims for <0.5 false accepts per hour and <5% false rejects [V 43] |
| microWakeWord (used by Home Assistant) | Apache-2.0 | okay_nabu, hey_jarvis, hey_mycroft, published by ESPHome under Apache-2.0 [V 69] | Positives from Piper sample generator [V 45]; its negative-feature dataset is **CC BY-NC 4.0** [V 44]. "Training a model that works well is still very difficult" [V 44] | Runs on microcontrollers, so it is cheap on a phone |
| sherpa-onnx KWS, zipformer 3.3M | Apache-2.0 | Open vocabulary: "HEY MILO" works without training | Trained on GigaSpeech, whose audio is licensed "only for non-commercial research and educational purposes" [V 42]. No licence file found for the model [U] | No published false-alarm rate [V 42] |
| Picovoice Porcupine (RN SDK 4.0.0, Apache-2.0 wrapper) | Proprietary engine | Custom keywords via console | Paid; Picovoice publishes no price list. A third-party page (May 2026) quotes a user citing "the $6,000 cost associated with the Foundation Plan", period not stated; the free tier is described as "Free evaluation" [P 47]; no personal plan (D) | Best-documented accuracy, but lock-in and cost |

**Can a custom model be trained and shipped commercially?** The code is Apache and a trained model is your own. Whether weights trained on non-commercial data are "derivative" is legally unsettled [U]. The clean path is to train on data you can document:
- **positives:** Kokoro voices (Apache-2.0 [V 54]) plus about 50 recorded volunteers;
- **negatives:** LibriSpeech (CC BY 4.0) and MUSAN noise (CC BY 4.0) [V 48].

Then publish the data manifest. Budget 1–2 weeks, including an outdoor false-accept test. "Milo" is a common first name and dog name, so false accepts on the street will be worse than the indoor benchmarks.

**Battery and platform.**
- Home Assistant's Android app (microWakeWord, from app 2026.2.3) says wake-word detection "has a noticeable impact on battery life" and "uses more battery than 'Ok Google' because Google Assistant has access to dedicated low-power hardware" [V 46]. It needs Home Assistant set as the default digital assistant app and is labelled "experimental" [V 46]; a Milo wake word on Android would face the same trade-off.
- I found no measured %/hour for a third-party phone wake word [U]. My estimate is 2–6%/hour on top of guidance, mostly from keeping the CPU and audio path awake [U]; measure it.
- On iOS, a background mic needs the audio background mode, an on-screen indicator, and a reason App Review accepts [V 7].

**Hands-free paths that exist today.**
- **iOS App Shortcuts** (App Intents, iOS 16+): phrases include the app name, such as "Ask Milo where I am", and work through "Hey Siri" and AirPods [P 49]. Recommended for the MVP.
- **Android:** Google Assistant was discontinued on Android and Wear OS on 4 Sep 2026 in favour of Gemini (Wikipedia, citing 9to5Google and Android Police) [P 50]. AppFunctions, which lets Gemini call app actions, is "experimental", Android 16+, "private preview with trusted testers" [V 50]. Register interest; do not plan on it.
- **Both platforms:** D's headset button and magic tap.

**Assumption to correct.** English-first removes only the language objection to a wake word. The licence, battery, false-accept and iOS objections remain.

### 3.3 Speech output

- **iOS:** `AVSpeechSynthesizer` with `prefersAssistiveTechnologySettings = true`. VoiceOver's voice, rate and pitch then take precedence over the utterance's own settings; if no assistive technology is on, the utterance's values are used [V 51]. Eloquence and other system voices show up in `speechVoices()` [P 52]. Reported iOS 26 regression: `AVSpeechSynthesisVoice(language:)` ignores voices the user picked in Spoken Content, especially third-party voices (FB20271264). An Apple DTS engineer replied that engineering could not yet reproduce it and was still investigating; the thread (Oct 2025) confirms no fix [V 53]. Test with VoiceOver on and off.
- **Android:** the user's chosen TTS engine (Google, Eloquence, Vocalizer, RHVoice). Milo sets only language, rate and D's audio attributes.
- **Neural TTS: do not bundle.**

| Engine | Licence of weights | Hidden dependency |
|---|---|---|
| Kokoro-82M v1.0 (27 Jan 2025) | Apache-2.0 [V 54] | G2P via misaki, which falls back to espeak-ng (GPL) [V 33, 54] |
| Kitten TTS 0.8 (15M–80M parameters, "developer preview") | Apache-2.0 [V 55] | Requires `phonemizer` and `espeakng_loader` [V 55] |
| Piper (`piper-tts` 1.8.0, 4 Sep 2026) | Code GPL-3.0-or-later; "Looking for maintainers" [V 56] | Embeds espeak-ng [V 56] |
| sherpa-onnx TTS | Apache-2.0 | Links espeak-ng when TTS is enabled [V 39] |
| Moonshine TTS | MIT, with its own G2P written "to allow wider usage" [V 33] | Voices are Kokoro and Piper voices, each with its own licence [U] |

GPL-3.0 inside an App Store binary conflicts with Apple's distribution terms. Moonshine's own documentation explains the espeak-ng problem [V 33]. Neural voices would only help if platform voices proved poor, and blind users generally prefer their own voice at their own rate (B). If that changes, Moonshine's MIT G2P with Kokoro voices is the only clean path found.

**Italian names in an English voice.** An en-US voice will mangle "via Arcivescovo Calabiana". Speak the name as a separate utterance with an it-IT voice, controlled by a setting ("Say Italian names in Italian", default on in Italy). On iOS, `AVSpeechSynthesisIPANotationAttribute` can also set pronunciation word by word [P 67]. OSM's `name:pronunciation` (IPA), which Mapbox's navigation SDK uses [P 65], is almost never mapped: 267 uses in Italy, 1,010 in Great Britain, 4,095 in the US [V 66].

## 4. What changes in the content

### 4.1 Lexicon

| Concept | en-US | en-GB | en-AU | it | OSM source |
|---|---|---|---|---|---|
| Walkway beside a road | sidewalk | pavement | footpath | marciapiede | `footway=sidewalk`, `sidewalk=*` |
| Kerb | curb | kerb | kerb | cordolo | `kerb=lowered/flush/raised` |
| Place to cross | crosswalk | crossing | crossing | attraversamento | `highway=crossing` |
| Junction | intersection | junction | intersection | incrocio | graph degree |
| Accessible signal | accessible pedestrian signal (APS) | crossing with a bleeper / rotating cone | audio-tactile signal | semaforo sonoro | `traffic_signals:sound/vibration` |
| Distance | feet, miles, "blocks" | yards or metres (§4.2) | metres | metri | – |

Implement this as a small lexicon that overrides one English template file, not as three copies. "Block" makes sense only in grid cities: derive it from counts of mapped junctions, US only.

### 4.2 Units

- **CLDR road-distance preferences:**
  - US: feet, rounded to 1 ft below 10 ft, to 10 ft from 10 ft and to 50 ft from 100 ft; miles from 0.5 mi.
  - GB: the same steps in yards.
  - Default (region 001): metres, rounded to 1 m, to 10 m from 10 m and to 50 m from 300 m, then kilometres from 0.9 km. Sweden also has a Scandinavian-mile rule [V 57].
- **Reading the device's system:** `Locale.MeasurementSystem` `.us/.uk/.metric` on iOS 16+, and `LocaleData.getMeasurementSystem` on Android API 28+ [V 58].
- **The UK is mixed.** Road signs use yards, but Google Maps' UK users complain it says feet [P 59], and many people under 60 think in metres [U].
- **Default:** follow the region, and offer metres, yards, feet and calibrated steps (the plan already has steps). Ask the UK cohort.
- **Speaking the numbers:** "300 feet", not "91 metres converted".

### 4.3 Crossing vocabulary mapped to OSM

- **US:** APS have a push-button locator tone repeating about once a second, an audible WALK (tone or speech) and a vibrotactile arrow pointing along the crosswalk [P 60]. The Access Board's public right-of-way guidelines (PROWAG) were published 8 Aug 2023; DOT adopted them for transit stops on 18 Dec 2024 [V 60]. Also HAWK beacons and RRFBs (`crossing_ref=hawk/rrfb`) [V 63].
- **UK:** `crossing_ref` values:
  - zebra (Belisha beacons; pedestrians have priority);
  - pelican (far-side signals, flashing amber);
  - puffin (near-side signals, pedestrian detectors);
  - toucan (pedestrians and cyclists);
  - pegasus (horses);
  - tiger/parallel (zebra plus cycle crossing) [V 63].

  At signalised crossings a **tactile cone under the push-button box rotates** during the green man. Bleepers are fitted only where no other crossing is within earshot [P 61]. So "no sound" in the UK does not mean "no non-visual cue": tell users to feel for the cone.
- **Australia:** audio-tactile push buttons (the PB/5 design, since 1984, AS 2353). A locator tone plays every 2 s and switches to rapid ticking for walk; a raised arrow vibrates in time with it [P 62].

**OSM tagging by country** (Geofabrik taginfo, nodes, data until 26 Sep 2026 [V 66]; the coverage ratio is my calculation against `crossing=traffic_signals` nodes and is only a rough indicator):

| | GB | US | Italy | Australia |
|---|---|---|---|---|
| `crossing=traffic_signals` nodes | 72,333 | 560,470 | 34,861 | 61,508 |
| `traffic_signals:sound` tagged (share) | 17,932 (~25%) | 56,875 (~10%) | 12,761 (~37%) | 15,733 (~26%) |
| …of which yes, walk or locate | 52% | 38% | 33% | 98% |
| `traffic_signals:vibration` tagged (yes) | 16,459 (84% yes) | 45,027 (18% yes) | 10,628 (14% yes) | 14,186 (89% yes) |
| `traffic_signals:arrow` | 135 | 3,193 | 107 | 554 |
| Top `crossing_ref` values | pelican 18,369, zebra 16,220, toucan 11,849, puffin 7,129 | zebra 13,033, pelican 598, hawk 414 | zebra 37,537, tiger 486 | zebra 115 |
| `button_operated=yes` | 38,085 | 67,722 | 6,183 | 17,166 |
| `tactile_paving=yes` / `no` | 206,502 / 113,894 | 980,946 / 385,543 | 20,433 / 236,304 | 53,419 / 105,283 |

Documented values: `traffic_signals:sound=yes/no/locate/walk`; the related keys are `traffic_signals:vibration`, `:arrow`, `:floor_vibration`, `:minimap` and `button_operated` [V 64].

**What each country needs.**
- **UK:** map `traffic_signals:vibration=yes` to "the cone turns when it is safe" and use `crossing_ref` for the spoken type. "A zebra crossing: traffic should stop, but wait until you hear it stop."
- **US:** with ~10% sound coverage, Milo's promise to route around crossings without APS mostly becomes "the map does not say". State it that way, as `en.ts` already does.
- **Australia:** audio-tactile is near-universal where tagged. Default an untagged signal to "probably audio-tactile" only after a check with Australian testers.

### 4.4 Street names

OSM's rule is "don't abbreviate" ("St. could be Street or Saint") [V 65]. Names from OSM can therefore be spoken as stored, and platform TTS never has to guess "St". Abbreviation handling is only needed on the input side: geocoding "Main St" and "5th Ave". It is also needed for ordinal and directional reading ("W 42nd Street" read as "West Forty-second Street") where a name was imported abbreviated [U: TIGER leftovers exist, not counted]. Keep `lc()` (lowercasing "Via"/"Corso" mid-sentence) for Italian names only.

### 4.5 Clock-face directions

A found no controlled comparison between clock-face and left/right directions. I found no US or UK O&M source that prescribes one for apps [U]. Keep the plan's default: left/right, with clock positions only for oblique branches, as a setting. Soundscape users expect "ahead/left/right" and BlindSquare users expect clock positions (C).

### 4.6 Keeping Italian: what it costs

- **Templates.** `en.ts` (442 lines) and `it.ts` (480 lines) already exist. Keeping both means writing each new template twice. Add a CI test that both catalogs have the same keys and use every placeholder. Estimated cost: +15–25% on content tasks, zero on the engine [U].
- **English variants** (en-US/GB/AU): lexicon plus units, about 2–3 days once; then near zero.
- **Speech.** Italian needs its own offline ASR (Moonshine has no Italian model, so Parakeet v3 through sherpa-onnx, per E) and its own voice. That means two model downloads and two test corpora (G's S1 in English plus E's Italian set).
- **LLM and gateway:** negligible (H: all shortlisted models except GLM Flash are multilingual).
- **Benefit.** Milan field tests are observable and in Italian. English testers are remote and unobserved. Dropping Italian would leave no one the founders can watch walking.

## 5. Work items for the plan

| ID | Item | Depends on | Runs in parallel with | Effort [U] |
|---|---|---|---|---|
| L1 | Lexicon (en-US/GB/AU), CLDR units, key-parity CI test | – | everything | 2–3 days |
| L2 | Voice feedback in the app plus the server endpoint; privacy page | I (VPS) | L1, L3 | 2–3 days |
| L3 | TestFlight and Play tracks, landing page, AppleVis and Blind Android Users posts | MVP build | L1, L2 | 3–4 days, spread out |
| L4 | iOS App Shortcuts (App Intents in the Expo module) | D's native module | L1–L3 | 2–3 days |
| L5 | Native STT wrapper: DictationTranscriber with contextual strings; Android biasing | D's native module | L4 | 3–4 days |
| L6 | Moonshine Small fallback on Android, then iOS | L5 | – | 3–5 days |
| L7 | Wake word, Android only, opt-in, permissively licensed data, battery test | after MVP feedback | – | 1–2 weeks |

## Open questions

1. Which phones and computers are available (an iPhone, an Android phone, a Mac)? This decides whether iOS-first is practical for the Swift half of the native module.
2. Is a UK/Ireland first cohort acceptable (time zone, data, charities), or do you prefer the larger US community despite thinner OSM crossing data and feet?
3. Personal or organisation developer accounts? The App Store shows a personal account holder's legal name, and the Play 12-tester gate applies only to personal accounts created after 13 Nov 2023 [V 4]. Organisation accounts need a legal entity.
4. Is there a budget to pay Milan field-test participants, and will EveryWare Lab or UICI handle consent?
5. Should voice-feedback recordings be kept after the bug is fixed? Retention decides the privacy text.

## Sources

1. WebAIM Screen Reader User Survey #10 results. https://webaim.org/projects/screenreadersurvey10/
2. WebAIM Screen Reader User Survey #11 (status page). https://webaim.org/projects/screenreadersurvey11/
3. Apple, TestFlight overview. https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
4. Google Play Console Help, testing requirements for new personal developer accounts. https://support.google.com/googleplay/android-developer/answer/14151465
5. Expo pricing. https://expo.dev/pricing
6. Android developer verification (Google blog; The Hacker News summary). https://android-developers.googleblog.com/2026/06/android-developer-verification.html, https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html
7. Apple App Store Review Guidelines (2.5.4, 2.5.14, 1.4.1). https://developer.apple.com/app-store/review/guidelines/
8. Soundscape Community README. https://raw.githubusercontent.com/soundscape-community/soundscape/main/README.md
9. Scottish Tech Army, Soundscape. https://www.scottishtecharmy.org/soundscape
10. Double Tap, "Soundscape lands on Android". https://doubletaponair.com/soundscape-lands-on-android-a-new-era-for-accessible-navigation/
11. Soundscape Android documentation. https://scottish-tech-army.github.io/Soundscape-Android/
12. Soundscape-Android PR #1084 (field tests). https://github.com/Scottish-Tech-Army/Soundscape-Android/pull/1084
13. AppleVis: VoiceVista, Best Developer 2024 Golden Apples; AppleVis Extra #95. https://www.applevis.com/podcasts/conversation-creators-voice-vista-winner-best-developer-2024-golden-apples, https://www.applevis.com/podcasts/applevis-extra-95-interview-jianfeng-wu-exploring-world-through-sound-voicevista
14. AppleVis beta-tester threads. https://www.applevis.com/forum/app-development-programming/beta-testers-wanted, https://www.applevis.com/forum/accessibility-advocacy/positive-help-resource-what-if-developers-had-pool-beta-testers
15. Blind Android Users. https://www.blindandroidusers.com/
16. Eyes-Free group; Top Tech Tidbits list directory. https://groups.google.com/g/eyes-free, https://toptechtidbits.com/directories/listserv-directory/
17. Eggert, Accessibility in the Fediverse; RBlind. https://yatil.net/blog/accessibility-in-the-fediverse-and-mastodon, https://rblind.com/
18. AMI-audio 2026-27 season. https://www.ami.ca/AMI-audio-2026
19. ACB Media, Main Menu. https://www.acbmedia.org/category/mm/
20. NFB, Access On podcast; Jonathan Mosen joins NFB (both 403 to crawlers); Living Blindfully site and feed (episode 305, 28 Sep 2024; Access On announcement, 9 Nov 2024). https://nfb.org/resources/publications-and-media/access-on-podcast, https://nfb.org/about-us/press-room/jonathan-mosen-brings-his-expertise-national-federation-blind, https://livingblindfully.com/feed/
21. Talking Tech by Vision Australia Radio (Apple Podcasts). https://podcasts.apple.com/au/podcast/talking-tech-by-vision-australia-radio/id919830401
22. Blind Abilities. https://blindabilities.com/
23. NFB Research Program. https://nfb.org/programs-services/research-program
24. ACB, clinical research study recruitment. https://www.acb.org/content/clinical-research-study-recruitment
25. RNIB user testing. https://www.rnib.org.uk/rnib-business/user-testing
26. ACVREP COMS; RWPN; OMAA. https://www.acvrep.org/certifications/coms, https://rwpn.org.uk/page-18412, https://www.omaaustralasia.com/about/
27. EveryWare Lab, Università degli Studi di Milano. https://everywarelab.di.unimi.it/
28. NVIDIA parakeet-tdt-0.6b-v2 model card. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2
29. Moonshine Voice README and licence. https://github.com/moonshine-ai/moonshine
30. Moonshine vs Whisper. https://moonshine-voice.readthedocs.io/en/latest/moonshine-vs-whisper/
31. Moonshine available models; accuracy. https://moonshine-voice.readthedocs.io/en/latest/models/available-models/, https://moonshine-voice.readthedocs.io/en/latest/models/accuracy/
32. Moonshine domain customization. https://moonshine-voice.readthedocs.io/en/latest/models/domain-customization/
33. Moonshine text to speech (G2P and espeak-ng). https://moonshine-voice.readthedocs.io/en/latest/using/text-to-speech/
34. Moonshine quickstart (Swift package, Maven 0.1.5). https://moonshine-voice.readthedocs.io/en/latest/quickstart/
35. Argmax, Apple SpeechAnalyzer and Argmax WhisperKit (20 Jun 2025). https://www.argmaxinc.com/blog/apple-and-argmax
36. heise, Apple's new speech APIs vs Whisper (4 Jul 2025). https://www.heise.de/en/news/Speech-to-text-Apple-s-new-APIs-outperform-Whisper-on-speed-10475273.html
37. iOS 26 custom vocabulary with DictationTranscriber; Apple forum on AnalysisContext (Apple engineer reply). https://dev.to/simple_memo/ios-26-didnt-kill-custom-vocabulary-youre-adding-it-to-the-wrong-module-5bdc, https://developer.apple.com/forums/thread/811083
38. expo-speech-recognition 57.1.0 (npm). https://www.npmjs.com/package/expo-speech-recognition
39. sherpa-onnx 1.13.8 (npm); espeak-ng CMake. https://www.npmjs.com/package/sherpa-onnx-node, https://github.com/k2-fsa/sherpa-onnx/blob/master/cmake/espeak-ng-for-piper.cmake
40. react-native-sherpa-onnx 0.4.4 (npm). https://www.npmjs.com/package/react-native-sherpa-onnx
41. whisper.rn 0.7.4 (npm). https://www.npmjs.com/package/whisper.rn
42. sherpa-onnx KWS pretrained models; GigaSpeech access terms. https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html, https://huggingface.co/datasets/speechcolab/gigaspeech
43. openWakeWord README; openwakeword_features dataset. https://github.com/dscripka/openWakeWord, https://huggingface.co/datasets/davidscripka/openwakeword_features
44. microWakeWord README; microwakeword dataset. https://github.com/kahrendt/microWakeWord, https://huggingface.co/datasets/kahrendt/microwakeword
45. Piper sample generator. https://github.com/rhasspy/piper-sample-generator
46. Home Assistant, Assist on Android. https://www.home-assistant.io/voice_control/android/
47. Picovoice pricing (secondary); Porcupine React Native (npm). https://checkthat.ai/brands/picovoice/pricing, https://www.npmjs.com/package/@picovoice/porcupine-react-native
48. OpenSLR LibriSpeech (SLR12), MUSAN (SLR17). https://www.openslr.org/12/, https://www.openslr.org/17/
49. App Intents and App Shortcuts. https://www.appcoda.com/app-intents-shortcuts/
50. Android AppFunctions; Google Assistant (Wikipedia). https://developer.android.com/ai/appfunctions, https://en.wikipedia.org/wiki/Google_Assistant
51. WWDC20, Create a seamless speech experience; Apple, prefersAssistiveTechnologySettings. https://developer.apple.com/videos/play/wwdc2020/10022/, https://developer.apple.com/documentation/avfaudio/avspeechutterance/prefersassistivetechnologysettings
52. Apple forum, AVSpeechSynthesisVoice and Eloquence. https://developer.apple.com/forums/thread/730789
53. Apple forum, iOS 26 AVSpeechSynthesisVoice regression. https://developer.apple.com/forums/thread/804648
54. hexgrad Kokoro-82M model card. https://huggingface.co/hexgrad/Kokoro-82M
55. KittenTTS README and pyproject. https://github.com/KittenML/KittenTTS
56. Piper (moved to OHF-Voice/piper1-gpl); piper-tts on PyPI. https://github.com/OHF-Voice/piper1-gpl, https://pypi.org/project/piper-tts/
57. Unicode CLDR units.xml (unitPreferences, length, road). https://github.com/unicode-org/cldr/blob/main/common/supplemental/units.xml
58. Android LocaleData.MeasurementSystem; Apple Locale.MeasurementSystem. https://developer.android.com/reference/android/icu/util/LocaleData.MeasurementSystem, https://developer.apple.com/documentation/foundation/locale/measurementsystem
59. Google Maps Community, "Say yards not feet". https://support.google.com/maps/thread/5637345/say-yards-not-feet?hl=en
60. APS guide, pushbutton locator tone; US Access Board PROWAG. http://www.apsguide.org/chapter4_pushbutton.cfm, https://www.access-board.gov/prowag/
61. UK crossings: Rochdale Council; I'DGO guidance; Pelican crossing (Wikipedia). https://www.rochdale.gov.uk/road-safety/pedestrian-crossings, https://www.idgo.ac.uk/pdf/PedestrianCrossings.pdf, https://en.wikipedia.org/wiki/Pelican_crossing
62. APS guide, Australia; PB/5 pedestrian button. http://www.apsguide.org/chapter10_australia.cfm, https://en.wikipedia.org/wiki/PB/5_pedestrian_crossing_button
63. OSM wiki, Key:crossing_ref. https://wiki.openstreetmap.org/wiki/Key:crossing_ref
64. OSM wiki, Key:traffic_signals:sound. https://wiki.openstreetmap.org/wiki/Key:traffic_signals:sound
65. OSM wiki, Names; Key:name:pronunciation. https://wiki.openstreetmap.org/wiki/Names, https://wiki.openstreetmap.org/wiki/Key:name:pronunciation
66. Geofabrik taginfo (Great Britain, US, Italy, Australia; data until 2026-09-26). https://taginfo.geofabrik.de/
67. Apple, AVSpeechSynthesisIPANotationAttribute. https://developer.apple.com/documentation/avfaudio/avspeechsynthesisipanotationattribute
68. Banfic et al., on-device streaming ASR (Nemotron Speech Streaming in ONNX Runtime), arXiv 2604.14493. https://arxiv.org/abs/2604.14493
69. ESPHome micro-wake-word-models README and LICENSE (Apache-2.0). https://raw.githubusercontent.com/esphome/micro-wake-word-models/main/LICENSE

## Verification (27 Sep 2026)

An adversarial check re-fetched primary sources for 34 claims. Changes made:
- **microWakeWord licence (Recommendation 5, §3.2):** the report said its pretrained models are non-commercial. ESPHome publishes okay_nabu, hey_jarvis and hey_mycroft under Apache-2.0 [69]; only its negative feature dataset is CC BY-NC 4.0. The recommendation stands, because no pretrained model says "Hey Milo" and the default negatives are still non-commercial.
- **Home Assistant Android wake word (§3.2):** it also requires the app to be the default digital assistant and is labelled experimental [46]. Added.
- **Picovoice price (§3.2):** "$6,000/year" was not supported. The secondary page quotes a user mentioning "$6,000" for the Foundation Plan without a period, and says Picovoice publishes no prices. Reworded; still [P].
- **Espeak-ng (Recommendation 6):** Piper embeds it and Kitten requires it. Kokoro's misaki G2P uses it only as a fallback for out-of-dictionary words. Reworded; the recommendation is unchanged.
- **`prefersAssistiveTechnologySettings` (Recommendation 6, §3.3):** Apple's documentation says it applies only while an assistive technology such as VoiceOver is on. Added.
- **DictationTranscriber contextual strings:** an Apple engineer confirms them on the Apple forum [37]. [P] → [V]. Apple's suggestion of `SFSpeechLanguageModel` added.
- **FB20271264:** the regression is real as a developer report, but Apple DTS said engineering could not reproduce it at first. "Known bug" → "reported regression"; [P] → [V] for the report.
- **CLDR:** thresholds made exact (metres to 50 m steps from 300 m, not from 100 m; 1-unit steps below 10). The Swedish exception is noted.
- **Android developer verification:** it is now checked on Google's blog, and it is registration for participating stores in four countries, with adb/advanced-flow sideloading still allowed. [P] → [V].
- **Living Blindfully / Access On, Double Tap renewal, `Locale.MeasurementSystem`/`LocaleData`:** [P] → [V]. The final episode was 305, 28 Sep 2024.
- **WebAIM:** #10 figures are exact. #11 is still "closed; results in the near future". Its "(2026)" date was not on the page and has been removed. "Four in five" was softened to 72–84% by region.
- **AppleVis award name:** "Developer of the Year" → "Best Developer, 2024 Golden Apples".

These checked out with no change: TestFlight limits and Beta App Review; the Play 12-tester/14-day rule (personal accounts after 13 Nov 2023); EAS Free/Starter/Update limits; the Moonshine v2 table (params, WER, Pixel 10a latency, LibriSpeech quantised, MIT, no Italian, "up to 40%", Maven 0.1.5); the Parakeet v2 card; the Argmax numbers (M4 Mac mini); the heise figures; openWakeWord licence, ACAV100M ~2,000 h and PyPI 0.6.0 (Feb 2024); GigaSpeech terms; the sherpa-onnx `SHERPA_ONNX_ENABLE_TTS` default ON with espeak-ng download; npm/PyPI versions (sherpa-onnx 1.13.8, react-native-sherpa-onnx 0.4.4, whisper.rn 0.7.4, expo-speech-recognition 57.1.0 with no SpeechAnalyzer code, Porcupine RN 4.0.0, piper-tts 1.8.0 GPL-3.0-or-later, KittenTTS deps); Kokoro v1.0 date and Apache-2.0; Talking Tech's final edition on 6 May 2025; Blind Android Users ep. 303; the AppFunctions status; Google Assistant's 4 Sep 2026 discontinuation (Wikipedia); arXiv 2604.14493; PROWAG dates; OSM crossing_ref and Names; LibriSpeech/MUSAN CC BY 4.0; App Review 2.5.4/2.5.14; `EXTRA_BIASING_STRINGS` (API 33). The taginfo counts were re-queried and agree within a handful of nodes (e.g. GB sound 17,934 vs 17,932), so the percentages are unchanged. Not reachable: NFB pages (403), RWPN (503), AppleVis (403), picovoice.ai/pricing (empty).
