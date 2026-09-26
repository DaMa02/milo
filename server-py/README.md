# server-py: the Milo engine

Deterministic engine for level 1: overview of the zone, virtual walk junction to junction, and six questions answered from the OpenStreetMap walk graph of central Milan (`LOTL_ZONE=porta-romana` loads the small Porta Romana test zone instead). Every response follows `contracts/*.schema.json` and every spoken number is a fact.

Run from the repo root (the graph is cached by osmnx in `$TOOLS`: 4 km around the centre of Milan; the first start downloads it from OpenStreetMap, later starts load it from the cache):

    source .venv/bin/activate && cd server-py && uvicorn app:app --port 8000

Endpoints (at the root; the Vite proxy strips `/api`): `GET /health`; `POST /session {lang?, origin?: {lat, lon, name?}, heading_deg?}` -> `{session_id, overview}`; `GET /session/{id}/overview`; `POST /session/{id}/explore {command, branch?, heading_deg?}` with command `start | forward | left | right | take | back | home | where` (`take` needs `branch`: index in the previous step's branches, 0 = leftmost, or its name); `POST /session/{id}/ask {question, tool?, params?}` with one of the six tools; without `tool`, Claude (`claude-opus-5-5`, effort low) picks the tool and copies the place names from the question, and the answer still comes from the deterministic tools (no tool fits: a fixed text listing what can be asked). Unknown session 404, bad input 422; a place the engine cannot use (unknown, ambiguous, outside the area or malformed) comes back as a question in the Answer text, status 200. Sessions live in memory only.

Test from `server-py/` (no pytest; validates every response against the contracts, number rule included):

    python tests/test_api.py

Question-only ask needs an Anthropic API key, plus `ANTHROPIC_WORKSPACE_ID` when the key is not scoped to a workspace. Keep them in your OS keychain or secrets manager and export them before starting the engine, never in a file (macOS example):

    export ANTHROPIC_API_KEY="$(security find-generic-password -s ANTHROPIC_API_KEY -w)"
    uvicorn app:app --port 8000

Without them the engine still runs; a question without `tool` gets the fixed list of what can be asked.
