# contracts

JSON Schemas (draft-07) for everything the engine (`server-py/`) sends to the UI (`web/`), plus real fixtures for the demo zone.

- `fact.schema.json`: one number or named thing with its evidence; every number said to the user is a fact. Also holds shared definitions (`meta`, crossings, relative directions).
- `overview.schema.json`: the zone from a stated reference (place + facing): short `text`, `details` on "more", landmarks, barriers.
- `explore-step.schema.json`: position, heading, branches left to right, where you came from, junction stack depth, boundary flag. Request: `POST /session/{id}/explore {command, branch?}`; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost) or its name.
- `answer.schema.json`: one deterministic tool answering a question, with `unknown[]`.
- `plan.schema.json`: routes under constraints, the user's selection, a stop, what changed, `compliant_route_available`.

Engine endpoints (`server-py/`, routes at the root; the Vite dev proxy maps `/api/*` to them). All text is English (`lang: "en"`).
- `POST /session {origin?: {lat, lon, name?}, heading_deg?, lang?: "en"}` → `{session_id, overview}`; default origin Talent Garden facing north. `GET /session/{id}/overview` → Overview.
- `POST /session/{id}/explore {command, branch?, heading_deg?}` → ExploreStep; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost).
- `POST /session/{id}/ask {question, tool, params?}` → Answer. `place` = `{lat, lon, name?}` or `{name}` (resolved inside the mapped area; ambiguous or unknown names come back as an Answer asking which one); `from` defaults to the session origin. Params: `walking_vs_straight_line`, `barrier_between`, `independent_connections`: `{from?, to}`; `street_continuity`: `{street}`; `extent`: `{place}`. `{question}` alone (no `tool`) works once `dm/server-llm` lands; until then `tool` is required.
- Plan (level 2), every call returns the whole Plan:
  - `POST /session/{id}/plan {destination: place, origin?: place, depart_at?, constraints?, detour_tolerance?}` → new plan, `plan_version` 1, no selection, no stop (`fixtures/plan.initial-comparison.json`).
  - `GET /session/{id}/plan` → the current plan.
  - `POST .../plan/select {route_id, if_version?}` → `selected_route_id` set.
  - `POST .../plan/stop/candidates {kind: "supermarket", if_version?}` → `stop_candidates[]` along the selected route, best first; the plan itself is unchanged (`plan.stop-candidates.json`).
  - `POST .../plan/stop {osm_id, duration_min, if_version?}` → every route recomputed through the stop (`plan.two-foot-routes-and-transit.json`); same `osm_id` with a new `duration_min` changes the duration (`plan.stop-5-min.json`); `{osm_id: null}` removes the stop.
  - `POST .../plan/constraints {constraints, detour_tolerance?, if_version?}` and `POST .../plan/depart {depart_at, if_version?}` → plan recomputed (`plan.no-compliant-route.json` is the `require` case).
  - Every applied change increments `plan_version`, and `differences[]` says what changed since the previous version.
  - Errors: 4xx means nothing was applied and the plan is unchanged; 409 means `if_version` is stale. On a timeout or 5xx the outcome is unknown: call `GET .../plan` and compare `plan_version` before telling the user anything.

Plans with a stop: every route passes through it (legs to the stop, one `stop` leg lasting the stop, legs after it). `duration_min` runs from `depart_at` to arrival, so waits and the stop count; `leave_at` says when to leave.

Legends. `source`: `computed` engine on the map, `map_tag` read from an OSM tag, `transit_api` Transitous, `web` search result, `estimated` an estimate (always said as one), `unknown` said by the user or not backed by data. `completeness`: `unknown` when the result could depend on paths outside the downloaded area. `strength`: `avoid_when_possible` fewest known violations, compared with the shortest route; `require` routes known to violate are never offered.

Fixtures are named `<schema>.<case>.json`, English, data of 2026-09-26, `meta.mode` offline. Regenerate (Mac, needs the osmnx cache in `$TOOLS`) and validate:

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh" && python contracts/make_fixtures.py && python contracts/validate.py

`validate.py` needs only `jsonschema`; it also fails if a number in a spoken string has no matching fact.
