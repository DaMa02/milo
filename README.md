# Milo — development

Milo helps blind and low-vision people understand and rehearse a walking route before leaving home. This branch contains the next version of the project, following the [work plan](docs/piano-di-lavoro.md).

**The new web app is an interface preview. It cannot calculate or rehearse a route yet.** It provides the keyboard and screen-reader structure for card WEB-1. The engine and dialogue are not connected to it; submitting a request explains this and preserves the text for editing.

The [hackathon application on `main`](https://github.com/DaMa02/milo/tree/main) remains available separately. The archived source is also preserved at commit [`ed9c4bf`](https://github.com/DaMa02/milo/tree/ed9c4bf31942bd1a2f01dced5e438007fee6456a).

## Run the interface preview

Use Node 22.12 or newer (CI uses Node 24), then run from the repository root:

```bash
npm ci
npm run dev
```

Open the local address printed by Vite. The preview needs no server, API key, microphone or location permission. It makes no external service calls. Requests remain in memory and are lost when the page is reloaded or closed.

- Enter a request, then use **Send request** or Ctrl+Enter (Command+Enter on macOS).
- Use Tab and Shift+Tab to move between controls. The first link skips to the main content.
- Choose English or Italian without losing the request.
- Responses use one polite live region; the application does not play speech.

See [the web app README](apps/web/README.md) for scope, verification and integration notes.

## Check and build

```bash
npm run check
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

The checks cover workspace types and the existing engine/dialogue tests. Browser checks run against the web preview in Chromium and WebKit, including axe accessibility checks. They do not replace testing with NVDA, JAWS, VoiceOver or TalkBack. No test calls a paid API.

## Project structure

| Path | Contents |
|---|---|
| `apps/web/` | React and Vite interface preview: keyboard input, response announcements, English and Italian |
| `packages/engine/` | Deterministic TypeScript engine, with tests against the Python prototype's recorded results |
| `packages/dialogue/` | Existing dialogue code; redesign depends on the shared contracts |
| `contracts/` | Current engine schemas and fixtures |
| `eval/seeds/hackathon/` | 188 recovered utterances for the future development corpus |
| `docs/` | Work plan, research and speaking rules |
| `docs/archivio/hackathon-2026/` | Documentation and interaction rules from the prototype |

## Next integration steps

The [plan, section 6](docs/piano-di-lavoro.md#6-step-di-lavoro) defines the work cards and dependencies. WEB-1 can be developed independently. The next conversation and rehearsal screens depend on DIA-1 and MOT-2, after both founders approve CON-1. This preview introduces no replacement contracts.

The manual NVDA and VoiceOver checks required to close WEB-1 are still pending. [AGENTS.md](AGENTS.md) describes the review and evidence required for each PR.

## Team and licence

Built by [Daniele Maglionico](https://github.com/DaMa02) and [Leonardo Gallo](https://github.com/Leoldo), starting at the BAINSA Accessibility Hackathon 2026.

[MIT](LICENSE). Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.
