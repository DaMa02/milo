# BAINSA Accessibility Hackathon 2026

Team: Daniele Maglionico, Leonardo Gallo.

Project: **Lay of the Land** — understand a place before travelling, see [docs/one-pager.md](docs/one-pager.md).

## Run

Node 20.19+ or 22.12+ and npm are required.

```text
npm install
npm run dev
npm run check
npm run build
```

The web scaffold is in `web/`; [web/README.md](web/README.md) describes the development proxy and browser accessibility checks. The backend and shared contracts are being integrated in separate PRs.

## How we work

- [AGENTS.md](AGENTS.md) holds the rules for people and coding agents: one task per branch and per PR, `main` always demo-ready, accessibility and verifiability requirements.
- Environment variables are listed in [.env.example](.env.example).
- Background research and tool notes (Italian) live in [docs/research/](docs/research/).
