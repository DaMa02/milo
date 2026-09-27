# AGENTS.md

Instructions for coding agents working on Milo. Humans: see [docs/piano-di-lavoro.md](docs/piano-di-lavoro.md).

## What Milo is

Milo helps blind and low-vision people **understand and rehearse a walking route before they walk it**: the area, the route under their constraints, and what they will meet at every junction and crossing, including what the map does not know. It runs in the browser, is used by typing or speaking with the user's own screen reader, and has no server of its own. Scope, decisions and work cards are in the plan (Italian): §1 scope, §2 decisions, §6 cards.

## Before you start

1. Work on **one card** from plan §6.3. Name it in the branch and PR title (e.g. `MOT-2`).
2. Check the card's scope against plan §1.3–1.5. If the change serves none of the jobs J1–J4, stop and ask.
3. Read the research reports the card cites (`docs/ricerca/2026-09-27/`). They are sources, not specs: the plan wins where they disagree.

## Non-negotiables

- **Every number comes from the engine.** A language model may interpret what the user said and reword an answer. It never computes a distance, direction or route, and never adds a place. Model text passes the number check (`speak.ts` in `packages/assistant`, later `packages/dialogue`).
- **Say what the map does not know.** Never infer "no sound signal" from a missing tag.
- **Inform, never command.** No "cross now", no "you can cross".
- **Screen reader first.** Everything works by keyboard with NVDA, JAWS, VoiceOver and TalkBack. Milo's own voice never talks over the screen reader.
- **User data stays in the browser.** No accounts, no analytics, no logging of what users say or where they go. Only what plan §5.4 lists may leave the browser.
- **Contracts change only through a PR that both founders approve** (plan §5.3).
- **Licences:** MIT-compatible code only in the app. No GPL/AGPL, no non-commercial models or datasets in what ships (reports N, O, P).
- **Never commit keys.** Use your own key in local env vars. Tests never call a paid API.
- **Speaking rules** in [docs/speaking-rules.md](docs/speaking-rules.md) bind every template and prompt.

## Repository

| Path | What |
|---|---|
| `packages/engine` | Deterministic walking engine on OpenStreetMap (TypeScript). Runs in the browser and in Node |
| `packages/assistant` | Hackathon dialogue code: one action per utterance. To be renamed `packages/dialogue` and rebuilt by the DIA cards |
| `contracts/` | JSON Schemas of engine results (draft-07), validated by the engine tests |
| `docs/` | Plan, research, speaking rules |
| `server-py/`, `web/` | **Hackathon code, do not build on it.** Being archived (plan D12); the snapshot is commit `ed9c4bf` |

Planned (plan §5.2): `apps/web`, `packages/contracts`, `packages/eval`, `eval/`.

## Checks

```bash
npm ci
npm run check   # type-check and tests of every workspace
```

Every PR must pass `npm run check`. Engine changes keep the parity and golden tests green, or update them with a reason in the PR.

## Pull requests

Fill in the PR template:
- the card;
- what changed and why;
- the blind-impact check of plan §3.1;
- the evidence (tests run, a spoken or textual transcript for user-facing changes, and screen reader and browser for UI changes);
- the licences added;
- a hand-off note: state, next step, traps.

The other founder reviews every PR.
