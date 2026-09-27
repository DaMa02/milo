# K: Sighted-helper view, live sharing, Be My Eyes / Aira
Research date: 27 Sep 2026. Tags: [V] verified in a primary source I fetched; [P] secondary source; [U] could not verify. Bracketed numbers point to Sources; letters (A–J, U, V) point to the other reports in this folder. Effort figures are my estimates, not measurements.

## Key findings

1. **Be My Eyes offers third-party apps no SDK or API** [U]. I found none in its site, business pages or searches, and V reached the same result. What does exist is undocumented:
   - The app claims universal links on `share.bemyeyes.com`, including `/volunteers/call`, `/group/*`, `/organization/*/call` and `/open-app` [V 6]. On Android, `assetlinks.json` delegates the same domain to `com.bemyeyes.bemyeyes` [V 7]; whether the app's intent filters actually verify these paths is untested [U].
   - Custom URL schemes: `org.bemyeyes.BeMyEyes://` on iOS and `com.bemyeyes.bemyeyes://` on Android, listed in the config of Be My Eyes' own directory website [V 8].
   - What `/volunteers/call` does when tapped is unknown [U]. Without the app installed it redirects to `/open-app` (checked with curl).
2. **Volunteers see only the camera.** The call is "one-way video (two-way audio)" [V 1], and "volunteers only hear your voice and see what you share through your camera" [V 2]. They get no location and no app screen.
   - Calls are recorded, and may be licensed to research and AI developers. Users can opt out by email [V 3].
   - So the only way Milo's state reaches an anonymous volunteer is through the user's own voice.
3. **The realistic Be My Eyes integration is the one the brief guessed:**
   - a short spoken summary;
   - a one-tap or voice hand-off (volunteer, group or contact);
   - Milo silent during the call;
   - a re-orientation when the call ends.

   Friends and family in a Be My Eyes group can also be sent Milo's live link through another channel.
4. **Aira agents already see more than volunteers**: GPS at the start of the call, maps and the camera [V 12]. On iPhone the user can also share their screen with the agent from the Aira app [V 13]. Aira does not operate in Italy (V §2.2), so it matters only for English-speaking testers.
5. **Screen sharing from Milo is a dead end.**
   - Android needs fresh consent for every capture session. From Android 15 QPR1, "screen projection automatically stops when the device screen is locked" [V 15], which is Milo's normal state.
   - iOS needs a separate broadcast extension target [V 17], with a 50 MB memory cap [P 18].
   - Sending about 1 KB of state and drawing it in a browser works with the screen locked and can be end-to-end encrypted.
6. **The proven live-share pattern is a time-boxed link that opens in any browser.**
   - Google Maps link shares last at most 24 h [V 25].
   - Glympse viewers need no app, and expired shares are deleted after 48 h [V 30].
   - Apple Check In encrypts location with a key Apple never holds [V 26].

   For Milo:
   - a random AES-GCM key in the URL fragment, which browsers never send to the server [V 32];
   - a relay of about 200 lines inside the VPS gateway;
   - server-sent events (SSE) to push updates to viewers.
7. **What remote helpers struggle with** is locating the user, knowing which way they face, and judging distance from video [V 38][P 37]. A dot on a map is not enough: the view must show GPS accuracy, heading and the distance to the next crossing as text.
8. **Remote O&M has clear limits.** Specialists judged street crossings and community travel unsuitable for remote teaching, and only 20% found telepractice satisfactory [V 40, 41]. Instructors would gain from **route preview and trip replay**, not a live remote-control view.
9. **tile.openstreetmap.org does allow normal interactive viewing** by an identified app or web page. It forbids prefetch and offline use, offers no SLA, and "may block access, without notice" [V 42].
   - For the live link the stronger argument is privacy: tile requests reveal where the user is.
   - Self-host a Protomaps PMTiles extract on the VPS and draw it with MapLibre GL JS [V 44–46, 51].
10. **MVP:**
    - the on-phone helper card, the hand-off and the summary. None of these needs a server.
    - Next: the encrypted live link as soon as the VPS exists.
    - Later: messages from helpers, a QR hand-off, O&M replay and a check-in mode.
    - Not planned: screen sharing, and video calls inside Milo.

## 1. Three helpers, three different needs

| Mode | Who | Typical moment | What they need | Channel |
|---|---|---|---|---|
| (a) Next to the user | Passer-by, companion, shop staff | Arrival, "I'm lost", before a crossing | Where the user wants to go, **in the helper's language**; next step; next crossing; nothing to tap | The user's phone screen |
| (b) Remote, known | Family, friend, O&M instructor | Whole trip, or on request | Position with accuracy, heading, route, next crossing facts, status, freshness, battery; what Milo said and understood | A web link, no install |
| (c) Remote, unknown | Be My Eyes volunteer or company agent, Aira agent | Finding the door, lost, reading signs | A 2–3 sentence context from the user, then the camera | Their own app |

Two points the brief did not anticipate:
- **Language.** Milo will speak English, but a passer-by in Milan speaks Italian. The card should use the local language, with a toggle. The engine already has `en` and `it` (`packages/engine/src/i18n`).
- **Touch.** With TalkBack or VoiceOver on, a sighted person who taps the screen gets focus changes, not actions. Mode (a) must work with no touch at all.

## 2. Be My Eyes in 2026: what a third-party app can actually use

### 2.1 Inventory

| Item | Status | Tag | Use for Milo |
|---|---|---|---|
| SDK or API to start a call, pass context or show app state | None found | [U] | – |
| Universal links | AASA files on `share.bemyeyes.com` and `profiles.bemyeyes.com` list `/volunteers/call`, `/group`, `/group/*`, `/organization/*/call`, `/catalog/*/call`, `/invite/*`, `/open-app`, `/rbm-key/*` for app ID `VS2JRRGV67.org.bemyeyes.BeMyEyes`. `assetlinks.json` delegates the domain to `com.bemyeyes.bemyeyes` | [V 6, 7] | Hand-off to a volunteer or a group, if the links behave as named. Test first |
| Custom schemes | `org.bemyeyes.BeMyEyes://` (iOS) and `com.bemyeyes.bemyeyes://` (Android), in the directory site's runtime config | [V 8] | Fallback that just opens the app |
| Groups ("friends and family") | Up to 20 people per group and 5 groups. The call goes to "the first available person", not to a random member [V 4, 5]. Joined by invite link. Free | [V 4] (Dec 2023 post; "first available member" restated Mar 2026 [V 5]) | The natural circle for Milo's live link |
| Groups on Meta glasses | Voice calls to groups and companies, announced 11 Mar 2026 | [V 5], V §2.1 | Milo's audio must also pause for glasses calls |
| Service Directory | Companies' own agents. Profile pages at `call.bemyeyes.com/service-directory/profile/<slug>` [V 8]; 600+ companies at launch, 18 Mar 2024 [V 9]. Barilla's QR codes on pasta boxes connect the scanner "instantly… to Barilla experts through the Be My Eyes app" (Barilla release, Oct 2022) [V 10], which shows that links into a specific call work | [V 8, 9, 10] | Later: "Tesco has a Be My Eyes line; call them?" at arrival (V) |
| Workplace | Screen sharing and remote control with colleagues, for desktop, sold to organisations (announced 11 Feb 2026) | [V 11] | Not for walking |
| Integrations found | Meta glasses; contact-centre platforms; Microsoft's Disability Answer Desk (V §2.1) | [P] | **No navigation app integration found** [U] |

### 2.2 What the volunteer sees, and what follows

- **Camera and voice only.** Calls are matched by language and time zone and are anonymous [V 1, 2, 3].
- **Recording.** Be My Eyes "record[s] and store[s] video calls… to improve our Services and create new Services". It "may license or otherwise share recorded video calls" with organisations developing products, "including AI". Users can opt out and ask for deletion by email [V 3].

Consequences for Milo:
1. Never send a live link to an anonymous volunteer.
2. The summary names the destination and the nearest junction, never the user's home address.
3. Tell users about the recording once, in the hand-off settings. Link to Be My Eyes' policy, and do not paraphrase it later.

### 2.3 Recommended hand-off flow

1. **Trigger.**
   - Voice: "call a volunteer", "call my family group", "call Anna".
   - A button on the main screen.
   - An offer from Milo at arrival when the door is not found (plan, arrival mode), or after a long time off route.
   - This is G's `handoff_to_human` tool, extended with `show_card` and `summary`.
2. **Summary, spoken once and repeatable** ("what do I tell them?"). At most three sentences, every number from the engine and checked by `speak.ts` (G). The street side is given only when reliable (plan). Example:
   > "I'm on Corso Buenos Aires, east side, about 20 metres before Via Morelli. I'm walking to Farmacia Centrale, Via Torino 5. Next I cross Via Morelli: traffic lights, sound signal unknown. GPS accuracy about 10 metres."
3. **Launch the helper app.**
   - **Android:**
     - Open `https://share.bemyeyes.com/volunteers/call` (or the group link) as a VIEW intent. If the app's intent filter is verified for that path, the link goes straight to the app; otherwise it opens the browser at `/open-app`. Test first.
     - Fallback: the launch intent for `com.bemyeyes.bemyeyes`. That package must be declared in `<queries>` on Android 11+ [V 23].
     - Last fallback: the Play Store page.
   - **iOS:** open the universal link. Fallback: `org.bemyeyes.BeMyEyes://`, then the App Store.
   - **A contact:**
     - `tel:` with `ACTION_DIAL`, which "shows a UI with the number being dialed, allowing the user to explicitly initiate the call". The reference tells apps to prefer it over `ACTION_CALL`, which is restricted and needs `CALL_PHONE` [V 57].
     - FaceTime: `facetime://…`, which "initiates the call without prompting the user" when opened from a native app [V 24]. That page is in Apple's archived documentation, so confirm the behaviour on current iOS.
     - WhatsApp: no documented deep link to start a call [U].
4. **Silence during the call.**
   - **Android does not mute Milo for you.** Its automatic muting during calls covers only `USAGE_MEDIA`/`USAGE_GAME` players, and only for incoming telephony calls [V 19]. Milo speaks through a navigation stream (D) and a Be My Eyes call is VoIP, so Milo must mute itself.
   - **Android detection:**
     - `AudioManager.getMode()` returns `MODE_IN_COMMUNICATION` ("an audio/video chat or VoIP call is established") or `MODE_IN_CALL`;
     - `addOnModeChangedListener` (API 31) reports changes [V 21];
     - audio-focus loss as a second signal.
   - **iOS detection:** "any app can create a new CXCallObserver object to be notified of any calls activity on the system" [V 22]. Whether Be My Eyes' outgoing calls go through CallKit is [U]. Test it, and fall back to audio-session interruptions.
   - **Milo can't hear the user during a call.** On Android 10+, while a call is active (`MODE_IN_CALL` or `MODE_IN_COMMUNICATION`) "the call always receives audio", and only an accessibility service or a privileged pre-installed app may capture alongside it. An ordinary app like Milo gets silence [V 20]. That is why the summary comes before the call.
   - Keep logging position during the call. Speak nothing. An optional haptic for "off route" stays off by default.
5. **After the call:** "Welcome back. You are on Via Torino, 30 metres from the pharmacy." Re-route if the user moved.

**Effort:** 3–5 days for the Android and iOS native parts and the device tests.

**Ask Be My Eyes:**
- written confirmation that `/volunteers/call` and the group links are stable and may be used;
- whether a context line could ever be shown to *group* members, never to anonymous volunteers.

This fits the Be My Eyes Foundation opening described in V.

## 3. Aira

- **What agents see:**
  - "access to your GPS position at the start of your call", plus maps and the phone camera [V 12];
  - older descriptions: a dashboard with Google Maps (satellite and Street View) and a user profile noting cane or dog and the detail they like [P 14].
- **Screen sharing:** "Our mobile app is limited to screen sharing on iPhones or iPads" [V 13].
- **No public SDK or URL scheme found** [U]. Coverage: US, CA, UK, AU, NZ, IE; not Italy (V §2.2).
- **For Milo:**
  - the same hand-off: open the Aira app through its launch intent or store link, with the same summary;
  - on iPhone the user can show Milo's helper card through Aira's own screen sharing, at no cost to us.
  - Low priority: test only if an English-speaking tester already uses Aira.

## 4. Why not share the screen

| Platform | Requirement | Consequence for Milo |
|---|---|---|
| Android 14+ | Consent for **each** capture session; the token works once; a `mediaProjection` foreground service is required [V 15, 16] | A consent dialog on every share |
| Android 15 QPR1+ | "Screen projection automatically stops when the device screen is locked" [V 15] | Fails in a pocket, which is the normal walking state |
| Android 14+ | Single-app sharing hides notifications [V 15] | Good for privacy, but it doesn't solve the lock problem |
| iOS | In-app capture only while in the foreground. System-wide capture needs a Broadcast Upload Extension plus an App Group [V 17] | An extra native target, with a hard memory cap of about 50 MB [P 18] |
| React Native | react-native-webrtc 124.0.8 (MIT, Jul 2026) supports screen capture and has shipped the MediaProjection service since 118.0.2 [V 16, 51] | Technically possible, but it needs a video relay (SFU/TURN), costs battery and data, and exposes everything on screen |

**Verdict:** sync state, not pixels. The one exception costs nothing: Aira's iOS screen share.

## 5. Live location sharing

### 5.1 How existing products do it

| Product | Viewer needs | Duration | Server can read? | Worth copying |
|---|---|---|---|---|
| Google Maps | Gmail account for contact shares; a link works without one | **Link: up to 24 h** [V 25] | Yes [U] | Shows battery level and whether it's charging [V 25] |
| Apple Check In | iPhone | Timer or destination; extend by 15, 30 or 60 min [V 27] | **No.** The key sits in a held iMessage, released only if the user doesn't arrive, stops progressing or goes offline past expiry [V 26] | Share *only on trouble*. Limited level (location, battery, signal) vs Full (route travelled) [V 27] |
| Apple Share ETA | iMessage, or SMS for non-iPhones | One trip | – | ETA only, updated on significant delay [P 28] |
| WhatsApp live location | WhatsApp | 15 min, 1 h or 8 h [P 29] | No, end-to-end encrypted [P 29] | A hard cap of 8 h |
| Glympse | **Any browser, "no app needed to view"** [V 30]; no account [U] | 5 min–4 h [P 30] | Yes | "Expired Glympses remain visible for 48 hours before they are permanently deleted" [V 30] |
| Hauk (open source) | Browser | Set by the sharer | Optional end-to-end encryption with a password (app setting "Enable end-to-end encryption") [V 31] | On the demo server, "location data is never logged to disk… only stays in RAM" [V 31], although its web server still keeps a 7-day access log with full URLs [V 31]; "last update X ago" |

### 5.2 Design for Milo's live link

- **Link:** `https://<milo-domain>/v/<id>#k=<key>`.
  - `id`: 128 random bits.
  - `k`: a 256-bit AES-GCM key. The fragment "is not sent to the server" [V 32].
- **Relay API** (inside G's Node gateway):
  - `POST /s` creates a share and returns `id` and a secret `writeToken`, which only the phone knows.
  - `PUT /s/<id>` (with the `writeToken`) uploads `{seq, iv, ct}`. The response carries the current viewer count.
  - `GET /s/<id>/events` is an SSE stream: the latest route and state, then updates.
  - `DELETE /s/<id>` ends the share.
- **Why SSE:** it reconnects automatically [V 33]. Serve it over HTTP/2, because on HTTP/1.1 a browser allows only 6 open SSE connections per domain [V 33].
- **Encryption:**
  - AES-GCM with a random 96-bit IV per message, and `seq` in the additional data so the phone can't be replayed or reordered.
  - On the phone: native CryptoKit `AES.GCM` (iOS 13+) [V 35] and `javax.crypto` GCM [V 36].
  - If the publisher runs in JS: `expo-crypto` 57 has `aesEncryptAsync` [V 34].
- **Relay storage:**
  - RAM only: the last state and the last route, each with a TTL;
  - no database and no disk;
  - no access logs for `/s`, `/v` or the tiles;
  - rate limits.
- **Publisher on the phone:**
  - It runs in D's native location service, so it works with the screen locked.
  - It sends every 5 s while walking, immediately on a step or status change, and every 30 s while still.
  - The route goes only when it changes (keyed by `route_id`).
- **Consent and lifetime:**
  - Off by default; started per trip by voice ("share this trip with Anna").
  - Expiry: arrival plus 15 minutes by default; cap of 4 h, extendable by voice; hard cap of 8 h, as WhatsApp.
  - "Stop sharing" works by voice and from the notification.
  - Milo speaks at start, when the first viewer connects ("someone opened your trip"), and at the end.
- **Viewer page:** static, served from the VPS with a strict CSP and no third-party scripts, because any third-party script could read the key in the fragment. Nothing is stored in the browser, and the page clears itself when the share ends.

### 5.3 Threats and mitigations

| Threat | Mitigation |
|---|---|
| The link is forwarded | Short expiry; announce new viewers; revoke. Later: named per-helper links |
| The server or a backup leaks | End-to-end encryption; RAM only; TTL |
| **Tile requests reveal the area** to whoever serves the tiles | Self-hosted tiles, with no logs on the tile path (§7). A third-party tile host learns roughly where the user walks |
| A hostile helper misdirects the user | No command from the helper in the MVP. Later helper messages come only from named helpers and are spoken as "Anna says: …" |
| Our own server serves malicious JavaScript | A web page can't fully guard against this. Keep the viewer small and publish its source |

## 6. What a helper needs to see: evidence

- **Remote sighted assistance studies:**
  - From interviews with Aira agents, "difficulties in orienting and localizing the users" and in estimating distances from the camera are core problems [P 37, 39].
  - In a lab study, 13 untrained agents guided a sighted confederate indoors. A 3D map showing the confederate's live position and orientation (part of the authors' AR-maps prototype) cut the mean time to find an unannotated landmark from 430 s with a 2D map to 211 s (p = 0.034), and lowered workload [V 38]. Their participants said: "I need to put myself in a location and to check if that's the right direction."
  - **Design consequences:**
    - show the heading arrow and its source (compass or direction of travel);
    - show the accuracy circle, plus the accuracy as text;
    - show the distance to the next crossing;
    - offer a "look at this crossing" button that opens Google Street View at the crossing, facing the direction of travel (`map_action=pano`, `heading`; no API key needed [V 53]).
- **O&M telepractice:**
  - In a 2022 survey of 66 specialists, 90.8% started remote work only because of COVID, only 20% found it satisfactory, and teaching was mostly concepts [V 41].
  - A best-practice paper puts "independent street crossing, public transportation use" among the skills not to teach remotely, citing delays and dropped calls [V 40].
  - So for instructors:
    - **route preview**: the route with each crossing's OSM facts and unknowns, which they can correct in OSM;
    - **trip replay**: planned route vs trail, off-route events, stops, and what Milo said where;
    - live following only while a family member walks with the student.
- **Envision's precedent:** its glasses call trusted friends and family who install the Envision Companion app, formerly called Ally [V 56]. Users do accept a small circle of known helpers, as with Be My Eyes Groups.

## 7. Maps for the helper view

- **Old web app** (`web/src/components/LiveMap.tsx`, `JourneyMap.tsx`):
  - What it is: Leaflet 1.9.4 with raster tiles from `tile.openstreetmap.org`. The map is non-interactive and hidden from screen readers (`aria-hidden`, `inert`); the text beside it carries the information.
  - Keep:
    - point and route validation;
    - automatic fit to the route, and panning when the user leaves the central 70% of the view (`getBounds().pad(-0.15)`);
    - accuracy circle, heading arrow, route halo;
    - fallback text when tiles fail;
    - the JourneyMap text block (next instruction, remaining metres and minutes).
  - Change:
    - make the map interactive (zoom and follow);
    - add a crossing marker and the trail;
    - fill the viewport;
    - replace the tiles.
- **OSM tile policy (checked 27 Sep 2026)** [V 42]. Requires:
  - the exact URL;
  - visible attribution;
  - an identifying User-Agent;
  - a valid Referer from web pages;
  - caching of 7 days or per the headers.

  Forbids:
  - prefetching;
  - "Offline use is not permitted on tile.openstreetmap.org";
  - no SLA, and access "may be withdrawn at any point".

  Normal viewing by a live viewer is allowed. The same applies to OSM's vector tiles at `vector.openstreetmap.org` [V 43].
- **Recommendation: self-host.**
  - Extract a PMTiles file for Milan and each test city from the Protomaps daily build with `pmtiles extract` [V 45]. Serve it as a static file from the VPS with HTTP range requests [V 44]. The whole planet is about 120 GB at z0–15 [V 45], if English-speaking testers spread out.
  - Render with MapLibre GL JS 6.11.2 and the `pmtiles` protocol, using a Protomaps style (`light`, `dark` or `grayscale` flavour) [V 47, 51].
  - Attribute "© OpenStreetMap" [V 46].
  - Fallback outside our extracts: the OpenFreeMap public instance (MIT; "no limits on the number of map views… no API keys, and no cookies"; donation-funded [V 48]; "I don't offer SLA guarantees" [V 58]). Its server logs leave out IP addresses by default, but it "may use Cloudflare as a CDN", which does see the requests [V 49]. So the fallback reveals roughly where the user walks to OpenFreeMap's CDN. Use it only when the user is outside every extract, and add the extract when a tester moves to a new city. *(Changed at verification: the privacy caveat was missing.)*
- **Map on the phone card (later):** MapLibre React Native 11.4.0 (MIT, Sep 2026) [V 51]. MapLibre Native reads `pmtiles://` since Android 11.8.0 and iOS 6.10.0 [V 50].

## 8. Accessibility of the helper view itself

The helper may have low vision (an elderly parent) or be blind (a friend who knows the area). Targets, from WCAG 2.2 AA [V 54]:
- text contrast ≥ 4.5:1 (1.4.3);
- route line, markers and controls ≥ 3:1 against the map (1.4.11). Use a thick route with a halo, and a position marker distinguished by shape, not only colour;
- no two-way scrolling at 320 CSS px width (1.4.10); text resizable to 200% (1.4.4). Never disable pinch zoom;
- a "freeze updates" toggle, because the page updates itself (2.2.2);
- the next step and status in a polite live region, so screen readers announce changes without moving focus (4.1.3). Keep the map `aria-hidden`, as the old app does;
- light, dark and high-contrast themes following `prefers-color-scheme` and `prefers-contrast`; large default text (about 20 px); metres or feet chosen by the viewer.

The on-phone card goes further: maximum text size, black on white or white on black, screen kept awake, and no interactive elements except the user's own close gesture or command.

## 9. Recommended design

### 9.1 Scope by stage

| Stage | Contents | Depends on | Parallel? |
|---|---|---|---|
| **K0: MVP, no server** (with the walking MVP) | (1) **Helper card**: "show my card" opens a no-touch, local-language screen: "I'm visually impaired, could you help me?", destination (name, address), next step and crossing, what Milo understood (current destination and stops). (2) **Summary + hand-off** to a volunteer, a group or a contact (Aira if installed). (3) **Silence during calls**, then re-orientation. (4) **"Share my location"** as text with a Google Maps link [V 53], through the share sheet | D's native audio and location modules; engine templates | The templates and the card UI can start now. Call detection needs D's native audio module |
| **K1: live link** (once G's gateway runs on the VPS) | End-to-end relay, native publisher, viewer page (text first, then the map), expiry, revocation, viewer announcements; self-hosted tiles | VPS, D's native location service | Relay, viewer and tiles can start now against a recorded trip fixture. The publisher waits for D |
| **K2: after tests** | Helper messages spoken to the user (named helpers only); QR so a passer-by can follow on their own phone; O&M route preview and trip replay; Check-In mode (share only if not arrived) [V 26]; Android 16 Live Updates on the lock screen [P 55] and iOS Live Activities; Service Directory hook at the destination | K1 | – |
| **Not planned** | Screen sharing (§4). In-app video calls: only if tests show that Be My Eyes or WhatsApp calls lack context badly, and then with self-hosted LiveKit (Apache-2.0, RN SDK 3.0.0, Sep 2026) [V 51] | – | – |

**Division of work** (matches G's split):
- Gateway/web developer: relay, viewer, tiles (K1).
- Phone developer: card, hand-off, call detection, publisher (K0, K1).

**Effort:**
- K0: about 1–1.5 weeks.
- K1: relay 2–3 days, viewer 4–6 days (reusing the web app), publisher 2–3 days per platform, tiles half a day.

### 9.2 Data exposed in each mode

| Data | (a) Card on the phone | (b) Live link, known helper | (b′) O&M replay (K2) | (c) Be My Eyes / Aira summary |
|---|---|---|---|---|
| Destination name and address | Yes | Yes | Yes | Name and street |
| Current street, side, next junction | Yes | Yes | Yes | Yes |
| Exact position and accuracy | As text only | Yes | Trail | Accuracy only (Aira has its own GPS) |
| Heading | No | Yes | Yes | No |
| Route line | Later (map) | Yes | Planned and actual | No |
| Next crossing facts (signals, sound, tactile, islands) | Yes | Yes | Every crossing | One line |
| What Milo said | Last 1–2 | Last 5 | All, timestamped | No |
| User's requests as understood | Current destination and stops | Navigation requests only (default) | All, if the user opts in | No |
| Free-form questions and answers | No | Off by default | Opt-in | No |
| Status (on/off route, paused, in call, GPS weak), freshness, battery | Status | Yes | Yes | No |
| Home, saved places, profile | Never | Never | Never | Never |
| Where it lives, and for how long | Screen only | Relay RAM until expiry; nothing in the viewer | A file the user owns | Be My Eyes' recording, under its policy [V 3] |

This answers J's open question 5: show the recent instruction history, only while sharing is active, with nothing kept afterwards.

## 10. What to reuse

| Component | Licence (MIT app, commercial) | Activity, 27 Sep 2026 | Reuse | Effort |
|---|---|---|---|---|
| `web/` LiveMap and JourneyMap (ours) | Ours | – | Logic, layout, fallback, CSS tokens | 2–3 d to port to MapLibre |
| maplibre-gl 6.11.2 | BSD-3 ✓ | Released 24 Sep 2026 [V 51] | Viewer map | Included above |
| pmtiles 4.5.0 (library and CLI) | BSD-3; the spec is CC0 ✓ [V 44] | 10 Aug 2026 [V 51] | Serve and read extracts | 0.5 d |
| @protomaps/basemaps 5.7.2 plus daily builds | Code BSD-3; style design CC0; tiles are an ODbL Produced Work: attribute, and rename if you serve a fork ✓ [V 46] | Style released 10 Mar 2026; repository active Sep 2026 [V 51, 52] | Styles and extracts | 0.5 d |
| OpenFreeMap | MIT ✓ [V 48] | Active [V 52] | Fallback tiles | Hours |
| @maplibre/maplibre-react-native 11.4.0 | MIT ✓ | 19 Sep 2026 [V 51] | Map on the card (K2) | 2–3 d |
| CryptoKit / javax.crypto; expo-crypto 57.0.3; @noble/ciphers 2.4.0 | Platform; MIT; MIT ✓ | Sep and Aug 2026 [V 34–36, 51] | AES-GCM | Included |
| Hauk | Apache-2.0 ✓ | Last commit on `master` 24 May 2024: dormant [V 52] | Ideas only: RAM-only storage, expiry, freshness display | – |
| react-native-qrcode-svg 6.3.26 | MIT ✓ | 22 Sep 2026 [V 51] | QR hand-off (K2) | 0.5 d |
| react-native-webrtc 124.0.8 | MIT ✓ | Jul 2026 [V 51] | Not recommended (§4) | – |
| LiveKit server; livekit-client 2.22.3; @livekit/react-native 3.0.0 | Apache-2.0 ✓ (client packages on npm; server from its LICENSE file) | Sep 2026 [V 51, 52] | Only if in-app video is ever needed | 1–2 wk |
| Google Maps URLs | No key needed [V 53] | – | Links to the position and to Street View | 0.5 d |

Apache-2.0, BSD and MIT code can all go into an MIT app used commercially. Apache-2.0 requires keeping its NOTICE file.

## 11. Where the founders' assumptions need adjusting

1. **"Shareable with Be My Eyes."** Volunteers see only the camera, and there is no API [V 1, 2][U]. Sending an anonymous, recorded volunteer a live link would be wrong anyway [V 3]. What is realistic:
   - the hand-off with a summary;
   - Milo's live link sent separately to *group* members;
   - an official context feature only through a partnership.
2. **"An interface to show a sighted person."** Showing the app screen fails twice over:
   - it is in English while Milan passers-by speak Italian;
   - a sighted person tapping a TalkBack or VoiceOver phone gets focus changes, not actions.

   The fix is a no-touch card in the local language.
3. **Screen sharing is not the easy route.** Android stops it when the screen locks [V 15].
4. **The OSM tile rule is not just "no heavy use".** Normal interactive viewing by an identified app is allowed; prefetch and offline are forbidden; there is no SLA [V 42]. The reasons to leave are privacy of the live link and reliability, not a ban.
5. **A remote helper must not "drive" crossings.** O&M evidence rejects remote teaching of street crossings [V 40]. The view is for awareness. Milo never offers a "cross now" control, and helper messages come later, attributed and named.
6. **Aira does not help the Milan tests** (not in Italy; Ireland is its only EU market, V). It matters only for English-speaking testers who already use it.

## 12. Open questions

1. Who will help the first testers, and through what: WhatsApp, SMS or phone? This decides how the link is sent.
2. What does `https://share.bemyeyes.com/volunteers/call` do with the app installed on Android and on iOS: call at once, or open a screen? Test on 2 Android phones and 1 iPhone, then ask Be My Eyes for written permission.
3. Does a Be My Eyes call put Android in `MODE_IN_COMMUNICATION`, and does it show up in iOS `CXCallObserver`? Test on devices.
4. Defaults: expiry at arrival plus 15 min with a 4 h cap? Announce every new viewer, or only the first?
5. Card wording: "I'm blind" or "I'm visually impaired"? Let testers choose. Which language outside Italy?
6. Would Milan O&M instructors (Istituto dei Ciechi, UICI) use route preview and replay? In what format (web, GPX)?
7. Tiles for English-speaking testers: an extract per city, or the 120 GB planet?
8. QR hand-off to strangers (K2): acceptable at all, and with what expiry (15 min)?

## Sources

1. Be My Eyes, Volunteer Hub (fetched 27 Sep 2026). https://www.bemyeyes.com/be-my-eyes-volunteer-hub/
2. Be My Eyes, home page ("100% anonymous"). https://www.bemyeyes.com/
3. Be My Eyes, Privacy Policy, effective 1 Sep 2026. https://www.bemyeyes.com/privacy-policy/
4. Be My Eyes blog, Groups for friends and family, 20 Dec 2023. https://www.bemyeyes.com/blog/be-my-eyes-integrates-new-feature-to-receive-visual-assistance-from-friends-and-family-members/
5. Be My Eyes and Meta, new accessibility functions (Mar 2026). https://www.bemyeyes.com/news/be-my-eyes-and-meta-launch-new-accessibility-functions/
6. share.bemyeyes.com apple-app-site-association (identical on profiles.bemyeyes.com), fetched 27 Sep 2026. https://share.bemyeyes.com/.well-known/apple-app-site-association
7. share.bemyeyes.com assetlinks.json, fetched 27 Sep 2026. https://share.bemyeyes.com/.well-known/assetlinks.json
8. Be My Eyes Service Directory profile page (runtime config in the page source). https://directory.bemyeyes.com/en-US/service-directory/profile/bemyeyes
9. Be My Eyes, Service Directory launch. https://www.bemyeyes.com/news/be-my-eyes-launches-service-directory-direct-customer-service-connections-to-over-600-new-companies-and-organizations/
10. PR Newswire, Barilla adds QR codes with Be My Eyes. https://www.prnewswire.com/news-releases/barilla-adds-qr-codes-on-packaging-to-assist-visually-impaired-customers-in-expanded-partnership-with-be-my-eyes-301651355.html
11. Be My Eyes, Workplace accessibility tools (Feb 2026). https://www.bemyeyes.com/business/news/be-my-eyes-announces-new-workplace-accessibility-tools/
12. Aira, "Navigating with Aira: 5 Effective Strategies" (1 Apr 2025). https://aira.io/navigating-with-aira-5-effective-strategies/
13. Aira, "Tech Tips & Troubleshooting" (9 Apr 2025). https://aira.io/aira-tech-tips/
14. AFB AccessWorld, Aira introduction. https://www.afb.org/aw/18/9/15178
15. Android Developers, Media projection. https://developer.android.com/media/grow/media-projection
16. react-native-webrtc, Android installation (screen sharing). https://raw.githubusercontent.com/react-native-webrtc/react-native-webrtc/master/Documentation/AndroidInstallation.md
17. LiveKit docs, Screen sharing (the old URL now redirects to https://docs.livekit.io/transport/media/screenshare/). https://docs.livekit.io/home/client/tracks/screenshare/
18. Apple Developer Forums, ReplayKit extension memory limit. https://developer.apple.com/forums/thread/108854
19. Android Developers, Manage audio focus. https://developer.android.com/media/optimize/audio-focus
20. Android Developers, Sharing audio input. https://developer.android.com/media/platform/sharing-audio-input
21. Android Developers, AudioManager reference. https://developer.android.com/reference/android/media/AudioManager
22. Apple Developer, CXCallObserver (doc JSON). https://developer.apple.com/documentation/callkit/cxcallobserver
23. Android Developers, Declare package visibility needs. https://developer.android.com/training/package-visibility/declaring
24. Apple, URL Scheme Reference: FaceTime links. https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/FacetimeLinks/FacetimeLinks.html
25. Google Maps Help, Share your real-time location. https://support.google.com/maps/answer/15437054
26. Apple Platform Security, Check In security. https://support.apple.com/en-gb/guide/security/secea59d7b70/web
27. Apple Personal Safety User Guide, Use Check In for Messages. https://support.apple.com/guide/personal-safety/use-check-in-for-messages-ips56b5bc469/web
28. Apple, Share your ETA in Maps. https://support.apple.com/guide/iphone/share-your-estimated-time-of-arrival-iph65c86df8c/ios
29. WhatsApp Help Center, How to use live location. https://faq.whatsapp.com/480865177351335/
30. Glympse FAQ, https://app.glympse.com/faq/, and app page, https://app.glympse.com/glympse-app/
31. Hauk README (Apache-2.0), and the Android app's strings for the end-to-end encryption setting. https://raw.githubusercontent.com/bilde2910/Hauk/master/README.md ; https://raw.githubusercontent.com/bilde2910/Hauk/master/android/app/src/main/res/values/strings.xml
32. MDN, URI fragment. https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment
33. MDN, Using server-sent events. https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
34. Expo, expo-crypto (SDK 57, AES-GCM). https://docs.expo.dev/versions/latest/sdk/crypto/
35. Apple Developer, CryptoKit AES.GCM. https://developer.apple.com/documentation/cryptokit/aes/gcm
36. Android Developers, javax.crypto.Cipher. https://developer.android.com/reference/javax/crypto/Cipher
37. Lee et al., Opportunities for Human-AI Collaboration in Remote Sighted Assistance, IUI 2022. https://dl.acm.org/doi/10.1145/3490099.3511113
38. Xie et al., Helping Helpers: Supporting Volunteers in RSA with AR Maps, DIS 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC11727196/
39. Lee et al., The Emerging Professional Practice of Remote Sighted Assistance, CHI 2020. https://doi.org/10.1145/3313831.3376591
40. Welch-Grenier et al., O&M remote instruction during COVID-19: best practices, liability and ethics, BJVI 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9805991/
41. McCarthy, Griffin-Shirley & Siffermann, A Survey of O&M Specialists' Use of Telepractice During COVID-19, JVIB 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9806191
42. OSMF, Tile Usage Policy (fetched 27 Sep 2026). https://operations.osmfoundation.org/policies/tiles/
43. OSMF, Vector Tile Usage Policy. https://operations.osmfoundation.org/policies/vector/
44. PMTiles README (licence, clients, range requests). https://raw.githubusercontent.com/protomaps/PMTiles/main/README.md
45. Protomaps, Basemap downloads. https://docs.protomaps.com/basemaps/downloads
46. Protomaps basemaps README (licensing and attribution). https://raw.githubusercontent.com/protomaps/basemaps/main/README.md
47. Protomaps, Basemap flavors. https://docs.protomaps.com/basemaps/flavors
48. OpenFreeMap README and LICENSE. https://raw.githubusercontent.com/hyperknot/openfreemap/main/README.md
49. OpenFreeMap, Privacy policy. https://openfreemap.org/privacy/
50. MapLibre Newsletter, January 2025 (PMTiles in MapLibre Native). https://maplibre.org/news/2025-02-03-maplibre-newsletter-january-2025/
51. npm registry, fetched 27 Sep 2026: maplibre-gl, pmtiles, @protomaps/basemaps, protomaps-leaflet, leaflet, @maplibre/maplibre-react-native, react-native-webrtc, livekit-client, @livekit/react-native, react-native-qrcode-svg, @noble/ciphers, expo-crypto. https://registry.npmjs.org/<package>
52. Latest commit on the default branch, read from shallow clones on 27 Sep 2026: bilde2910/Hauk (24 May 2024; LICENSE Apache-2.0), hyperknot/openfreemap (13 Sep 2026), protomaps/basemaps (11 Sep 2026), livekit/livekit (26 Sep 2026; LICENSE Apache-2.0). The GitHub search API was not reachable at verification, so the earlier `pushed_at` date (26 Jun 2024) for Hauk was not re-checked. https://github.com/bilde2910/Hauk
53. Google, Maps URLs (Street View `map_action=pano`, no API key). https://developers.google.com/maps/documentation/urls/get-started
54. W3C, WCAG 2.2 (Recommendation, 12 Dec 2024). https://www.w3.org/TR/WCAG22/
55. Android Developers, Live update notifications. https://developer.android.com/develop/ui/views/notifications/live-update
56. Envision, Companion (Ally) app. https://www.letsenvision.com/ally
57. Android Developers, Intent reference (`ACTION_DIAL`, `ACTION_CALL`). https://developer.android.com/reference/android/content/Intent
58. OpenFreeMap home page, FAQ ("Do you offer support and SLA guarantees?"). https://openfreemap.org/

## Verification (27 Sep 2026)

I checked 34 claims against primary sources, fetched again today. Web search was unavailable, so claims with no fetchable page keep their tag.

**Confirmed as written:**
- Be My Eyes AASA paths and app ID (identical on `profiles.bemyeyes.com`), the `assetlinks.json` package, the `/volunteers/call` → `/open-app` 307 redirect, and the URL schemes in the directory page's `mobileApps` config.
- Be My Eyes: "one-way video (two-way audio)"; "Volunteers only hear your voice…"; the recording and licensing wording, the opt-out by email and the 1 Sep 2026 effective date; groups of up to 20 people, up to 5 groups.
- Aira: GPS at the start of the call (1 Apr 2025); mobile screen sharing on iPhone and iPad only (9 Apr 2025).
- Android: per-session consent, single-use token, the Android 15 QPR1 auto-stop on lock, and single-app sharing hiding notifications; auto-mute only for `USAGE_MEDIA`/`USAGE_GAME` and only on incoming calls; `addOnModeChangedListener` (API 31); the `MODE_IN_COMMUNICATION` wording; the `CXCallObserver` quote.
- Live sharing: Google Maps links up to 24 h, with battery and charging shown; Glympse 48 h deletion; Apple Check In key handling, the Limited and Full levels, and +15/30/60 min.
- Web and maps: the MDN fragment and SSE (6 connections without HTTP/2) text; the OSM tile and vector tile policies; Protomaps planet ~120 GB at z0–15; the basemaps licensing (BSD-3, CC0, ODbL, rename forks); the PMTiles licence; the flavour names; Google Maps URLs `map_action=pano` with no key; WCAG criteria numbers.
- Every npm version, date and licence in §10 (maplibre-gl 6.11.2 BSD-3, 24 Sep; pmtiles 4.5.0; @protomaps/basemaps 5.7.2; maplibre-react-native 11.4.0 MIT; react-native-webrtc 124.0.8 MIT; livekit-client 2.22.3 and @livekit/react-native 3.0.0 Apache-2.0; react-native-qrcode-svg 6.3.26; @noble/ciphers 2.4.0; expo-crypto 57.0.3 with `aesEncryptAsync` and GCM); react-native-webrtc's screen-sharing service since 118.0.2.
- The O&M survey (66 specialists, 90.77%, 20.00%) and the best-practice paper's list of high-level travel skills and its concern about delays; the paper titles and authors via Crossref and NCBI.
- MapLibre's January 2025 newsletter on PMTiles; the local `web/` facts (Leaflet 1.9.4, OSM raster URL, `aria-hidden` plus `inert`, the engine's `en` and `it`).

**Corrected:**
- **Be My Eyes Groups:** the call goes to the *first available* member, not a random one (Dec 2023 post, restated Mar 2026).
- **Android App Links:** `assetlinks.json` only *declares* the delegation. "Verified" and "goes straight to the app" were softened to "test first".
- **Android microphone during calls:** the quote "other ordinary apps receive silence" is not on the page. It is now a paraphrase of the page's rules; the conclusion holds.
- **AR-maps study:** the 430 s → 211 s result compares a 3D map with a 2D map, indoors, with a sighted confederate. It is not AR versus no map.
- **Glympse:** the source says "no app needed to view", not "no account". No account is now [U].
- **Aira:** "not in the EU" contradicted V, which names Ireland as Aira's EU market. Now "not in Italy".
- **Hauk:** end-to-end encryption confirmed in the app ([P]→[V]); the demo server's 7-day access log added; the last commit on `master` is 24 May 2024. The `pushed_at` date could not be re-checked.
- **Old web app:** it pans at the central 70% of the view (`pad(-0.15)`), not 85%.
- **OpenFreeMap:** "no SLA" is on its home page, not the README (source 58 added). The privacy policy says it may use Cloudflare as a CDN. The fallback recommendation now carries a privacy caveat, because a third-party CDN would see roughly where the user walks.
- **Envision:** the app is now called Envision Companion; "free" was removed as unverified.
- **FaceTime:** the quote comes from Apple's archived documentation; a note to confirm on current iOS was added.

**Tags raised to [V]:** Meta glasses groups (11 Mar 2026), Service Directory 600+ (18 Mar 2024), the Barilla QR release, Workplace (11 Feb 2026), `<queries>` on Android 11+, `ACTION_DIAL` (source 57), the MapLibre Native PMTiles versions, and the LiveKit server licence.

**Left as they were:** WhatsApp durations and encryption [P] (the help page renders by script); Glympse 5 min–4 h [P]; the ReplayKit 50 MB limit [P] (forum, iOS 12.2); Lee et al. quotes [P]; Android 16 Live Updates [P]; the absence of a Be My Eyes or Aira SDK [U] (no developer documentation found on either site).
