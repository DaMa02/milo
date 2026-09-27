# S: Testing guidance before blind testers: replay, simulation and ground truth
Research date: 27 Sep 2026. Tags: [V] verified in a primary source I fetched (official docs, product page, licence file, registry, dataset record, paper abstract); [P] secondary source or search snippet; [U] could not verify; [M] my own calculation, design or estimate. Bracketed numbers point to the Sources; letters point to the other reports in this folder; "plan" is `docs/piano-di-lavoro.md` v1.

This report builds on N (golden-transcript replay, event button, Valhalla on the VPS), P (no open traces of blind pedestrians; uB-VisioGeoloc), O (Android emulator with TalkBack and a logging TTS engine), D and A (phone GNSS error, blind stride), J (J1 structured cues, retention), K (trip replay), L (iOS is the release gate; remote testers), M (pilot cities) and Q (contracts C1/C2, `tools/replay`, milestones (a)–(c), owners). It does not repeat them.

## In short

1. **Split the plan's criteria in two.** Some are *invariants* that any log can check without ground truth: "now" only with r ≤ 5 m; no "arrived" with r > 10 m; never silent too long; never a question at a crossing. Test them on every simulated walk and every real log. The others are *accuracy* criteria and need ground truth: the timing error of "now", the distance at arrival, false off-route events and crossing facts [M].
2. **Add one missing criterion: r must be honest.** Every tier in plan §4.3 rests on r, the 95% radius. Android's `getAccuracy()` is a 68% radius [V 41]. iOS `horizontalAccuracy` states no confidence level at all [V 42]. Only ground truth can calibrate r. Target: the true error is ≤ r on at least 95% of fixes, per class of environment [M].
3. **Ground truth: checkpoints first, PPK second.** The timing, arrival and off-route criteria are measured against physical lines: corners, kerbs and doors. The walker marks each line with a Bluetooth remote, and the mark lands on the same phone clock as the speech callbacks, so no clock sync is needed [M]. A u-blox ZED-F9P receiver, post-processed (PPK) against the free SPIN3 network, gives a continuous track for calibrating r and checking the side of the street. Kit: about **€700** (§2.4).
4. **SPIN3 is free, but with conditions** [V 3, 4]:
   - registration is required;
   - its terms address "imprese e operatori professionali";
   - correction data are CC BY 4.0;
   - real-time NTRIP must connect from Italy through an Italian mobile operator.

   1-s RINEX, including virtual RINEX, is kept for 3 months [V 2]. PPK needs no live connection. In London, OS Net RINEX is free but only at 30-s epochs [V 62].
5. **Sighted walks are open-loop: exploit it.** A sighted walker who knows the route turns at the corner whatever Milo says. So (a) one walker can carry the whole device matrix at once, with identical truth, and (b) every team log can be replayed through every future build to score it again without walking [M]. Logs from blind testers are closed-loop: the walker reacts to the cues, so they cannot be replayed counterfactually.
6. **No blindfold walks.** A blindness simulation made participants judge blind people as less capable of work and independent living (Silverman, Gwinn & Van Boven 2015) [V 55]. Blindfolded sighted people also do not have cane or dog skills. Team walks validate the machinery, not usefulness.
7. **The sample sizes in the plan are too small for its claims** [M]:
   - 50 crossings, all correct, prove only ≥ 94.2% at 95% confidence;
   - 30 minutes without a false off-route bound the rate only below 6 per hour;
   - the "now" bounds need at least 59 events with truth per platform (§3.3).
8. **Replay in three places:**
   - **Node:** deterministic, with a virtual clock (N, Q);
   - **inside the app:** a debug-only `ReplaySource` in `milo-guidance` that feeds recorded fixes, steps and heading to the real foreground service, with real speech and the screen off;
   - **OS mock locations:** adb test providers, emulator GPX, `simctl location`, XCUITest `XCUILocation`, Maestro `setLocation`/`travel`, `pymobiledevice3`. These are for smoke tests only: none of them injects steps, heading or accuracy together [V 30–38].
9. **Fuzz the engine with a virtual blind walker.** Use 0.55 m cane stride (D), pauses at kerbs and slow turns from WeAllWalk (CC0, blind walkers) [V 25], and a GNSS error model built from an Ornstein–Uhlenbeck process with side-of-street flips and dropouts [V 27]. Run it nightly against the invariants.
10. **Datasets:**
    - Mobile-GVIO (CC BY 4.0, June 2026) is the only public *pedestrian* set I found with phone GNSS (an iPhone) and an independent truth [V 24];
    - UrbanNav has no licence [V 22];
    - the GSDC licence could not be read [U 19];
    - I found no European pedestrian set.
11. **Device matrix:** iPhone 17, used iPhone 15, Pixel 10 and Galaxy A57; about €2,600 new or partly used (§7).
    - "One iPhone Pro" is not needed for GNSS: the non-Pro iPhone 17 already has dual-frequency GPS, and the 17e does not [V 50].
    - The Pixel 10a lists no dual-band GNSS; the Pixel 10 does [V 52].

## 1. What each criterion needs

| Plan criterion | Type | Needs truth? | Where it is tested |
|---|---|---|---|
| "Now" only with r ≤ 5 m | Invariant | No | L0 property tests, L1 fuzz, every log |
| Timing error of "now": median ≤ 2 m, P95 ≤ 5 m | Accuracy | Yes: position relative to the turn | L3 walks; L1 counterfactual replay of team logs |
| No "arrived" with r > 10 m | Invariant | No | L0, L1, every log |
| Precision mode: ≤ 5 m from the entrance | Accuracy | Yes: surveyed door | L3 (camera phase) |
| Zero false off-route in 30 min downtown | Accuracy (a rate) | Route adherence only | L3 plus L1 fuzz |
| Crossing facts ≥ 95% right; crossing position within 2 m | Accuracy | Survey sheet and tape | L3 survey |
| 60 min locked, no interruption; < 5%/h battery | Platform | No | L2 desk soak (continuity); L3 (battery, which needs real GNSS) |
| **New:** true error ≤ r on ≥ 95% of fixes | Calibration | Yes: continuous track | L3 with PPK |

The crossing position is a *relative* measure: the distance along the kerb from the corner to the crossing. A measuring wheel gives it to a few centimetres, so it needs no GNSS [M].

## 2. Ground truth in Milan

### 2.1 Options

| Option | Accuracy | Works in canyons and porticoes? | Cost | Verdict |
|---|---|---|---|---|
| **Checkpoints + event marks + steps** | ~0.3–0.6 m along the route at marked lines (error budget in §3.2) | Yes: it uses no GNSS | Bluetooth remote, measuring wheel | **Primary** for timing, arrival and off-route |
| **ZED-F9P PPK** against SPIN3 VRS 1-s RINEX | SPIN3 states 1–2 cm for 10–15 min static sessions at ~10 km [V 2]. Walking in canyons: [U], measure it in the pilot | Degrades; no signal under porticoes [M] | ~€520 kit | **Secondary**: r calibration, side of the street, open segments |
| ZED-F9P real-time RTK over SPIN3 NTRIP | 2–3 cm horizontal in theory [V 2] | Same as PPK, with no smoothing pass | Same | Monitoring only; PPK is better after the walk |
| Emlid Reach RX2 | All-band, tilt-compensated [V 16] | Better antenna, same physics | $2,399 before tax [V 16] | Runner-up; overkill |
| Milan DBT 2020 (1:1000) | "Nominal scale 1:1000", from a Mar–Apr 2020 flight [V 59]; planimetric tolerance [U] | n/a | Free, CC BY [V 59] | Kerb lines, islands, porticoes, poles (§2.3); **not** zebra stripes |
| Video annotated by hand | Depends on the frame | Yes | Hours per walk | Only to resolve disputed events |

### 2.2 SPIN3 and RTKLIB

- **SPIN3:** 39 stations in Piedmont, Lombardy and Aosta Valley; 34 were operational on 27 Sep 2026 [V 1].
  - The Milan station is at Politecnico di Milano, Piazza Leonardo da Vinci 32 [V 5].
  - NTRIP: 158.102.7.10:2101. Mountpoints VRS, NRT and iMAX (GPS+GLO+GAL+BDS, RTCM 3 MSM5) and MAC (GPS+GLO) [V 2].
  - The service is free with registration [V 3]. The terms offer it "a imprese e operatori professionali, pubblici e privati"; whether two individual developers qualify is an open question (§13).
  - Correction data are CC BY 4.0 [V 4].
  - Real-time use must "partire dal territorio italiano" with an Italian operator [V 3].
  - RINEX and virtual RINEX at 1–60 s require registration and are kept for 3 months [V 2].
  - 30-s RINEX is anonymous and free [V 6].
- **RTKLIB:** BSD 2-clause "and additional two exclusive clauses"; commercial use is allowed. Versions up to 2.4.1 were GPLv3 [V 7].
  - Upstream `tomojitakasu/RTKLIB` was last pushed on 28 May 2024 [V 8].
  - Use the **rtklibexplorer "demo5" fork** (tuned for u-blox; pushed 22 Sep 2026; 976 stars) [V 8]. Its `str2str` logs the receiver and `rnx2rtkp` post-processes.
  - It runs as a CLI on a laptop or on the VPS, so there is nothing to link into the MIT app.
- **Antenna:** a ZED-F9P "with a patch antenna is only suitable … in conditions with high availability of open sky". With a geodetic-grade antenna it beats professional gear in most partially obscured cases (Janos & Kuras 2021) [V 17]. Carry a survey antenna on a backpack mast, not a patch or helical antenna.
- **Expected in Milan** [U until the pilot]:
  - fix most of the time in wide streets and squares;
  - float or nothing in narrow historic streets;
  - no signal under porticoes and in the Galleria.

  The pilot walk (§11, S9) measures the fix rate per segment class. Where it is low, the checkpoints carry the truth.

### 2.3 Milan's topographic database

- The DBT 2020 is CC BY, in SHP (EPSG 7791 or 3003), and the zip is 597 MB [V 59].
- Its WMS lists class 010102 "Area di circolazione pedonale", plus 010204 "Elemento tranviario", 020208 "Palo" and 010103 cycle areas [V 60].
- In the national content specification, pedestrian areas are typed as marciapiede, salvagente (island), galleria pedonale, sottopassaggio/portico and others. The "ciglio di marciapiede" (kerb line) is the boundary with the carriageway [V 61]. There is no class for zebra stripes.
- **Use:** an agent derives kerb lines, islands, porticoes and poles for every route and pre-fills the survey sheets. Surveyors confirm them on site and measure the zebra offsets by wheel.

### 2.4 Recommended kit and protocol

**Kit** (prices from the store pages on 27 Sep 2026; VAT treatment not stated [U]):
- ArduSimple **RTK Portable 2**: ZED-F9P, 70 g, USB/UART/Bluetooth, powered by USB, **€299** [V 10];
- **Budget Survey Multiband antenna**: L1/L2, 390 g, 5/8" thread, **€89** [V 11], on a backpack mast (DIY, ~€30 [U]);
- Raspberry Pi Zero 2 W running `str2str` to log raw UBX to SD, plus a power bank (~€60 [U]);
- two Bluetooth media remotes for event marks (~€25 [U]);
- a measuring wheel (~€40 [U]);
- optional: ArduSimple 4-section pole for static checkpoint surveys, **€139** [V 12].

Total ≈ €650–750.

Alternatives: the all-band UM980 board at €223 [V 13] (RTKLIB support for its raw format [U]); or the RTK Smart Antenna at €759, which has an Event input and a battery [V 12].

**Protocol, one walk:**
1. Log raw UBX at 1 Hz from 5 min before the walk.
2. Start with a 30-s static occupation at a surveyed point, then press "sync".
3. Walk the route. Press the remote at every decision line, kerb line and door on the survey sheet, and at the start and end of every scripted deviation.
4. After the walk: download the SPIN3 VRS 1-s RINEX for the area and run `rnx2rtkp` (forward plus backward, combined) to produce `truth.jsonl`.
5. Where the solution is not fixed, interpolate between marks along the planned path using step counts × the walker's stride. Measure the stride on a 50 m taped line [M].

## 3. Measuring each criterion

### 3.1 Definitions [M]

- **Decision line (turn point).** The line across the walker's footway at which the turn must begin: the building or kerb corner for a turn along the same side; the kerb line when the turn begins with a crossing. The survey sheet names a visible reference for each line.
- **Kerb line.** The edge where the footway meets the carriageway at a crossing: the top of the kerb, or the start of a dropped kerb or ramp. It is taken from the DBT boundary and confirmed on site.
- **Timing error of "now".**
  - *e = d − D*: *d* is the distance the walker still had to cover to the decision line when the word "now" began to sound; *D* is the design lead.
  - Proposed *D* = 2 m, about 2 s of blind walking, enough to hear "turn left now". Ask the O&M instructors (§13).
  - Criterion: median |e| ≤ 2 m, P95 ≤ 5 m.
- **"Arrived".** An arrival-class cue (C2 `cls: arrival`) that asserts arrival; "approaching" does not count. The measure is the straight-line distance from the true position when the word begins to the surveyed entrance: the centre of the door threshold.
- **False off-route.** A transition to `off_route` (or an off-route cue) while all three hold:
  - the truth is inside the route corridor (the planned footway or crossing, cross-track ≤ 3 m);
  - it is not inside a marked deviation;
  - it is more than 10 s after one ends.
- **Missed off-route.** A marked deviation of more than 20 m with no off-route event within 30 s.

### 3.2 Clock synchronisation

- **Same clock where it matters.** The timing and arrival errors compare a speech callback with a mark, both on the phone's monotonic clock:
  - Android `elapsedRealtimeNanos`, which keeps running in deep sleep [V 41];
  - iOS `mach_continuous_time`, which keeps running "while the system is asleep" [V 43].
- **Distance from the time difference.** Steps between the word and the mark × stride. Use speed × Δt only when the walker did not slow down.
- **When the word is heard:**
  - Android `onStart` fires "soon before audio is played back" [V 39]. `onRangeStart` (API 26) fires when a range "is expected to start playing on the speaker", but only if the engine supplies timing [V 39]; with it, log the start of the word "now".
  - iOS has `didStart` and `willSpeakRangeOfSpeechString` [V 40].
  - Add a measured output latency per device and audio route: speaker, wired, Bluetooth bone conduction.
  - Measure it once by filming the phone in 240-fps slow motion: the test build flashes the screen at the callback, and the video's audio track records the sound onset [M].
- **Phone to GNSS time** (for the PPK track):
  - Android GPS-provider fixes carry time "from the clock in use by the satellite constellation" together with the elapsed realtime of the same fix [V 41]. Test builds subscribe to the GPS provider as well as the fused one, and fit a line that maps one clock to the other.
  - On iOS, align by cross-correlating the phone's speed profile with the PPK speed profile [M].
- **Error budget** [M]:
  - press jitter 0.1–0.3 s ≈ 0.1–0.35 m at 1.2 m/s;
  - stride error ≈ 3% over ≤ 10 m ≈ 0.3 m;
  - output latency after correction < 0.05 s.

  In total about ±0.5 m, well inside the 2 m median.

### 3.3 Sample sizes (distribution-free, 95% confidence) [M]

| Claim | Events needed | Rule |
|---|---|---|
| P95 of \|e\| ≤ 5 m | **59** "now" events with 0 above 5 m; 93 with 1; 124 with 2 | The largest of 59 is an upper bound on P95 (0.95^59 < 0.05) |
| Median of \|e\| ≤ 2 m | With n = 59: the **37th** smallest ≤ 2 m; n = 93: the 55th | Binomial order statistic |
| Crossing facts ≥ 95% | **59/59** correct (lower bound 95.05%) | 50/50 gives ≥ 94.2%; 48/50 gives ≥ 87.9% (Clopper–Pearson) |
| False off-route rate | 0 events in **3 h** → < 1/h; in 8.5 h → < 0.35/h | Poisson: 3/T. The plan's 30 min gives only < 6/h |
| r calibration | ≥ 30 min of truth per environment class | Fixes are autocorrelated: bootstrap in 30-s blocks |

**Pool per platform** (iOS, Android) and per release candidate. "Now" is said only when r ≤ 5 m, which may be rare in Milan's canyons. The first bank walk tells how many eligible events a walk yields [U].

**Severity.** A false "audible signal" or a false "island" is a safety error. Allow **zero** such errors, whatever the percentage.

### 3.4 Walk-log format: `milo.walklog/1` (JSONL)

One object per line, ordered by `t` (monotonic ms). It extends Q's C1 `NativeEvent` and C2 `Cue` rather than replacing them. The truth lives in a sidecar file, so the phone never holds it.

| `k` | Fields | Source |
|---|---|---|
| `header` | `schema`, `walk_id`, `purpose` (team_truth, team_smoke, tester, synthetic), `consent` {scope, export: none/metrics/corpus, expires}, `app` {version, build, engine_rev}, `pack` {city, osm_timestamp, sha256}, `device` {model, os, tts_engine, audio_route, l5}, `route` {plan_v, route_id, dest.entrance}, `walker` {kind, stride_m, carry}, `truth` {kind, file} | App |
| `clk` | `unix_ms` every 10 s | Native |
| `fix` | `src` (fused, gps, network, replay, mock), `lat`, `lon`, `acc68`, `spd`, `spd_acc`, `crs`, `crs_acc`, `t_fix`, `utc_ms`, `mock` | C1 |
| `gnss` | `used`, `used_l5` (from `getCarrierFrequencyHz` [V 44]), `cn0` | Android |
| `steps`, `hdg` | count; `deg`, `acc`, `src` | C1 |
| `pose` | matcher output: `lat`, `lon`, `r95`, `tier`, `edge`, `side`, `s_m`, `impl` (ts@sha or native@sha) | Engine or native (R) |
| `nav` | `status`, `off_m`, `rem_m` | Engine |
| `cue` | the C2 `Cue` (id, plan_v, step, cls, tier, maneuver, dir, onto, at_m, `facts[]` per J1, tpl, params) plus rendered `text` and `lang` | Engine |
| `tts` | `cue`, `utt`, `ev` (queued, start, range, done, stop, error), `range`, `word` | C1 |
| `mark` | `what` (decision, kerb, door, dev_start, dev_end, wrong, note, sync), `ref` (turn:5, xing:12), `src` | Remote, headset, screen |
| `user` | `kind`, `intent`; `text` only if `export` = corpus | Dialogue |
| `batt` | `pct`, `uAh` (`BATTERY_PROPERTY_CHARGE_COUNTER` [V 45]), `temp_c` | Native |
| `life` | fg, bg, screen_off, service_start/stop, focus_loss, call | C1 |
| `truth.jsonl` | `gps_ms`, `lat`, `lon`, `q` (fix, float, single, interp), `sd`; `check` {id, kind, lat, lon, src: rtk_static, dbt2020, wheel} | PPK pipeline |

```jsonl
{"k":"header","schema":"milo.walklog/1","walk_id":"2026-10-12T0931Z-pr3","purpose":"team_truth","consent":{"scope":"team","export":"metrics","expires":"2027-10-12"},"device":{"model":"Pixel 10","audio_route":"bt","l5":true},"truth":{"kind":"ppk+checkpoints","file":"truth.jsonl"}}
{"k":"fix","t":812345.2,"src":"fused","lat":45.4512,"lon":9.2071,"acc68":6.1,"spd":1.08,"crs":182,"t_fix":812340.0,"utc_ms":1791797460000,"mock":false}
{"k":"cue","t":812410.9,"id":"c42","step":5,"cls":"instruction","tier":"now","maneuver":"turn","dir":"left","onto":{"osm":"w123","label":"Via Brembo"},"text":"Turn left now onto Via Brembo."}
{"k":"tts","t":812452.3,"cue":"c42","utt":"u77","ev":"range","range":[10,13],"word":"now"}
{"k":"mark","t":814380.0,"what":"decision","ref":"turn:5","src":"remote"}
```

**Who reads it:**
- N's golden replay reads `fix`, `steps` and `hdg`, and writes `cue` and `tts`: the transcript is the `cue` lines.
- K's trip replay reads everything except `user`.
- J's corpus export reads `user` plus the surrounding `cue` lines, only when `export = corpus`.

### 3.5 Analysis script: `tools/walk-score` (TypeScript)

Written in TypeScript, so it reuses the engine's projection and route geometry. Python is used only to call RTKLIB.

Steps:
1. Validate the log against the contracts schema.
2. Fit the monotonic-to-GNSS clock map (§3.2).
3. Build the truth: PPK where `q` = fix or float, else interpolation between checkpoints.
4. Project the truth and the poses onto the planned path, giving `s_true(t)` and the cross-track distance.
5. Score:
   - *e* for each "now";
   - the arrival distance;
   - false and missed off-route events;
   - r calibration by environment class, taken from the route segment tags;
   - crossing facts joined to the survey sheet;
   - battery %/h from `uAh`;
   - continuity (gaps > 10 s, service stops, TTS errors).
6. Aggregate per build, with the order-statistic bounds of §3.3.
7. Write JSON (for the dashboard), CSV per event, and an accessible Markdown or HTML report.

Effort: 3–4 days, agent-friendly [M].

## 4. Replay and simulation

### 4.1 Node replay (L1)

- **Deterministic by design.** `step()` in `navigate.ts` already takes `now` as a parameter, so a virtual clock is a harness concern [M, repo].
- **Pipeline.** Records → matcher → engine → cue scheduler → simulated speech. Speech duration = words ÷ speech rate + a latency drawn from the measured table for that device and route.
- **Pinned map.** Each log carries its `pack.sha256`, and replay loads that pack. Porta Romana, already a fixture, is route M1.
- **It works wherever the matcher runs.** R (option D) keeps N's matcher in TypeScript and gives native code the clock, the speech queue and a watchdog that guides from a snapshot when JavaScript stalls. Two modes:
  - *inputs*: the TypeScript matcher plus the engine, the default under R;
  - *poses*: the recorded `pose` lines, engine only. This mode covers a native matcher if one is ever added, and the watchdog's snapshot guidance.

  One set of JSON conformance vectors runs against every implementation, TypeScript and native, so the golden files stay valid either way [M].
- **No JavaScript timers.** R found that on a locked Android phone JavaScript timers do not fire. The virtual clock therefore advances only on events: in Node from the log's `t`, on the phone from the native clock ticks, which `ReplaySource` also emits.
- **Counterfactual scoring.** Team logs (open-loop) are re-scored against every new build: the timing error is recomputed from the new cue times and the recorded truth. Walks then only confirm.

### 4.2 Device-level replay

| Tool | What it injects | Limits | Use |
|---|---|---|---|
| **In-app `ReplaySource`** (debug builds of `milo-guidance`) | Recorded fix, steps and heading, at recorded pace, into the real service | Real GNSS off unless in "shadow" mode (location requested but ignored) | **Main L2 tool**: 60-min locked soak on every phone, TTS timing |
| `adb shell cmd location providers add-test-provider` / `set-test-provider-location` | Lat, lon, accuracy, time | Needs `appops set <uid> android:mock_location allow`; no speed or bearing [V 36] | Smoke tests of the real location path |
| Emulator GPX/KML playback; `geo fix`; `sensor set` | Route at 1×–n× speed; accelerometer and magnetometer [V 37, 38] | No step detector among the listed sensors [V 37] | O's TalkBack job, plus location |
| `xcrun simctl location … start --speed --interval` | Waypoints; default 20 m/s and 1 s [P 34] | No accuracy, no steps | iOS simulator CI |
| XCUITest `XCUIDevice.shared.location = XCUILocation(…)`; GPX in test plans | Location, course; GPX replay [V 32, 33] | iOS 16.4+ [V 33]; test-plan location affects only the test bundle [V 32] | iOS UI tests |
| Maestro `setLocation`, `travel` | A point; points + speed [V 30, 31] | `setLocation` needs Android API ≥ 31; `travel` defaults to a 15-s timeout [V 30, 31] | Journey smoke flows (O) |
| `pymobiledevice3 developer dvt simulate-location play` (GPL-3.0, 11.19.4, 27 Sep 2026) | GPX on a physical iPhone, iOS 17+ [V 35] | Development tool only, never shipped | Real iPhone smoke tests |

**Do mock locations reach a foreground service with the screen off?**
- Android test providers are injected in the system server, and delivered fixes are flagged `isMock()` [V 41].
- Delivery to a foreground service with the screen off, and whether the fused provider (Play services) honours test providers, are not documented [U]. The same holds for iOS device simulation on a locked phone [U].
- Do not rely on either. `ReplaySource` bypasses the question.
- A half-day spike on the Samsung and the iPhone settles it for the smoke tests.

**Answer to R's open question 6: replay on iOS without Xcode.** `ReplaySource` reads a `walklog` file from the app's sandbox, so the injection needs no Xcode. The file reaches the sandbox in one of three ways:
- a debug menu downloads it from the VPS;
- Files or AirDrop, with the app's document types opened in debug builds;
- a push from a laptop with `pymobiledevice3`'s file services [U: the exact command was not checked].

Replay then runs through R's T1 test (a 60-minute locked replay) with real speech and the screen off [M].

### 4.3 Virtual walker and invariant fuzzing (`tools/sim`)

- **Gait:**
  - stride 0.55 m with a cane, 0.62 m with a dog (D);
  - cadence and turn durations, and stops, fitted from **WeAllWalk**: blind walkers with a cane or dog, pocketed iPhones, annotated turns and stops; CC0, 321 MB [V 25, 26];
  - pauses at kerbs of 2–90 s [M];
  - slow turns;
  - veering on open crossings and squares (Guth & LaDuke 1995 on individual differences [V 29]);
  - scripted wrong turns.
- **GNSS error:**
  - a correlated Ornstein–Uhlenbeck error with moving-average smoothing and outliers, the method of Wöltche 2025 (paper CC BY; his Map Matching 2 is AGPL, so the idea only) [V 27, 28];
  - σ by environment class, from 5–15 m in streets to more than 30 m in canyons (D, A);
  - side-of-street flips, dropouts under porticoes, and a reported accuracy that is miscalibrated on purpose;
  - parameters refitted from Milo's PPK walks and from Mobile-GVIO (§5).
- **Invariants,** checked with `fast-check` 4.10.2 (MIT) [V 63]:
  - no "now" tier with r95 > 5 m;
  - no "arrived" with r95 > 10 m;
  - never silent for more than N s on route (N = the plan's reminder interval);
  - no more than K words in 10 s;
  - no question or prompt between the kerb mark and the far kerb;
  - no identical cue within 10 s;
  - every number spoken has a fact (J1);
  - an off-route event within 30 s of a deviation;
  - the same seed gives the same transcript.
- **Scale.** About 1,000 simulated walker-hours a night on GitHub Actions (free for public repos, Q) [M].
- **Effort.** 4–6 days [M].

## 5. Public datasets for fuzzing and error models

| Dataset | Mode | Phone GNSS | Truth | Licence | In the CI of an MIT repo? | Use |
|---|---|---|---|---|---|---|
| **Mobile-GVIO** (Shenzhen; Zenodo, 3 Jun 2026) | Pedestrian, handheld; 7 sequences of 0.1–1 km, outdoor and indoor–outdoor | iPhone 11 Pro Max fixes, 1 Hz | LiDAR-IMU (Fast-LIO2) in a local frame; its evaluation aligns trajectories (`evo --align`) [V 24] | CC BY 4.0 [V 24] | **Yes**, as small derived CSVs with attribution | The best public fit for pedestrian iPhone error dynamics. The alignment hides a constant bias [M] |
| **WeAllWalk** (UCSC, 2016) | Blind walkers indoors, cane and dog | None (IMU only) | Annotated segments, turns, stops [V 25] | CC0 [V 25] | **Yes** | Gait model |
| **uB-VisioGeoloc** (Dijon) | Pedestrian | GPS module (~3 m in clear weather), not a phone; "mainly open environments" [V 23] | None | CC0 (P) | Yes | Smoke replay only |
| **UrbanNav** (Hong Kong, Tokyo) | Vehicle (Honda Fit, Toyota Rush) | u-blox F9P and M8T; phone IMU only | SPAN-CPT or POS LV620, ~5 cm [V 22] | **None stated**: the "License" section holds only contacts [V 22] | **No** | Offline canyon study, after asking the authors |
| **GSDC 2021–23** (Google, Kaggle) | Driving [P] | Android phones' raw measurements and fixes (e.g. a Pixel 7 Pro in the 2023 samples) [V 21] | A high-accuracy reference [U: not read] | Kaggle rules could not be rendered [U 19]; the IEEE DataPort copies are re-uploads by a third party [P] | **No**, until the rules are read | Offline calibration of accuracy reporting; vehicle dynamics differ |
| **Google GnssLogger** (Apache-2.0, pushed 8 Sep 2026) | A tool, not data | Logs raw measurements, fixes (with `elapsedRealtimeNanos` and `MockLocation`) and sensors [V 18] | — | Apache-2.0 [V 8] | Format reference | Diagnose multipath on test phones |

No European pedestrian dataset with phone GNSS and independent truth turned up (Zenodo search, 27 Sep 2026) [U]. Milo's own team walks are the primary source. Tools: `gnss-lib-py` 1.1.0 (MIT) [V 64] and `pyubx2` 1.3.7 (BSD-3) [V 64].

## 6. Sighted team walks

### 6.1 Protocol

- **What the walker carries:** phones in normal positions (trouser and jacket pockets, rotated between runs); one headset, live; the other phones muted but logging; the RTK backpack; the remote.
- **Eyes open.** The walker follows the route they know and ignores the cues (open loop).
- **Safety:**
  - obey the signals; never cross against the light to "test";
  - a second person walks along on canyon and tram routes;
  - daylight only;
  - no one steps into the carriageway to survey: measure from the kerb or from the island.
- **Scripted deviations**, one or two per route, bracketed by `dev_start` and `dev_end`, to measure detection.
- **Afterwards:** PPK and scoring on the same day, while the notes are fresh.

### 6.2 No blindfold simulation

- Simulating blindness led participants to judge blind people less capable of work and independent living. Merely watching someone simulate did not have this effect (two experiments) [V 55].
- Silverman, a blind psychologist, argues in the NFB's journal that a blindfold highlights "the initial trauma of becoming blind rather than the realities of being blind". The long, instructor-led immersion (400+ hours) required for NOMC certification is a different thing [P 56].
- Sears & Hanson discuss how people without the disability are used to stand in for users in accessibility research, and the limits of doing so [P 57].
- **Organisations differ.** RNIB publishes a sight-loss simulation app for awareness, for non-commercial use [V 58]. None of this endorses blindfolded walks in traffic, and none makes them evidence of usefulness.

### 6.3 What sighted walks can and cannot show

- **They can show:**
  - timing, arrival distance and off-route behaviour against truth;
  - honest r;
  - crossing facts;
  - background survival and battery;
  - golden logs for replay.
- **They cannot show:**
  - whether the wording is understood without sight;
  - reactions under cane or dog workload;
  - veering on open crossings;
  - trust, cognitive load, and the need for "repeat" and clarification;
  - VoiceOver and TalkBack coexistence during real use.

### 6.4 Milan route bank (about 10 routes)

Each route: 0.8–1.5 km, 10–20 min, about 5 turns and about 5 crossings. The bank then holds about 50 crossings, the plan's sample, and 10 arrivals. Areas are candidates for the survey to confirm [M].

| # | Area | Tests |
|---|---|---|
| M1 | Porta Romana, around Talent Garden (the existing engine fixture) | Baseline; deterministic replay on the committed OSM snapshot |
| M2 | Città Studi, Piazza Leonardo da Vinci | Open sky, about 0 km from the SPIN3 Milano station [V 5]: validates the kit and calibrates r in the open |
| M3 | Brera, narrow historic streets | Canyon; narrow or missing footways; cobbles |
| M4 | Duomo portici, Galleria, Corso Vittorio Emanuele | Porticoes and a covered gallery (GNSS dropout); crowds; arrival at a door under a portico |
| M5 | Via Torino, Carrobbio | Tram tracks in the carriageway; frequent crossings |
| M6 | Bastioni (e.g. Viale Monte Nero, Viale Piave) | Wide boulevards, islands, long signalised crossings |
| M7 | Porta Nuova (Gae Aulenti, Melchiorre Gioia) | Modern high-rise canyon; raised square; ramps and steps |
| M8 | Navigli, Darsena | Waterside paths, bridges, uneven or absent kerbs |
| M9 | Paolo Sarpi | Pedestrianised shared street with no kerbs next to ordinary streets |
| M10 | Stazione Centrale forecourt, to one named entrance | Large square, several entrances, arrival mode |

**Pilot cities (M), one route each if the founders travel:**
- **London:** crossings with rotating cones. Use OS Net RINEX (free, 30-s epochs) [V 62] for a coarser PPK.
- **Dublin:** audio-tactile signals. Irish base data [U].

**Survey sheets.** An agent generates one per route from OSM and the DBT, listing turns with their decision lines, crossings with Milo's facts, kerbs, the door and the environment class per segment. The walk fills them with truth and wheel offsets. About 4–5 person-days for the ten routes [M].

**Regression.**
- Every release candidate walks the bank once, with all phones carried together: about 1 day for two people.
- It is scored against the previous candidate with bootstrap intervals; a regression is a result worse than the baseline beyond noise.
- Between walks, every new build is re-scored on all past team logs in Node.
- Summary metrics, without coordinates, go to the public repo. Raw logs stay private (§8.3).

## 7. Device matrix

| Phone | GNSS | Why | New (IT, 27 Sep 2026) | Used |
|---|---|---|---|---|
| **iPhone 17** (non-Pro) | Dual-frequency [V 50] | Release gate (L); what many will buy | €1,129 for 256 GB [V 51] | [U] |
| **iPhone 15** | L1 only (D) | The installed base; single-frequency contrast | — | ~€402 for 128 GB [P 54] |
| **Google Pixel 10** | "GNSS dual-band" [V 52] | Clean Android reference; battery counters in Perfetto [V 46] | €739 on offer, €799 list [V 52] | [U] |
| **Samsung Galaxy A57** | L5 not stated [U 53]; check on arrival with `used_l5` | Samsung's app killing (dontkillmyapp: Samsung 5 of 5) [V 49]; mid-range | ~€334 street [P 53] | — |
| Optional: iPhone 17e | L1 only (no "doppia frequenza") [V 50] | New alternative to a used 15 | €879 for 256 GB [V 51] | — |
| Not needed: iPhone 18 Pro | Dual-frequency [V 50] | Only for later LiDAR or camera work | €1,489 [V 51] | — |

Total ≈ €2,600, less for the phones the founders already own. A founder's own Xiaomi or OnePlus makes a useful third Android: both also score 5 on dontkillmyapp [V 49].

Samsung promised in July 2024 that from One UI 6.0 the foreground services of apps targeting Android 14 "will be guaranteed to work as intended" when they follow the new policy [V 49]. Verify it with the desk soak.

**Battery:**
- Android logs `uAh` from the charge counter [V 45]; Pixels also give Perfetto battery counters [V 46].
- iOS: Power Profiler records untethered traces on iOS 26+ [V 47]. `batteryLevel` moves in about 5% steps [P 48], so a 60-min run alone cannot resolve "< 5%/h".
- Protocol: start at 90%, screen locked, Bluetooth headset, real walk; three runs; subtract a locked idle baseline measured on the same phone.

## 8. Handover to blind testers

### 8.1 Entry criteria for the first blind field test (gate G-B1)

1. L0 and L1 green:
   - no invariant violation in 10,000 simulated walks on the candidate build;
   - golden transcripts reviewed.
2. L2: a 60-min locked replay soak on every matrix phone, with no service stop, no fix gap over 10 s and no TTS error.
3. L3, on at least two bank walks of the candidate:
   - the "now" bounds of §3.3 met, or, if eligible events are too few, the observed median ≤ 2 m and P95 ≤ 5 m, reported with n;
   - no "arrived" with r > 10 m;
   - no false off-route in ≥ 3 h per platform;
   - crossing facts ≥ 95%, with **zero safety-critical errors**;
   - r calibration ≥ 95% in street and canyon classes, or the tiers widened until it is.
4. Battery measured on at least two phones (target < 5%/h).
5. Privacy and safety:
   - stop word, "never 'cross now'" and the safety texts in place;
   - consent and retention implemented (§8.3);
   - DPIA draft (I).
6. An O&M instructor has reviewed and approved each test route (§8.2).

### 8.2 O&M review

- **Before the walk: route review.** A static, accessible HTML page and a GPX from the same engine, in the plan's rehearsal mode (§4.6): the "jump" transcript, each crossing's facts and unknowns, and each turn's cue. The instructor marks every item OK, wrong or missing, and vetoes routes. Corrections flow into OSM through the team account (N) and into the survey truth.
- **During the first session:**
  - in person in Milan, with the instructor shadowing;
  - the tester uses their own cane or dog;
  - pre-agreed stop rules;
  - familiar routes first.
- **After: trip replay (K).** Planned route against trail, cues where they were said, marks and off-route events, as a text table for screen readers as well as a map. Generated by `tools/replay --report`.
- **Remote English testers (L), unobserved:**
  - start on routes they already know well;
  - they press "here" at corners, so their own knowledge becomes ground truth for timing;
  - logs come only with a per-trip consent.

### 8.3 Consent and retention (N open question 4)

- **Team walks:**
  - a written consent from each walker;
  - raw logs in a private store (private repo with LFS, or the VPS), kept for the project as the regression corpus and deletable on request;
  - public fixtures only with the walker's consent, trimmed 200 m at each end [M].
- **Blind testers:**
  - logs stay on the phone (J: 7 days by default);
  - upload only per trip, after a spoken and on-screen explicit consent (Art. 9(2)(a), as in I);
  - the first and last 200 m are trimmed on the phone;
  - on the server, raw logs are deleted after 90 days, and only metrics and coordinate-free cue transcripts are kept, unless the tester opts into the corpus (J) [M];
  - never in CI and never in the public repo.

## 9. Test pyramid for guidance

| Level | Proves | Tools | When | Cost | Effort [M] |
|---|---|---|---|---|---|
| **L0 Unit and property** | Tier, cue and matcher rules; invariants on generated inputs | Vitest, fast-check (MIT) | Every PR, < 1 min | €0 | 2 d scaffolding |
| **L1 Node replay and fuzz** | Same inputs give same cues (golden, N); metrics on logs with truth; counterfactual re-scoring; virtual-walker fuzz | `tools/replay`, `tools/sim`, `tools/walk-score` | Goldens on every PR; fuzz nightly | €0 | 3–4 + 4–6 + 3–4 d |
| **L2 Device and emulator** | Background survival, real TTS timing, OS integration, screen reader | `ReplaySource`, adb test providers, emulator GPX + TalkBack logging TTS (O), `simctl`, XCUITest, Maestro, pymobiledevice3 | Per release candidate, plus the 60-min desk soak | Phones (§7) | `ReplaySource` 2–3 d per platform; CI jobs 3–4 d |
| **L3 Sighted walks with truth** | Timing, arrival, false off-route, r calibration, crossing facts, battery | RTK kit, remotes, wheel, route bank, RTKLIB demo5 + SPIN3 | Pilot once; bank per release candidate | ~€700 kit | Survey 4–5 d; ~2 person-days per bank walk + 0.5 d review |
| **L4 Blind field tests** | Usefulness, comprehension, trust, safety in the closed loop | O&M review, rehearsal, trip replay, consented logs | After G-B1 | Tester and instructor compensation [U] | Per session |

## 10. Shopping list

| Item | Price | Tag |
|---|---|---|
| ArduSimple RTK Portable 2 (ZED-F9P) | €299 | [V 10] |
| ArduSimple Budget Survey Multiband antenna | €89 | [V 11] |
| Backpack mast, 5/8" adapter | ~€30 | [U] |
| Raspberry Pi Zero 2 W, SD card, case; 20 Ah power bank | ~€60 | [U] |
| 2 Bluetooth media remotes | ~€25 | [U] |
| Measuring wheel | ~€40 | [U] |
| Optional: ArduSimple 4-section pole (static checkpoints) | €139 | [V 12] |
| iPhone 17 (256 GB) | €1,129 | [V 51] |
| iPhone 15 (used, 128 GB) | ~€402 | [P 54] |
| Google Pixel 10 | €739–799 | [V 52] |
| Samsung Galaxy A57 | ~€334 | [P 53] |
| SPIN3 registration; OS Net RINEX | Free | [V 3, 62] |
| **Total** | **≈ €650–750 kit + ≈ €2,600 phones** | |

## 11. Order, parallel and serial, with owners

Owners follow Q §8: Daniele owns the engine and the contracts; Leonardo owns the native modules and the UI; agents take TypeScript work that has an oracle.

| Step | What | Owner | Depends on | Parallel with |
|---|---|---|---|---|
| **S1** | `milo.walklog/1` in `packages/contracts` (extends C1 and C2) | Daniele + agent | Q week-0 contract freeze | S6 |
| S2 | Node replay with virtual clock; inputs and poses modes; matcher conformance vectors | Agent (Daniele reviews) | S1, J1 | S3–S5 |
| S3 | Virtual walker, GNSS error model, nightly invariant fuzz | Agent | S2 | S4, S5 |
| S4 | `tools/walk-score`, first on synthetic logs | Agent | S1 | S2, S3, S5 |
| **S5** | Native logging in `milo-guidance` (both clocks, TTS ranges, charge counter, lifecycle), remote marks, `ReplaySource` | Leonardo | S1, S0 (Q) | S2–S4 |
| S6 | Order the kit; register with SPIN3; PPK script (demo5 `rnx2rtkp`) | Daniele + agent | — | S1–S5 |
| S7 | Route bank: OSM and DBT survey sheets (agent), then the field survey (both) | Both + agent | S6 kit | S2–S5 |
| S8 | CI device jobs: emulator TalkBack (O), `simctl` or XCUITest location, Maestro smoke | Leonardo + agent | App shell | S7 |
| **S9** | Pilot walk: M2 open sky plus one canyon route. Measure fix rate and eligible "now" events; tune §2.4 | Both | S5, S6, S7 | — |
| **S10** | Bank walk per release candidate, then regression review | Both (agent scores) | S9 | Per build |
| S11 | O&M route review page and trip replay report | Agent (Leonardo reviews the UI) | S2 | S10 |
| S12 | Consent and retention texts for walk logs | Both, agent drafts | I's DPIA | S10 |

**The serial spine:** S1 → S5 → S9 → S10 → G-B1 → blind tests.
- S9 coincides with Q's milestone (a), the first locked-screen walk.
- One bank walk with L0–L2 green is enough for (b), the closed beta.
- The full G-B1 gates (c).

## 12. Corrections to the plan and initial assumptions

1. **The plan's §4.3 criteria mix invariants and accuracy.** Invariants can be tested on every log and in the fuzzer, cheaply and continuously; only accuracy needs walks.
2. **r is assumed honest.** It is 68% on Android [V 41] and unspecified on iOS [V 42]. Calibrate it, or the tiers mislead.
3. **The sample sizes are too small** for the claims (§3.3). "Zero false off-route in 30 minutes" is a smoke test, not a guarantee.
4. **"One iPhone Pro and one non-Pro."** The iPhone 17 is dual-frequency. The real split is L1-only against L1/L5 [V 50].
5. **"Three Android phones incl. a Samsung"** needs one dual-band reference. The Pixel 10a lists none; the Pixel 10 does [V 52].
6. **RTK is not the answer everywhere.** A ZED-F9P with a patch antenna needs open sky [V 17], and Milan's porticoes block everything. Checkpoints are the backbone; PPK is the complement.
7. **The 60-min locked-screen test does not need a 60-min walk.** Continuity can be tested at the desk with `ReplaySource` on every build. Only battery needs real GNSS.
8. **SPIN3 is not a drop-in for London or Dublin,** and its eligibility for individuals is unclear [V 3, 4].

## 13. Open questions

1. **D, the design lead for "now".** 2 m by default? Ask the O&M instructors.
2. **Crossing position:** is it measured to the near edge of the zebra or to its centre line?
3. **SPIN3 eligibility:** ask CSI Piemonte (info.gnss@csi.it) whether two individual developers may register.
4. **Phones already owned:** which ones do Daniele and Leonardo have? It changes the shopping list.
5. **Should the plan adopt the r-calibration criterion** and the severity rule for crossing facts?
6. **Where team logs live:** a private GitHub repo with LFS, or the VPS? And may trimmed team walks become public fixtures?
7. **Compensation** for blind testers and O&M instructors in Milan: rates [U] (L).
8. **Travel:** will the founders walk one London and one Dublin route before the English beta? Irish base-station data [U].
9. **GSDC:** can someone logged into Kaggle read the competition's data rules, to decide whether it can be used at all?

## Sources

1. SPIN3 GNSS, home (stations, status, "gratuito … previa registrazione"). https://www.spingnss.it/
2. SPIN3, I servizi (NTRIP, mountpoints, precision, RINEX 1–60 s, 3-month retention). https://www.spingnss.it/i-servizi/
3. SPIN3, FAQ (free; registration; Italian territory and operator). https://www.spingnss.it/faq/
4. SPIN3, Termini e condizioni (professional users; correction data CC BY 4.0). https://www.spingnss.it/termini-e-condizioni-di-utilizzo/
5. SPIN3, Stazioni permanenti (Milano: Politecnico di Milano, Piazza Leonardo da Vinci 32). https://www.spingnss.it/stazioni/
6. SPIN3, Download RINEX 30s (anonymous). https://www.spingnss.it/download-rinex-30/
7. RTKLIB readme (licence, versions). https://raw.githubusercontent.com/tomojitakasu/RTKLIB/master/readme.txt
8. GitHub repository search API, 27 Sep 2026 (pushed_at, stars, licence): tomojitakasu/RTKLIB, rtklibexplorer/RTKLIB, google/gps-measurement-tools, IPNL-POLYU/UrbanNavDataset, Stanford-NavLab/gnss_lib_py, doronz88/pymobiledevice3, semuconsulting/pyubx2, addy90/map-matching-2, SZU-Rob-IPNP-Lab/Mobile-GVIO-Dataset. https://api.github.com/search/repositories
9. ArduSimple, simpleRTK2B Budget (ZED-F9P), €172. https://www.ardusimple.com/product/simplertk2b/
10. ArduSimple, RTK Portable 2, €299. https://www.ardusimple.com/product/simplertk2blite-bt-case-kit/
11. ArduSimple, Budget Survey Multiband GNSS Antenna, €89. https://www.ardusimple.com/product/survey-gnss-multiband-antenna/
12. ArduSimple, RTK Smart Antenna, €759 (Event input; pole €139 on the same page). https://www.ardusimple.com/product/rtk-smart-antenna/
13. ArduSimple, simpleRTK3B Budget (UM980, L1/L2/L5), €223. https://www.ardusimple.com/product/simplertk3b-budget/
14. ArduSimple, Lightweight Helical Tripleband antenna, €146. https://www.ardusimple.com/product/lightweight-helical-tripleband-l-band-antenna-ip67/
15. ArduSimple, simpleRTK2B Basic Starter Kit (ANN-MB-00), €211. https://www.ardusimple.com/product/simplertk2b-basic-starter-kit-ip65/
16. Emlid store (Reach RX2 $2,399; RS4 $3,899; tax excluded). https://store.emlid.com/
17. Janos, D. & Kuras, P. (2021). Evaluation of Low-Cost GNSS Receiver under Demanding Conditions in RTK Network Mode. Sensors 21, 5552. https://doi.org/10.3390/s21165552
18. google/gps-measurement-tools, README and LOGGING_FORMAT.md. https://raw.githubusercontent.com/google/gps-measurement-tools/master/README.md ; https://raw.githubusercontent.com/google/gps-measurement-tools/master/LOGGING_FORMAT.md
19. Kaggle, Google Smartphone Decimeter Challenge 2023–2024 (page rendered by script; rules not readable). https://www.kaggle.com/competitions/smartphone-decimeter-2023
20. Fu, G. M., Khider, M. & van Diggelen, F. (2020). Android Raw GNSS Measurement Datasets for Precise Positioning. ION GNSS+ 2020. https://doi.org/10.33012/2020.17628
21. gnss_lib_py, Google Decimeter Challenge datasets tutorial. https://gnss-lib-py.readthedocs.io/en/latest/tutorials/parsers/tutorials_google_decimeter_notebook.html
22. UrbanNav README (platforms, ground truth, "License" section). https://raw.githubusercontent.com/IPNL-POLYU/UrbanNavDataset/master/README.md
23. uB-VisioGeoloc, Data in Brief 2024, full text via Europe PMC. https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10865199/fullTextXML
24. Mobile-GVIO dataset, Zenodo record and README. https://zenodo.org/records/20525157 ; https://raw.githubusercontent.com/SZU-Rob-IPNP-Lab/Mobile-GVIO-Dataset/main/README.md
25. The WeAllWalk Data Set, Dryad (CC0). https://doi.org/10.7291/D17P46
26. Ren, P., Elyasi, F. & Manduchi, R. (2021). Smartphone-Based Inertial Odometry for Blind Walkers. Sensors 21, 4033. https://doi.org/10.3390/s21124033
27. Wöltche, A. (2025). Artificial Ground Truth Data Generation for Map Matching with Open Source Software. FOSSGIS 2025, Zenodo. https://zenodo.org/records/14774143
28. addy90/map-matching-2, LICENSE.md (AGPL-3.0). https://raw.githubusercontent.com/addy90/map-matching-2/main/LICENSE.md
29. Guth, D. A. & LaDuke, R. (1995). Veering by Blind Pedestrians: Individual Differences and Their Implications for Instruction. JVIB 89(1). https://doi.org/10.1177/0145482X9508900107
30. Maestro, `travel`. https://docs.maestro.dev/api-reference/commands/travel
31. Maestro, `setLocation`. https://docs.maestro.dev/api-reference/commands/setlocation
32. Apple, Simulating location in tests. https://developer.apple.com/documentation/xcode/simulating-location-in-tests
33. Apple, `XCUIDevice.location` and `XCUILocation`. https://developer.apple.com/documentation/xcuiautomation/xcuidevice/location
34. Stack Overflow answer quoting `simctl location` help (16 Jan 2023), via the Stack Exchange API. https://stackoverflow.com/questions/67310637
35. pymobiledevice3, `simulate_location.py`; PyPI 11.19.4. https://raw.githubusercontent.com/doronz88/pymobiledevice3/master/pymobiledevice3/cli/developer/dvt/simulate_location.py ; https://pypi.org/project/pymobiledevice3/
36. AOSP `LocationShellCommand.java` (GitHub mirror, main). https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/main/services/core/java/com/android/server/location/LocationShellCommand.java
37. Android, Emulator extended controls (location, virtual sensors), updated 20 Apr 2026. https://developer.android.com/studio/run/emulator-extended-controls
38. Android, Emulator console (`geo fix`, `sensor set`), updated 17 Jul 2026. https://developer.android.com/studio/run/emulator-console
39. Android, `UtteranceProgressListener`. https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener
40. Apple, `AVSpeechSynthesizerDelegate`. https://developer.apple.com/documentation/avfaudio/avspeechsynthesizerdelegate
41. Android, `Location` (`getAccuracy` 68%, `getElapsedRealtimeNanos`, `getTime`, `isMock`). https://developer.android.com/reference/android/location/Location
42. Apple, `CLLocation.horizontalAccuracy`. https://developer.apple.com/documentation/corelocation/cllocation/horizontalaccuracy
43. Apple, `mach_continuous_time`. https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time
44. Android, `GnssStatus.getCarrierFrequencyHz`. https://developer.android.com/reference/android/location/GnssStatus
45. Android, `BatteryManager` (`BATTERY_PROPERTY_CHARGE_COUNTER`). https://developer.android.com/reference/android/os/BatteryManager
46. Perfetto, Battery counters and power rails. https://perfetto.dev/docs/data-sources/battery-counters
47. Apple, Measuring your app's power use with Power Profiler. https://developer.apple.com/documentation/xcode/measuring-your-app-s-power-use-with-power-profiler
48. Apple, `UIDevice.batteryLevel`; Apple Developer Forums on 5% steps [P]. https://developer.apple.com/documentation/uikit/uidevice/batterylevel ; https://developer.apple.com/forums/thread/788911
49. Don't kill my app!, Samsung. https://dontkillmyapp.com/samsung
50. Apple Italia, technical specifications: iPhone 17, iPhone 17e, iPhone 18 Pro. https://www.apple.com/it/iphone-17/specs/ ; https://www.apple.com/it/iphone-17e/specs/ ; https://www.apple.com/it/iphone-18-pro/specs/
51. Apple Store Italia, prices. https://www.apple.com/it/shop/buy-iphone/iphone-17 ; https://www.apple.com/it/shop/buy-iphone/iphone-17e ; https://www.apple.com/it/shop/buy-iphone/iphone-18-pro
52. Google Store Italia, Pixel 10a and Pixel 10 specifications and prices. https://store.google.com/it/product/pixel_10a_specs?hl=it ; https://store.google.com/it/product/pixel_10_specs?hl=it
53. GSMArena, Samsung Galaxy A57 [P]. https://www.gsmarena.com/samsung_galaxy_a57_5g-14379.php
54. Back Market Italia, iPhone 15 (search-result snippet, €402 for 128 GB) [P]. https://www.backmarket.it/it-it/p/iphone-15
55. Silverman, A. M., Gwinn, J. D. & Van Boven, L. (2015). Stumbling in Their Shoes. Social Psychological and Personality Science 6(4), 464–471. https://doi.org/10.1177/1948550614559650
56. Silverman, A. M. (2015). The Perils of Playing Blind. Journal of Blindness Innovation and Research 5(2) (copy) [P]. https://www.ericforest.ca/classes/IDB100/Readings/Inclusive%20Methods/The%20Perils%20of%20Playing%20Blind:%20Problems%20with%20Blindness%20Simulation%20and%20a%20Better%20Way%20to%20Teach%20about%20Blin.pdf
57. Sears, A. & Hanson, V. L. (2012). Representing users in accessibility research. ACM TACCESS 4(2). https://doi.org/10.1145/2141943.2141945
58. RNIB, Eyeware. https://www.rnib.org.uk/living-with-sight-loss/assistive-aids-and-technology/eyeware/
59. Comune di Milano Open Data, Database Topografico 2020 SHP (CKAN API; CC BY). https://dati.comune.milano.it/dataset/ds2889_database-topografico-dbt-2020-shp
60. Comune di Milano, DBGT 2020 WMS GetCapabilities. https://gisportal.comune.milano.it/federated/services/DBGT/Milano_2020_DBGT/MapServer/WMSServer?request=GetCapabilities&service=WMS
61. Regione Emilia-Romagna, DBTR "Area di circolazione pedonale" (national class 010102). https://mappegis.regione.emilia-romagna.it/archiviogis/dbtr/metadati/risorse/DBTR_ACP_spec.pdf
62. Ordnance Survey, OS Net RINEX data. https://www.ordnancesurvey.co.uk/products/os-net-rinex
63. npm registry: fast-check 4.10.2 (MIT, 19 Sep 2026). https://registry.npmjs.org/fast-check
64. PyPI: pyubx2 1.3.7 (BSD-3, 24 Sep 2026); gnss-lib-py 1.1.0 (MIT, 15 Sep 2026). https://pypi.org/pypi/pyubx2/json ; https://pypi.org/pypi/gnss-lib-py/json
