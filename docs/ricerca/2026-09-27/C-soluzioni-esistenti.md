# Pedestrian navigation aids for blind and low-vision users: comparison for Milo

Checked on 27 Sep 2026 against official sites, store listings and repositories. Key: ● yes, ◐ partial, ○ no, ? not documented. Controls: V = voice commands, NL = natural-language assistant, H = headset/media buttons, S = Siri or Assistant shortcut, G = special gesture, SR = tuned for VoiceOver/TalkBack. IT = Italian interface / usable in Italy.

## A. Navigation apps

| App | Platforms · price · licence | Data | Callouts · clock · junctions | Crossings/signals | Turn guidance | 3D audio / beacons | Offline | Transit | Controls | IT |
|---|---|---|---|---|---|---|---|---|---|---|
| [BlindSquare](https://www.blindsquare.com/user-guide/) | iOS · €44.99 · closed | Foursquare, OSM | ●·●·● | ? | Hands off to Apple/Google Maps; repeats clock bearing to a tracked place | iBeacon indoor system | ? | Announces stops on board; hands off to Moovit | V H G SR | ● |
| [VoiceVista](https://drwjf.github.io/vvt/index.html) | iOS, watchOS · free, optional sponsorship · MIT (developer's statement) | OSM | ●·◐ option·● | ? | ● toward a beacon or along a route | ● | ◐ cache, offline search | ○ | S H SR | ● |
| [Soundscape Community](https://github.com/soundscape-community/soundscape) | iOS · free · MIT | OSM | ●·○·● | ? | ○ beacon only | ● Bose Frames head tracking | ○ | ○ | H SR | ● |
| [Soundscape (Scottish Tech Army)](https://scottish-tech-army.github.io/Soundscape-Android/) | Android (2026), iOS rewrite on the same code · free · MIT | OSM vector tiles | ● four detail levels·○·● | ◐ crossings in tiles | ○ beacon plus waypoints | ● HRTF, AirPods head tracking | ● regional extracts | ◐ stops called out while riding (beta) | H NL SR | ● |
| [Lazarillo](https://lazarillo.app/theapp/) | iOS, Android · free, account required; venues pay · closed | Not disclosed; own indoor maps | ●·●·● | ? | ◐ | Indoor in mapped venues | ○ | ◐ bus | V SR | ● |
| [Indigo Nav](https://www.aph.org/product/indigo/) (ex-GoodMaps Outdoors) | iOS, Android · free (APH) · closed | Google Routes, Foursquare/Google Places | ●·●·● on approach and at the junction | ? | ● verbose, with tones and haptics | ○ | ○ | ● | S SR | ◐ Italy covered, no Italian |
| [Google Maps](https://blog.google/products-and-platforms/products/maps/better-maps-for-people-with-vision-impairments/) | Android, iOS · free · closed | Google | ◐ Lens on demand·○·◐ busy-junction warning | ○ | ● distance, heading, off-route | ○ | ○ walking | ● | NL S SR | ◐ Italian guidance undocumented |
| [Apple Maps + VoiceOver](https://support.apple.com/guide/iphone/use-voiceover-in-apps-iphe4ee74be8/ios) | iOS, watchOS · free · closed | Apple | ◐ streets and places in heading mode·○·○ | ○ | ● spoken; sound and haptic cue toward the start | ○ | ● incl. walking | ● | S G SR | ● |
| [Ariadne GPS](https://apps.apple.com/it/app/ariadne-gps/id441063072) | iOS · €5.99 + €3.99 add-on · closed | Apple Maps | ◐ | ? | ○ | ○ | ? | ○ | G SR | ● last updated in 2020 |
| [MyWay Pro](https://sbv-fsa.ch/publikationen-und-apps/apps/myway-pro-sichere-navigation-im-oeffentlichen-raum/) | iOS, Android · CHF 1/month, 10/year, 30 lifetime · closed | OSM, SchweizMobil | ● places, waypoints | ? | ● | ◐ trail beacons | ◐ saved routes | ○ | SR | ● |
| [Moovit](https://moovit.com/features/accessibility/) | iOS, Android, web · free with ads, Moovit+ · closed | Transit feeds | ○ | ○ | ● Live Directions, get-off alert | ○ | ◐ static maps | ● | SR | ● |
| [Oko](https://apps.apple.com/us/app/oko-cross-streets-and-maps/id1583614988) | iOS 17+ · free since Jul 2025 · closed | Camera AI, maps | ○·?·● | ● Walk/Don't Walk, US only | ● US, CA, JP, ES, BE | ○ | ? | ○ | G | ○ |
| [NaviLens](https://www.navilens.com/en/) | iOS, Android · free app; owners buy tags · closed | Printed tags | ● tag in view | ◐ where tagged | ◐ to the tag | ○ | ? | ● where installed | G SR | ◐ few sites |
| [Waymap](https://www.waymapnav.com/how-it-works) | iOS, Android · free; venues pay · closed | Surveyed venues | ◐ | ? | ● step by step | ○ | ● | ● Washington Metro | SR | ◐ interface only |
| [Clew](https://github.com/occamLab/Clew) | iOS · free · no licence file | ARKit tracking | ○ | ○ | ● retraces a recorded path | ○ | ● | ○ | S | ○ |
| [OsmAnd](https://osmand.net/docs/user/plugins/accessibility/) | Android plugin; iOS through VoiceOver · free and paid tiers · GPLv3 | OSM | ◐ timed announcements·●·○ | ○ | ● | ○ | ● | ◐ no timetables | G SR | ● |
| [WeWALK](https://wewalk.io/en/) | iOS, Android, smart cane · free app with in-app purchases; cane about $850 · closed | ? | ◐ Explore mode | ? | ● | ○ | ? | ● stop alerts | NL, cane buttons, SR | ◐ Italian interface |

## B. Vision AI and wearables (all closed source)

| Product | Form · price | Use on a walk | IT |
|---|---|---|---|
| [biped NOA](https://www.startupticker.ch/en/news/noa-by-biped-marks-successful-market-entry-in-europe-and-the-us) | Camera vest, bone-conduction audio · about £2,400 | Obstacles including head height; crosswalk layout; doors; live descriptions. GPS still in development in [Nov 2024](https://bipedai.substack.com/p/noa-update-is-here-faster-ai-follow) | ◐ Italy not in the 2024 launch list |
| [Glidance Glide](https://www.glidance.io/product) | Two-wheeled guide · $1,499 + $30/month | Steers around obstacles; finds crosswalks and doors | ○ [US pilot](https://glidance.io/glide-july-2026-updates/) |
| [Seeing AI](https://blogs.microsoft.com/accessibility/seeing-ai-app-launches-on-android-including-new-and-updated-features-and-new-languages/) | iOS, Android · free | Text and scene description on demand | ● |
| [Lookout](https://support.google.com/accessibility/android/answer/9031274) | Android · free | Explore mode; Find mode for doors, vehicles and other objects | ● Q&A in English only |
| [Be My Eyes / Be My AI](https://www.bemyeyes.com/be-my-eyes-smartglasses/) | iOS, Android, desktop, Meta glasses · free; brands pay | Volunteer video calls and AI photo chat | ● glasses included |
| [Aira](https://aira.io/subscriptions/) | Apps, Meta glasses · $26–1,160/month; Access AI free | Trained agents guide you live | ○ |
| [Envision](https://www.letsenvision.com/) | Free app; [Glasses $2,499](https://shop.letsenvision.com/products/glasses-home); [Ally Solos $699](https://shop.letsenvision.com/products/ally-solos-glasses) | Text and scene description; Ally assistant | ● |

## Analysis

### The field in 2026

**Soundscape family.** Microsoft announced the end of Soundscape in December 2022, and existing installs ran until 30 Aug 2023 ([blog](https://www.microsoft.com/en-us/research/blog/microsoft-soundscape-new-horizons-with-a-community-driven-approach/)). It also released an MIT subset that is "not a turnkey equivalent" of the product ([repo](https://github.com/microsoft/soundscape)). Forks carry it on:
- VoiceVista adds clock bearings, Siri shortcuts and 65 languages.
- Soundscape Community adds NaviLens support.
- The Scottish Tech Army rewrite adds offline maps, adjustable callout detail and Gemini actions ([release notes](https://scottish-tech-army.github.io/Soundscape-Android/release-notes.html)).

These apps give the best spatial awareness, but they compute no routes ([FAQ](https://scottish-tech-army.github.io/Soundscape-Android/users/help-frequently-asked-questions.html)), Street Preview is "largely a proof of concept" ([Sep 2025](https://scottish-tech-army.github.io/Soundscape-Android/newsletters/9-Sep-2025.html)), and most translations have not been checked by a native speaker.

**Specialist GPS apps.**
- BlindSquare remains the reference for callouts and clock bearings, and its headset menu works with the screen locked. But it runs only on iOS, is paid, and leaves routing to other apps.
- Lazarillo is free and has Italian, but requires an account.
- Indigo Nav promises the most verbose guidance, but needs a data connection to route. Note: GoodMaps Outdoors descends from Sendero's Seeing Eye GPS. APH later [acquired](https://www.aph.org/blog/navigating-independently-with-indigo/) the GoodMaps software.
- MyWay Pro is the Italian-speaking European option, focused on recorded routes.

**Mainstream maps.**
- Google's [detailed voice guidance](https://blog.google/products-and-platforms/products/maps/better-maps-for-people-with-vision-impairments/) launched in US English and Japanese. We found no official list of further languages.
- [Lens in Maps](https://blog.google/outreach-initiatives/accessibility/ai-accessibility-update-gaad-2024/) reads nearby places aloud through a screen reader.
- [Gemini](https://blog.google/products-and-platforms/products/maps/gemini-navigation-biking-walking/) answers hands-free questions during walks (January 2026).
- Google Maps gives walking directions only [online](https://support.google.com/maps/answer/6291838).
- Apple Maps has [offline walking directions](https://support.apple.com/en-us/105084). Apple warns not to use its [door detection](https://support.apple.com/guide/iphone/detect-doors-around-you-iph35c335575/ios) for navigation.
- Moovit has the best transit alerts, but gives little pedestrian detail and shows ads.

**Infrastructure-based aids.**
- Oko ([2024 Apple Design Award](https://developer.apple.com/news/?id=58c4urmu)) reads US signals only. Its pricing flipped from subscription to free after [Synapse/Polara](https://synapse-its.com/synapse-its-acquires-oko-mobile-app/) acquired it.
- NaviLens has few Italian sites; one is [Valle d'Aosta](http://www.comune.torino.it/pass/informadisabili/2025/04/28/valle-daosta-naviga-codici-qr-per-orientarsi-progetto-sensi-per-ciechi-e-sordi/), with 150 codes.
- Waymap first needs a LiDAR survey of each venue.
- Clew was last updated in 2023.
- OsmAnd is open source, offline and gives clock bearings, but its accessibility plugin is Android-only and its prompts are generic.

**Hardware and vision AI.**
- WeWALK's live video help does not cover Italy ([App Store](https://apps.apple.com/us/app/wewalk-navigation-assistance/id1344297911)).
- NOA and Glide are costly and early. biped.ai showed a placeholder page on 27 Sep 2026.
- The camera apps describe scenes, but none of them plans routes.

### Gap analysis: where Milo can lead

1. **Routing around hazards.** None of the apps reviewed routes blind walkers around unsignalised crossings or main roads; mainstream apps stop at wheelchair filters. Milo can route on the OSM tags `crossing=traffic_signals`, [`traffic_signals:sound`](https://wiki.openstreetmap.org/wiki/Key:traffic_signals:sound), `tactile_paving` and `kerb`, and say when a tag is missing.
2. **Map questions answered on the phone, in Italian.** Gemini, WeWALK and Be My AI run in the cloud and do not reason over footpaths, and Soundscape 2.0 removed its voice control. Nothing answers "Is there a crossing with signals before the pharmacy?" offline.
3. **Rehearsing the planned route.** Virtual exploration exists (BlindSquare's simulation, VoiceVista's jumps between junctions and GPX playback, Street Preview), but we found none that walks a computed route junction by junction, with crossing details.
4. **Junction descriptions that include the crossing.** Apps name the streets but rarely describe the crossing itself.
5. **Door-to-door transit** with walking legs guided at the detail blind users need. Milo plus Transitous can supply this; BlindSquare hands transit off, and Indigo lacks Italian.
6. **Italian, Android, open source and offline together.** Among apps built for blind users, only the Scottish Tech Army Soundscape shares this profile. It deliberately does no routing, so Milo can complement it. OsmAnd is also open and offline, but it is not designed for blind users.
7. **Signal detection for Italy, later.** Oko handles US signals only.

### Reusable open-source assets

- **[microsoft/soundscape](https://github.com/microsoft/soundscape) (MIT).**
  - Callout logic in `apps/ios/GuideDogs/Code/Behaviors/Default/`: `AutoCalloutGenerator.swift`, `IntersectionGenerator.swift` and `CalloutRangeContext.swift`.
  - Beacon styles in `Code/Audio/Audio Beacon/`, plus the beacon sounds.
  - Street Preview in `Behaviors/Preview`.
  - The OSM importer in `svcs/data`.
- **[Soundscape-Android](https://github.com/Scottish-Tech-Army/Soundscape-Android) (MIT, Kotlin Multiplatform).** The closest match to Milo's stack.
  - A GeoEngine that turns tiles into ways and intersections.
  - A [planetiler fork](https://scottish-tech-army.github.io/Soundscape-Android/developers/mapping.html) that adds crossings, sidewalks and entrances, plus PMTiles extract scripts.
  - A headset audio menu and Gemini control through Android app functions.
  - [AirPods heading calibration](https://scottish-tech-army.github.io/Soundscape-Android/developers/head-tracking.html).
  - A [fix that stops VoiceOver and callouts talking over each other](https://scottish-tech-army.github.io/Soundscape-Android/developers/voiceover-and-callouts.html).
- **Soundscape Community (MIT).** NaviLens and Bose Frames integration.
- **OsmAnd ([GPLv3 code; CC BY-NC-ND artwork](https://github.com/osmandapp/OsmAnd/blob/master/LICENSE)).** Clock and 8-direction bearing styles, and announcements when the target changes sector. The code can be reused only under GPL, and the artwork cannot be reused at all.
- **Clew.** It has no licence file, so it is all rights reserved by default. Reuse the idea (breadcrumbs simplified to keypoints) or ask OCCaM Lab for permission.
- **Crossing and signal datasets.**
  - [ImVisible PTL + LytNet](https://github.com/samuelyu2002/ImVisible) (MIT): 5,059 images labelled for signal state and the crosswalk midline.
  - [PTL-Crosswalk](https://github.com/ronaldosm/PedestrianTrafficLightsAndCrosswalkDetection): includes Italian images; licence not stated.
  - Mapillary Vistas v2 (CC BY-NC-SA 4.0, non-commercial): includes pedestrian-signal and curb-cut classes.
- **Data and audio.**
  - [Foursquare OS Places](https://foursquare.com/resources/blog/products/foursquare-open-source-places-a-new-foundational-dataset-for-the-geospatial-community/) (Apache 2.0, over 100 million places).
  - The [OpenSidewalks schema](https://taskarcenteratuw.github.io/tcat-wiki/opensidewalks/schema/).
  - [Resonance Audio](https://github.com/resonance-audio/resonance-audio) (Apache 2.0).
  - Planetiler (Apache 2.0) and PMTiles (BSD-3).

### Table stakes

- Keeps working with the screen locked and alongside other apps.
- "Where am I?" and "What's around or ahead?" on demand.
- Callouts with filters and a quick way to turn them down. Soundscape's most common complaint is "too much of it in busy places".
- Directions relative to the user: clock face or spatial audio.
- Walking turn-by-turn with warnings, off-route detection and rerouting.
- Headset-button and assistant control.
- Full TalkBack/VoiceOver support without speech collisions.
- Markers, route recording and GPX sharing.
- Previews of places and routes.
- Transit stop and get-off alerts.
- Offline maps, low battery use and a GPS accuracy readout.
- Free or cheap, in the user's language.

### Lessons from shutdowns and churn

- **Microsoft Soundscape.** The open release shipped with "no automation … to provision" its Azure services, and the Scottish Tech Army calls the inherited backend "very expensive to run". They replaced it with PMTiles, which protomaps estimates at about £10 per 10 million tiles a month. Lesson: keep data on the device and publish the licence, documentation and user-data export from day one.
- **ViaOpta Nav.** Novartis [launched](https://www.novartis.com/news/media-releases/novartis-pharmaceuticals-launches-first-app-visually-impaired-people-use-apple-watch-and-other-smart-watches) it in 2014–15 as a sideline to its business. Its [Play listing](https://play.google.com/store/apps/details?id=com.novartis.blind) now returns 404, and we found no source release. Lesson: anchor the project in a community whose mission it is, not in a sponsor's budget.
- **Wider churn.** GoodMaps Outdoors was renamed twice, Oko's pricing reversed, Ariadne and Clew stalled, and biped's site went offline. Each time, users lose their tools and saved places. Lessons: open formats (GPX, GeoJSON), several maintainers, and a small server footprint.
