# WEB-1: accessible interface foundation

This application implements the independent WEB-1 card in the
[work plan](../../docs/piano-di-lavoro.md#6-step-di-lavoro). It establishes the
interaction surface for jobs J1–J4. Route planning and rehearsal are explicitly
unavailable in this preview, pending CON-1 and the MOT/DIA integration.

## Run and verify

From the repository root, with Node 22.12 or newer:

```bash
npm ci
npm run dev
npm run check
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

The browser tests start their own server on port 5217. CI installs the Linux
browser dependencies and runs the same checks. The output in `dist/` is a static
build with relative asset URLs; publication is a separate card (WEB-6).

## Interaction

- The first Tab stop is a skip link. It moves focus to the main landmark; the
  next Tab reaches the request field.
- Text entry works with native editing, including multiline input. Ctrl+Enter
  or Command+Enter submits only from the request field and ignores IME composition.
- Empty input has a linked inline error. The error is mounted before focus
  returns to the field and is also placed in the existing polite status region.
- A nonempty request receives an explicit unavailable response. Its exact text
  remains editable, and focus stays on the control used to submit it.
- There is one persistent polite live region, initially empty. Repeated
  submissions update its content; no timed speech or synthetic route result is used.
- Switching English/Italian preserves the request and focus. The document
  language and title change; TypeScript checks the two catalogues have the same keys.
- There is no app speech, microphone, GPS, storage, telemetry or external service
  call. A page reload resets the draft. This is not a claim of offline app installation.

Example transcript, with a keyboard:

> Request: I want to go to the Duomo, stopping at a pharmacy on the way, no public transport.
>
> Response: Route planning is not connected in this preview. Your request is still here; you can edit it.

The preview deliberately does not claim that it has understood, saved or calculated
the request. No geographic information is generated.

## Verification boundary

The automated suite covers the initial, invalid and unavailable states in English
and Italian with axe; landmarks, skip links and focus; multiline and IME input;
repeated submissions; loss of network after loading; 320px reflow and 200% text
enlargement; forced colours; absence of external requests, persistence and device APIs.
It runs on Chromium and iPhone-sized WebKit. Text resizing is not native browser
zoom, and WebKit emulation is not a physical iPhone or VoiceOver test.
The skip link explicitly participates in sequential focus (`tabIndex={0}`), so
standard Tab traversal includes it in both browser engines without test-only attributes.

**WEB-1 remains open until its manual screen-reader checks are recorded.** At minimum:

| Environment | Status |
|---|---|
| NVDA with Chrome or Firefox on Windows | Not yet tested |
| VoiceOver with Safari on macOS | Not yet tested |
| VoiceOver with Safari on a physical iPhone | Not yet tested |

Record the browser and screen-reader versions, the spoken transcript, and any
failure. Verify the whole sequence: page entry, headings and landmarks, skip
link, blank submission, correction, valid submission, repeated submission,
English/Italian switch, keyboard help and return to editing. Check especially
that the response is heard without stealing focus and that the error is not
spoken twice in a confusing way. Further JAWS/TalkBack coverage remains part of
the product's wider acceptance criteria.

## Integration hand-off

- `src/App.tsx` owns only preview input, language, validation and response state.
- `src/copy.ts` holds the English and Italian interface text.
- `src/styles.css` and the reused SVG preserve Milo's identity. See `DESIGN.md`.
- WEB-2 replaces the explicit unavailable response using the approved DIA-1
  integration, preserving focus and error recovery. Do not treat `ResponseState`
  as a trip or engine contract.
- Do not claim to detect screen-reader speech: no reliable detection is assumed
  here. Voice behaviour belongs to WEB-2 and must be explicitly tested.
- Shared contracts stay in CON-1, reviewed by both founders. The engine, dialogue
  and current schemas are unchanged by this card.

## Dependencies and licences

React/React DOM, Vite, its React plugin, TypeScript and React types use MIT licences.
Playwright is Apache-2.0. Axe and its Playwright integration are MPL-2.0 and used
only in tests, as called for by WEB-1. The Milo mark is reused from the MIT-licensed
hackathon source at `ed9c4bf:web/src/assets/milo-mark.svg`.
