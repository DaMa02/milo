# BAINSA Accessibility Hackathon 2026

Team: Daniele Maglionico, Leonardo Gallo.

Project: **Lay of the Land** — understand a place before travelling, see [docs/one-pager.md](docs/one-pager.md).

## Run

Node 20.19+ or 22.12+ and npm are required.

Contract checks also require Python 3.9+ with `jsonschema` installed. Install it in your chosen Python environment with `python -m pip install jsonschema` (use that environment's executable if it has another name).

```text
npm install
npm run dev
npm run check
npm run build
```

`npm run check` validates the shared contract fixtures before TypeScript and the unit tests. Run `npm run check:contracts` for contract validation alone. The checks do not install packages or access the network.

To choose a Python environment explicitly, set `BAINSA_PYTHON` to its executable path; an invalid override fails without falling back. Otherwise the launcher tries `VIRTUAL_ENV`, the repository `.venv`, then `python3` and `python` on PATH, selecting the first Python 3.9+ environment with `jsonschema` available. Environment variables must be set in the shell; the launcher does not read `.env` files.

The web scaffold is in `web/`; [web/README.md](web/README.md) describes the development proxy and browser accessibility checks. The backend and shared contracts are being integrated in separate PRs.

## How we work

- [AGENTS.md](AGENTS.md) holds the rules for people and coding agents: one task per branch and per PR, `main` always demo-ready, accessibility and verifiability requirements.
- Environment variables are listed in [.env.example](.env.example).
- Background research and tool notes (Italian) live in [docs/research/](docs/research/).
