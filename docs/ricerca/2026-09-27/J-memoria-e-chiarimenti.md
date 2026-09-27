# J: Trip memory and clarification of compound requests
27 Sep 2026. Tags: [V] verified in a primary source I fetched, [P] secondary source, [U] could not verify. Bracketed numbers refer to the Sources; letters A–H refer to the other reports of this round. This report builds on G §5.4 (memory) and G §5.7 (clarification ladder) and does not repeat them.

## In short

1. **No agent-memory library.** mem0, Letta, Zep/Graphiti and LangMem solve fuzzy recall over long chats with LLM extraction and vector search, mostly on a server. Milo's memory is small, structured, exact, safety-relevant and private. Use a `TripStore` in on-device SQLite (expo-sqlite: FTS5 on by default, optional SQLCipher [V 13]) with five parts: event log, referent register, frame versions, profile, and a rolling summary written by code.
2. **Code answers most recall requests without a model:** "repeat", "I missed that", "the one before", "the second option", "take me home", "undo". The model sees a rebuilt card of about 1k dynamic tokens per turn, never the raw transcript. Evidence: LLMs lose 39% on average when information arrives over several turns. Giving everything in one consolidated turn keeps nearly all the performance, while restating it on top of the growing conversation recovers only part [V 17].
3. **"Repeat the last instruction" must regenerate the instruction, not replay it.** A cue like "in 25 metres" is stale 10 seconds later. The engine must therefore emit structured cues. Today `NavResult.text` is a plain string, and `navigate.ts` suppresses any sentence said in the previous 10 s (`REPEAT_S`) [V repo].
4. **Retention.** Keep everything on the phone. Trip logs auto-delete after 7 days (proposed default). "Forget this trip" deletes a trip immediately. The gateway stores nothing. A trip log is exported only per trip, with the user's opt-in, and exported logs become corpus data.
5. **Compound requests: the founders' "ask the user to break it down" should not be the first response.** Asking users to repeat or rephrase is among the weaker recovery strategies measured: AskRepeat 33.7% (bottom tier), AskRephrase 48.6% (second tier), against 64.4% for moving the task on [V 18]. Humans instead move the task on [V 18] or, when they ask at all, mostly ask targeted questions about the missing part [V 20]. Milo should apply what it understood, read it back, and ask for the one missing or uncertain piece. It should switch to "one thing at a time" only after repeated failure, or when the user chooses it in settings.
6. **Signals exist on every target platform:**
   - per-word confidence: Android 14+ (`RecognitionPart`, 5 levels) [V 31], iOS 26 `SpeechTranscriber` (confidence attributes on the transcript; granularity not documented) [V 32], sherpa-onnx per-token log-probabilities [V 33];
   - n-best alternatives: Android and iOS, but not the sherpa-onnx offline result [V 31–33].

## 1. What Milo must remember, and who answers

| User says | Answered by | Model needed? |
|---|---|---|
| "Repeat", "what did you say?", "I missed that" | Log: last spoken item; if it was an instruction, regenerated at the current position (§4.7) | No |
| "And the one before?" | Log, n-back over instructions | No |
| "You told me to turn left at the pharmacy, I can't find it, help" | Log search on cue landmarks, then the engine: where the user is relative to that step (before, past, off route), then `describe_junction` | Code finds the step and the geometry; the model may phrase the answer |
| "Like I asked earlier, avoid the stairs" | Frame: add `avoid steps`, idempotent ("already avoiding stairs") | Parser only |
| "Go back to the second option you offered" | Register: last list of routes, ordinal 2 | Parser only (grammar if simple) |
| "The café you mentioned ten minutes ago" | Register: category `cafe`, mentioned around t−10 min; one match resolves, two are read back | Parser emits a `mentioned` reference (§4.8) |
| "What did you mean by 'keep right at the fork'?" | Log (cue and facts), then `describe_junction(step)` | Yes, for phrasing |
| "Take me home", "avoid stairs always" | Profile | No / parser |
| "What did you understand?" | Frame v_n read back | No |
| "Forget this trip" | Store delete, with explicit confirmation | No |

## 2. Evidence on recall

- **Blind navigators replay instructions.** NavCog (6 blind participants) had a "Previous Instruction" button that repeats the last message. Participants were "very positive" about it, because they missed instructions "due to ambient noise" or distraction. "Listened for instructions" was one of six coded interruption types [V 16].
- **Soundscape does the same.** It keeps a callout history (a bounded stack, `maxItems` default 10). Outside route guidance, the headset "previous track" button replays the last callout; during route guidance the same button moves to the previous waypoint instead [V 14]. Each history item offers repeat, set a beacon, or more information [P 15]. The code is MIT, but Swift, so Milo reuses the idea only.
- **Rasa** has a `pattern_repeat_bot_messages` repair flow that resends all bot messages since the last user message [V 26].
- **Other reports:**
  - spoken guidance loads working memory more than spatial audio (Klatzky 2006, in A), so replay on demand lowers what the user must memorise;
  - route rehearsal helps (Guerreiro, in A);
  - ChitChatGuide resolved "the second one" wrongly 6 times (E §1). That is why references are resolved by code against a register.
- **LLMs and long dialogues** [V 17]:
  - across 15 LLMs and more than 200,000 simulated conversations, splitting a fully specified task over several turns cut performance by 39% on average. Models "make assumptions in early turns… and do not recover";
  - for GPT-4o-mini the scores were: all in one turn 86.8, concatenated 84.4, spread over turns 50.4, spread plus a final recap 66.5, restated at every turn ("snowball") 61.8 (four of the six tasks);
  - recap and snowball keep the conversation and add restatements; only the single consolidated turn (concatenated) comes close to the original;
  - so Milo should hand the model a consolidated state every turn instead of a growing transcript, not on top of it.

**Implication.** Replay needs a precise, time-stamped record of what was said and why. It does not need semantic search over months of chat. The hard part is the "why", the facts behind each cue, and today the engine does not keep it.

## 3. Agent-memory libraries: verdicts

| | Licence | Version, activity (27 Sep 2026) | Runtime needs | Fit for Milo | Verdict |
|---|---|---|---|---|---|
| **Letta** (ex-MemGPT) | Apache-2.0 [V 2] | `letta-ai/letta` now says the V1 API server is retired to an `archive` branch; source moved to `letta-code` 0.33.2 (25 Sep 2026), 31.8 MB unpacked, depends on node-pty, sharp, ink [V 1,2]; 24.9k stars [V 12] | Terminal/desktop agent or Letta Cloud; memory in git ("MemFS"), "dreaming" [V 2] | Model rewrites its own memory and prompts, the opposite of what safety preferences need | **No.** Borrow "memory blocks": fixed, labelled sections pinned in context |
| **mem0** | Apache-2.0 [V 4] | npm 3.3.1 / PyPI 2.2.1, both 25 Sep 2026; 66.0k stars [V 4,12] | An LLM for extraction (default `gpt-5-mini`) plus a vector store (peer deps include better-sqlite3, Qdrant, pg) [V 4] | April 2026 algorithm is "ADD-only… nothing is overwritten" [V 4]: "avoid stairs" and "stairs are fine today" would both stay. Its LoCoMo 92.5 / LongMemEval 94.4 are for the managed platform "with proprietary optimizations" [V 4], and vendors dispute each other's LoCoMo numbers [P 5] | **No** |
| **Zep / Graphiti** | Graphiti Apache-2.0 [V 6] | graphiti-core 0.30.2 (8 Sep 2026); 31.2k stars; Zep Community Edition deprecated, Zep is cloud only [V 6,7,12] | Python, Neo4j / FalkorDB / Neptune (Kuzu deprecated), an LLM with structured output per episode [V 6] | Right ideas at the wrong weight | **No.** Borrow bi-temporal validity (facts invalidated, not deleted) and provenance to the source episode |
| **LangMem** | MIT [V 8] | 0.0.30, last release 27 Oct 2025 (11 months ago); 1.7k stars [V 8,12] | Python, LangGraph store | "Hot path" vs "background" memory is a useful distinction [V 8] | **No** (stale, Python) |
| **OpenClaw memory** | MIT (G) | see G | Markdown `USER.md`, `MEMORY.md`, daily notes, `DREAMS.md`; the model writes them when asked; SQLite hybrid search; "memory flush" before compaction [V 9] | Free text written by the model is wrong for safety preferences (G) | **No.** Borrow the split between a stable profile and per-trip notes |
| **Pi session files** | MIT [V 10] | Coding agent: JSONL tree (`id`/`parentId`), `custom` entries, `context_edit` (`replacement: null` hides an entry from the model), `compaction` with `firstKeptEntryId` [V 10]. pi-agent-core: `prepareRequest` installs "canonical persisted context" before every request; SQLite backend in a separate Node package (0.87.1) that takes a runtime-specific SQLite factory [V 11] | – | A transcript store, not a memory model | **Use `prepareRequest`** to rebuild context from the `TripStore`. Keep Pi's transcript as a cache. Borrow `context_edit` for "forget that" |
| **Plain event log in SQLite** | expo-sqlite 57.0.3 MIT; op-sqlite 18.2.5 MIT [V 13] | active | expo-sqlite: FTS5 on by default (`enableFTS`), `useSQLCipher`, `withSQLiteVecExtension`, `SQLiteSession` changesets with inversion [V 13] | Exact, offline, deletable, testable in Node | **Yes.** expo-sqlite first; op-sqlite if write speed matters |

**Why not vectors?** Recall in Milo happens over a few hundred events per trip. FTS5 over the spoken text, plus filters on kind, time, category and OSM id, finds "the pharmacy you mentioned" exactly. Embeddings add a model, fuzziness and nothing that is needed. If needed later, sqlite-vec is available (0.1.9, MIT or Apache) [V 13].

## 4. The memory model

### 4.1 Stores

All five parts live in one SQLite file on the phone. Every row carries `trip_id`, so deletion is one statement per table. Writes use WAL mode and happen before speech is queued, so the store survives the OS killing the app.

### 4.2 Trip event log (append-only)

```json
{"seq":57,"t":"2026-09-27T10:14:03.1+02:00","kind":"utterance","via":"asr:android34",
 "text":"add a pharmacy on the way and avoid stairs",
 "words":[["add","h"],["a","h"],["pharmacy","l"],["on","h"],["the","h"],["way","h"],["and","h"],["avoid","m"],["stairs","h"]],
 "alts":["add a bakery on the way and avoid stairs"],
 "pos":{"lat":45.4521,"lon":9.2003,"acc_m":8},"mode":"guiding","frame_v":6,"step":5}

{"seq":58,"kind":"parse","of":57,"layer":"llm","model":"<id>","ms":920,
 "commands":[{"cmd":"edit","op":"add","field":"stops","value":{"place":{"kind":"category","category":"pharmacy"},"where":"along_route"},"anchors":[2]},
             {"cmd":"edit","op":"add","field":"avoid","value":{"kind":"steps"},"anchors":[7,8]}],
 "status":["unsure","ok"]}

{"seq":61,"kind":"say","cls":"instruction","id":"i23","plan_v":6,"step":5,
 "text":"In 25 metres, turn left onto via Ripamonti, just after the pharmacy.",
 "cue":{"maneuver":"turn","dir":"left","rel_deg":-84,"onto":"way/123","landmarks":["p12"],"at_m":1840},
 "facts":[{"type":"distance_to_maneuver","value":25,"unit":"m","source":"computed","evidence":["way/123"]}],
 "pos":{"lat":45.4519,"lon":9.2001,"acc_m":9},"heard":"full"}
```

- **Kinds:**
  - `utterance`, `parse`, `say` (classes: `instruction`, `warning`, `readback`, `answer`, `question`), and `event` (off route, stop reached, GPS degraded, crossing entered);
  - `breadcrumb`, one point every ~10 m, needed for "take me back the way I came";
  - `delete`, a tombstone.
- **`facts`** reuse `contracts/fact.schema.json`: every spoken number is a fact with evidence [V repo]. The example above is shortened: the schema also requires `inputs`, `data_date` and `completeness`.
- **`heard`** is one of `full`, `cut` (barge-in) or `preempted`. G §5.8 already repeats cut instructions.
- **Size:** my estimate is a few hundred rows and well under 1 MB for a one-hour walk.

### 4.3 Referent register

```json
{"places":[{"id":"p12","label":"Farmacia San Luigi","category":"pharmacy","osm":"node/987654",
            "said_as":["the pharmacy"],"roles":["landmark:i23","stop_candidate:L3#1"],"first":57,"last":61}],
 "lists":[{"id":"L2","of":"routes","items":["A","B"],"read_at":22},
          {"id":"L3","of":"stop_candidates","for_stop":"s1","items":["p12","p13"],"read_at":59}],
 "last_list":"L3","last_place":"p12","pending":[{"slot":"stops.s1.category","asked_at":null,"tries":0}]}
```

- **What enters the register:** every place Milo names, in read-backs, answers, lists, or instructions (landmarks), plus every place the user names that resolves.
- **`pending`** holds the clarification queue (§5.4). It survives a crossing: the question is asked later.

### 4.4 Versioned trip frame

```json
{"v":7,"parent":6,"cause":58,"request":"r4","trip":{"destination":{"kind":"name","text":"Duomo"},
  "stops":[{"id":"s1","place":{"kind":"ref","ref":"resolved","id":"p12"},"where":"along_route"}],
  "avoid":[{"kind":"steps","strength":"require"}],"modes":{"transit":"none"},"time":{"kind":"now"}},
 "plan":"plan_v7","active_from_seq":64}
```

- The trip shape is E's `Trip`.
- **Undo** returns to `parent`.
- **"Go back to what I asked first"** goes to the version created by request `r1`.
- `active_from_seq` records when guidance actually switched plans at a safe point (G §5.6).

### 4.5 Long-term profile

```json
{"v":12,
 "prefs":[{"key":"avoid.steps","value":"require","scope":"always","valid_from":"2026-09-20","valid_to":null,
           "source":"t_20260920#r2","confirmed":true}],
 "speech":{"verbosity":"short","rate":1.8,"clarify":"targeted","repeat_button":"previous_track"},
 "places":[{"id":"home","name":"home","lat":45.4400,"lon":9.2000,
            "entrance":{"lat":45.4401,"lon":9.2002,"note":"gate on the left, bell 4"}}],
 "routes":[{"id":"R1","name":"home to the office","from":"home","to":"office","trip":{"avoid":[{"kind":"steps"}]},
            "city_pack":"milano@2026-09-20","path_hash":"sha1:…","walked":7}],
 "stride":{"m":0.57,"n_steps":4200,"method":"gps_pedometer"}}
```

**Rules:**
1. Preferences said mid-trip default to `scope: trip`. They become `always` only with explicit words ("always", "from now on").
2. Relaxing a safety preference "always" needs explicit confirmation (E, G).
3. A superseded preference gets a `valid_to` date instead of being deleted, following Graphiti's validity windows [V 6]. "Why are you avoiding stairs?" can then cite when and where the user set it.
4. The model never writes the profile directly. It calls `profile` (G), and code writes the profile.
5. A saved route stores the frame plus the city-pack version. It is re-planned when the map changes.

### 4.6 Rolling summary (written by code, not by the LLM)

Each resolved request becomes one line, written from a template:

```text
r3 10:02 new trip: Duomo on foot, avoiding steps (v3). r4 10:14 added stop s1 Farmacia San Luigi, +3 min (v7).
r5 10:16 asked when s1 closes: 19:30 from map hours.
```

- The newest 8 lines are kept verbatim.
- Older lines merge per topic into a single line ("earlier: 2 route changes, 1 stop removed").
- The cap is about 200 tokens.
- An LLM-written summary is allowed only for chat content that never affects routing (for example a web answer about a museum), and it is marked as unverified.

### 4.7 "Repeat" is regenerated, not replayed

- **"Repeat", "I missed that":** take the last `say` event.
  - If it is an instruction whose step is still ahead, ask the engine for the cue of that step at the current position: "In 5 metres, turn left onto via Ripamonti, just after the pharmacy."
  - If the step has passed: "You passed that turn 10 metres ago. Turn around and…". This comes from the engine's off-route and back logic.
  - Other items (answers, read-backs) are replayed verbatim.
- **Bypass the 10-second duplicate filter** (`REPEAT_S`) for user-requested repeats [V repo].
- **Earlier instructions:** "the one before" walks back through the log (n-back).
- **The headset button:** mapping "previous track" to repeat saves a voice turn. Soundscape does this only outside route guidance; while guiding a route it uses previous/next track to step between waypoints [V 14], so its precedent for "repeat during guidance" is weaker than it looks. It also conflicts with push-to-talk if that uses the headset, so it is an open question (§8).

### 4.8 What the LLM sees each turn

This refines the dynamic blocks of G §5.3. The token counts are targets to measure.

| Block | Content | Tokens |
|---|---|---|
| Profile card | Active `always` preferences; saved place names only (no coordinates); verbosity | ≤ 80 |
| Frame card | Frame v_n in compact JSON; pending confirmation, if any | ≤ 150 |
| Referents | ≤ 8 places (id, label, category, age such as "4 min ago", role); the last list with ordinals | ≤ 200 |
| Recent guidance | Last 3 `say` events of class instruction (id, age, text, heard flag) | ≤ 120 |
| Rolling summary | §4.6 | ≤ 200 |
| Clarification queue | Open slots and what was already asked | ≤ 60 |
| Dialogue tail | Last 2–3 exchanges verbatim | ≤ 250 |
| User turn | Best transcript with low-confidence words marked (`[pharmacy?]`), plus ≤ 2 alternatives | ≤ 80 |

- **Total:** about 1.1k dynamic tokens on top of the cached prefix (G).
- **Rebuilt, not accumulated:** `prepareRequest` rebuilds these blocks every turn [V 11]. The transcript never grows. This follows Laban's concatenated result (84.4 against 86.8), not the recap or snowball ones, which restate on top of the transcript and recover only part [V 17]; that is also why the verbatim dialogue tail stays at 2–3 exchanges.
- **No coordinates:** the model gets street names and distance bands, never latitude and longitude. It does not need them, and they are the most sensitive data.
- **Phone model:** it gets only the frame card, the last list and the user turn.

**Schema additions to E's union:**
- `Place.ref` gains `"mentioned"`, with optional `category`, `text` and `ago_min`. Code matches it against the register within a time window (±50% of `ago_min`, at least ±3 min).
- `Place.ref` gains `"list_item"`, with `list` ∈ {routes, places, stops} and `ordinal`.
- A new command, `{"cmd":"revert","to":"original"|"request","request":"r1"}`.
- G's `recall` tool keeps its arguments. It returns at most 3 log entries with their facts.

### 4.9 Storage, retention, deletion

| Data | Where | Kept | Deleted by |
|---|---|---|---|
| Trip log, register, frames, breadcrumbs | Phone (SQLite, SQLCipher optional) | Trip + 7 days (proposed default; the user chooses 0, 7 or 30) | "Forget this trip" (explicit yes), expiry, "forget everything" |
| Profile, saved places and routes | Phone | Until changed | "Forget home", "forget my preferences" |
| Agent transcript (Pi context) | Phone | Current trip | Trip end (it is rebuilt from the store anyway) |
| Gateway (VPS) | – | Nothing; counters only (G) | – |
| Live share for a sighted helper | Relay | Only while sharing, with a TTL | Stop sharing |
| Research export | Phone → team | Per trip, opt-in | User |

- **Precedent:** in December 2023 Google announced moving Maps Timeline onto the device and cutting the default auto-delete, for users who first turn on Location History, from 18 to 3 months, with end-to-end encrypted backup [V 34]. Milo's logs hold inferred disability data (F §6), so a shorter default is justified.
- **Deletion:** use `PRAGMA secure_delete` plus a VACUUM after a delete. A server backup of the profile only makes sense later, end-to-end encrypted.
- **Exported logs are the best corpus source** (plan A1): real utterances with ASR alternatives, parses and corrections, labelled in context.

## 5. Clarifying compound requests

### 5.1 Evidence

| Source | Setting | Finding |
|---|---|---|
| Bohus & Rudnicky 2005 [V 18] | 46 users, 449 sessions, 8,278 turns; word error rate 25.6% | Non-understanding recovery rate by strategy: MoveOn 64.4%, FullHelp 58.5%, TerseYouCanSay 56.5%, Reprompt 49.2%, YouCanSay 48.6%, AskRephrase 48.6%, DetailedReprompt 37.7%, Notify 35.7%, AskRepeat 33.7%, Yield 31.2%. Recovery mattered most below 60–70%. Non-native speakers: about a quarter of turns not understood, 39.3% recovery |
| Skantze 2005 [P 19; V as described in 18, which cites the 2003 workshop version] | Human wizards receiving corrupted recognition | Wizards often did not signal non-understanding. They asked task-related questions, which "generally led to a speedier recovery" |
| Stoyanchev et al. 2013 [V 20] | 925 ASR transcripts, each with one misrecognised segment shown as "XXX" to crowd annotators (text, not live speech) | Annotators chose to ask in 38.3% of single-word and 47.9% of multi-word errors. Of those questions, 76.1% and 62.3% were targeted ("Some?" for "some [toast]") |
| Myers et al. 2018 [P 21] | Voice calendar | After failures users hyperarticulate, simplify (dropping content words), or try new wordings |
| Ashktorab et al. 2019 [V 22] | 203 crowd workers, 8 repair strategies, text chatbot scenarios | "Providing options and explanations were generally favored" |
| Beneteau et al. 2019 [V 23] | 10 families, 59 breakdowns with Alexa | The repair burden falls on users; assistants should collaborate in repair |
| Google conversation design [V 24] | Guidance (Actions deprecated in 2023, page kept) | Rapid reprompt, then "escalating detail" with options or examples; end after 2 no-match attempts |
| Alexa dialog management [V 25] | Guidance | Fills the slots given and asks only for missing required ones, in a set order; "use confirmations sparingly" |
| Rasa CALM [V 26] | Product | Several `StartFlow` commands, when no flow is active, start sequentially by default; clarification is opt-in (`CLARIFY_ON_MULTIPLE_START_FLOWS`), showing 3 options by default (configurable via the `max_clarification_options` slot) |
| Kim et al. 2021 [V 27] | Alexa-scale language understanding | Asking for every ambiguity "could lead to asking too many questions"; a learned model decides when to ask |
| CLAMBER 2024 [V 28], RegretBench 2026 [V 29] | LLM benchmarks | LLMs identify ambiguity poorly. Over-asking and under-asking are separate failures that final accuracy hides |
| Peng et al. 2026 [V 30] | Cascaded ASR + LLM (Parakeet-TDT backbone) | Token-level error detectors built on the ASR model's internal representations enable targeted clarification: recall on domain-shift errors 57.96% vs 23.66% (SPGI test set), up to 31% lower WER (the arXiv listing abstract says 30%; the paper body says 31.0%). The detectors read ASR latent representations, which sherpa-onnx's `OfflineRecognitionResult` does not include |
| Blind users (E §1) | – | Short speaking windows and a demand for efficiency. ChitChatGuide took 99 s to plan by voice against 26 s with buttons |

**An illustration (my arithmetic, not a measurement).** If each content word is misrecognised with probability 0.1, an 8-content-word request comes through perfectly only 0.9^8 ≈ 43% of the time. Repeating the whole sentence has the same odds. Keeping the correct 7 words and asking about 1 does not.

### 5.2 Verdict on the initial proposal

Asking the user to split the request is an AskRephrase / YouCanSay strategy, which is middle tier [V 18]. As a first response it has three costs:
- it throws away what was understood;
- it adds turns for users who need efficiency;
- it moves the integration across turns onto the model, where LLMs are weakest [V 17].

It works well as the third rung of the ladder, as a user setting, and in heavy noise, where short answers suit a constrained grammar (E §4). The recommended default:
- keep what was understood;
- read it back;
- ask one targeted question, offering choices when there are two candidates;
- move on after two failures.

### 5.3 Signals

| Recognizer | Per-word confidence | n-best |
|---|---|---|
| Android `SpeechRecognizer` | API 34+: `RECOGNITION_PARTS` with `EXTRA_REQUEST_WORD_CONFIDENCE`, 5 levels plus unknown [V 31] | `RESULTS_RECOGNITION` with `CONFIDENCE_SCORES` (0–1, or −1 when unavailable) since API 14; span-level `RESULTS_ALTERNATIVES` since API 34 [V 31]. The docs say these arrays "should" be filled, and `CONFIDENCE_SCORES` "is optional and might not be provided"; whether the on-device recognizer fills them is [U] |
| iOS 26 `SpeechTranscriber` | `transcriptionConfidence` attribute on the attributed-string transcript; whether it is per word is not documented [V 32] | `alternatives`, "in descending order of likelihood" [V 32] |
| sherpa-onnx 1.13.8 (Parakeet, E) | `ys_log_probs` per token [V 33] | No: the offline result has one `text` [V 33] |

**Normalising confidence.** Every recognizer maps to `h` / `m` / `l` / `u` per word. Thresholds are calibrated on the outdoor part of the corpus. If per-word confidence is unknown, a word counts as `l` when it differs among the top 3 alternatives.

**Anchors.** Code aligns each parsed command to its anchor words:
- place text;
- category and avoid-lexicon words;
- numbers;
- negations within the clause.

A command's confidence is the minimum over its anchors. Words that are neither anchors nor function words are unparsed.

### 5.4 Policy

1. **Classify each command:**
   - `ok`: resolved, all anchors `h`;
   - `unsure`: an anchor is `m` or `l`, the n-best alternatives disagree on it, or the place match has a close runner-up;
   - `missing`: a required value is absent ("stop at the… on the way");
   - `unparsed`: leftover content words.
2. **Apply `ok` commands** with implicit confirmation, except those that need explicit confirmation under E/M3: starting guidance, relaxing a safety constraint, switching on transit.
3. **Safety asymmetry.** An `unsure` command that would relax safety, or whose negation is uncertain ("avoid" or "don't avoid"), is never applied. The safer value stays, and Milo asks.
4. **Read back** the applied part in one sentence. This is the grounding act (E).
5. **Ask one targeted question** for the highest-priority open item. Priority: safety constraints, destination, stops, transit, time. Reuse the understood words (a reprise). Offer two choices when the n-best gives two valid values. Put the other open items in the `pending` queue.
6. **After two questions in a row,** summarise and ask "anything else, or shall we go?". This avoids an interrogation.
7. **Two failures on the same slot:** offer spelling, a nearby landmark, a saved place, or typing. Or move on without the item ("I'll leave the stop out; say 'add a stop' any time"). This is MoveOn [V 18] with Google's two-attempt limit [V 24].
8. **"One thing at a time"** is used only when:
   - (a) nothing was applied from a long utterance, twice in a row;
   - (b) the user chose `clarify: one_at_a_time` in the profile; or
   - (c) VAD reports heavy noise while the user is stationary.

   Even then Milo asks the first question at once ("Let's go one step at a time. Where to?"). Every answer is still parsed as a full utterance (G).
9. **Never ask at a crossing or close to a manoeuvre.** The queue waits, and Milo asks again later with context ("About the stop you mentioned: what kind of place?").

### 5.5 Example dialogues (place names and numbers invented)

```text
1  Partial, n-best choice
U: Take me to the Duomo, stopping at a [pharmacy?|bakery?] on the way, and avoid the stairs.
M: Duomo on foot, avoiding stairs. A stop on the way: pharmacy or bakery?
U: Pharmacy.
M: Farmacia San Luigi on corso di Porta Romana, 3 minutes more. Shall we go?

2  Unparsed clause, reprise
U: Go to corso Lodi 12 and ... mumble ... tram.
M: To corso Lodi 12. You mentioned the tram: should I use it or leave it out?

3  Uncertain negation on a safety constraint
U: [Don't?] avoid the stairs this time.
M: I'm still avoiding stairs. Do you want routes with stairs this time? Say yes or no.

4  Mid-trip, at a crossing
U: Add a cash machine and ... [inaudible] ...
M: (waits until the crossing is done) Adding a cash machine on the way. You said something else: what was it?

5  Two failures on a street name
U: Via [Arcivesco Calabria?]  M: Via what, please?  U: [Arcive Scovo?]
M: I'm not getting the street. You can spell it, name a place nearby, or say "skip".

6  Nothing usable twice, noisy
U: (12 words, all low confidence)  M: Sorry, it's noisy. Where do you want to go?
U: (again nothing)  M: Let's go one thing at a time. Just the destination, please.

7  Memory
U: Like I asked earlier, avoid the stairs.   M: Stairs are already avoided on this route.
U: What about the café you mentioned ten minutes ago?
M: Bar Crocetta, on your left about 200 metres back. Add it as a stop?
```

### 5.6 What to measure

Add about 60 recall turns and about 60 compound turns to the corpus (plan A1 / G S1), with simulated recognition errors: one word per clause dropped or swapped, drawn from real n-best confusions. Score:
- the share of correct commands applied;
- turns to a complete frame;
- wrong applications on safety fields, which must be zero;
- how often Milo asks when nothing was wrong (over-asking).

Compare against the founders' "split it" policy as a baseline. Then test the default clarification style and the meaning of "repeat" with blind users in Milan.

## 6. Corrections to initial assumptions

- **"Ask to break the request into single questions"** is supported as a fallback, not as the default (§5.2).
- **"Borrow the memory from Pi or OpenClaw".** Pi persists an agent transcript. OpenClaw writes Markdown notes produced by the model. Neither is a trip memory. Milo's memory is its own `TripStore`, which Pi's `prepareRequest` reads.
- **"Persistent memory" suggests a memory framework.** The frameworks target long chat recall, the thing their LoCoMo and LongMemEval scores measure. That is not Milo's problem, and they add an LLM, a server and nondeterminism.
- **"Help with an instruction given earlier" is not only memory.** It needs the engine to keep structured cues and their facts, which requires a change to `navigate.ts`.
- **Having a server does not mean memory should live there.** Trip memory is the most sensitive data Milo holds, and every lookup it serves is local.

## 7. Work items

| Id | Work | Depends on | Effort (my estimate) |
|---|---|---|---|
| J1 | `navigate.ts` emits `cues[]` (step, manoeuvre, `onto` OSM id, landmark ids, facts) and can regenerate the cue for a step at a given position | – | 3–4 days |
| J2 | `TripStore` schema: log, register, frames, profile; FTS5; Node tests (part of G S2) | – | 4–5 days |
| J3 | Fast-path resolvers: repeat, n-back, lists, `mentioned`, saved places, revert, "what did you understand" | J1, J2 | 3 days |
| J4 | Recognizer adapter: per-word confidence and n-best normalised; Android 14+ spike on Pixel and Samsung | – (part of G S5) | 3–4 days |
| J5 | Anchor alignment, command classification, clarification queue, English templates | J2; J4 can be stubbed | 4–5 days |
| J6 | Context builder with budgets through `prepareRequest` | J2, G S4 | 2 days |
| J7 | Retention, "forget" commands, opt-in export | J2 | 2–3 days |
| J8 | Corpus items (§5.6) | – | 3 days |
| J9 | Field test of clarification style and repeat semantics | J3, J5, G S6 | – |

- **In parallel now:** J1, J2, J4, J8.
- **Then in series:** J3 and J5, then J6 and J7, then J9.
- **Split between the two developers, following G:**
  - phone and audio: J4, J7;
  - dialogue and evaluation: J2, J3, J5, J6, J8;
  - the engine owner: J1.

## 8. Open questions

1. **Retention default:** 7 days? Do blind testers want a trip history ("take me back the way I came yesterday")?
2. **What "repeat" means:** the last instruction only, or the last thing said? Should the headset "previous track" button repeat, if push-to-talk also uses the headset? (Soundscape uses it for "previous waypoint" while guiding, and for repeat only otherwise.)
3. **Android confidence:** does the Android on-device recognizer actually fill `RECOGNITION_PARTS` confidence and `RESULTS_ALTERNATIVES`?
4. **Default clarification style:** targeted, or one at a time? Should it adapt per user after repeated failures?
5. **Sighted helper view:** should it show the recent instruction history, and for how long after sharing stops?
6. **Consent for research export:** what wording, and is it valid for data about disability (F §6)?
7. **English-first in Milan:** Italian street names will be the most frequent uncertain spans. Is spelling acceptable to users, or is choosing from the nearest matching streets enough?

## Sources

1. letta-ai/letta README (fetched 27 Sep 2026). https://raw.githubusercontent.com/letta-ai/letta/main/README.md
2. letta-ai/letta-code README and LICENSE; npm @letta-ai/letta-code 0.33.2. https://raw.githubusercontent.com/letta-ai/letta-code/main/README.md, https://registry.npmjs.org/@letta-ai/letta-code
3. Packer et al. MemGPT. 2023 (cited via [2]). https://arxiv.org/abs/2310.08560
4. mem0 README; npm mem0ai 3.3.1; PyPI mem0ai 2.2.1. https://raw.githubusercontent.com/mem0ai/mem0/main/README.md, https://registry.npmjs.org/mem0ai, https://pypi.org/pypi/mem0ai/json
5. Zep, "Is Mem0 really SOTA in agent memory?"; getzep/zep-papers issue 5. https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/, https://github.com/getzep/zep-papers/issues/5
6. Graphiti README; PyPI graphiti-core 0.30.2. https://raw.githubusercontent.com/getzep/graphiti/main/README.md, https://pypi.org/pypi/graphiti-core/json
7. getzep/zep README (Community Edition deprecated). https://raw.githubusercontent.com/getzep/zep/main/README.md
8. LangMem README; PyPI langmem 0.0.30. https://raw.githubusercontent.com/langchain-ai/langmem/main/README.md, https://pypi.org/pypi/langmem/json
9. OpenClaw docs, Memory. https://docs.openclaw.ai/concepts/memory
10. Pi coding agent, session file format. https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/session-format.md
11. pi-agent-core README; npm @earendil-works/pi-session-backend-sqlite-node 0.87.1. https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/README.md, https://registry.npmjs.org/@earendil-works/pi-session-backend-sqlite-node
12. GitHub repository search (stars, 27 Sep 2026): mem0ai/mem0, getzep/graphiti, letta-ai/letta, getzep/zep, langchain-ai/langmem. https://github.com/mem0ai/mem0
13. Expo SQLite docs (SDK 57); npm expo-sqlite 57.0.3, @op-engineering/op-sqlite 18.2.5, sqlite-vec 0.1.9. https://docs.expo.dev/versions/latest/sdk/sqlite/, https://registry.npmjs.org/expo-sqlite
14. microsoft/soundscape: CalloutHistory.swift, HomeViewController+RemoteControl.swift, LICENSE.txt (MIT). https://github.com/microsoft/soundscape/blob/main/apps/ios/GuideDogs/Code/Command%20Processor/CalloutHistory.swift
15. Preece. Microsoft Soundscape adds a new dimension to accessible wayfinding. AccessWorld, Aug 2018. https://afb.org/aw/19/8/15067
16. Ahmetovic et al. NavCog: a navigational cognitive assistant for the blind. MobileHCI 2016. https://www.cs.cmu.edu/~kkitani/pdf/AGKITA-MHCI16.pdf
17. Laban, Hayashi, Zhou, Neville. LLMs get lost in multi-turn conversation. 2025. https://arxiv.org/abs/2505.06120
18. Bohus, Rudnicky. Sorry, I didn't catch that! Non-understanding errors and recovery strategies. SIGdial 2005. https://aclanthology.org/2005.sigdial-1.14/
19. Skantze. Exploring human error recovery strategies. Speech Communication 45(3), 2005. https://doi.org/10.1016/j.specom.2004.11.005
20. Stoyanchev, Liu, Hirschberg. Modelling human clarification strategies. SIGDIAL 2013. https://aclanthology.org/W13-4021/
21. Myers et al. Patterns for how users overcome obstacles in voice user interfaces. CHI 2018. https://doi.org/10.1145/3173574.3173580
22. Ashktorab et al. Resilient chatbots: repair strategy preferences. CHI 2019. https://doi.org/10.1145/3290605.3300484
23. Beneteau et al. Communication breakdowns between families and Alexa. CHI 2019. https://doi.org/10.1145/3290605.3300473
24. Google. Conversation design: errors (updated 18 Sep 2024). https://developers.google.com/assistant/conversation-design/errors
25. Amazon. Alexa dialog management (updated 9 Oct 2025). https://developer.amazon.com/en-US/docs/alexa/custom-skills/define-the-dialog-to-collect-and-confirm-required-information.html
26. Rasa. Patterns (clarification, repeat bot messages, CLARIFY_ON_MULTIPLE_START_FLOWS). https://rasa.com/docs/reference/primitives/patterns/
27. Kim et al. Deciding whether to ask clarifying questions in large-scale spoken language understanding. ASRU 2021. https://arxiv.org/abs/2109.12451
28. CLAMBER. ACL 2024. https://aclanthology.org/2024.acl-long.578/
29. Ta et al. One more turn, less regret (RegretBench). 2026. https://arxiv.org/abs/2607.21143
30. Peng et al. Proactive for uncertainty: cause-aware error diagnosis and interactive clarification. 2026. https://arxiv.org/abs/2605.25404
31. Android RecognitionPart and SpeechRecognizer reference. https://developer.android.com/reference/android/speech/RecognitionPart, https://developer.android.com/reference/android/speech/SpeechRecognizer
32. Apple SpeechTranscriber.ResultAttributeOption and Result. https://developer.apple.com/documentation/speech/speechtranscriber/resultattributeoption, https://developer.apple.com/documentation/speech/speechtranscriber/result
33. sherpa-onnx `offline-stream.h` (OfflineRecognitionResult); npm sherpa-onnx 1.13.8. https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/csrc/offline-stream.h
34. Google. Updates to Location History and new controls in Maps, 12 Dec 2023. https://blog.google/products/maps/updates-to-location-history-and-new-controls-coming-soon-to-maps/

## Verification (27 Sep 2026)

An adversarial check re-fetched the primary sources (raw GitHub READMEs and code, the npm and PyPI registries, GitHub repository search, the Android and Apple reference pages, and the paper PDFs or HTML) for 34 claims.

**Confirmed as written:**
- Letta README (V1 API server retired to `archive`; source in `letta-code`); `@letta-ai/letta-code` 0.33.2, 25 Sep 2026, Apache-2.0, 31,780,584 bytes unpacked, depends on node-pty, sharp and ink; MemFS and "dreaming" in its README.
- mem0: npm 3.3.1 and PyPI 2.2.1 (both 25 Sep 2026), Apache-2.0, "ADD-only extraction … nothing is overwritten", LoCoMo 92.5 / LongMemEval 94.4 on the managed platform "with proprietary optimizations", default `gpt-5-mini`, the peer dependencies listed; Zep's blog disputing mem0's LoCoMo numbers.
- graphiti-core 0.30.2 (8 Sep 2026, Apache-2.0), Neo4j 5.26 / FalkorDB / Neptune with Kuzu deprecated, facts "invalidated — not deleted"; Zep Community Edition "no longer supported".
- LangMem 0.0.30, 27 Oct 2025, MIT, "hot path" vs "background".
- Stars: mem0 66,057; Graphiti 31,198; Letta 24,904; LangMem 1,684.
- expo-sqlite 57.0.3 (MIT) with `enableFTS` default true, `useSQLCipher`, `withSQLiteVecExtension`, `SQLiteSession` changesets with invert; op-sqlite 18.2.5 MIT; sqlite-vec 0.1.9 "MIT OR Apache"; OpenClaw npm MIT.
- Pi session format (JSONL tree, version 3, `context_edit` with `replacement: null`, `compaction` with `firstKeptEntryId`), `prepareRequest` "canonical persisted context", separate SQLite backend package 0.87.1 (MIT) with a runtime-specific SQLite factory.
- OpenClaw memory files, SQLite hybrid search and memory flush.
- Soundscape `CalloutHistory(maxItems: UInt = 10)` over a `BoundedStack`; MIT licence; AccessWorld's description of history item actions.
- NavCog: 6 participants, "Previous Instruction" button, "very positive", "ambient noise", "Listened for instructions".
- Bohus & Rudnicky 2005: all ten recovery rates, 46 users, 449 sessions, 8,278 turns, WER 25.6%, the 60–70% threshold, and 26.3% non-understandings with 39.3% recovery for non-native speakers.
- Stoyanchev et al. 2013: 925 utterances, 38.3% / 47.9% asked, 76.1% / 62.3% targeted.
- Laban et al.: 39% average drop, 15 LLMs, 200,000+ conversations, GPT-4o-mini 86.8 / 84.4 / 50.4 / 66.5 / 61.8.
- Android: `RecognitionPart` API 34 with five levels plus unknown; `EXTRA_REQUEST_WORD_CONFIDENCE` API 34; `CONFIDENCE_SCORES` API 14; `RESULTS_ALTERNATIVES` API 34.
- Apple: `transcriptionConfidence` and `alternatives` "in descending order of likelihood" (iOS 26).
- sherpa-onnx `OfflineRecognitionResult` with a single `text` and per-token `ys_log_probs`; npm 1.13.8 Apache-2.0.
- Rasa `pattern_repeat_bot_messages` and `CLARIFY_ON_MULTIPLE_START_FLOWS`; Google's two-attempt limit (page updated 18 Sep 2024, Actions deprecated 13 Jun 2023); Alexa "use confirmations sparingly" (updated 9 Oct 2025).
- Kim et al. 2021, CLAMBER 2024 and RegretBench 2026 (Ta et al., arXiv 2607.21143) abstracts; Ashktorab (N=203) and Beneteau (10 families, 59 breakdowns) abstracts.
- Google Maps Timeline: 18 → 3 months, end-to-end encrypted backup.
- Repo: `REPEAT_S = 10` and `NavResult.text: string | null` in `packages/engine/src/navigate.ts`; `contracts/fact.schema.json`.

**Corrected:**
- In short §5: "the weakest recovery strategy" was wrong. AskRepeat is in the bottom tier, but Yield (31.2%) is lowest, and AskRephrase is in the second tier. The wording on human behaviour now separates moving on [18] from targeted questions [20].
- Soundscape: "previous track" replays the last callout only outside route guidance; during route guidance it goes to the previous waypoint. §4.7 and open question 2 now say so, because the precedent for "repeat during guidance" is weaker. The cross-reference to the open questions was also fixed from §7 to §8.
- Laban: the design rests on the concatenated result (84.4), not the recap one. Recap and snowball restate on top of the transcript and recover only part. The recommendation is unchanged but now says why the dialogue tail stays short. Snowball (61.8) was added, and the note that this table covers four of the six tasks.
- Rasa: 3 clarification options is a default (the `max_clarification_options` slot), not a hard maximum, and sequential start applies when no flow is active.
- Peng et al.: the arXiv listing's abstract says "up to a 30% reduction in WER", the paper body says 31.0% (SPGI). Both are noted. The detectors use ASR latent representations, which the sherpa-onnx result does not include.
- Google Maps: an announcement (Dec 2023), and the 3-month default applies when Location History is first turned on.
- iOS: `transcriptionConfidence` is documented only as "confidence attributes in a transcription's attributed string"; per-word granularity is not stated.
- Android: `CONFIDENCE_SCORES` "is optional and might not be provided" was added to the [U] note.
- Stoyanchev: the annotators saw text transcripts with the error replaced by "XXX", not live speech. Ashktorab: text chatbot scenarios.
- Skantze: Bohus cites the 2003 workshop version, not the 2005 journal paper.
- §4.2: the `facts` example omits fields the schema requires (`inputs`, `data_date`, `completeness`).

**Not re-checked:** Myers et al. 2018 (abstract not available; stays [P]); the cross-references to reports A, E, F and G beyond checking that the E figures (99 s vs 26 s, "the second one" 6 times) appear in E.
