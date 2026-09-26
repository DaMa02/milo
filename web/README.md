# Web application

From the repository root, with Node 20.19+ (or 22.12+) and npm:

```text
npm install
npm run dev
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`dev` serves the app on localhost (Vite prints the URL). `check` validates the shared fixtures (Python with `jsonschema`), TypeScript and dictionary completeness, offline. `build` produces `web/dist/`. `preview` serves that build locally.

The development server forwards `/api/*` to FastAPI at `127.0.0.1:8000`, stripping the `/api` prefix. Production hosting must provide the equivalent reverse proxy. API credentials belong to the server and must never be placed in browser environment variables.

## Overview and exploration

Open the saved example to hear or read the shared Porta Romana overview. The short result is followed by optional detail, explicit map gaps and evidence links. Explore from the start, use forward to reach the first recorded junction, return to the previous junction or the start, and ask where you are. Every branch is listed in the engine's order, with its crossing properties. Selecting the start's branch at 11 o'clock reaches the recorded first junction; other unrecorded branches report unavailable and retain the current position. The saved adapter replays the exact shared fixtures; it does not simulate a graph or invent further movement.

The app is English only, as confirmed by Leo and Daniele. The earlier dictionaries remain as inactive assets. The connected data source uses the session endpoints in contracts/README.md: one server session is reused for overview, exploration and questions. The default remains the explicitly saved example. Requests have a 20-second limit. After an uncertain exploration outcome, Where am I must confirm the server position before another movement. A live failure will never silently switch to a saved response.

All actions work through native buttons or text commands. Numbered branch buttons remain visible without opening the street details; `take 2` follows the second listed branch (the API receives index 1). The short narration keeps the full initial reference, including any mapped offset from the origin to the first junction. An unavailable action keeps focus; a selected branch that changes the list returns focus to the result heading. A persistent polite live region announces results and errors. The app's speech is optional: listen, stop and repeat are available; automatic reading is off by default and suppresses duplicate result announcements when enabled. No microphone or recording is used.

## Questions

Ask is available under both views and preserves the virtual position. Choose one of the five question types and enter a place/street and your question. Named places are resolved by the engine; the browser does not guess coordinates or interpret free text. Questions use the session origin, explicitly stated as Talent Garden, rather than the virtual position. Full natural-language tool selection follows the server LLM endpoint.

The three saved question buttons replay exact canonical fixtures, including uncertainty and sources. Other requests are unavailable in saved mode. During a request the next question can be drafted without changing the submitted question; a response labels the question it answered and does not move focus or replace that draft. Errors keep the input and allow retry. Unsupported questions returned with tool none retain the five question choices.

## Journey planning

Plan your trip opens the confirmed trip separately from virtual exploration. The editable fields are drafts; submission sends the documented Plan request. Departure uses Milan local time and is converted to a precise instant, rejecting ambiguous or nonexistent daylight-saving times. An arrival deadline is not treated as a departure time.

Alternatives show total elapsed time (including waiting and shopping), total walking, transfers, timestamps, per-constraint satisfied/violated/unknown status and details. Opening details does not select a route. Only Choose route changes the selected ID. All seven constraints offer no preference, avoid when possible or require; known violations of requirements fail the response guard.

A chosen route can search for supermarkets, add a stop, change its duration or remove it. The engine supplies every detour and recalculated route. The confirmed journey summary includes the selected route, times, stop, constraints, unknowns and the original area reference/overview, and remains available when returning to exploration. Opening hours are explicitly unverified.

Mutations send if_version and run serially. A 4xx leaves the previous plan and its old parameters visible. After a 409, lost response or server failure the app reads the authoritative Plan before enabling another mutation. If that read also fails, the last confirmed plan remains labelled and Refresh current plan is available. A unchanged recovered version never announces historical differences as a new change. Stopping speech during a pending request suppresses the forthcoming automatic reading and does not cancel the calculation.

Saved planning replays only canonical routing results: the recorded departure and places, initial A/B/C selection, route A supermarket search, Lidl for 15 or 5 minutes, removal and the recorded unsignalled-crossings require/relax case. Other changes—including different supermarkets or changing routes after a stop—report unavailable without changing the confirmed plan. Selection and revision tracking are local user state; no new geographic result or transit time is calculated in the browser.

Browser tests cover the complete recorded party story by keyboard, separate exploration origin/route selection, requirements, stop changes, 422/503 errors, authoritative recovery, blocked uncertain writes, delayed responses with editable drafts, route reordering and independent speech stop. Transport failures/delays and speech are simulated; route facts come from canonical fixtures. A real engine run still needs the server on the Mac or a local installation; these tests do not claim live backend or manual screen-reader validation.

Browser tests check keyboard entry and movement, focus, navigation between views without losing position, offline misses, speech cancellation/repeat/errors, transport failures, reflow at 320/390/1280 CSS pixels and axe WCAG A/AA rules. They use a local browser and no external API; the initial browser installation needs a network connection. Speech tests stub the browser voice engine to verify event handling, not the quality of an installed voice. Automated checks do not replace a manual NVDA/VoiceOver check.

## Optional live engine checks

`web/tests/live-engine.spec.ts` is skipped by default. With the deterministic engine available on port 8000 (or a local bridge to the agreed Mac tunnel), set `LOTL_LIVE_ENGINE=1` and run `npx playwright test web/tests/live-engine.spec.ts`. These tests use real browser requests through the Vite proxy: session, exploration with a chosen branch and return path, five explicit question tools, ambiguous/missing names and the stable trip origin after virtual movement. They do not call a language model. Local engine installation needs Python 3.11 or later for the pinned OSMnx dependency. Keep live tests separate from the offline fixture suite.
