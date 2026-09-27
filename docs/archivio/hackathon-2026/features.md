# Features

For each feature, this page gives what you say and what Milo answers (**Practical**), then the endpoint, the module and the method behind it (**Technical**). Endpoints are served by the engine in [`server-py/`](https://github.com/DaMa02/milo/tree/ed9c4bf/server-py/) and reached by the app under `/api`. The request and response shapes are in [contracts/README.md](https://github.com/DaMa02/milo/blob/ed9c4bf/contracts/README.md).

The example replies come from the engine: the fixtures in [`contracts/fixtures/`](https://github.com/DaMa02/milo/blob/ed9c4bf/contracts/fixtures/), live runs, and the simulated walk in the tests, all from 26 September 2026. Where no recorded reply exists, the page shows the sentence pattern the engine fills in, with placeholders in angle brackets. When `/speak` is on, Claude shortens the engine's text to at most two sentences, keeps its numbers and adds a fixed next-step hint.

Every utterance first goes through `/stt` (speech to text) and `/interpret` (text to one action). See [architecture.md](architecture.md).

## 1. Start from GPS

**Practical.** "Use my location", then "Yes" or "No".
> You seem to be at via Arcivescovo Calabiana 6, within about 30 metres. Start here?

**Technical.** The browser reads the position, then calls `POST /places/reverse` ([`places_api.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/places_api.py)). Photon's reverse geocoder returns the street and house number, or the name of a building or place within 25 m. If Photon is unreachable, the engine uses the nearest named street on the loaded map within 150 m. On "yes", `POST /session {origin, heading_deg}` ([`app.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/app.py)) opens a session with that start point and the compass heading.

## 2. Start or destination by name

**Practical.** "Start from the Duomo", "Take me to Bocconi University", "I'm going to …". Then "Yes", "No" or "The second one".
> I found Bocconi University, Piazza Angelo Sraffa, Milan. Is that right? Say 'yes' or 'no'.

**Technical.** The grammar ([`lotl/grammar.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/grammar.py)) extracts the place name, and `POST /places/search` ([`places_api.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/places_api.py)) queries Photon inside a greater-Milan bounding box. It returns at most 3 candidates, drops namesakes more than 25 km away, and filters out bus stops, platforms and bike docks. When Photon finds nothing, Claude proposes up to 2 names that speech recognition may have misheard (for example "Baconi" for Bocconi), and those are searched too. The last fallback is the named streets and features of the loaded map. A destination is stored with `POST /session/{id}/destination`.

## 3. Describe the area

**Practical.** "What's around me?", "Describe the area", then "More" for detail.
> Facing north from Talent Garden, the southern belt railway runs from your left to your right 160 m ahead, and you are on the south side. The nearest place to cross it on foot is the corso Lodi bridge, with an underpass beside it, 410 m at 2 o'clock.

**Technical.** `GET /session/{id}/overview` ([`lotl/overview.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/overview.py)). The overview covers the 800 m around the session origin: the railway inside that window and the places to cross it on foot, main roads within 500 m and construction sites within 400 m. Directions are clock positions relative to the reference facing, which is the phone's compass heading when the app has one, and north otherwise. A short `text` is read first, and `details` and `unknown` follow on request.

## 4. Virtual walk

**Practical.** "Let's walk", "Turn left", "Turn right", "Take via Brembo", "Take the second one", "Go back", "Back to the start", "Where am I?"
> Start at Talent Garden, facing north. You are on the pavement of via Arcivescovo Calabiana. 3 ways, from left to right: a footpath, at 8 o'clock, 20 m to a junction; the pavement of via Arcivescovo Calabiana, at 11 o'clock, 140 m to a junction with the crossing of via Arcivescovo Calabiana; …

**Technical.** `POST /session/{id}/explore {command, branch?}` ([`lotl/explore.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/explore.py)). The walk moves from junction to junction on the pedestrian graph. The ways out of the current node are sorted by bearing relative to the facing, from left to right. Each one carries its name, what it leads to and its crossings (with or without a signal, and with or without sound, or "the map does not say"). The way the user arrived by is reported as "behind you". A junction stack supports "go back", the start point supports "back to the start", and a boundary flag warns at the edge of the mapped area.

## 5. Questions about the map

**Practical.** Five kinds of question, anywhere in the flow:

| You say | Example reply |
|---|---|
| "Is it close to here?", "How far is it on foot?" | 350 m in a straight line, but 1,080 m on foot, about 14 minutes: the southern belt railway is in between. On foot you cross it on the corso Lodi bridge. |
| "Is there anything between here and viale Isonzo?" | Yes. In a straight line you would cross the southern belt railway, Cintura sud di Milano, and the construction site Villaggio Olimpico 2026 - Parco Porta Romana. |
| "Does via Arcivescovo Calabiana go through?" | On foot, via Arcivescovo Calabiana does not go through: it is about 600 m long, it has a dead end, and its other ends connect to via Brembo, via Cassano d'Adda, via Vallarsa and viale Ortles. |
| "How big is the park?" | \<Park\> takes the block between \<street\> and \<street\>; its longest side is about \<N\> minutes on foot, \<M\> m; walking all around it takes about \<K\> minutes. |
| "How many ways are there to Bocconi?" | There are 2 independent ways between \<A\> and \<B\>, sharing no junction: one through \<junction\>, the other through \<junction\>. |

**Technical.** `POST /session/{id}/ask {question, tool?, params?}` ([`lotl/tools.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/tools.py)). The interpreter picks the tool and copies the place names, and the tool computes the answer:
- `walking_vs_straight_line`: shortest path on the walk graph compared with the great-circle distance, at 80 m per walking minute.
- `barrier_between`: railways, water and construction sites that cross the straight line between the two places, with the places where the railway can be crossed on foot.
- `street_continuity`: the street's ends, dead ends, length and what its ends connect to. The answer is marked incomplete when it depends on paths outside the map.
- `independent_connections`: node connectivity between the two places (a minimum node cut, by Menger's theorem), computed in the box around both ends plus 500 m.
- `extent`: the minimum rotated rectangle and the outline of the OpenStreetMap area, the bounding streets, and whether the area fills its block (at least 60%).

Each tool answers in under 1.5 s on the city graph (`tests/test_city_speed.py`). A place that is unknown, ambiguous or outside the map comes back as a question.

## 6. About a place

**Practical.** "Is the pharmacy open?", "When does Lidl close?", "Tell me about Lidl", "Is Lidl wheelchair accessible?"
> \<Name\>, \<street number\>: a pharmacy \<N\> m from here in a straight line. Open until \<hh:mm\>. Wheelchair access: yes, according to the map.

**Technical.** Tool `place_info` in [`lotl/tools.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/tools.py). The engine parses the OpenStreetMap `opening_hours` tag in Rome local time ("open until \<hh:mm\>", "closed now, it opens tomorrow at \<hh:mm\>"). It also reads the `wheelchair` and address tags and computes the straight-line distance from the start. A kind word such as "the pharmacy" means the one nearest to the session origin. Missing tags go into `unknown`, for example "The map does not say when it is open."

## 7. Routes

**Practical.** "How do I get there?", then "Other routes", "Take the shortest", "Take the main streets", "Take the bus".
> To reach Bocconi University from Talent Garden, I recommend route A, on foot along main streets, 29 minutes. It has 10 crossings without a signal. Say 'let's go' to start, or 'other routes' to compare.

**Technical.** `POST /session/{id}/plan`, then `plan/select` ([`plan_api.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/plan_api.py), [`lotl/plan.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/plan.py)). There are up to three routes:
- **A** follows main streets, which usually have wider pavements. Each metre off a main road costs 1.3 metres, and the reply says what that costs compared with the shortest way.
- **B** is the shortest on foot.
- **C** uses public transport from Transitous (MOTIS plan API, at most 2 transfers and 60 minutes). Its walking legs are checked for mapped crossings within 10 m of the trace.

Each route reports its minutes, walking metres, crossings by kind, and the status of every constraint (`satisfied`, `violated` or `unknown`). Every change returns the whole plan with a new `plan_version` and `differences[]`. Stale writes are rejected with 409 (`if_version`).

## 8. Constraints

**Practical.** "Avoid crossings without signals", "Avoid signals without sound", "Avoid steps", "Avoid construction", "Avoid main roads", "Only side streets", "Never … at all".
> In the mapped area, every way to viale Isonzo has at least one crossing without a signal. So no route there meets the requirement of signals at every crossing. The route with the fewest is route A, 14 minutes, with 1 crossing without a signal. Do you want me to relax the requirement to avoid when possible?

**Technical.** `POST /session/{id}/plan/constraints` ([`lotl/plan.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/plan.py)). The constraint kinds are unsignalled crossings, signals without sound, steps, construction, main roads, transfers, and walking beyond a number of minutes (the last one through the API only). The routing graph is built once per constraint set:
- **Avoid when possible** (the default) takes the shortest path on a graph without the known violations and compares it with the unconstrained shortest path. When the extra time is more than 5 minutes or 25% of the shortest route, whichever is larger, the reply states the trade-off and asks you to choose.
- **Require** ("never", "only side streets") removes the violating edges completely.

Edges with unknown data stay in the graph but are marked, so a route is called compliant only when every edge is verified. When no route qualifies, `compliant_route_available` is `no` and the reply offers to relax the requirement.

## 9. A stop on the way

**Practical.** "Stop at a pharmacy for 10 minutes", "I want a coffee on the way", "Add a supermarket", then "The first one" and "For 15 minutes".
> Supermarkets near route A: Lidl, 1 minute more on foot; NaturaSì, 8 minutes more on foot; Conad, 12 minutes more on foot. Which one, and for how long?

**Technical.** `POST .../plan/stop/candidates {kind}`, then `POST .../plan/stop {osm_id, duration_min}` ([`lotl/plan.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/plan.py)). The kinds are supermarket, pharmacy, café, bakery, cash machine and shop. The engine keeps places within 300 m of the selected route, routes the 8 with the least straight-line detour, and offers the 3 best by real detour, each with its opening hours. Adding the stop recomputes every route through it (legs to the stop, the stop itself, legs after it). On transit, the second leg departs after the stop. A new `duration_min` only changes the duration, and `osm_id: null` removes the stop.

## 10. Live guidance

**Practical.** "Let's go", "Guide me", "Stop guiding". Milo speaks without being asked:
> Guidance started to Bocconi University: 2,280 metres, about 29 minutes. Walk along via Arcivescovo Calabiana for 85 metres, then turn left onto a pavement.<br>
> In 60 metres, turn left onto a pavement. … In 25 metres, turn left onto a pavement. … Turn left now, onto a pavement.<br>
> In 30 metres, a crossing without signals: stop at the kerb and listen before you cross. … Crossing now.<br>
> You are going the wrong way. Turn around. … Good, now you are heading the right way.<br>
> You are off the route, about 90 metres from it. The route is at 5 o'clock. … New route. Walk along …<br>
> You have arrived at Bocconi University. It is at 11 o'clock, about 15 metres.

**Technical.** `POST /session/{id}/navigate {lat, lon, accuracy_m, heading_deg}`, called about once a second ([`navigate_api.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/navigate_api.py), [`lotl/navigate.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/navigate.py), [`web/src/hooks/useLiveGuidance.ts`](https://github.com/DaMa02/milo/blob/ed9c4bf/web/src/hooks/useLiveGuidance.ts)). The engine projects each fix onto the selected foot route and decides what, if anything, to say now. The cue rules are described in [architecture.md](architecture.md#live-guidance-loop).

## 11. General questions

**Practical.** "What is Bocconi known for?", "How do I add a stop?", "Search online when the library opens".
> From general knowledge, \<one to three short sentences\>.<br>
> According to \<site name\>, \<answer\>. *(after a web search)*

**Technical.** Action `chat` in `/interpret` ([`lotl/chat.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/chat.py)). Claude answers in at most three short sentences. It starts with "From general knowledge," or "According to \<site\>," and reads no URLs. Claude's web search tool is enabled only when you ask for a search ("search", "look it up", "online", "cerca"). Claude is instructed never to give directions, distances, walking times, routes or crossings, and to name the phrase that asks the engine instead. The last 6 turns are kept in memory for context. An utterance that fits no action also ends here instead of in a dead end.

## 12. Service commands

**Practical.** "Repeat", "Stop", "More", "What don't you know?", "Where does this come from?", "Help", "Faster", "Slower", "Start over".

**Technical.** These are fixed phrases in [`lotl/grammar.py`](https://github.com/DaMa02/milo/blob/ed9c4bf/server-py/lotl/grammar.py), matched with no model in about 0.05 s. The grammar also covers basic Italian ("ripeti", "basta", "più veloce"). "Faster" and "Slower" change the audio playback rate in the app, between 0.5× and 2×. "What don't you know?" reads the current result's `unknown[]`, and "Where does this come from?" reads its sources.

## 13. Live map

**Practical.** Nothing to say: the map is for a sighted companion or an observer. The blind user never needs it. Once a start point is set, the screen shows the start and, when chosen, the destination. During guidance it adds the route line, the user's position with its GPS accuracy and heading, the next instruction with its distance, and the distance and time left. After guidance stops, the last known position stays on the map, marked as paused.

**Technical.** [`web/src/components/JourneyMap.tsx`](https://github.com/DaMa02/milo/blob/ed9c4bf/web/src/components/JourneyMap.tsx) and [`web/src/components/LiveMap.tsx`](https://github.com/DaMa02/milo/blob/ed9c4bf/web/src/components/LiveMap.tsx). The map uses Leaflet with OpenStreetMap tiles and is lazy-loaded, so its code is fetched only when the map first appears. It is rendered only after a session exists. The route line is the `route_line` returned by `POST /session/{id}/navigate` at the start of guidance and after a re-route, and the next instruction and the distance and time left come from the latest guidance reply. The map is not interactive and is hidden from screen readers (`aria-hidden`, `inert`). The same journey details are written as text below it. If Leaflet fails or the tiles do not load, the map says so and the text stays readable. It never blocks the Talk button or the spoken guidance.
