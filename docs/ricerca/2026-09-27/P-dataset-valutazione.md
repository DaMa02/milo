# P: Datasets for evaluation and training
Research date: 27 Sep 2026. Tags: [V] verified today in a primary source (dataset file, licence file, dataset card or paper); [P] secondary source; [U] could not verify. Bracketed numbers point to the Sources list. Letters (B, E, G, H, J, L, M, O) refer to the other reports of 27 Sep.

## In short

1. **No public dataset matches Milo's task. Build the ~400-turn corpus mostly by hand, and use public data for seeds, stress tests and noise, never as the test set.** Nothing public covers walking trips with blind-specific avoidances (steps, unsignalled crossings, signals without sound) or mid-trip edits against a live frame. The closest dataset, TOPv2 navigation, is built around driving (§2).
2. **Seeds: MASSIVE `transport` (CC BY 4.0, English and Italian in parallel) first, then TOPv2 navigation (CC BY-SA 4.0), then Taskmaster-1 ride booking (CC BY 4.0) for spoken corrections.** Convert them with a script into E's command union, then check them by hand.
3. **Do not use STOP in the corpus.** Its licence forbids derivative works, translation and "incorporat[ing] the STOP Dataset into any other program, dataset, or product". Meta can also revoke it, demand deletion or audit you [V 5]. The same licence does allow using the unmodified data privately to "research, develop and improve" NLU models, and those models "may be used for academic and commercial purposes" (clauses 1–2) [V 5]. So a private ASR measurement on its navigation audio is allowed, but relabelling it to Milo frames is not. For English spoken SLU use SLURP audio (CC BY-NC) for one-off measurements only. For Italian use ITALIC (CC BY 4.0, gated), which has a noisy test split [V 13,14].
4. **Street names are the biggest ASR risk, and no permissive dataset exists.** Across 15 recognisers, US street names spoken by US residents were transcribed wrong 44% of the time. Fewer than 1,000 synthetic TTS samples improved accuracy for non-native speakers by about 60% relative [V 42]. That dataset is NC-ND and gated [V 43]. Build a small "Milan streets in English sentences" set (L §3.1), and generate synthetic audio with Kokoro (Apache-2.0) [V 55].
5. **Noise for mixing: MUSAN, DEMAND and SONYC-Backgrounds, all CC BY** [V 34,35,41]. UrbanSound8K, ESC-50 and CHiME are non-commercial or paid [V 37,38,39]. Keep them out of the pipeline.
6. **Harness: write our own in TypeScript (~300 lines plus metrics) in the repo.** It scores the frame that results from applying the commands, not the command strings. Borrow τ³-bench's design (final-state check plus a simulated user) for multi-turn scripts [V 33], and When2Call's four-way "act / ask / refuse / answer" label [V 29]. Do not adapt BFCL's code (§4).
7. **The criteria as written cannot be measured on 400 items.** At 90% accuracy, a 160-item held-out set has a 95% interval of about ±4.7 points. "Zero risky actions" in n items only bounds the true rate at 3/n [P 58]. Add a synthetic safety-gate set of at least 300 items (§9).
8. **The held-out set must be private, made of real human speech, split by speaker and source, marked with a canary string, and refreshed from field logs** (§10). The repo is public under MIT, so a public test set will end up in the next models' training data.

## 1. What the corpus must contain

Milo's items are **turns in context**, not isolated sentences. Each item carries the frame before the turn, J's referent register and last list, and the trip state. The expected result is the frame after the turn, or a clarifying question. Proposed English composition, merging G S1, J §5.6 and L §3.1:

| Category | n | Main sources |
|---|---|---|
| Compound new trips (destination + stop + avoid + mode + time) | 70 | Blind testers, B's quotes, templates; MASSIVE/TOPv2 seeds |
| Simple one-slot requests | 40 | MASSIVE `transport_query`, TOPv2 `GET_DIRECTIONS` |
| Corrections and mid-trip edits ("actually avoid stairs", "drop the pharmacy") | 60 | Taskmaster-1 ride-booking patterns; templates |
| References ("the other one", "the second", "there") | 40 | E/J examples; SGD and MultiWOZ user turns as patterns |
| Recall and help on earlier instructions (J) | 60 | J §5.6 |
| Mid-trip questions (where am I, how far, what is at this corner) | 40 | Testers; B |
| Milanese names inside English sentences (L) | 50 | Recorded in Milan |
| Out of scope or unsafe ("is it safe to cross now?", driving, traffic) | 25 | TOPv2 `UNSUPPORTED_NAVIGATION`, `GET_INFO_TRAFFIC` |
| Control words, as a regression set | 15 | Grammar |
| **Total** | **400** | At least 150 recorded outdoors on the phone, at least 10 speakers, at least 5 of them blind |

Recording: use the app itself with `expo-speech-recognition` audio persistence (`recordingOptions.persist`, Android 13+ and iOS only) (O), at walking pace, in three conditions: quiet, street, and tram or bus stop. Each item stores the reference transcript, the ASR n-best, and the audio (with consent).

## 2. Task-oriented parsing datasets

| Dataset | Size / languages | Licence | Last activity | Use in Milo | MIT and commercial? | Effort |
|---|---|---|---|---|---|---|
| **TOP** (Meta, 2018) | 44,783 English queries, 25 intents, 36 slots; 35% nested deeper than 2; navigation and events only [V 1,2] | CC-BY-SA (README) [V 1] | v1.1, Dec 2018 [V 1] | Superseded: TOPv2 contains the same navigation data (below) | Derived items must stay CC BY-SA; never bundle in the app | – |
| **TOPv2** (Meta, 2020) | 8 domains; navigation 20,998 / 2,971 / 6,075 train/eval/test, 17 intents, 33 slots, 57% flat [V 4] | CC BY-SA 4.0 (LICENSE in the zip) [V 3] | v1.1, Mar 2021 (added low-resource splits only) [V 3] | **Seeds** by conversion; out-of-scope negatives; a parser stress test (nested destinations such as "directions to the Eagles game") | As above; fine for dev and training files that keep the licence | 2–3 days |
| **STOP** (Meta, 2022) | TOPv2 read aloud: 236,477 files, 218 h, 885 speakers; also TTS versions [V 6] | Proprietary agreement: no derivatives or translation, no incorporation into datasets or products, revocable, audit right; use to develop NLU models is granted, and the resulting models may be used commercially (clauses 1–2) [V 5] | v3 paper, Oct 2022 | **Not as seeds or corpus.** Relabelling to Milo frames is a derivative work. At most a private ASR check on the unmodified navigation audio | Never in the repo, CI or app; private model-development use is permitted | – |
| **SLURP** (2020) | 72,277 recordings, 58 h, 177 speakers, 18 scenarios, headset and far-field [V 9] | Text CC BY 4.0; audio CC BY-NC 4.0 [V 8,10] | Static | English spoken-SLU measurement on `transport` audio; **SLU-F1 metric** (entity credit despite ASR spelling errors) [V 9] | Text yes; audio only for one-off research, not in CI | 1 day |
| **MASSIVE 1.1** (Amazon) | 52 locales incl. en-US and it-IT; 16,521 parallel utterances per locale (11,514/2,033/2,974); 18 scenarios, 60 intents, 55 slot types [V 11,12] | CC BY 4.0 (NOTICE) [V 11] | Nov 2022 [V 12] | **Best seed source.** `transport` has 805 utterances per locale (query 314, ticket 187, traffic 154, taxi 150) and `recommendation_locations` 235 [V, own count on 12]. The Italian is localised, not just translated ("walmart" becomes "conad") [V 12]. Use it for the Italian half later | Yes | 0.5 day |
| **ITALIC** (2023) | MASSIVE read aloud in Italian: 16,521 samples, 70 speakers from 13 regions, 15.46 h; `hard_speaker` and `hard_noisy` splits [V 13,14] | CC BY 4.0, gated (share contact details) [V 13] | Card updated Feb 2025 | Italian ASR + parse test in noise (Whisper large zero-shot WER 11.46% on the random `massive` split, 15.41% on `hard_noisy`, 8.65% on `hard_speaker`) [V 14] | Yes | 1 day |
| **Speech-MASSIVE** | 12 languages, **no English or Italian** [V 15] | CC BY-NC-SA 4.0 [V 15] | 2024 | None | – | – |
| **SNIPS / ATIS** | Single-intent assistant and flight queries | SNIPS benchmark repo CC0 [V 19]; ATIS provenance not checked [U] | Static | Only through MixSNIPS | SNIPS yes | – |

**Inside TOPv2 navigation.** I downloaded the dataset and counted all 30,044 navigation utterances [V 3]. The intent and root counts are identical to TOP's navigation part, so TOPv2 did not add new navigation data.

- **It is about cars and traffic.** `GET_INFO_TRAFFIC` is the root of 12,540 utterances (42%). Among `METHOD_TRAVEL` values, "drive"/"driving" appear 3,148 times and "walk"/"walking" 57 times. Only 89 utterances contain "walk" or "on foot".
- **The labels Milo needs are rare.** `WAYPOINT` appears 152 times, `WAYPOINT_ADDED` 5 times ("Add stop at grocery store to my route"), `PATH_AVOID` 457 times (mostly highways and tolls) and `UPDATE_DIRECTIONS` 350 times.
- **Yield.** A crude filter (drop traffic, road-condition, driving, highway and flight words) leaves 10,381 candidates. Many are between cities ("minneapolis to sandstone"). Expect about 1,000–2,000 usable walking-scale seeds after review [U, estimate].

| TOPv2 label (occurrences) | Milo target (E's schema, G's tools) |
|---|---|
| `IN:GET_DIRECTIONS` (2,709) | `new_trip` with `destination` |
| `GET_ESTIMATED_DURATION` / `GET_DISTANCE` / `GET_ESTIMATED_ARRIVAL` / `DEPARTURE` (5,958 / 2,481 / 2,135 / 1,046) | `trip_status` question, or `new_trip` plus a question |
| `IN:UPDATE_DIRECTIONS` (350) | `edit` (ask for route alternatives) |
| `SL:DESTINATION` / `SL:SOURCE` (17,695 / 8,458) | `destination` / `origin` |
| `SL:METHOD_TRAVEL` (3,720) | `modes`: walk → `transit: none`; bus, train, subway → `types` |
| `SL:WAYPOINT` / `WAYPOINT_ADDED` (152 / 5) | `stops` |
| `SL:PATH_AVOID`, `OBSTRUCTION_AVOID`, `WAYPOINT_AVOID`, `ROAD_CONDITION_AVOID` (457 / 835 / 25 / 31) | `avoid`: only construction maps (`construction`); highways and tolls → out of scope |
| `SL:DATE_TIME_ARRIVAL` / `DEPARTURE` (1,819 / 3,207) | `time`: `arrive_by` / `depart_at` |
| `SL:CATEGORY_LOCATION` (2,899), `IN:GET_LOCATION_HOME/WORK/SCHOOL` (4,567 / 1,842 / 267) | `Place.category`, `Place.saved` |
| `IN:UNSUPPORTED_NAVIGATION` (2,175), `GET_INFO_TRAFFIC` (12,540) | Out-of-scope negatives |

## 3. Multi-intent, dialogue and reference datasets

| Dataset | What it is | Licence | Use in Milo | Verdict |
|---|---|---|---|---|
| **MixATIS / MixSNIPS** (AGIF, 2020) | Single-intent ATIS/SNIPS sentences joined "by using conjunctions, e.g., 'and'", 1/2/3 intents in ratio 0.3/0.5/0.2 [V 17]. Clean versions: 13,162/759/828 and 39,776/2,198/2,199 [V 16] | Repo GPL-2.0 [V 16]; data licence not stated separately [U] | Idea only. Its "A and B" joins are the easy case; Milo's hard cases are embedded ("to the Duomo, stopping at a pharmacy, no buses") | **Idea only** |
| **BlendX** (LREC-COLING 2024) | Harder multi-intent built with rules and ChatGPT [P 18] | GPL-2.0 [V 18] | Its blending patterns (implicit conjunction, ellipsis) as paraphrase instructions (§8) | **Idea only** |
| **Schema-Guided Dialogue** | More than 20k dialogues, 20 domains, multiple APIs per domain; SGD-X schema variants [V 20] | CC BY-SA 4.0 [V 20] | Patterns for slot changes and references across turns; SGD-X shows how to test robustness to schema wording | Patterns; optional training data kept under its licence |
| **MultiWOZ 2.2** | 10k human-human written dialogues, incl. a taxi domain [V 21] | MIT [V 21] | "Actually make it…" edit patterns | Patterns |
| **Taskmaster-1** (Google) | 13,215 dialogues, of which 5,507 are spoken Wizard-of-Oz dialogues whose user turns were transcribed; includes "setting up ride service". It notes users often omitted origin or destination [V 22] | CC BY 4.0 [V 22] | **Seeds for spoken corrections and missing-slot behaviour**: real disfluencies such as "they um, they want…" [V 22] | **Use** (~1 day to extract ride-service user turns) |
| **SpokenWOZ** | 5.7k spoken human-human dialogues, 249 h, 8 domains incl. taxi [P 23] | CC BY-NC 4.0 [P 23] | ASR-noisy dialogue state tracking, as a research reference | Measurement only |
| **Frames** (Maluuba) | Wizard-of-Oz dialogues built around comparing options and "referring back to previously discussed packages" [V 24] | Not stated on the page [U 24] | The best design reference for "the second one" / "the other": frame tracking over a list of candidates | **Idea only** |

## 4. Clarification datasets and tool-calling harnesses

| Resource | What it measures | Licence / activity | Use in Milo |
|---|---|---|---|
| **ClariQ**, **Qulac** | Clarifying questions for ambiguous web-search topics (TREC facets; Qulac 198 topics, 762 facets) [V 25,26] | Qulac MIT [V 26]; ClariQ has no licence file [U 25] | **Irrelevant as data.** Faceted web search is not trip slots |
| **CLAQUA** | ~40k knowledge-base QA clarification examples [P 27] | Not checked [U] | Irrelevant |
| **CLAMBER** (ACL 2024) | ~12k items with a taxonomy of ambiguity types [P 28] | Not checked [U] | Borrow the taxonomy for Milo's tags (unclear word, missing slot, several candidates) |
| **When2Call** (NVIDIA, NAACL 2025) | Four-way decision: tool call, follow-up question, unable to answer, direct answer; includes training data [V 29] | CC BY 4.0, "ready for commercial use"; card updated Apr 2025 [V 29] | **Adopt its label**: each item gets `expected_action ∈ {apply, ask, refuse, answer}`. Its training split can teach the on-device model to ask instead of guessing |
| **RegretBench** (Jul 2026) | Multi-turn clarification policy: intent resolution, interaction cost, "regret" [V 30] | Paper CC BY-SA 4.0; data release not stated [U 30] | Metric idea: the cost of each extra question (§9) |
| **BFCL** (Berkeley) | Function-call AST and execution checks; `multi_turn_miss_param` is the closest analogue to Milo's "ask for the missing slot" [V 31]. V4 overall weights: agentic 40%, multi-turn 30% [V 31] | Apache-2.0; `bfcl-eval` 2026.3.23 on PyPI [V 32] | **Public prior only** (H already uses it). Its checker compares Python-style calls, not a stateful frame, and has no navigation domain. Adapting it costs more than writing our own |
| **τ²/τ³-bench** (Sierra) | A domain is a database, tools, a policy and tasks, with a reference trajectory that defines the target end state; an LLM plays the user. τ³ adds full-duplex voice with background noise, accents and interruptions. v1.0.1, July 2026 [V 33] | MIT [V 33] | **Copy the design**: an LLM "user" with a hidden goal (e.g. "go to the Duomo, then change the stop to the other pharmacy"), and success judged on Milo's final frame. Its voice mode uses ElevenLabs TTS converted to 8 kHz telephony audio [V 33], unlike a phone mic outdoors, so do not use it for ASR |

## 5. Speech: street names and outdoor noise

### 5.1 Street names

- **"Sorry, I Didn't Catch That"** (Zhou, Bartelds, Bianchi, Zou; arXiv, Feb 2026) [V 42]:
  - it tested 15 recognisers from OpenAI, Deepgram, Google and Microsoft on US street names;
  - average transcription error: 44%; Whisper-Large accuracy 73%;
  - accuracy for speakers whose primary language is not English was 46%, against 64% for English-only speakers;
  - fine-tuning on fewer than 1,000 synthetic samples (XTTS voice cloning) gave about 60% relative improvement for those speakers.
- **Its data:** SF Streets (2,262 utterances, 78 participants) and US Streets (3,600 recordings, 97 participants, all non-English-primary speakers). The paper's appendix gives CC BY-NC-ND 4.0 for the public SF Streets set and says only "for public research use" for US Streets [V 42]. On Hugging Face both are gated with licence "other" [V 43]. Use them for measurement only.
- **Common Voice:** CC0 1.0, as listed on Mozilla Data Collective, which is now the download site [V 45,46]; scripted-speech v27.0 (2026-09) [V 45]. It has had a `sentence_domain` field since v17.0 [V 45]. The domains include "Automotive and Transport", but none for addresses or places [V 44]. It is a CC0 source of Italian and English speakers, but not of street names.
- **Build our own set.** Take 50 Milanese names (L) plus 50 names from the English-speaking test city (M), each in 2–3 carrier sentences. Record 10 or more speakers. Add Kokoro-82M TTS (Apache-2.0; 20 American and 8 British English voices, 2 Italian) [V 55]. Score entity accuracy after J's phonetic match to the gazetteer, not raw WER.

### 5.2 Noise and noisy speech

| Corpus | Content | Licence | Verdict |
|---|---|---|---|
| **MUSAN** | Music, speech and noise, 11 GB [V 34] | CC BY 4.0 [V 34] | **Use** (babble and music) |
| **DEMAND** | 16-channel recordings at 16 and 48 kHz, 18 environments incl. `STRAFFIC`, `SPSQUARE`, `PSTATION`, `TBUS`, `TMETRO` [V 35] | CC BY 4.0 on Zenodo [V 35]. The DNS Challenge README says CC BY-SA 3.0 [P 36]: attribute, and treat it as share-alike to be safe | **Use** (street, square, station, bus) |
| **SONYC-Backgrounds** / **SONYC-UST v2.3** | New York street-sensor backgrounds (307 MB) / 10 s tagged urban clips [V 40,41] | CC BY 4.0 [V 40,41] | **Use** (real city background) |
| DNS Challenge noise | AudioSet (CC BY 4.0) and Freesound CC0 clips [P 36] | Mixed | Optional |
| CHiME-3/4 | Real speech on a bus, in a café, a pedestrian area and a street junction [V 37] | LDC agreement, fee [V 37] | Skip |
| UrbanSound8K | 8,732 clips of 4 s or less, 10 classes [P 38] | CC BY-NC 4.0 [V 38] | Research only |
| ESC-50 | 2,000 clips from Freesound [V 39] | CC BY-NC 3.0; the ESC-10 subset is CC BY [V 39] | ESC-10 only |

Mix at SNR 15, 5 and 0 dB with `audiomentations` (MIT, 0.43.1) [V 59], and score WER and entity WER with `jiwer` (Apache-2.0, 4.0.0) [V 59]. Synthetic mixes rank recognisers. Only the outdoor recordings set thresholds (J's confidence calibration).

## 6. Blind-navigation and camera datasets

- **Route descriptions written by or for blind people.** No open corpus was found in this round [U]. Memory-Maze collected instructions given from memory for guiding blind people, with "stutters, errors, and omissions"; its release is not stated [V 52]. Ask ANIOMAP O&M instructors to describe 20–30 Milan routes. They are ground truth for guidance text, not for the parser.
- **GPS traces of blind pedestrians.** None open were found [U]. The nearest is **uB-VisioGeoloc** (Dijon): RGB-D video with GPS and IMU carried by a walking person (whether sighted is not stated), 16 sequences of which 14 real and 2 synthetic; the data is CC0 1.0 on Harvard Dataverse, the article CC BY [V 50]. Replay its GPS through the engine to test off-route false alarms. Milo's own field logs (plan §4.11) remain the real source.
- **BlindWays:** 11 blind participants, 8 urban routes, 3D motion with text descriptions [V 51]; no licence stated [U]. Useful for engine-side studies of turn behaviour, not for the corpus.
- **Intersection descriptions:** no dataset found [U]. Derive them from OSM tags (C, N).
- **Camera (phase 2):**
  - **VizWiz-VQA**: 20,523/4,319/8,000 image-question pairs; blind people "recorded a spoken question" about each photo; CC BY 4.0 [V 47]. Use it to seed camera-mode questions and to test the vision model.
  - **ImVisible PTL**: 5,059 images; the repo is MIT, but the images are on Google Drive and the README states no separate data licence [V 48]. It can train a crossing-light detector that ships in the app; ask the author to confirm the images fall under MIT first. Milo must never turn the detected light state into "cross now".
  - **GuideDog**: 22,084 egocentric walking-scene descriptions, of which 2,106 are human-verified gold; data CC BY-NC 4.0 [V 49]. For evaluation only.
  - **PTL-Crosswalk** has no licence, and **Mapillary Vistas** is CC BY-NC-SA (C). Skip both for shipping.
- **Vision-and-language navigation** (Touchdown, CC BY 4.0 text with gated Street View panoramas [V 53]; R2R, under the indoor Matterport3D Terms of Use [V 54]; Talk2Nav, not checked): **irrelevant**. These train an agent to follow instructions visually. Milo parses requests and generates instructions.

## 7. Licence rules for an MIT app

| Class | Datasets | Rule |
|---|---|---|
| Permissive | MASSIVE, SLURP text, Taskmaster, When2Call, SNIPS, MultiWOZ, MUSAN, SONYC, Common Voice, VizWiz, ImVisible (repo MIT; image licence to confirm), ITALIC, uB-VisioGeoloc, Kokoro | Use for dev, training and the public repo, with attribution in `corpus/NOTICE.md` |
| Share-alike or GPL | TOP/TOPv2, SGD, DEMAND (conservatively), MixATIS/MixSNIPS/BlendX | Keep derived items in separate files under the same licence (`corpus/seeds/topv2/`). Never bundle them in the app. Whether weights trained on CC BY-SA data are "adapted material" is unsettled [U]. For the on-device LoRA, prefer permissive data |
| Non-commercial, no-derivatives or proprietary | STOP, SLURP audio, Speech-MASSIVE, SpokenWOZ, SF/US Streets, UrbanSound8K, ESC-50, GuideDog, Mapillary Vistas, CHiME, R2R | One-off private measurement at most; never in CI, never redistributed. If Milo becomes a business (X, Y), even internal evaluation is a grey area [U] |
| Unknown | ClariQ, CLAQUA, CLAMBER, Frames, BlindWays, PTL-Crosswalk | Ideas only |

## 8. Synthetic-data pipeline

1. **Frame sampler.** Draw target frames and command lists from E's schema, weighted by expected use: 0–3 stops, the six avoid kinds, modes, and time kinds. The label is fixed before any text exists.
2. **Templates.** Hand-write 100–150 templates from B's real quotes, blind testers' phrasings and the TOPv2/MASSIVE seeds. Names stay placeholders (`{STREET}`, `{POI}`).
3. **Paraphrase.** Five paraphrases per template from two model families (e.g. DeepSeek-V4.1 and Qwen via the gateway, H/I). Ask for spoken register, fillers, self-repair ("no wait, the other one"), BlendX-style implicit joins, and British, American and non-native English. Prefer open-weights models for anything that will train a model: some closed providers' terms restrict using outputs to build models [U, check each provider's terms].
4. **Fill** the placeholders from the Milan and test-city OSM gazetteers (M), including hard names.
5. **Check.** A third model parses each paraphrase. If the parse differs from the seed frame, the item goes to a person. People also audit 10% of the agreements. As in TOP, two annotators label, a third adjudicates, and three-way disagreements are dropped [V 2]. LINGUIST showed that instruction-generated labelled utterances improve low-resource intent and slot models (+2.5 slot F1 at 10-shot) [V 56].
6. **Speech and ASR noise.** Generate audio with Kokoro voices, mix it with §5.2 noise, and run it through the phone recognisers. Also inject J's real n-best confusions into the text.
7. **Where it goes.** Synthetic items go into training and dev, and into the safety-gate set (§9). They never enter the held-out test. Tag each item with `source`, `generator`, `prompt_sha` and `licence`.

Cost: at H's per-token prices, 5,000 paraphrases cost a few dollars [U, estimate]. Human review of about 1,000 items takes about 2 person-days.

## 9. Scoring harness

**Item format (JSONL).**
- Identity and provenance: `id`, `split`, `lang`, `source`, `licence`, `speaker`, `audio?`.
- Input: `context` (frame before, referent register, last list, trip state), `transcript`, `nbest?`.
- Expected: `expected` (frame after, or `ask:{slot}` / `refuse` / `answer`), `alternatives[]`.
- `safety_fields[]` and `tags[]`.

**Scoring rules.**
- Score the **resulting frame**: apply the predicted commands with G's `TripStore` applier (S2) and compare canonical frames. Two different command lists that reach the same frame are both correct.
- Canonicalise before comparing:
  - fill defaults (origin = here, time = now), so that stating a default equals omitting it;
  - sort `avoid` by kind and `stops` by order;
  - compare places as resolved gazetteer ids, or as normalised text when unresolved.

| Metric | Definition | Gate |
|---|---|---|
| Exact frame match | Resulting frame equals the expected frame, or the right action (`ask` for the right slot, `refuse`, `answer`) | Plan: cloud ≥90%, offline ≥75% |
| Per-slot P/R/F1 | Per field (destination, stops, avoid, modes, time), with SLURP's SLU-F1 for names: label match earns credit, reduced by character distance [V 9] | Diagnostic |
| Safety violations | A changed safety field (avoid removed, unsignalled crossings allowed, start without read-back) without confirmation | **0**, on a dedicated set of 300 or more items: zero failures in n bounds the rate at 3/n, i.e. 1% at n = 300 [P 58] |
| Ask precision and recall | Asked when needed / did not ask when the frame was already complete (over-asking, J §5.6) | Diagnostic; founder item 7 |
| Turns to complete | On multi-turn scripts with τ-style simulated users [V 33] | Plan: 1 turn for the Duomo sentence |
| Schema-valid rate | Output passes the schema before repair | ≥99% |
| Latency | Time to the command list, and to first audio; p50 and p95 over 3 runs a day on different days (H) | Cloud p50 < 2 s |
| WER / entity WER | For audio items (`jiwer`) | Diagnostic |

**Statistics.**
- Report Wilson 95% intervals: at 90% on 400 items, about 86.7–92.6%; on a 160-item test, about 84.4–93.8%.
- Compare models with a paired McNemar test on the same items, not by eye.
- A difference under ~5 points on the test split is a tie. Break ties with latency, cost and hosting (H §5.2).

**Runner.**
- A CLI `milo-eval` in `packages/assistant` (vitest for the fast layers).
- It uses the provider matrix from pi-ai (G, H) and writes JSONL results plus a Markdown summary.
- CI runs the grammar and the on-device parser on dev at every PR; the cloud bake-off runs on demand within a budget.
- Runners-up: `inspect-ai` (MIT, Python, 0.3.271 of 26 Sep 2026) and `promptfoo` (MIT, Node, 0.123.1) [V 59]. Both are built around single prompts rather than a stateful frame, and the harness must live next to the TypeScript applier anyway.

## 10. Keeping the held-out set honest

- **Only real human turns in test** (plan A1 says "frasi reali"). Synthetic, LLM-paraphrased and public-dataset items stay in dev and train.
- **Split by speaker and by source, not by utterance.** No test speaker, template, route or street name appears in dev, as in ITALIC's `hard_speaker` split [V 13].
- **Private storage.** Keep test in a private repo, or encrypted (`age`) in the MIT repo, with a SHA-256 manifest committed. Put a canary GUID in every file, as BIG-bench does, "to prevent benchmark tasks from leaking into web-scraped training data" [V 57].
- **Never let test items reach a prompt, a few-shot example, a grammar rule or a LoRA.** Tune on dev only. Open test once per decision (model choice, release), and log who opened it and why.
- **Refresh.** Each month, add a "fresh" slice from opted-in exported trip logs (J). A drop between the frozen test and the fresh slice signals overfitting.
- **Double annotation.** Two annotators per test item, adjudicated; report agreement.

## 11. Work plan

**In parallel (no dependencies):**
- P1: harness skeleton, item schema, metrics and statistics (3 days; an agent can write it from §9).
- P2: MASSIVE and TOPv2 converters to E's commands, plus review (3 days).
- P3: template bank from B and testers (2 days, human).
- P4: TTS, noise mixing and ASR runner (2 days).
- P5: recording protocol, consent text and a speaker sheet (1 day, human).

**In series:**
- G's S2 applier → exact-frame scoring.
- P2 + P3 → paraphrase and check (§8) → freeze dev.
- App build with audio persistence (O) → outdoor recordings in Milan and remote English sessions (L) → freeze test.
- Frozen test → H's bake-off.
- Italian half after the English launch, starting from MASSIVE it-IT and ITALIC.

**Split:** one person takes P1, P4 and the bake-off runner; the other takes P3, P5 and recordings; agents take P2 and the paraphrase pipeline.

## 12. Corrections to initial assumptions

1. **"Public datasets can give us the corpus."** Not the test set. TOPv2's navigation data is 42% traffic questions, "walk" appears as a travel method 57 times against 3,148 for driving, and only 5 utterances add a stop to a route [V, own count on 3].
2. **"Meta's STOP is an open spoken navigation dataset."** Its licence forbids derivative works and use inside other datasets or products, and it can be revoked [V 5]. It does allow private use to develop models, which may then be used commercially, so it is a measurement resource, not a corpus source.
3. **"400 utterances scored by exact frame match decide the model."** They can only tell apart models more than ~5 points apart. "0 risky actions" needs its own set of 300 or more items. Exact match alone also misses over-asking and question quality (item 7).
4. **"Scoring by exact match of the frame."** Match the resulting frame (§9), not the model's command text. Otherwise equivalent edits count as errors.
5. **"English first makes speech easier."** English benchmarks contain no Italian names, and even US street names fail 44% of the time in US English [V 42]. The Milan-name set (L) is required, not optional.
6. **"Use BFCL and τ2 as the harness."** Use τ's design, not its code; BFCL only as a public prior (§4).

## 13. Open questions

1. **Testers.** Who records the English outdoor items: remote AppleVis/Reddit volunteers (L) or English speakers in Milan? At least 5 blind speakers are needed.
2. **Voice recordings and GDPR.** Consent and retention for voice data: store it on the EU VPS or keep it local? (I, J)
3. **Non-commercial datasets.** They stay out of anything Milo ships; whether they may be used even for internal measurement still needs a decision.
4. **Test city.** Which English-speaking city's gazetteer goes into the corpus (M)?
5. **ITALIC access.** Register for the gated dataset now, so the Italian half can start later without delay.

## Sources

1. TOP README and versionlog in the dataset zip (via http://fb.me/semanticparsingdialog → https://download.pytorch.org/data/semanticparsingdialog.zip), fetched 27 Sep 2026
2. Gupta et al., "Semantic Parsing for Task Oriented Dialog using Hierarchical Representations", EMNLP 2018. https://arxiv.org/abs/1810.07942
3. TOPv2 dataset zip with LICENSE (CC BY-SA 4.0). https://fb.me/TOPv2Dataset → https://dl.fbaipublicfiles.com/topv2/TOPv2_Dataset.zip
4. Chen et al., "Low-Resource Domain Adaptation for Compositional Task-Oriented Semantic Parsing", EMNLP 2020. https://arxiv.org/abs/2010.03546
5. STOP Dataset License Agreement. https://dl.fbaipublicfiles.com/stop/LICENSE.txt (same text in https://github.com/facebookresearch/spoken_task_oriented_parsing)
6. Tomasello et al., "STOP: A dataset for Spoken Task Oriented Semantic Parsing", 2022. https://arxiv.org/abs/2207.10643
7. STOP documentation. https://facebookresearch.github.io/spoken_task_oriented_parsing/docs/semantic_parsing/
8. SLURP repository README and LICENSE.txt. https://github.com/pswietojanski/slurp
9. Bastianelli, Vanzo, Swietojanski, Rieser, "SLURP: A Spoken Language Understanding Resource Package", Nov 2020. https://arxiv.org/abs/2011.13205
10. SLURP audio on Zenodo (licence "other-nc"). https://zenodo.org/records/4274930
11. MASSIVE repository (README, LICENSE.txt, NOTICE.md). https://github.com/alexa/massive
12. MASSIVE 1.1 data (Last-Modified 7 Nov 2022). https://amazon-massive-nlu-dataset.s3.amazonaws.com/amazon-massive-dataset-1.1.tar.gz
13. ITALIC dataset card. https://huggingface.co/datasets/RiTA-nlp/ITALIC
14. Koudounas et al., "ITALIC: An Italian Intent Classification Dataset", 2023. https://arxiv.org/abs/2306.08502
15. Speech-MASSIVE dataset cards. https://huggingface.co/datasets/FBK-MT/Speech-MASSIVE and https://huggingface.co/datasets/FBK-MT/Speech-MASSIVE-test
16. AGIF repository (MixATIS/MixSNIPS, GPL-2.0). https://github.com/LooperXX/AGIF
17. Qin et al., "AGIF", Findings of EMNLP 2020. https://arxiv.org/abs/2004.10087
18. BlendX repository (GPL-2.0) and paper. https://github.com/HYU-NLP/BlendX ; https://arxiv.org/abs/2403.18277
19. Sonos/Snips NLU benchmark LICENSE (CC0). https://github.com/sonos/nlu-benchmark
20. Schema-Guided Dialogue README (CC BY-SA 4.0). https://github.com/google-research-datasets/dstc8-schema-guided-dialogue
21. MultiWOZ repository and LICENSE (MIT). https://github.com/budzianowski/multiwoz
22. Taskmaster README and TM-1 README (CC BY 4.0). https://github.com/google-research-datasets/Taskmaster
23. SpokenWOZ. https://spokenwoz.github.io/ ; https://arxiv.org/abs/2305.13040
24. Frames dataset page. https://www.microsoft.com/en-us/research/project/frames-dataset/
25. ClariQ repository. https://github.com/aliannejadi/ClariQ
26. Qulac repository (MIT). https://github.com/aliannejadi/qulac
27. Xu et al., "Asking Clarification Questions in Knowledge-Based Question Answering", EMNLP 2019. https://aclanthology.org/D19-1172/
28. CLAMBER, ACL 2024. https://arxiv.org/abs/2405.12063
29. When2Call dataset card and repository. https://huggingface.co/datasets/nvidia/When2Call ; https://github.com/NVIDIA/When2Call ; https://arxiv.org/abs/2504.18851
30. Ta et al., "One More Turn, Less Regret" (RegretBench), Jul 2026. https://arxiv.org/abs/2607.21143
31. BFCL README, CHANGELOG and TEST_CATEGORIES.md. https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard
32. bfcl-eval on PyPI (2026.3.23, Apache 2.0). https://pypi.org/project/bfcl-eval/
33. τ-bench (tau2-bench) README, voice README, domains README, LICENSE (MIT). https://github.com/sierra-research/tau2-bench
34. MUSAN, OpenSLR SLR17 (CC BY 4.0). https://www.openslr.org/17/
35. DEMAND on Zenodo (CC BY 4.0, v1.0, 2013). https://zenodo.org/records/1227121
36. Microsoft DNS Challenge README (noise sources and licences). https://github.com/microsoft/DNS-Challenge
37. CHiME3, LDC2017S24. https://catalog.ldc.upenn.edu/LDC2017S24
38. UrbanSound8K on Zenodo (CC BY-NC 4.0) and dataset page. https://zenodo.org/records/1203745 ; https://urbansounddataset.weebly.com/urbansound8k.html
39. ESC-50 README (CC BY-NC 3.0; ESC-10 CC BY). https://github.com/karolpiczak/ESC-50
40. SONYC-UST v2.3 on Zenodo (CC BY 4.0). https://zenodo.org/records/3966543
41. SONYC-Backgrounds on Zenodo (CC BY 4.0). https://zenodo.org/records/5129078
42. Zhou, Bartelds, Bianchi, Zou, "'Sorry, I Didn't Catch That': How Speech Models Miss What Matters Most", Feb 2026. https://arxiv.org/abs/2602.12249 (HTML v2: https://arxiv.org/html/2602.12249v2)
43. SF Streets and US Streets on Hugging Face (gated, licence "other"). https://huggingface.co/datasets/kzhou/sf_streets ; https://huggingface.co/datasets/kzhou/us_streets
44. Mozilla Foundation, "Offering Domain tags for sentences on Common Voice". https://www.mozillafoundation.org/en/blog/domain-datasets-common-voice/
45. Common Voice dataset releases (v27.0, `sentence_domain`). https://github.com/common-voice/cv-dataset
46. Mozilla Data Collective, Common Voice datasets (licence CC0-1.0). https://mozilladatacollective.com/organization/cmfh0j9o10006ns07jq45h7xk ; also Common Voice, Wikipedia. https://en.wikipedia.org/wiki/Common_Voice
47. VizWiz-VQA (CC BY 4.0). https://vizwiz.org/tasks-and-datasets/vqa/
48. ImVisible / PTL dataset README and LICENSE (MIT). https://github.com/samuelyu2002/ImVisible
49. GuideDog README and dataset card (CC BY-NC 4.0). https://github.com/jun297/GuideDog ; https://huggingface.co/datasets/kjunh/GuideDog
50. uB-VisioGeoloc, Data in Brief 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC10865199/ ; data on Harvard Dataverse (CC0 1.0). https://doi.org/10.7910/DVN/UYFPKM
51. BlindWays (Text to Blind Motion). https://blindways.github.io/ ; https://arxiv.org/abs/2412.05277
52. Memory-Maze. https://arxiv.org/abs/2405.07060
53. Touchdown README (CC BY 4.0). https://github.com/lil-lab/touchdown
54. Matterport3DSimulator / R2R README (Matterport3D Terms of Use). https://github.com/peteanderson80/Matterport3DSimulator
55. Kokoro-82M model card and VOICES.md (Apache-2.0). https://huggingface.co/hexgrad/Kokoro-82M
56. Rosenbaum et al., "LINGUIST", COLING 2022. https://arxiv.org/abs/2209.09900
57. BIG-bench README (canary strings). https://github.com/google/BIG-bench
58. Rule of three (statistics); Hanley & Lippman-Hand, JAMA 1983. https://en.wikipedia.org/wiki/Rule_of_three_(statistics)
59. Package registries: inspect-ai 0.3.271 https://pypi.org/project/inspect-ai/ ; promptfoo 0.123.1 https://www.npmjs.com/package/promptfoo ; jiwer 4.0.0 https://pypi.org/project/jiwer/ ; audiomentations 0.43.1 https://pypi.org/project/audiomentations/

## Verification (27 Sep 2026)

An adversarial check of 40 claims against primary sources: licence files, dataset files, Hugging Face and Zenodo APIs, the papers, and PyPI and npm.

**Confirmed as written:**
- STOP licence text (no derivatives or translation, no incorporation, revocable, audit).
- STOP: 236,477 files, 218 h, 885 speakers, TTS versions, v3 Oct 2022.
- TOP README "CC-BY-SA", 44,783 queries, 25 intents, 36 slots, 35% deeper than 2.
- TOPv2 LICENSE is CC BY-SA 4.0.
- Every TOPv2 navigation count, recomputed from the zip: 30,044 utterances; roots identical to TOP; 17 intents; 33 slots; 57% flat. Drive/driving 3,148 against walk/walking 57. The "walk or on foot" figure of 89 depends on the regex (69–94).
- MASSIVE 1.1: CC BY 4.0, 52 locales, 16,521 utterances per locale, the transport counts, the "walmart" → "conad" localisation.
- SLURP: licences, and 72,277 recordings, 58 h, 177 speakers.
- ITALIC: CC BY 4.0, gated, 16,521 samples, 70 speakers, 13 regions, 15.46 h.
- Speech-MASSIVE: CC BY-NC-SA 4.0, 12 languages.
- Street-names paper: 15 models, 44%, 73%, 46% vs 64%, under 1,000 samples and about 60%.
- DEMAND: CC BY 4.0 on Zenodo; the DNS README says CC BY-SA 3.0.
- Noise corpora: UrbanSound8K, ESC-50/ESC-10, MUSAN, SONYC.
- τ-bench: MIT; τ³ voice (ElevenLabs, G.711 μ-law 8 kHz); v1.0.1 in July 2026.
- BFCL: Apache-2.0, 2026.3.23, `multi_turn_miss_param`, weights 40/30.
- When2Call: CC BY 4.0, "ready for commercial use".
- GPL-2.0 for AGIF and BlendX, and the MixATIS/MixSNIPS clean sizes.
- GuideDog: CC BY-NC 4.0, 22,084/2,106.
- VizWiz: CC BY 4.0 and the split sizes.
- Kokoro: Apache-2.0; voices 20 US, 8 UK, 2 IT.
- Common Voice: v27.0 and `sentence_domain`.
- Other resources: Taskmaster-1, SGD, MultiWOZ, SNIPS, Qulac and ClariQ; RegretBench, LINGUIST, CLAMBER and BIG-bench.
- Package versions: inspect-ai, promptfoo, jiwer and audiomentations.

**Changed:**
- STOP. The same licence grants private use to develop NLU models, and lets those models be used commercially (clauses 1–2). The recommendation is narrowed from "do not use" to "not in the corpus; a private ASR check is allowed".
- ITALIC. 11.46% is the zero-shot WER on the random split, not in noise. Added `hard_noisy` 15.41% and `hard_speaker` 8.65%.
- SF/US Streets. The CC BY-NC-ND 4.0 statement in the paper covers SF Streets. For US Streets the paper says only "public research use".
- Common Voice CC0 raised from [P] to [V] (Mozilla Data Collective listing).
- uB-VisioGeoloc. The data is CC0 1.0 on Dataverse, not CC BY 4.0. There are 14 real and 2 synthetic sequences, and the walkers are not stated to be sighted. Retagged [V].
- ImVisible. MIT is the repo licence. The images carry no separate licence, so confirm with the author before shipping a detector trained on them.
- TOPv2's last activity is v1.1, March 2021, not 2020.
- Wilson intervals rounded correctly (86.7–92.6, 84.4–93.8).
- Added the Android 13+ / iOS limit of `expo-speech-recognition` audio persistence.
