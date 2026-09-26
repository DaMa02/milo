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

`dev` serves the app on localhost (Vite prints the URL). `check` checks TypeScript and dictionary completeness, offline. Until the dedicated command integration lands, also run `python contracts/validate.py` (Python with `jsonschema`). `build` produces `web/dist/`. `preview` serves that build locally.

The development server forwards `/api/*` to FastAPI at `127.0.0.1:8000`, stripping the `/api` prefix. Production hosting must provide the equivalent reverse proxy. API credentials belong to the server and must never be placed in browser environment variables.

## Overview and exploration

Open the saved example to hear or read the shared Porta Romana overview. The short result is followed by optional detail, explicit map gaps and evidence links. Explore from the start, use forward to reach the first recorded junction, return to the previous junction or the start, and ask where you are. Every branch is listed in the engine's order, with its crossing properties. Selecting the start's branch at 11 o'clock reaches the recorded first junction; other unrecorded branches report unavailable and retain the current position. The saved adapter replays the exact shared fixtures; it does not simulate a graph or invent further movement.

The app is English only, as confirmed by Leo and Daniele. The earlier dictionaries remain as inactive assets. The HTTP boundary and structural guards are ready for engine integration; PR #8 documents the session endpoints. A live failure will never silently switch to a saved response.

All actions work through native buttons or text commands. An unavailable action keeps focus; a selected branch that changes the list returns focus to the result heading. A persistent polite live region announces results and errors. The app's speech is optional: listen, stop and repeat are available; automatic reading is off by default and suppresses duplicate result announcements when enabled. No microphone or recording is used.

Ask and Plan follow in separate frontend PRs. This PR does not claim free exploration beyond the recorded steps or a completed live engine integration.

Browser tests check keyboard entry and movement, focus, navigation between views without losing position, offline misses, speech cancellation/repeat/errors, transport failures, reflow at 320/390/1280 CSS pixels and axe WCAG A/AA rules. They use a local browser and no external API; the initial browser installation needs a network connection. Speech tests stub the browser voice engine to verify event handling, not the quality of an installed voice. Automated checks do not replace a manual NVDA/VoiceOver check.
