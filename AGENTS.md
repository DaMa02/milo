# AGENTS.md

Shared rules for every coding agent (Claude Code, Codex) and every human working in this repo.
Claude Code reads this file through `CLAUDE.md`; Codex reads it directly.

## Context

- BAINSA Accessibility Hackathon, Talent Garden, Milan, Saturday 26 Sep 2026.
- Build 09:30–16:30. The submission portal locks at 17:00 sharp. Judges visit our table 17:00–18:00 for a live demo.
- Track, idea, module owners and the integrator are set in `docs/one-pager.md`. **Read it before starting any task.**
- Background research and tool notes (Italian): `docs/research/`.

## Two operating systems

- Every npm script must run on macOS and Windows: no bash-only commands in `package.json`; use Node scripts for anything non-trivial. Paths via `path.join`, never hardcoded separators.
- `.gitattributes` forces LF line endings; do not commit CRLF.
- macOS-only pieces (Apple Vision OCR via `ocrmac`, MLX models) sit behind one interface in the engine with a fallback: the UI and the fixtures never depend on them.
- The demo runs on the Mac. Work on Windows is built and tested against the fixtures; to reach the real engine from another machine, expose it with a `cloudflared` tunnel.
- Screen-reader checks: VoiceOver on macOS, NVDA on Windows.

## Golden rules

1. `main` always runs the demo. Never merge code that breaks `npm run dev` or the demo path.
2. One task = one branch = one PR. Branch names: `<initials>/<module>-<slug>`, e.g. `xy/ui-table`.
3. Stay inside the module your task names. Shared files (`package.json`, lockfiles, `shared/` types, routing, env handling) change only in their own small PR, merged first; other tasks then rebase on `main`.
4. Small PRs. The description says what changed, how it was tested, which files were touched.
5. Never commit secrets. Keys live in environment variables; `.env` is gitignored; `.env.example` lists names only. Keys never reach the browser: calls to paid APIs go through `server/`.
6. No new dependency without a one-line reason in the PR. Prefer native platform features (Web Audio, Web Speech, ARIA, CSS media queries) and what is already installed.
7. If you find changes you did not make, stop and report. Never revert someone else's work.
8. Do not reformat files unrelated to your task.

## Product principles (non-negotiable)

**Our own UI must be accessible.** This is an accessibility hackathon and judges will test it.
- Semantic HTML first; ARIA only where native elements cannot do the job.
- Every flow works with the keyboard alone, with a visible focus indicator.
- Status and results that appear asynchronously are announced through `aria-live="polite"` regions (`assertive` only for true alerts).
- Contrast: text ≥ 4.5:1, UI components and chart marks ≥ 3:1. Never convey meaning by color alone.
- Respect `prefers-reduced-motion` and `prefers-contrast`; layout must survive 400% zoom.
- Every media file we ship has captions; the demo video also gets an audio-described version if time allows.
- Check key flows with a screen reader: VoiceOver on macOS (Cmd+F5), NVDA on Windows.

**Verifiability.** Our users cannot check AI output by looking or listening again.
- Every AI-generated claim shown to users carries its evidence (source text span, label, timestamp or region) and an explicit uncertainty flag.
- Never present an estimate as a fact. Deterministic checks (sums, ranges, timestamps, matching) live in code, not in prompts.
- Model outputs are parsed against a JSON schema. On failure: one retry, then a graceful fallback that says what is missing.

**Languages.** The event and the judges are international.
- UI, demo and pitch in English by default; Italian is a fully supported second language, switchable in the UI.
- UI strings live in one dictionary file per language; never hardcode user-facing text in components.
- Speech-to-text, text-to-speech and LLM steps must be multilingual. No English-only or Italian-only logic.
- Instructions to models are written in English; user content stays in its own language, and answers come back in the user's language.

**Latency.** Show partial results fast; never block the UI on a model call; stream when the API allows it.

**Privacy.** Nothing recorded or stored by default. Ask consent before recording anyone. No personal data in logs.

## Contracts, fixtures, workflow

- `contracts/` holds ONE JSON schema for the data exchanged between modules and 2–3 realistic fixtures. It is written first, by hand, by 10:15; later changes go through one dedicated PR.
- `npm run check` runs the pipeline on the fixtures with no network access. Tests and fixtures never call paid APIs.
- The integrator merges as soon as a piece works: squash-merge, `npm run check`, a manual run of the demo path. A PR that conflicts is closed and relaunched from the updated `main`.
- MVP working end to end by 12:00. Feature freeze at 14:30. Backup demo recording ready by 16:00. Submit by 16:15.
- Accessibility checks: `axe-core` in the browser; for key flows, VoiceOver or NVDA by hand (Guidepup can script both if time allows).

## Agent-to-agent channel

- The channel is GitHub, not files in the repo. A PR description is the handoff: what it does, what changed in `contracts/`, what the other side needs. Questions and answers go in that PR's comments.
- Anything not tied to a PR goes in issue #1 "Agent channel", closed before submission.
- Every agent message starts with `[claude→codex]` or `[codex→claude]`, holds one request and names the files and branch involved.
- Agents never merge each other's PRs and never change scope: people decide.

## Default stack (until `docs/one-pager.md` says otherwise)

- Frontend: Vite + React + TypeScript in `web/`.
- Backend, only when needed for secrets or streaming: Node + TypeScript in `server/`. Python only for local models, in `server-py/`.
- LLM and vision: Claude, through OpenRouter (OpenAI-compatible API), called from the server. Claude is the event's core technology: other APIs (speech-to-text, messaging) only around it.
- At most one external API besides Claude per concept.
- Node ≥ 20, npm.

## Commands

Fill in as soon as the scaffold exists:

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

## Definition of done

- Runs locally with `npm run dev`, no console errors.
- UI changes checked with the keyboard and, for key flows, with a screen reader (VoiceOver or NVDA).
- PR opened with test notes; the task list in `docs/one-pager.md` updated if scope changed.
