# One-pager

Every agent reads this before starting a task. Where this file and `AGENTS.md` disagree, this file wins.
Claims are marked **(verified)** with a source, or **(assumption)**.

## Track and brief

- Track: **1 · Hearing Hues** (blind and low-vision users), example 2 "Explore a place before entering it".
- Full official brief (paste):

  > **Hearing Hues.** For blind and low-vision users. Digital interfaces often communicate visual cues: a progress bar stops moving, an error appears beside a field, or one line in a chart suddenly diverges from the others. These interface cues allow users to understand what is happening at first sight. How might we make that information understandable without relying on sight? Choose one piece of information that sighted users can comprehend almost effortlessly and redesign how a blind or low-vision user can receive that information without the need to navigate the interface.
  >
  > *Explore a place before entering it.* A sighted person can glance at a map and immediately understand the shape of a neighbourhood, how streets connect, where landmarks are and which routes appear complicated. Create a nonvisual way to explore that spatial structure, rather than reducing the map to a list of turn-by-turn instructions.
  >
  > Solutions could use audio, haptics, conversational interfaces or other accessible representations. The choice should follow the information and the situation in which someone needs it.

- Judging criteria and weights: unknown to us. Organisers' advice relayed by Leo: solve one problem very well, especially the hard cases.
- Required deliverables: unknown to us. Leo's priority: a working live demo over slides.
- Partner technologies or special prizes to target: Anthropic is the main partner. Nothing else known.

## Product

Working name: **Lay of the Land** (assumption: rename freely).

- **User**: a blind person who has to go somewhere unfamiliar. The evening before, at home, with a screen reader, they want what a sighted person gets from one glance at the map: how the place is laid out, what separates and what connects, which ways there are and which one suits them.
- **The one piece of information**: *how the place I am going to is laid out, and what lies between me and it.* Two moments: before leaving (this hackathon) and on the pavement (the camera step, last in the list, built only once everything before it works).
- **Problem**: blind travellers pre-plan unfamiliar journeys and find a mental representation of the area comforting **(verified)**: [Strategies and needs of blind pedestrians during urban navigation, 2018](https://shs.cairn.info/revue-le-travail-humain-2018-2-page-141?lang=en), [SceneScout, 2025](https://arxiv.org/pdf/2504.09227). Tactile maps give that survey knowledge, but only 17.15% of respondents in an international survey had ever used one **(verified)**: [Scientific Reports, 2025](https://www.nature.com/articles/s41598-025-08117-9).
- **Why existing solutions are not enough** (as far as we checked on 26/09, none tested with a screen reader): [Audiom](https://www.audiom.net/) and Microsoft's [AVE study](https://www.microsoft.com/en-us/research/publication/use-cases-and-impact-of-audio-based-virtual-exploration/) explore places by audio and are our direct precedents; Soundscape Street Preview did the same before Microsoft retired it. Google ships conversational navigation ([Gemini in walking navigation](https://blog.google/products-and-platforms/products/maps/gemini-navigation-biking-walking/), [Ask Maps](https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/)) and [WeWALK](https://support.wewalk.io/en/article/what-do-i-get-access-to-with-a-wewalk-subscription-2/) offers foot and transit routes for blind users. What we add and must demonstrate: the structure is explained in orientation-and-mobility language, every statement carries its evidence or says the map is silent, the user chooses the route they want among computed alternatives under constraints they set, and the whole thing keeps one stable spatial reference while they change their mind.
- **Demo moment (90 s, Leo's scenario, all numbers real and reproducible offline)**: "A friend invited me to a party on viale Isonzo; I am at Talent Garden." (1) Overview of the party's block. (2) Explore: walk the block virtually, come back to the corner. (3) Ask: "Is it close to here?" → "350 m in a straight line, but 1,090 m on foot: the southern belt railway is between you and it; you cross it on the corso Lodi bridge or at Lodi M3." (4) Plan: on foot or by metro; "I'd rather avoid crossings without signals" → the app avoids them where it can and states the trade-off: "Route A: every crossing verified as signalled, 16 minutes. Route B: the shortest, 14 minutes, with two crossings the map does not say are signalled. Which one?"; pick route A. (5) "I need a supermarket for beers" → the detour each candidate costs; "I'll shop for 15 minutes" → the plan updates and reads out what changed. (6) Level 3: opening hours of that supermarket, from the map or the web, with the source. Input is keyboard and text; output is spoken and on screen. Voice input is a level 3 item. The demo destination is fixed: 45.44658, 9.20584, a point on viale Isonzo 350 m from Talent Garden at bearing 330°.

### Levels

**Level 1, by 13:00: understand the place.**
1. **Overview** of the zone around a point: stable landmarks, barriers (railway, water, construction sites), main roads, how the zone is split, in the speaking rules below. Computed from OpenStreetMap, cached for the demo zone.
2. **Free exploration**: a virtual walk along the street network with one stable reference. At every junction: how many branches, what each leads to, where the user came from. Commands: forward, left, right, back to the last junction, back to the start, where am I. Keyboard and text.
3. **Questions in the user's own words** (EN/IT), anywhere in the flow, answered by five deterministic computations: barrier between A and B; how far a place extends (in walking time and bounding streets); does a street go through or end; how many independent ways between two places; walking distance vs straight-line distance.
4. **Accessible UI**: keyboard only, screen reader, `aria-live` for every answer, EN/IT switch, browser text-to-speech. Works from fixtures without the server.

**Level 2, by 14:30: plan the trip my way.**
5. **Routes under the user's constraints, and the user picks one**: alternatives on foot (from the graph) and by public transport (Transitous, see Architecture). Constraints are things to avoid, not penalties: crossings without signals, signals without sound, steps, construction sites, main roads, transfers, walking beyond a number of minutes. The default strength is *avoid when possible*: the engine computes the best route with every known violation removed and compares it with the unconstrained shortest route. If the detour is acceptable (within +5 minutes or +25%, whichever is larger; tunable **(assumption)**) it is the main proposal; if avoiding costs more than that, the user gets both, the compliant longer route and the shorter one, with the trade-off in minutes and in violating crossings, and chooses. *Require* is the explicit hard form: routes known to violate are never offered. In both forms a route whose compliance is unknown (the map is silent on a crossing) is never called compliant. Every route reports each constraint as satisfied, violated or unknown, computed over every walking leg, including the walking legs of a transit route and the legs added by a stop. If no route is verified compliant, the app says so and offers to relax the requirement. The user hears 2–3 alternatives with what differs, and selects the one they want; the plan keeps it.
6. **A stop along the way** (supermarket or any mapped place): candidates near the chosen route, the detour each one costs in minutes, and the time the stop adds; on transit, the second leg is recomputed from the new departure time; constraints are re-evaluated on the new legs.
7. **Change your mind**: preference, requirement, departure time or stop duration change → the plan is recomputed and the differences are read out.

**Level 3, only if levels 1 and 2 run end to end.**
8. **Voice input**: Web Speech API in the browser; local Parakeet through the server as fallback on the Mac. Until this ships, input is keyboard and text and output is spoken: not a voice conversation.
9. **Information about a place or a street**: opening hours, entrance, wheelchair and tactile-paving tags from OpenStreetMap first (deterministic); then a web search (Tavily) for events, closures and accessibility notes, every item with its URL and retrieval time, summarised only from what the search returned.
10. **Directional audio cues** (Web Audio panner) for junction branches and barriers; to be tested with headphones before shipping.
11. **Next step, the second moment**: on the pavement, the phone camera checks the map against reality ("the map said a signalled crossing; the photo shows a barrier, not on the map"), labelled *estimated*. Built only after 1–10 work correctly.

- **Out of scope**: turn-by-turn guidance while walking, real-time obstacle detection, indoor spaces, cities beyond the cached zone during the demo.
- **Main risk and plan B**: the LLM maps a request to the wrong computation or invents a place. Plan B: the model only chooses among fixed tools and parameters, validated by JSON schema; place names are resolved inside the zone only and ambiguity triggers a question back; if nothing fits, the UI offers the commands as buttons. Second risk: an external API (Overpass, Transitous, Tavily) or the model is slow or down at the table: see "Offline demo path" in Architecture.

## Speaking rules (binding for prompts, UI strings and fixtures)

Common orientation-and-mobility practice (assumption: standard practice, not checked with a blind user today).

1. Distances in metres, rounded (350 m, not 347 m), and in walking minutes (about 1 minute per 80 m). Never hectares, acres, square metres or percentages of an area.
2. Size and extent as walking time and bounding streets: "the park takes the whole block between via Ripamonti and via Adamello, about 3 minutes along its side", never "3 hectares".
3. Directions relative to the user's facing: ahead, behind, left, right, or clock positions ("at 2 o'clock"). "Ahead" only when a heading has been established; a distance comparison says "in a straight line". Cardinal directions only when the user asks, or in the overview with a stated reference ("with the station behind you").
4. Landmarks must be perceivable without sight: crossings, traffic lights (say if sound is mapped), kerbs, steps, tram tracks, bridges and underpasses, the noise of a main road or railway, entrances, bus and metro stops, changes of surface. Never colours, signs, shop fronts or "you will see".
5. A junction is described as: number of branches, listed from left to right, each with its name and what it leads to; the branch the user came from is "behind you".
6. Missing data is said, never skipped: "the map does not say whether this crossing has a signal". Estimates are marked as estimates. A conclusion that depends on data outside the downloaded area says so.
7. Short first, detail on request: one or two sentences, then "more" for the rest. No decorative adjectives.
8. Same reference throughout a session: the start point and the user's facing never change silently; every change is announced.
9. Numbers and names from the computation only. The model never adds a place, a distance or a time that is not in the facts it received.
10. The user's language in, the same language out; instructions to models in English.

## Architecture

- **Demo zone**: Porta Romana, Milan, around Talent Garden Calabiana (45.44386, 9.20808). The graph is fetched with a 1.5 km buffer and answers are given within 800 m. Boundary nodes are marked; conclusions that could depend on paths leaving the downloaded area ("no route", dead end, number of independent routes) carry `completeness: complete | unknown` and say so in words. Walk graph at 800 m: 1,425 nodes, 4,206 edges, ~10 s to download, then cached **(verified)**.
- **Engine `server-py/`** (Python, FastAPI, owner Daniele). Libraries chosen: `osmnx`, `networkx`, `shapely`, `geopandas`. One session state per user: `{zone, position, heading, junction_stack, plan}`. Endpoints:
  - `POST /session {zone, lang}` → session id + overview; `GET /session/{id}/overview`
  - `POST /session/{id}/explore {command}` → `ExploreStep`
  - `POST /session/{id}/ask {question}` → `Answer`
  - `POST /session/{id}/plan {origin, destination, constraints, depart_at}` → `Plan` with `routes[]`; `POST .../plan/select {route_id}`; `POST .../plan/stop {kind|place, duration_min}`; `POST .../plan/constraints {...}` → `Plan` recomputed
  - Level 3: `GET /session/{id}/info?place=`; `POST /session/{id}/check-photo`
- **Routing on foot**: shortest paths on the graph. For each constraint, two graphs: the full one and one with the edges known to violate it removed; edges with unknown data stay but are marked, so a route is compliant only if every edge is verified. *Avoid when possible* = shortest path on the filtered graph, compared with the shortest on the full graph; beyond the detour tolerance both are returned with the trade-off. *Require* = filtered graph only. Up to three alternatives by penalising the chosen path.
- **Routing by transit**: [Transitous](https://transitous.org), MOTIS API pinned to **`/api/v6/plan`** **(verified)** 26/09: with `maxTransfers=0&maxTravelTime=60` v6 returns 5 itineraries for Talent Garden → Duomo, v1 returns 0 for the same request. Parameters used: `maxTransfers`, `maxTravelTime` (minutes), `maxPreTransitTime` / `maxPostTransitTime` (seconds, first and last street legs only). Total walking is computed in code from all legs, transfers included; polyline precision 6. Every request carries a `User-Agent` with a contact address, per the [service conditions](https://transitous.org/api/); prototype use is allowed, production has further conditions.
- **Offline demo path**: overview, exploration and the five questions run offline from the cached graph for any input inside the zone. Transit, web and model calls run live or from a cache keyed by their exact inputs (origin, destination, constraints, departure time rounded to 5 minutes, stop). Every response carries `meta {mode: live | offline, cache: hit | miss | none, computed_at}`. Offline with a cache miss, the response says "not available offline" instead of reusing a stale plan. The demo script uses only cached input combinations.
- **Web information (level 3)**: OSM tags first (`opening_hours`, `wheelchair`, `tactile_paving`, `entrance`, `website`); then Tavily search from the server (`TAVILY_API_KEY`, to be added to `.env.example` by name in the contracts PR).
- **LLM**: OpenRouter, model from env `OPENROUTER_MODEL`, default `deepseek/deepseek-v4.1-flash` (text + image; $0.30/M in, $1.20/M out; one tool-mapping call measured at $0.0002 **(verified)** 26/09, not a cost bound for a whole flow). Two roles: (1) utterance → one tool or parameter change, JSON schema; (2) computed facts → sentences under the speaking rules, citing only those facts. The key has a $15 cap: one retry at most, no loops. Switching model means re-running the mapping and format tests.
- **Contracts `contracts/`**: `fact.schema.json` shared by all: `{type, value, unit, source, evidence[], inputs{}, data_date, completeness}` with `source` one of `computed | map_tag | transit_api | web | estimated | unknown`; `evidence` holds OSM ids or URLs and `inputs` the coordinates, snapshot date and parameters that produced the number, so every figure can be recomputed. Then `overview.schema.json`, `explore-step.schema.json`, `answer.schema.json`, `plan.schema.json` (`constraints[]` with strength `avoid_when_possible | require` and `detour_tolerance`; routes with legs, crossings, per-constraint `status: satisfied | violated | unknown`, `trade_off` in minutes and violating crossings, warnings, facts; `compliant_route_available: yes | no | unknown`; `differences[]`; `meta`). Fixtures: 1 overview, 2 explore steps, 3 answers, 2 plans (one with two routes and a stop; one where no verified compliant route exists), all with real Porta Romana numbers.
- **UI `web/`** (Vite + React + TypeScript, owner Leonardo): screens Overview, Explore, Plan (route list with selection, constraints with strength, stop), and Ask available everywhere. Runs against `contracts/fixtures/` on Windows; to reach the real engine: `cloudflared tunnel --url http://localhost:8000` on the Mac.
- **Checks**: `npm run check` validates fixtures against the schemas and typechecks `web/`, no network. `npm run check:engine` (Mac) recomputes the fixtures from the cached graph and diffs them.
- **Integrator** (merges to `main`): Daniele, because the demo runs on his Mac.

## Feasibility per capability

| Capability | Implementation | Status / blocker |
|---|---|---|
| Overview | osmnx: barriers, primary roads, large areas, split of the zone | Computed on real data 26/09 **(verified)**; wording to rewrite under the speaking rules |
| Free exploration, branch and return | Walk on the graph: current node, heading, junction stack; branches sorted by bearing relative to heading | No technical blocker; about 1.5 h engine + UI **(assumption)** |
| Five relational questions | Barrier intersection, walking-time extent, `noexit` + degree with buffer, node connectivity, path length / great-circle | Computed on real data 26/09 **(verified)**; dead-end and connectivity answers carry `completeness` |
| Foot routes under constraints, pick one | Filtered graph vs full graph, detour tolerance, unknown marking; 3 alternatives | Tags are sparse: signal sound mapped on 7 of 88 crossings near the zone **(verified)**, so compliance will often be "unknown" rather than verified: the app says so and states the trade-off |
| Transit routes | Transitous `/api/v6/plan`; demo itineraries cached by exact inputs | v6 works **(verified)**; live coverage of Milan buses and trams beyond M3 **(assumption)** |
| Stop along the way | OSM `shop=supermarket`; foot: A→S→B minus A→B; transit: two v6 calls, second departure = arrival + duration; constraints re-evaluated | No blocker; needs the `Plan` object |
| Change constraint / time / duration | Re-run plan with new parameters; the model maps the utterance to a parameter; `differences[]` read out | No blocker; depends on the row above |
| Offline demo path | Cached graph for zone computations; input-keyed cache for transit, web, model; `meta` on every response | No blocker; the demo script must stay on cached inputs |
| Voice input | Web Speech API; Parakeet fallback via server | Level 3; browser support differs (Chrome yes, Firefox limited) **(assumption)** |
| Web information | OSM tags, then Tavily; each item with URL and time | Key present on Daniele's machine; quality of results for a specific street **(assumption)** |
| Directional audio | Web Audio `PannerNode` | Must be tested with headphones; comprehensibility unproven |
| Camera check (next step) | Phone photo → vision model (DeepSeek V4.1 Flash accepts images; local Gemma 4 on the Mac answered in 16 s cold **(verified)**) compared with the map's claims | Last; needs the phone reaching the Mac through the tunnel |

## Timeline (overrides `AGENTS.md`)

- 11:30 contracts merged; scaffold PR open. 12:15 walking skeleton: overview, one explore step, one question, end to end, ugly.
- 13:00 level 1. 14:30 level 2 and feature freeze (level 3 items ship only if already working).
- 15:30 demo path rehearsed twice, offline. 16:00 backup video with captions. 16:15 submitted.

## Task list

One line per task: `[owner/agent] branch — goal — status`.

- [Daniele/Claude] `dm/contracts-schema` — five schemas, fixtures with real numbers (including the no-compliant-route plan), `TAVILY_API_KEY` name in `.env.example` — todo, first
- [Leonardo/Codex] `lg/web-scaffold` — root `package.json` (`dev`, `check`), `web/` Vite + React + TS, EN/IT dictionaries — todo, merged before any other `web/` work
- [Daniele/Claude] `dm/server-zone` — cached graph with buffer and boundary marks, session state, overview, explore, five tools, `/ask` with the tool name passed directly, `meta` on responses — todo
- [Daniele/Claude] `dm/server-llm` — utterance → tool/parameter, facts → sentences under the speaking rules — todo
- [Leonardo/Codex] `lg/web-overview-explore` — Overview and Explore screens, keyboard commands, `aria-live`, TTS — todo
- [Leonardo/Codex] `lg/web-ask` — question box and answer with evidence and unknowns — todo
- [Daniele/Claude] `dm/server-plan` — foot alternatives with avoid-when-possible/require and detour tolerance, Transitous v6, stop, recompute, input-keyed cache — todo
- [Leonardo/Codex] `lg/web-plan` — route list with selection, constraints with strength, stop, differences read out, "no compliant route" state — todo
- [Leonardo] pitch (2 min), demo video with captions, submission — todo
- level 3: [Leonardo] `lg/web-voice-input`, [Daniele] `dm/server-info`, [Leonardo] `lg/web-audio-cues`; next step: [Daniele] `dm/server-photo-check`, [Leonardo] `lg/web-camera`
