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

`dev` serves the app on localhost (Vite prints the URL). `check` currently checks TypeScript and dictionary completeness, offline. Contract validation will be connected when Daniele's schema PR lands; no duplicate schema or fixture is defined here. `build` produces `web/dist/`. `preview` serves that build locally.

The development server forwards `/api/*` to FastAPI at `127.0.0.1:8000`, stripping the `/api` prefix. Production hosting must provide the equivalent reverse proxy. API credentials belong to the server and must never be placed in browser environment variables.

The initial scaffold has an English default, an Italian switch, a skip link, visible keyboard focus and a language-change announcement. Subsequent PRs connect Overview, Explore, Ask and Plan to the shared contracts. No route or map result is fabricated by the scaffold.

The browser test checks keyboard entry, language switching, reflow at 320/390/1280 CSS pixels and axe WCAG A/AA rules. It uses a local browser and no external API; the initial browser installation needs a network connection. Automated checks do not replace a manual NVDA/VoiceOver check.
