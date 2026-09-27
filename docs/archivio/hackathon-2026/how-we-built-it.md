# How we built it

Milo was built on Saturday 26 September 2026, between the start of the build (09:30) and the submission deadline (17:00), by two people, each working with coding agents.

## Roles

- **Daniele Maglionico** built the engine (`server-py/`), the contracts and the voice back end on macOS with Claude Code. He was also the integrator who merged to `main`, because the demo runs on his Mac.
- **Leonardo Gallo** built the web app (`web/`) and the live map on Windows with Codex. He also owned the product decisions, the pitch, the presentation and the submission.

The shared rules for people and agents, and a morning plan, lived in our development repository. Pull request and issue numbers on this page refer to that repository, which is private.

## Process

- **Contracts first.** Before any feature code, we wrote JSON Schemas for every response and fixtures with real numbers from the demo area ([`contracts/`](https://github.com/DaMa02/milo/tree/ed9c4bf/contracts/)). Leonardo's side built and tested against the fixtures on Windows, and Daniele's engine had to produce the same shapes. Later contract changes went through their own small PRs.
- **One task, one branch, one PR.** Branches were named `<initials>/<module>-<slug>`, for example `dm/server-plan` or `lg/web-live-guidance`. We opened over 50 pull requests during the day. Each was squash-merged as soon as it worked, so `main` has no merge commits and was kept ready for the demo.
- **GitHub as the agent channel.** The agents coordinated through PR descriptions and comments, plus one issue (#1, "Agent channel") for everything not tied to a PR. Each message was prefixed `[claude→codex]` or `[codex→claude]`. Agents never merged each other's PRs or changed scope: the two of us decided.
- **Tests without paid APIs.** The engine tests use fake Claude clients, a mocked Photon, Transitous answers from a cache, and the OpenStreetMap graph from the local cache. Several of them fail on any network call. The browser tests replay fixtures and stub the network. `npm run check` runs with no network on macOS and Windows alike.
- **Measured, then claimed.** Numbers in our planning notes were marked either verified, with a source, or as an assumption. The latencies in the README were measured on the day.

## How the scope grew

The morning plan targeted exploration before a trip, over keyboard and text, in an 800 m zone around Talent Garden. Voice input was an optional extra, and turn-by-turn guidance was out of scope. Once that worked end to end, we added in order: local speech recognition, place search, a map of all central Milan, live guidance, a spoken interface with one Talk button, and finally shorter replies written by Claude with every number checked. The project was renamed from "Lay of the Land" to Milo along the way.
