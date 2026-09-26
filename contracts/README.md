# contracts

JSON Schemas (draft-07) for everything the engine (`server-py/`) sends to the UI (`web/`), plus real fixtures for the demo zone.

- `fact.schema.json`: one number or named thing with its evidence; every number said to the user is a fact. Also holds shared definitions (`meta`, crossings, relative directions).
- `overview.schema.json`: the zone from a stated reference (place + facing): short `text`, `details` on "more", landmarks, barriers.
- `explore-step.schema.json`: position, heading, branches left to right, where you came from, junction stack depth, boundary flag. Request: `POST /session/{id}/explore {command, branch?}`; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost) or its name.
- `answer.schema.json`: one deterministic tool answering a question, with `unknown[]`.
- `plan.schema.json`: routes under constraints, the user's selection, a stop, what changed, `compliant_route_available`.

Engine endpoints (`server-py/`, routes at the root; the Vite dev proxy maps `/api/*` to them). All text is English.
- `POST /session {origin?: {lat, lon, name?}, heading_deg?, lang?: "en"}` → `{session_id, overview}`; default origin Talent Garden facing north. `GET /session/{id}/overview` → Overview.
- `POST /session/{id}/explore {command, branch?, heading_deg?}` → ExploreStep; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost).
- `POST /session/{id}/ask {question, tool, params?}` → Answer. Plan endpoints follow in level 2.

Plans with a stop: every route passes through it (legs to the stop, one `stop` leg lasting the stop, legs after it); `duration_min` runs from `depart_at` to arrival, so waits and the stop count; `leave_at` says when to leave.

Legends. `source`: `computed` engine on the map, `map_tag` read from an OSM tag, `transit_api` Transitous, `web` search result, `estimated` an estimate (always said as one), `unknown` said by the user or not backed by data. `completeness`: `unknown` when the result could depend on paths outside the downloaded area. `strength`: `avoid_when_possible` fewest known violations, compared with the shortest route; `require` routes known to violate are never offered.

Fixtures are named `<schema>.<case>.json`, English, data of 2026-09-26, `meta.mode` offline. Regenerate (Mac, needs the osmnx cache in `$TOOLS`) and validate:

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh" && python contracts/make_fixtures.py && python contracts/validate.py

`validate.py` needs only `jsonschema`; it also fails if a number in a spoken string has no matching fact.
