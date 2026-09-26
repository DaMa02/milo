# server-py: the Lay of the Land engine

Deterministic engine for level 1: overview of the zone, virtual walk junction to junction, and five questions answered from the OpenStreetMap walk graph of Porta Romana. Every response follows `contracts/*.schema.json` and every spoken number is a fact.

Run on the Mac (the graph comes from the osmnx cache in `$TOOLS`: 1.5 km around Talent Garden, answers within 800 m; about 6 s to load at startup, no network):

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh" && cd server-py && uvicorn app:app --port 8000

Endpoints (at the root; the Vite proxy strips `/api`): `GET /health`; `POST /session {lang?, origin?: {lat, lon, name?}, heading_deg?}` -> `{session_id, overview}`; `GET /session/{id}/overview`; `POST /session/{id}/explore {command, branch?, heading_deg?}` with command `start | forward | left | right | take | back | home | where` (`take` needs `branch`: index in the previous step's branches, 0 = leftmost, or its name); `POST /session/{id}/ask {question, tool?, params?}` with one of the five tools; without `tool`, Claude (`claude-opus-5-5`, effort low) picks the tool and copies the place names from the question, and the answer still comes from the deterministic tools (no tool fits: a fixed text listing what can be asked). Unknown session 404, bad input 422; a place the engine cannot use (unknown, ambiguous, outside the area or malformed) comes back as a question in the Answer text, status 200. Sessions live in memory only.

Test (no pytest; validates every response against the contracts, number rule included):

    python tests/test_api.py

Question-only ask needs the event key and workspace from the Keychain (never in a file):

    ANTHROPIC_API_KEY=$(~/.claude/bin/secret ANTHROPIC_EVENT_API_KEY) ANTHROPIC_WORKSPACE_ID=$(~/.claude/bin/secret ANTHROPIC_EVENT_WORKSPACE_ID) uvicorn app:app --port 8000

Without them the engine still runs; a question without `tool` gets the fixed list of what can be asked.
