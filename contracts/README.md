# contracts

JSON Schemas (draft-07) for everything the engine (`server-py/`) sends to the UI (`web/`), plus real fixtures for the demo zone.

- `fact.schema.json`: one number or named thing with its evidence; every number said to the user is a fact. Also holds shared definitions (`meta`, crossings, relative directions).
- `overview.schema.json`: the zone from a stated reference (place + facing): short `text`, `details` on "more", landmarks, barriers.
- `explore-step.schema.json`: position, heading, branches left to right, where you came from, junction stack depth, boundary flag. Request: `POST /session/{id}/explore {command, branch?}`; `take` needs `branch`, the index in the previous step's `branches[]` (0 = leftmost) or its name.
- `answer.schema.json`: one deterministic tool answering a question, with `unknown[]`.
- `plan.schema.json`: routes under constraints, the user's selection, a stop, what changed, `compliant_route_available`.

Legends. `source`: `computed` engine on the map, `map_tag` read from an OSM tag, `transit_api` Transitous, `web` search result, `estimated` an estimate (always said as one), `unknown` said by the user or not backed by data. `completeness`: `unknown` when the result could depend on paths outside the downloaded area. `strength`: `avoid_when_possible` fewest known violations, compared with the shortest route; `require` routes known to violate are never offered.

Fixtures are named `<schema>.<case>.json`, English, data of 2026-09-26, `meta.mode` offline. Regenerate (Mac, needs the osmnx cache in `$TOOLS`) and validate:

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh" && python contracts/make_fixtures.py && python contracts/validate.py

`validate.py` needs only `jsonschema`; it also fails if a number in a spoken string has no matching fact.
