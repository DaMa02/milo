# Milo's conversational interface: evidence and a recommended design

27 September 2026. Bracketed numbers refer to the sources. Names follow Milo's code (`commands.ts`, `interpret.ts`, `plan.schema.json`).

## 1. Blind users and voice interfaces

Abdolrahmani, Kuber and Branham interviewed 14 blind users of mainstream assistants; their problems concerned input, the responses, and control over what was read out [1]. Commands were misheard in noisy places, unusual names could not be corrected, the time allowed for speaking was too short, and answers were padded or too thin [1, 4]. The authors call blind screen-reader users power users who tune verbosity and rate per task, and note that a voice error costs them more because they have no visual fallback [2]. Pradhan, Mehta and Findlater found wide uptake among people with disabilities, with precise speaking time as a main barrier [3, 5]. Branham and Roy showed that five vendors' guidelines model the assistant on human conversation, with short turns and human pacing, which underestimates blind listeners [6, 4]. Blind listeners handle faster speech [7], and a 20-day home study concluded that rate must be a user setting [8].

Recent LLM systems show what breaks. ChitChatGuide (GPT-4 on a mall navigation system, 11 visually impaired participants) handled vague, contextual requests and made exploration more enjoyable [9], but its log is sobering: 14 of 143 planning answers failed on speech recognition; 6 resolved "the second one" to the wrong item and users caught only 5; 3 invented items or tours; only 16.7% of requests for shorter descriptions were honoured; and planning took 99 s against 26 s with buttons. WanderGuide found three preferred levels of detail [10]. "Say It My Way" (CHI 2026) logged answers over ten times longer than the questions and recommends persistent verbosity controls and a hurry mode [11]. SceneScout's descriptions were 72% accurate, with subtle errors hard to catch without sight [12]. TIMELI found that multimodal models speak at bad moments, including during street crossings [13].

## 2. Architecture patterns

**Dialogue state.** A frame whose slots are filled and revised over turns is still the right backbone. Models fill frames well from schema descriptions [14] and track state better when slots are function arguments (FnCTOD: GPT-4 gained 14 points of joint goal accuracy) [15]. Multi-intent utterances have their own benchmarks, MixATIS and MixSNIPS [16]. Rasa CALM, the closest production pattern, has the LLM emit a short list of commands (start flow, set slot, cancel, clarify) that deterministic flows execute [17].

**Many tool calls or one frame?** Parallel tool calls push orchestration into the model: geocode the Duomo, search pharmacies along a route that does not exist yet, then route. Small models fail there. On BFCL V4, Qwen3-4B-Instruct-2507 scores 87.9% on single-turn calls but 22.1% multi-turn and 15.5% when a parameter is missing; Llama 3.2 3B scores 4% multi-turn [18]. A frame is easier to validate, read back, undo and constrain with a grammar. I recommend a hybrid: the model returns typed commands that edit one trip frame; code applies them atomically, resolves places, routes and decides what to ask. Edits mirror JSON Patch [19] but address items by id. A cloud model can send each command as a parallel tool call.

**Confirmation.** Google advises implicit confirmation of parameters most of the time, and explicit confirmation before hard-to-undo actions or when misunderstanding is costly [20]. Sagawa et al. found users prefer one final confirmation when nothing has gone wrong and explicit confirmation right after an error; earlier systems went explicit when recognition confidence was low or new input contradicted old input [21].

**Missing information, grounding, undo, carryover.** Default the origin to GPS, the time to now, modes and avoidances to the profile; ask only when the destination is missing or ambiguous. The read-back is the grounding act [22], in map terms. Version every frame so "annulla" steps back. Keep a register of places mentioned and of the last list read out, like Alexa's slot carryover [23]. The model emits symbolic references ("ordinal 2", "the other", "last place") and code resolves them, removing ChitChatGuide's wrong-item errors.

### Proposed schema

Enums reuse the engine's names (`AVOID_KINDS`, `PLACE_KINDS`, strengths) and stay language-neutral, because models otherwise copy user-language words into code fields [24]. The union uses `anyOf` with a leading `cmd` constant, which llama.cpp grammars handle; for cloud strict modes that require every field or reject keywords such as `minProperties`, derive a stricter variant (Milo's empty-string convention works).

```json
{
  "type": "object", "additionalProperties": false, "required": ["commands"],
  "properties": {"commands": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"$ref": "#/$defs/Cmd"}}},
  "$defs": {
    "Cmd": {"anyOf": [
      {"type": "object", "additionalProperties": false, "required": ["cmd", "trip"], "properties": {
        "cmd": {"const": "new_trip"}, "trip": {"$ref": "#/$defs/Trip"}}},
      {"type": "object", "additionalProperties": false, "required": ["cmd", "op", "field"], "properties": {
        "cmd": {"const": "edit"},
        "op": {"enum": ["add", "remove", "replace"]},
        "field": {"enum": ["destination", "origin", "stops", "avoid", "modes", "time"]},
        "stop_id": {"type": "string"},
        "value": {"anyOf": [{"$ref": "#/$defs/Place"}, {"$ref": "#/$defs/Stop"}, {"$ref": "#/$defs/Avoid"},
                            {"$ref": "#/$defs/Modes"}, {"$ref": "#/$defs/Time"}]}}},
      {"type": "object", "additionalProperties": false, "required": ["cmd"], "properties": {
        "cmd": {"enum": ["confirm", "reject", "undo", "cancel", "start", "repeat", "more"]}}}]},
    "Trip": {"type": "object", "additionalProperties": false, "minProperties": 1, "properties": {
      "destination": {"$ref": "#/$defs/Place"}, "origin": {"$ref": "#/$defs/Place"},
      "stops": {"type": "array", "maxItems": 3, "items": {"$ref": "#/$defs/Stop"}},
      "avoid": {"type": "array", "items": {"$ref": "#/$defs/Avoid"}},
      "modes": {"$ref": "#/$defs/Modes"}, "time": {"$ref": "#/$defs/Time"}}},
    "Place": {"type": "object", "additionalProperties": false, "required": ["kind"], "properties": {
      "kind": {"enum": ["name", "category", "saved", "here", "ref"]},
      "text": {"type": "string"},
      "category": {"enum": ["pharmacy", "supermarket", "cafe", "bakery", "atm", "shop"]},
      "ref": {"enum": ["last_place", "ordinal", "other"]},
      "ordinal": {"type": "integer", "minimum": 1}}},
    "Stop": {"type": "object", "additionalProperties": false, "required": ["place"], "properties": {
      "id": {"type": "string"}, "place": {"$ref": "#/$defs/Place"},
      "where": {"enum": ["along_route", "near_origin", "near_destination"]},
      "order": {"type": "integer", "minimum": 1},
      "duration_min": {"type": "integer", "minimum": 0}}},
    "Avoid": {"type": "object", "additionalProperties": false, "required": ["kind"], "properties": {
      "kind": {"enum": ["steps", "unsignalled_crossings", "signals_without_sound", "main_roads", "construction", "transfers"]},
      "strength": {"enum": ["avoid_when_possible", "require"]}}},
    "Modes": {"type": "object", "additionalProperties": false, "minProperties": 1, "properties": {
      "transit": {"enum": ["none", "allowed", "preferred"]},
      "types": {"type": "array", "items": {"enum": ["bus", "tram", "subway", "rail"]}},
      "max_transfers": {"type": "integer", "minimum": 0},
      "max_walk_min": {"type": "integer", "minimum": 0}}},
    "Time": {"type": "object", "additionalProperties": false, "required": ["kind"], "properties": {
      "kind": {"enum": ["now", "depart_at", "arrive_by"]},
      "clock": {"type": "string", "pattern": "^[0-2][0-9]:[0-5][0-9]$"},
      "day_offset": {"type": "integer", "minimum": 0}}}
  }
}
```

`replace` on a stop with a `Place` swaps the place and keeps order and duration. Grow the categories from the OSM lexicon, and validate every output again after decoding, since grammar converters skip some keywords.

### The examples

```text
"Voglio andare al Duomo fermandomi ad una farmacia lungo il percorso, senza prendere mezzi pubblici"
{"commands":[{"cmd":"new_trip","trip":{"destination":{"kind":"name","text":"Duomo"},
  "stops":[{"id":"s1","place":{"kind":"category","category":"pharmacy"},"where":"along_route","order":1}],
  "modes":{"transit":"none"}}}]}

"E evita le scale"
{"commands":[{"cmd":"edit","op":"add","field":"avoid","value":{"kind":"steps"}}]}

"No, non quella farmacia, l'altra"
{"commands":[{"cmd":"edit","op":"replace","field":"stops","stop_id":"s1","value":{"kind":"ref","ref":"other"}}]}

"Portami lì"
{"commands":[{"cmd":"edit","op":"replace","field":"destination","value":{"kind":"ref","ref":"last_place"}},{"cmd":"start"}]}

"The second one"   (the field follows what the last list offered)
{"commands":[{"cmd":"edit","op":"replace","field":"destination","value":{"kind":"ref","ref":"ordinal","ordinal":2}}]}

"Va bene il tram ma senza cambi, devo arrivare per le sei"
{"commands":[{"cmd":"edit","op":"replace","field":"modes","value":{"transit":"allowed","types":["tram"],"max_transfers":0}},
             {"cmd":"edit","op":"replace","field":"time","value":{"kind":"arrive_by","clock":"18:00","day_offset":0}}]}
```

For the first sentence, code adds origin `here` and time `now`, geocodes "Duomo" near the user, picks the pharmacy with the smallest detour and reads back once, ending with "vuoi partire?". Seven turns become two. "L'altra" resolves only if two candidates were offered; otherwise Milo names two and asks. Times are read back in full ("arrivo entro le 18"), since "le sei" is ambiguous.

## 3. On-device LLMs, routers and embeddings

| Model | BFCL V4 overall / single-turn / multi-turn [18] | Notes |
|---|---|---|
| Qwen3.5-2B / 4B (Mar 2026) | 43.6 / 50.3 overall, self-reported, thinking mode [25] | 201 languages, Apache-2.0; 2B Q4_K_M 1.28 GB |
| Qwen3-4B-Instruct-2507 | 35.7 / 87.9 / 22.1 | Apache-2.0 |
| Qwen3-1.7B (Milo's local model) | 28.4 / 82.9 / 11.0 | 0.6B: 23.9 / 71.8 / 3.6 |
| xLAM-2-3b-fc-r | 41.2 / 83.0 / 58.4 | best small multi-turn; CC-BY-NC |
| Gemma 4 E2B / E4B (Apr 2026) | not listed; tau2 24.5 / 42.2 [26] | native function calling, 140+ pretraining languages, Apache-2.0; succeeds Gemma 3n |
| Gemma 3 4B (prompted) | 19.6 / 61.1 / 0.4 | |
| Llama 3.2 3B / 1B | 22.0 / 82.7 / 4.0; 1B 10.8 overall | Italian supported |
| FunctionGemma 270M | simple calls 61.6 | fine-tuning lifts Mobile Actions from 58% to 85% [27] |

Ministral 3 3B, SmolLM3 3B and Phi-4-mini support Italian and tool calls but are not on BFCL V4; LFM2-1.2B-Tool does not list Italian. Multilingual calls are harder: on MASSIVE-Agents, Llama 3.2 3B averaged 4.3% exact calls across 52 languages, small models failing mostly on syntax [28], which a grammar removes.

**Speed and memory.** On a Galaxy S26 Ultra GPU, LiteRT-LM runs Gemma 4 E2B at 52 tokens/s with 0.3 s to first token, using about 0.8 GB of weights [26]. On a mid-range Galaxy M55s (Snapdragon 7 Gen 1, CPU), a June 2026 test of the same model measured 7 tokens/s and about 11 s to first token on a long prompt [29]: prefill sets the wait. Mid-range phones will mostly run on the CPU, since llama.rn's GPU path covers only Adreno and its NPU path needs Snapdragon 8 Gen 1 or newer [30], and with MLC LLM, Mali GPUs showed nearly unusable prefill [31]. Cache the static prompt prefix (llama.rn session files; check this with Qwen3.5's hybrid linear attention) and keep per-turn context near 200 tokens. Gemma 4 E2B's GGUF is about 3 GB, Qwen3.5-2B's 1.28 GB [32].

**Constrained decoding.** llama.rn compiles JSON schemas to GBNF [30], as Milo already does; LiteRT-LM supports constrained decoding [33]; MLC LLM uses XGrammar. Engines differ in coverage and speed [34], and constraints can hurt free reasoning [35], so keep the schema shallow and extraction-only.

**Routers and embeddings.** Milo's router already follows aurelio-labs/semantic-router (MIT, local encoders) [36]. It returns one route and cannot reliably tell "con i mezzi" from "senza mezzi", so keep it for single-intent control commands. Italian intent accuracy on MTEB MASSIVE-it [37]: EmbeddingGemma-300m 76.3, Qwen3-Embedding-0.6B 74.0, jina-embeddings-v3 72.3, arctic-embed-m-v2.0 64.0, paraphrase-multilingual-MiniLM 59.7, multilingual-e5-small 57.7, granite-embedding-107m 53.8. EmbeddingGemma needs under 200 MB quantized [38] but has the Gemma licence; Qwen3-Embedding-0.6B is Apache-2.0.

## 4. Italian speech recognition on the phone

| Recognizer | Italian WER (lower is better) | Notes |
|---|---|---|
| Parakeet-TDT-0.6b-v3 (Aug 2025) | FLEURS 3.0, CoVoST 3.7, MLS 10.1 [39] | int8 about 0.67 GB; offline, so pair with VAD; CC-BY-4.0 |
| Whisper small / medium / large-v2 | FLEURS 9.8 / 5.2 / 4.0; Common Voice 9: 16.0 / 9.4 / 7.1 [40] | tiny and base: FLEURS 29.8 and 17.9 |
| Vosk small-it (48 MB) / it-0.22 (1.2 GB) | Common Voice 16.9 / 8.1; MLS 25.9 / 15.7 [41] | small model suits fixed grammars |
| Android on-device recognizer | none published | API 31; biasing strings and model download from API 33 [42]; ML Kit GenAI speech is alpha, it-IT in beta [43] |
| iOS 26 SpeechAnalyzer | none published | on-device, Italian supported [44] |

sherpa-onnx decodes a 3.8 s clip with Parakeet v3 int8 in 1.25 s on 2 threads; the same-size v2 reaches a real-time factor of 0.09 on 4 Cortex-A76 cores [45]. Parakeet v3's average WER rises from 6.3% clean to 11.7% at 0 dB SNR and 19.9% at -5 dB [39]. Whisper degrades more gracefully than LibriSpeech-trained models below 10 dB [40], but invented phrases in about 1% of transcripts, more often for speakers with long pauses [46], a real risk for commands. For names like "via Arcivescovo Calabiana": bias recognition with nearby OSM street names (sherpa-onnx hotwords need modified beam search [45]; NeMo's CTC word spotter helps rare words [47]), match the n-best list phonetically against the local gazetteer, and confirm explicitly when unsure. A close-talk headset and push-to-talk matter as much as the model.

## 5. Recommended design

**Dialogue model and schema.** Keep Milo's layers (fixed grammar, embedding router, LLM), but each returns the command list above over one trip frame, versioned with the plan's `plan_version` so undo works and stale edits are refused. Code applies the list atomically, resolves references, geocodes, plans and chooses what to say from Italian and English templates filled with engine facts (speaking rule 9). Speech stops on a tap, a headset button or a keyword; rate and verbosity (short, normal, detailed) are settings.

**Confirmation policy.**
- Explicit (yes/no or a double tap): starting guidance to a new destination, folded into the single read-back; relaxing a safety constraint (steps, unsignalled crossings, signals without sound, main roads); switching on public transport; a low-confidence place match or a close runner-up; the turn after a correction or misrecognition; destinations outside the downloaded area.
- Implicit (state the change and its cost): adding an avoidance, a stop duration, an unambiguous candidate, a new arrival time.
- None: repeat, more, speed, stop.
- Nothing is asked at a crossing; it waits. "Cosa hai capito?" reads the frame back.

**Models per tier.**
- Cloud parser: a fast model with strict schema support. On BFCL V4, Claude Haiku 4.5 is the most accurate model under 2 s mean latency (68.7% overall, 53.6% multi-turn, 1.7 s) [18]; escalate to a larger model only when validation fails. It should suit Milo's 3 s budget better than the current `claude-opus-5-5` default; measure both.
- On-device parser: Qwen3.5-2B, non-thinking, Q4_K_M, on llama.rn with the schema grammar, LoRA-tuned on Italian and English turns generated by the cloud model and checked by people. Race it against Gemma 4 E2B on LiteRT-LM, and a tuned Qwen3.5-0.8B or FunctionGemma for low-memory phones; Qwen3-1.7B is the baseline.
- Router: EmbeddingGemma-300m (or Qwen3-Embedding-0.6B for Apache-2.0), with the 0.86 threshold recalibrated on Italian.
- Speech: Parakeet-TDT-0.6b-v3 through sherpa-onnx with VAD and street-name hotwords; the Android on-device recognizer with biasing strings on low-memory phones.

**First step.** Build the labelled utterance set the repo lacks (it has grammar and API tests only): about 400 Italian and English turns with compound requests, corrections, references and street names, some recorded outdoors, scored by exact frame match. Settle every model choice on it, and test verbosity defaults and the confirmation policy with blind users and O&M instructors.

## Sources

1. Abdolrahmani, Kuber, Branham. "Siri Talks at You". ASSETS 2018. https://doi.org/10.1145/3234695.3236344
2. Abdolrahmani, Mukkath, Kuber, Branham. Blind people are power users (position paper, 2018). https://accessiblevoice.wordpress.com/wp-content/uploads/2018/10/10-abdolrahmani.pdf
3. Pradhan, Mehta, Findlater. "Accessibility Came by Accident". CHI 2018. https://doi.org/10.1145/3173574.3174033
4. Oumard, Kreimeier, Götzelmann. Pardon? Voice user interfaces for BVI users (review and survey). https://arxiv.org/abs/2203.05848
5. Masina et al. Accessibility of voice assistants with impaired users. JMIR 2020. https://pmc.ncbi.nlm.nih.gov/articles/PMC7547392/
6. Branham, Mukkath Roy. Reading Between the Guidelines. ASSETS 2019. https://doi.org/10.1145/3308561.3353797
7. Bragg et al. A large inclusive study of human listening rates. CHI 2018. https://doi.org/10.1145/3173574.3174018
8. Choi et al. "Nobody Speaks that Fast!". CHI 2020. https://doi.org/10.1145/3313831.3376569
9. Kaniwa, Kuribayashi et al. ChitChatGuide. MobileHCI 2024. https://doi.org/10.1145/3676492
10. Kuribayashi et al. WanderGuide. CHI 2025. https://doi.org/10.1145/3706598.3713788
11. Zamiri Zeraati et al. Say It My Way. CHI 2026. https://arxiv.org/abs/2602.16930
12. Jain, Findlater, Gleason. SceneScout. 2025. https://arxiv.org/abs/2504.09227
13. Kuribayashi, Shangguan, Ohn-Bar. Time-Aware Assistive Navigation (TIMELI). 2026. https://arxiv.org/abs/2609.05596
14. Rastogi et al. Schema-Guided Dialogue. AAAI 2020. https://arxiv.org/abs/1909.05855
15. Li et al. LLMs as zero-shot DST through function calling (FnCTOD). ACL 2024. https://aclanthology.org/2024.acl-long.471/
16. Qin et al. AGIF (MixATIS, MixSNIPS). Findings of EMNLP 2020. https://arxiv.org/abs/2004.10087
17. Rasa. LLM command generators (CALM). https://rasa.com/docs/reference/config/components/llm-command-generators/
18. Berkeley Function Calling Leaderboard V4, data updated 2026-04-12. https://gorilla.cs.berkeley.edu/leaderboard.html
19. RFC 6902, JSON Patch. https://www.rfc-editor.org/rfc/rfc6902
20. Google. Conversation design: confirmations. https://developers.google.com/assistant/conversation-design/confirmations
21. Sagawa, Mitamura, Nyberg. A comparison of confirmation styles for error handling. Interspeech 2004. https://doi.org/10.21437/Interspeech.2004-120
22. Clark, Brennan. Grounding in communication. 1991. https://doi.org/10.1037/10096-006
23. Naik et al. Contextual slot carryover for disparate schemas. Interspeech 2018. https://arxiv.org/abs/1806.01773
24. Lost in Execution: multilingual robustness of tool calling. 2026. https://arxiv.org/abs/2601.05366
25. Qwen3.5-2B and Qwen3.5-4B model cards. https://huggingface.co/Qwen/Qwen3.5-2B, https://huggingface.co/Qwen/Qwen3.5-4B
26. Gemma 4 E4B model card; LiteRT-LM Gemma 4 E2B benchmarks. https://huggingface.co/google/gemma-4-E4B-it, https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
27. FunctionGemma 270M model card. https://huggingface.co/google/functiongemma-270m-it
28. MASSIVE-Agents. Findings of EMNLP 2025. https://aclanthology.org/2025.findings-emnlp.1099/
29. Urja Labs. On-device LLM benchmarks on mid-range Android, June 2026. https://urjalabs.in/blog/on-device-llm-benchmarks-mid-range-android/
30. llama.rn README. https://github.com/mybigday/llama.rn
31. Understanding LLMs in your pockets: performance study on COTS mobile devices. 2024. https://arxiv.org/abs/2410.03613
32. GGUF files. https://huggingface.co/unsloth/Qwen3.5-2B-GGUF, https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF
33. Google Developers Blog. LiteRT-LM, May 2026. https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/
34. JSONSchemaBench. 2025. https://arxiv.org/abs/2501.10868
35. Tam et al. Let Me Speak Freely? 2024. https://arxiv.org/abs/2408.02442
36. aurelio-labs/semantic-router. https://github.com/aurelio-labs/semantic-router
37. MTEB results repository, MassiveIntentClassification, Italian test split. https://github.com/embeddings-benchmark/results
38. Google. Introducing EmbeddingGemma, September 2025. https://developers.googleblog.com/en/introducing-embeddinggemma/
39. NVIDIA parakeet-tdt-0.6b-v3 model card. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
40. Radford et al. Whisper: robust speech recognition via large-scale weak supervision. 2022. https://arxiv.org/abs/2212.04356
41. Vosk models. https://alphacephei.com/vosk/models
42. Android SpeechRecognizer and RecognizerIntent reference. https://developer.android.com/reference/android/speech/SpeechRecognizer, https://developer.android.com/reference/android/speech/RecognizerIntent
43. ML Kit GenAI Speech Recognition (alpha). https://developers.google.com/ml-kit/genai/speech-recognition/android
44. Apple WWDC25, SpeechAnalyzer; launch languages listed in addpipe's overview. https://developer.apple.com/videos/play/wwdc2025/277/, https://blog.addpipe.com/apple-speechanalyzer-api/
45. sherpa-onnx NeMo transducer models and hotwords. https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html, https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html
46. Koenecke et al. Careless Whisper. FAccT 2024. https://arxiv.org/abs/2402.08021
47. Andrusenko et al. Fast context-biasing with a CTC word spotter. Interspeech 2024. https://arxiv.org/abs/2406.07096
