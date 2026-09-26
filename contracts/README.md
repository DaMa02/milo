# contracts

JSON Schemas (draft-07) for everything the engine (`server-py/`) sends to the UI (`web/`), plus real fixtures for the demo zone.

- `fact.schema.json`: one number or named thing with its evidence; every number said to the user is a fact. Also holds shared definitions (`meta`, crossings, relative directions).
- `overview.schema.json`: the zone from a stated reference (place + facing): short `text`, `details` on "more", landmarks, barriers.
- `explore-step.schema.json`: position, heading, branches left to right, where you came from, junction stack depth, boundary flag. Request: `POST /session/{id}/explore {command, branch?}`; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost) or its name.
- `answer.schema.json`: one deterministic tool answering a question, with `unknown[]`.
- `plan.schema.json`: routes under constraints, the user's selection, a stop, what changed, `compliant_route_available`.

Engine endpoints (`server-py/`, routes at the root; the Vite dev proxy maps `/api/*` to them). All text is English (`lang: "en"`).
- `POST /session {origin?: {lat, lon, name?}, destination?: {lat, lon, name}, heading_deg?, lang?: "en"}` → `{session_id, overview, zone: {name, source}}`. The engine holds one map of central Milan (inside the 90/91 ring); the overview and exploration describe 800 m around the session origin, while questions and routes work anywhere on the map. An origin outside central Milan loads a map around it: `source` is `city`, `cache` or `download` (about 80 s the first time, so clients wait up to 120 s). Default origin Talent Garden facing north. `GET /session/{id}/overview` → Overview.
- `POST /session/{id}/destination {lat, lon, name}` → `{destination: {lat, lon, name}, straight_line_m}`. The places `destination`, `there` and `the party` in questions, and a plan without `destination`, then mean this one.
- `POST /session/{id}/explore {command, branch?, heading_deg?}` → ExploreStep; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost).
- `POST /session/{id}/ask {question, tool, params?}` → Answer. `place` = `{lat, lon, name?}` or `{name}` (resolved inside the mapped area; ambiguous or unknown names come back as an Answer asking which one); `from` defaults to the session origin. Params: `walking_vs_straight_line`, `barrier_between`, `independent_connections`: `{from?, to}`; `street_continuity`: `{street}`; `extent`: `{place}`. `{question}` alone (no `tool`) works once `dm/server-llm` lands; until then `tool` is required.
- Plan (level 2), every call returns the whole Plan:
  - `POST /session/{id}/plan {destination?: place, origin?: place, depart_at?, constraints?, detour_tolerance?}` (without `destination`: the session destination; neither → 422) → new plan, `plan_version` 1, no selection, no stop (`fixtures/plan.initial-comparison.json`).
  - `GET /session/{id}/plan` → the current plan.
  - `POST .../plan/select {route_id, if_version?}` → `selected_route_id` set.
  - `POST .../plan/stop/candidates {kind: "supermarket", if_version?}` → `stop_candidates[]` along the selected route, best first; the plan itself is unchanged (`plan.stop-candidates.json`).
  - `POST .../plan/stop {osm_id, duration_min, if_version?}` → every route recomputed through the stop (`plan.two-foot-routes-and-transit.json`); same `osm_id` with a new `duration_min` changes the duration (`plan.stop-5-min.json`); `{osm_id: null}` removes the stop.
  - `POST .../plan/constraints {constraints, detour_tolerance?, if_version?}` and `POST .../plan/depart {depart_at, if_version?}` → plan recomputed (`plan.no-compliant-route.json` is the `require` case).
  - Every applied change increments `plan_version`, and `differences[]` says what changed since the previous version.
  - Errors: 4xx means nothing was applied and the plan is unchanged; 409 means `if_version` is stale. On a timeout or 5xx the outcome is unknown: call `GET .../plan` and compare `plan_version` before telling the user anything.

Voice, places and one entry point for everything the user says (user position and words travel in request bodies, never in URLs, and are never logged):
- `POST /stt`, body = raw audio (`audio/webm`, `audio/mp4` from iOS Safari, `audio/ogg`, `audio/wav`), optional `?lang` → `{text, lang, audio_ms, stt_ms}`; 422 `{"detail": "No speech detected."}`; 503 when voice input is not available (type instead). Parakeet runs locally on the Mac.
- `POST /interpret {utterance, lang, session_id?, context: {view, pending: null|"origin"|"destination"|"stop", candidates: [names], stop_candidates: [names], last_action?, has_destination, routes: [{id, label}]}}` → `{utterance, action, params, via: "grammar"|"jev"|"claude"}`. Works without a session. Actions: `explore {command, branch?}` · `ask {question, tool, params}` · `overview` · `more` · `unknowns` · `sources` · `repeat` · `stop` · `help` · `speed {change: "faster"|"slower"}` · `start_over` · `set_origin {query}` · `set_origin_here` · `set_destination {query}` · `confirm {answer: "yes"|"no", index?}` · `route` · `route_select {route_id}` · `route_avoid {kind, strength?}` · `route_stop {kind: "supermarket"|"pharmacy"|"cafe"|"bakery"|"atm"|"shop", duration_min?}` · `stop_duration {minutes}` (when `pending` is "stop" or `last_action` is "route_stop") · `navigate {state: "start"|"stop"}` · `none {reason: "no_fit"|"outside_area"|"unclear"|"model_unavailable"}`. Commands and confirmations come from a local grammar (instant); then Jev (TypeSafe, ~0.3 s, only with `TYPESAFE_API_KEY`, only confident answers that copy no free text); everything else from Claude. `ask` may use the tool `place_info {place: {name}}` (a name or a kind: "the pharmacy"). With `pending: "stop"`, "the first one" or a name in `stop_candidates` → `confirm {answer: "yes", index}`. Indexes are 0-based: `confirm.index` 0 = first candidate; `explore.branch` is either the 0-based index ready for `/explore` (0 = leftmost; "take 2" / "the second one" arrives as 1) or the branch name as a string, exactly what `/explore` accepts.
- `POST /places/search {query, near?: {lat, lon}, lang}` → `{query, candidates: [{name, kind, street, housenumber, city, lat, lon, distance_m}]}`, at most 3, best first. `POST /places/reverse {lat, lon, lang}` → `{label, street, housenumber, name, city, lat, lon}`; `label` is the street and number unless a named building or place is within 25 m. `name` of a search candidate and `label` of a reverse result are always non-empty strings; `kind`, `street`, `housenumber`, `city` (and `name` in reverse) may be `null`; `lat`, `lon` and `distance_m` are always numbers (distance from `near`, or from the map centre). Photon (OpenStreetMap), falling back to the names on the map.
- `POST /tts {text, lang}` → `audio/mp4` (AAC), spoken on the Mac with `say` (voice Daniel, en-GB; "N m" read as metres); 503 `{detail}` when not available. Play it through one `<audio>` element unlocked by the Talk tap: iOS Safari plays it through the speaker or headphones, while its `speechSynthesis` often stays silent after the mic was used.
- `GET /voice/health` → `{stt: "parakeet"|"none", tts: "say"|"none", router: "claude"|"grammar"}`.
- Errors of these endpoints: 422 `{detail}` is one sentence the app can say.
- Route A of a plan prefers main streets (usually wider pavements) and says what that costs against the shortest way; the constraint `main_roads` with `avoid_when_possible` still asks for side streets instead.

Plans with a stop: every route passes through it (legs to the stop, one `stop` leg lasting the stop, legs after it). `duration_min` runs from `depart_at` to arrival, so waits and the stop count; `leave_at` says when to leave.

Legends. `source`: `computed` engine on the map, `map_tag` read from an OSM tag, `transit_api` Transitous, `web` search result, `estimated` an estimate (always said as one), `unknown` said by the user or not backed by data. `completeness`: `unknown` when the result could depend on paths outside the downloaded area. `strength`: `avoid_when_possible` fewest known violations, compared with the shortest route; `require` routes known to violate are never offered.

Fixtures are named `<schema>.<case>.json`, English, data of 2026-09-26, `meta.mode` offline. Regenerate (Mac, needs the osmnx cache in `$TOOLS`) and validate:

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh" && python contracts/make_fixtures.py && python contracts/validate.py

`validate.py` needs only `jsonschema`; it also fails if a number in a spoken string has no matching fact.
