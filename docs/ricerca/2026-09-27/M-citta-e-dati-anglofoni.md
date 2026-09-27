# M: Data for English-speaking cities: crossings, accessible signals, transit, OSM completeness
Research date: 27 Sep 2026. Tags: **[V]** verified in a primary source I fetched; **[P]** secondary source or search snippet; **[M]** my own measurement (OSM extracts, open-data APIs, Transitous queries, all run on 27 Sep 2026); **[U]** could not verify. Bracketed numbers point to Sources; letters point to the other reports in this folder. Effort figures are my estimates. Not legal advice.

This report builds on F (Milan data), I (server, city packs, Transitous rules), L (English testers, UK/Ireland anchor) and N (repos, Project Sidewalk, OpenSidewalks). It does not repeat them.

## Key findings

1. **Pilot cities: London, New York City and Dublin, with Milan for field tests.** Toronto is the runner-up for North America.
   - **London:** the richest keyless transit API (station entrances, lift outages, street disruptions), dense OSM in the centre, and one hour from Milan.
   - **NYC:** publishes every accessible pedestrian signal (APS) monthly, and the MTA feeds need no key. It also has the largest gap between OSM and reality, so conflation adds the most there.
   - **Dublin:** in the EU and one hour away. Its signals are well surveyed in OSM, and they appear to be almost all audio-tactile.
   - **Toronto:** flags every one of its 2,559 signals as audible or not, under a licence OSM accepts, but the TTC has no real-time feed in Transitous.
2. **OSM alone must not tell a user "this signal has no sound" in North America.** I matched official APS lists to OSM within 40 m [M]:
   - OSM has `traffic_signals:sound=yes` at 27% of NYC's APS intersections, and at about 50% in Toronto, Seattle and San Francisco.
   - At 12% of NYC's APS intersections, OSM carries only `sound=no`, which is stale.

   Official data, shipped as an overlay beside the city pack, fixes this.
3. **In the UK, Ireland and Australia the tactile signal matters more than the sound.**
   - Central London OSM has 268 `sound=no` against 88 `yes`, but 292 `traffic_signals:vibration=yes`, which mappers use for the rotating cone [M].
   - The engine does not read `traffic_signals:vibration`, `crossing_ref` or `button_operated` (see `NODE_TAGS` in `packages/engine/src/osm/overpass.ts`). So it cannot say "feel for the cone under the button box".
4. **Only four candidate cities publish open APS data**: NYC, Toronto, Seattle and San Francisco.
   - London, Dublin, Vancouver and Sydney publish signal locations only.
   - Chicago had APS at 85 of 2,713 signalised intersections in March 2025 [P 24].
   - Milan publishes nothing (F).
5. **Transitous routed trips in all 14 cities** [M]. In a Sunday test, however, it gave no live times for the Tube, TTC, CTA or ATM. Station-level accessibility data is best at:
   - **MBTA:** GTFS with 9,291 pathways and 333 entrances;
   - **MTA:** 2,120 subway entrances and a keyless elevator-outage feed;
   - **TfL:** entrances and lift disruptions in the Unified API [M].
6. **Street-works feeds with geometry and no key** exist in London (TfL road disruptions), NYC (construction permits with a sidewalk field, plus closures), Toronto (road restrictions, real time), Seattle and Vancouver. England's Street Manager pushes events by SNS under the Open Government Licence (OGL) [V 43]; its England-only scope is [P].
7. **Public Overpass was unusable from here today** [M]:
   - overpass-api.de reset every connection through the session proxy;
   - `overpass.private.coffee` timed out, and when it did answer, its data dated from 24–28 Jul 2026.

   I measured from city extracts instead, which supports I's plan to build packs from extracts. `private.coffee` is in the engine's `DEFAULT_OVERPASS_ENDPOINTS`.

## 1. Method

- **OSM data:**
  - BBBike city extracts, data to 25 Sep 2026 23:00 UTC [V 1];
  - Milan from the openstreetmap.fr Lombardy extract, 27 Sep 2026 01:35 UTC [V 2];
  - parsed with pyosmium 4.3.1 [V 3]. Script and outputs are in the session scratchpad, not the repo.
- **Two boxes per city**, both centred downtown: 3×3 km (downtown) and 10×10 km (urban core).
  - Centres: Duomo, Charing Cross, Bryant Park, Downtown Crossing, Union Square, Westlake, the Loop, Yonge–Dundas, Granville/Georgia, Sydney Town Hall, Flinders/Swanston, O'Connell Bridge, Waverley and George Square.
  - The boxes in Vancouver, Sydney, Chicago and Boston include water, so compare ratios, not totals.
- **Definitions:**
  - **Signalised node:** `highway=crossing` or `highway=traffic_signals`, with `crossing=traffic_signals` or `crossing:signals=yes`. One intersection usually has 2–4 such nodes.
  - **Surveyed:** the node carries any `traffic_signals:sound` value. Sound tags on `footway=crossing` ways are rare (8–43 per 10 km box, [M]); the engine already copies them onto nodes (`crossingTags` in `zone.ts`).
  - **Sidewalk/road:** length of `footway=sidewalk` divided by the length of roads from trunk to living_street. Sidewalks mapped on both sides everywhere would give about 2.0.
  - **Road sidewalk tag:** share of road length with any `sidewalk*` key.
- **Cross-check:** the Milan figures are in proportion with F's whole-city counts (22,660 crossings, 1,409 `sound=yes`).

## 2. OSM completeness

### 2.1 Urban core, 10×10 km [M]

| City | Crossings | Signalised nodes | Sound surveyed | Sound yes / no | Vibration yes | Crossings with tactile tag (yes) | Kerb nodes | Entrances | Sidewalk / road | Roads with sidewalk tag |
|---|---|---|---|---|---|---|---|---|---|---|
| Milan | 17,471 | 4,843 | 42% | 1,282 / 771 | 434 | 45% (716) | 29,251 | 16,077 | 1.38 | 53% |
| London | 16,516 | 3,991 | 44% | 590 / 1,182 | 1,355 | 49% (6,308) | 14,452 | 11,880 | 0.68 | 72% |
| New York | 19,261 | 10,658 | 28% | 569 / 2,433 | 216 | 38% (5,358) | 12,812 | 2,196 | 1.54 | 61% |
| Boston | 16,056 | 2,957 | 31% | 627 / 286 | 173 | 43% (4,437) | 5,381 | 1,618 | 1.20 | 64% |
| San Francisco | 11,371 | 4,068 | 47% | 813 / 1,099 | 371 | 44% (3,946) | 6,708 | 1,093 | 0.95 | 75% |
| Seattle | 20,640 | 2,936 | 40% | 620 / 569 | 412 | 24% (2,846) | 24,968 | 1,271 | 1.52 | 84% |
| Chicago | 17,773 | 3,912 | 45% | 39 / 1,705 | 39 | 35% (4,786) | 2,309 | 3,737 | 1.51 | 75% |
| Toronto | 9,869 | 2,620 | 41% | 618 / 469 | 151 | 41% (2,005) | 1,136 | 2,664 | 1.56 | 89% |
| Vancouver | 12,328 | 2,940 | 48% | 773 / 627 | 45 | 58% (372) | 7,835 | 2,092 | 1.45 | 90% |
| Sydney | 8,742 | 2,695 | 68% | 1,811 / 11 | 1,383 | 58% (650) | 3,254 | 2,400 | 0.69 | 45% |
| Melbourne | 14,012 | 3,265 | 61% | 1,970 / 19 | 1,827 | 46% (3,412) | 1,438 | 1,175 | 1.05 | 36% |
| Dublin | 4,580 | 1,592 | 52% | 793 / 37 | 383 | 56% (1,413) | 1,048 | 1,743 | 0.41 | 37% |
| Edinburgh | 1,986 | 962 | 66% | 340 / 294 | 510 | 71% (1,125) | 1,147 | 7,796 | 0.08 | 63% |
| Glasgow | 2,374 | 1,560 | 21% | 127 / 199 | 226 | 44% (801) | 565 | 4,162 | 0.06 | 24% |

### 2.2 Downtown, 3×3 km [M]

| City | Crossings | Signalised nodes | Sound surveyed | Yes / no | Vibration yes | Kerb nodes | Entrances | Sidewalk / road |
|---|---|---|---|---|---|---|---|---|
| Milan | 2,286 | 770 | 42% | 239 / 86 | 60 | 4,235 | 4,671 | 1.71 |
| London | 2,542 | 733 | 49% | 88 / 268 | 292 | 3,438 | 2,674 | 1.41 |
| New York | 2,356 | 2,123 | 30% | 108 / 538 | 60 | 1,698 | 541 | 1.61 |
| Boston | 2,640 | 619 | 20% | 105 / 21 | 32 | 779 | 367 | 1.37 |
| San Francisco | 3,041 | 1,718 | 46% | 428 / 363 | 212 | 1,068 | 451 | 1.26 |
| Seattle | 3,893 | 1,733 | 44% | 361 / 410 | 255 | 4,377 | 531 | 1.67 |
| Chicago | 3,121 | 1,464 | 58% | 7 / 842 | 13 | 902 | 2,448 | 1.29 |
| Toronto | 1,919 | 856 | 55% | 257 / 217 | 114 | 254 | 1,134 | 1.66 |
| Vancouver | 2,264 | 1,150 | 65% | 283 / 464 | 20 | 2,442 | 322 | 1.58 |
| Sydney | 1,966 | 986 | 72% | 707 / 3 | 493 | 1,122 | 771 | 0.88 |
| Melbourne | 2,328 | 1,104 | 83% | 911 / 7 | 836 | 423 | 473 | 0.88 |
| Dublin | 1,053 | 580 | 76% | 426 / 16 | 218 | 467 | 684 | 0.47 |
| Edinburgh | 518 | 360 | 83% | 143 / 157 | 259 | 316 | 2,444 | 0.25 |
| Glasgow | 621 | 488 | 22% | 21 / 88 | 90 | 210 | 805 | 0.08 |

### 2.3 What the numbers mean

- **Crossings.**
  - London and every North American candidate have 10,000–20,000 crossing nodes in the core.
  - Edinburgh and Glasgow have about 2,000. Their sidewalks are mostly not mapped as separate ways, so there are few crossings to carry tags.
- **Sound.** 21% (Glasgow) to 68% (Sydney) of signalised nodes are surveyed. The tags match what is known about each place:
  - where APS are near-universal, they say so (Sydney 1,811 yes against 11 no; Melbourne 1,970 against 19);
  - where APS are rare, they say that too (Chicago 39 yes against 1,705 no).

  L's national figures (about 25% of signalised nodes surveyed in Great Britain, about 10% in the US) understate big US cities, which reach 28–47%. NYC's tags are stale, though (§3.2).
- **Vibration.** London has 1,355, Melbourne 1,827 and Sydney 1,383. The wiki defines the tag only as "vibrations occur when crossing is permitted" [V 5]. UK mappers use it as an approximation for the rotating cone, which turns rather than vibrates [P 6].
- **Tactile paving** is tagged on 24–71% of crossings. In North America, `yes` means a detectable warning surface at the kerb ramp; it is not a guide line like LOGES (F §1).
- **Kerbs.** Seattle's 24,968 and Milan's 29,251 come from imports:
  - Seattle: the 2017 import of sidewalks and kerb ramps from public-domain city data [V 13];
  - Milan: the AMAT project (F §4).

  Toronto has 1,136, so kerb warnings there must come from city data.
- **Sidewalks.**
  - NYC, Seattle, Toronto, Chicago, Vancouver and Boston map separate sidewalks across the core, with a ratio of 1.2–1.56.
  - London does in the centre (1.41) but less in the 10 km box (0.68).
  - Dublin (0.41), Sydney (0.69) and the Scottish cities mostly rely on `sidewalk=*` tags on roads. There the engine routes on the road centreline and cannot tell which side of the street the user is on (A).
- **Entrances.** Milan has 16,077, London 11,880 and Edinburgh 7,796, but NYC has 2,196 and San Francisco 1,093. In American cities, "take me to the door" will often end in the engine's `entrancesUnknown` message.

## 3. Accessible pedestrian signals: official data

### 3.1 Datasets

| City | Dataset | Content | Size and freshness | Licence; into OSM? |
|---|---|---|---|---|
| New York | DOT "Accessible Pedestrian Signal Locations" (Socrata `de3m-c5p4`) [V 7] | One point per intersection, with install date. Signals are audible and vibrotactile, activated by push button | 4,404 intersections: Bronx 855, Brooklyn 1,127, Manhattan 776, Queens 1,050, Staten Island 596. Rows updated 17 Sep 2026; updated monthly [M]. 3,436 of them installed 2022–2026 [M] | No licence field. Local Law 11 of 2012 releases city data "without… restrictions" [P 27]. Usable in the app; an OSM import is possible after community review |
| San Francisco | DataSF "Traffic Signals" (`ybh5-27n2`), column `aps` [V 10]; SFMTA list (PDF) [V 9] | Per signal: APS type and project | 1,507 signals, 535 with APS, 150 pending or future. Rows last updated 31 May 2024 [M]. The PDF lists 611 APS intersections at 30 Jun 2026 [V 9] | PDDL, i.e. public domain [V 10] |
| Seattle | SDOT "Accessible Pedestrian Signals (Active)" view [V 11] | Signal assemblies whose push-button model contains "NAV-" (one maker's APS) | 442 assemblies; layer edited 25 Sep 2026; latest push-button install 18 Dec 2024 [M]. The filter may miss other brands | City data is "public domain with attribution" (as used for the Seattle import) [V 13] |
| Toronto | "Traffic Signals Tabular" [V 14] | Per signal: `AUDIBLEPEDSIGNAL`, `APS_OPERATION`, and the `PX` id | 2,559 signals, 1,400 with the audible flag set to 1; refreshed 26 Sep 2026 [M]. The city page says 1,219 APS (May 2023) and 20–30 more a year [V 15] | OGL–Toronto, found compatible with ODbL by OSMF in 2024 [P 16] |
| London | TfL "Traffic Signals" (SFM) [V 17] | Site type: Pelican, Puffin, Toucan, their "dual" variants, Pedestrian, Junction. No audible or cone attribute | 6,460 sites in service: 3,130 junctions, 1,825 pedestrian, 465 puffin, 376 pelican, 266 toucan, 398 dual. Extract dated 31 Jul 2026 [M] | "Open Government Licence" [V 17]. OGL v2/v3 is compatible with ODbL [V 25, 26] |
| Dublin | DCC "Traffic signals and SCATS sites" [V 20] | Locations only | Refreshed Mar 2026 [V 20] | CC BY 4.0: fine in the app. It needs a waiver before import into OSM [V 25] |
| Vancouver | "Traffic signals" [V 21] | Location and type only | 966; weekly [V 21] | OGL–Vancouver |
| Sydney | TfNSW "Traffic Lights Location" [V 22] | Locations only | Updated Jun 2026 | CC BY |
| Chicago | None found | Court order: at least 71% of signalised intersections within 10 years. 85 of 2,713 had APS in Mar 2025 [P 24] | – | – |
| Boston, Melbourne, Edinburgh, Glasgow | None found [U] | – | – | – |
| Milan | None (F) | – | – | – |

NYC is under a court order to fit APS at 10,000 signalised intersections by the end of 2031 [P 8]. At that pace, the city data will outrun OSM surveys for years.

### 3.2 Conflation test [M]

I took the official points inside each city's 10 km box and looked for OSM signalised nodes within 40 m of each one.

| City (data date) | Official APS points | OSM `sound=yes` nearby | Only `sound=no` nearby | Untagged | No OSM signal nearby |
|---|---|---|---|---|---|
| New York (Sep 2026) | 712 | 189 (27%) | 82 (12%) | 416 (58%) | 25 (4%) |
| Toronto (Sep 2026) | 402 | 203 (50%) | 25 (6%) | 165 (41%) | 9 (2%) |
| Seattle (Sep 2026) | 252 | 127 (50%) | 8 (3%) | 114 (45%) | 3 (1%) |
| San Francisco (May 2024) | 380 | 188 (49%) | 17 (4%) | 161 (42%) | 14 (4%) |

Where the city lists a signal without APS (263 in Toronto, 716 in San Francisco), OSM has only `no` at 38% and 37% of them, and has `yes` at 5% and 7%. The San Francisco list is from 2024, so some of those `yes` tags are probably newer installations. A 40 m radius can catch a neighbouring junction on short blocks, so treat these shares as approximate.

### 3.3 Defaults when there is no data

| Region | Evidence | What Milo says at a signalised crossing with no sound tag |
|---|---|---|
| UK | Guidance: audible and/or tactile devices must be provided wherever pedestrian signals are [P 19]. TfL says all London crossings have "audible signals and/or rotating cones" [P 18]. Standard audible signals are not used at staggered crossings ("bleep and sweep" there) [P 18] | "There should be a cone under the button box that turns when it is safe to cross." Say "should": the map does not confirm it |
| Ireland | OSM core: 793 yes against 37 no. A South Dublin specification says tactile devices "shall always be utilised" [P 56] | As for the UK |
| Australia | Audio-tactile push buttons date from 1984 (PB/5) [P 55]; Victoria requires them at all new signals [P 23]; OSM core shows 1,970 yes against 19 no | "The button should beep and vibrate" |
| US, Canada | APS are the exception outside court-ordered programmes (NYC, Chicago); Toronto has 1,400 of 2,559 | "The map does not say if this signal has sound." Never say "no sound" from OSM alone |
| Italy | F §2 | As in F |

### 3.4 Conflation pipeline (server side, part of I's pack builder)

1. Fetch each dataset nightly on the VPS (Socrata JSON, CKAN CSV, ArcGIS GeoJSON). Store the source, fetch date and licence with it.
2. Normalise to `{lat, lon, aps: yes|no|pending, since, source_id}` at intersection level.
3. Snap each point to the OSM signalised nodes, and the ends of `footway=crossing` ways, within 30–40 m. One official point applies to every crossing at its junction; Toronto's `PX` id also joins to its Pedestrian Network (§5).
4. Resolve conflicts:
   - An official `yes` beats an OSM `no` when the install date is newer than the tag's last edit.
   - An official `no` never overrides an OSM `yes`, because lists go stale (San Francisco).
   - Speak the source: "City data from 2026 says this crossing has an accessible signal."
5. Write an overlay per tile (for example `overlay/aps.json`) next to the ODbL pack, with its own licence and attribution. Do not merge it into the OSM-derived database; that keeps CC BY sources such as Dublin and Sydney usable without licence questions. The engine merges the overlay at load time.
6. Publish disagreements as a task list for local mappers, as MapRoulette challenges do. Do not bulk-import: every import needs local community review, and CC BY sources need waivers [V 25].

## 4. Transit

| City | GTFS static | Real time | Terms | Transitous test [M] | Station accessibility |
|---|---|---|---|---|---|
| London | Transitous GB feed from Aubin: BODS buses plus National Rail [V 28, 29]. TfL's own timetables are TransXChange | TfL Unified API arrivals, not GTFS-RT. GB GTFS-RT from Aubin [V 28] | TfL terms are based on OGL v2 with extra conditions (call limits, branding) [P 38]. BODS is OGL [P 39] | Tube and London Buses routed; 2 of 16 legs live | StopPoint entrances (9 at Oxford Circus); `/Disruptions/Lifts/v2`, no key [M 37] |
| New York | MTA subway and buses [V 28] | GTFS-RT without a key [M 31] | MTA says keys are "no longer required" [P 31] | Subway and bus routed; 5 of 10 legs live | 2,120 entrances on data.ny.gov (Dec 2025) [M 33]. Elevator/escalator outage JSON without a key [M 31], though the MTA page still mentions registration [V 32]. Station ADA column [V 32]. Subway GTFS has no pathways or entrances [M 36] |
| Boston | MBTA GTFS with pathways and levels [M 34] | GTFS-RT [M 34] | MassDOT Developers License Agreement [P 35] | 10 of 10 legs live | 333 entrances, 9,291 pathways, 80 levels. v3 API has elevator facilities and accessibility alerts [M 34] |
| San Francisco | SFMTA and regional feeds via 511 (API key) [V 28] | Yes | 511 terms [U] | 10 of 11 legs live | – |
| Seattle | King County Metro, Sound Transit [V 28] | Yes | [U] | 4 of 5 legs live | – |
| Chicago | CTA, Metra [V 28] | Transitous lists CTA real time [V 28], but 0 of 5 legs were live | CTA Developer License Agreement [P 40] | Routed | Train Tracker is a separate API |
| Toronto | TTC via Transitland [V 28] | TTC not in Transitous; the TTC alerts feed is marked retired [P 41] | OGL–Toronto | Routed; 0 of 14 legs live | – |
| Vancouver | TransLink [V 28] | Yes | [U] | 3 of 5 legs live | – |
| Sydney | TfNSW, CC BY 4.0 [V 28] | Yes (key) | CC BY 4.0 | Routed (Sydney Metro) | – |
| Melbourne | Transport Victoria, CC BY 4.0 [V 28] | Yes (key) | CC BY 4.0 | Train, tram and bus routed | – |
| Dublin | NTA GTFS, CC BY 4.0 [V 42] | GTFS-R, key and fair-use policy [P 42]; Transitous labels it CC BY-SA 4.0 [V 28] | Check which licence applies | 5 of 6 legs live | – |
| Edinburgh, Glasgow | Lothian, First, SPT and ScotRail in the GB feed [M] | ScotRail only | BODS covers England only [P 39] | Routed | – |
| Milan | ATM (F) | None (F) | – | Routed; 0 live | F |

- **Test conditions:** the live checks ran on Sunday 27 Sep 2026 around 14:00 UTC, so Sydney and Melbourne were at night and not checked for live times.
- **Where live times are missing** (Tube, TTC, CTA, ATM), Milo should say the time is scheduled, not live. For London, the TfL arrivals API can fill the gap under TfL's terms.
- **Commercial use:** Transitous's non-commercial rule is covered in I §9.

## 5. Other useful open data

**Sidewalk and kerb inventories**

| City | Dataset | Use for Milo |
|---|---|---|
| Seattle | Sidewalks: 46,268 segments. Curb Ramps: 38,740, of which 25,825 have a detectable warning and 12,915 do not. Marked Crosswalks: 6,330. All last edited 25 Sep 2026 [M 12] | Add `tactile_paving` to kerb nodes; flag ramps without a warning surface |
| New York | Planimetric sidewalk polygons (Apr 2024) [M 46]. Pedestrian Ramp Locations: 217,679 ramps with a detectable-warning-surface condition field, last updated Oct 2021 [M 46] | Kerb and tactile overlay (2021 data: say so) |
| Toronto | Pedestrian Network: 87,105 segments with sidewalk code, crosswalk type and signal `PX` id [M 47] | Side-of-street gaps and crossing types; joins to the APS flag |
| Vancouver | Sidewalk condition rating 2021: 15,580 records [M 49] | Surface hazards (old data) |
| Melbourne | City of Melbourne Pedestrian Network [P 53] | Not checked |

- **Project Sidewalk.** Its data is CC0 [V 50]. Its public English-speaking cities near the candidates are Seattle, Chicago, Burnaby (next to Vancouver, BC) and Waltham (near Boston). The "Vancouver" in its list is Vancouver, Washington [M 50]. Its label clusters (obstacle, surface problem, missing ramp) could feed a hazards overlay in Seattle and Chicago only.
- **OpenSidewalks and the Transportation Data Exchange Initiative (TDEI).** In January 2026 the TDEI held about 5,600 datasets covering 10.5 M crossings, mostly in Washington State [P 51]. N covers the schema; in Seattle the data largely overlaps what OSM already imported.

**Street works and closures**

| City | Feed | Notes |
|---|---|---|
| London | TfL `/Road/all/Street/Disruption`: TIMS segments with `closure` and a lineString, no key [M 37]. Street Manager: SNS push of permit and works events, OGL, with registration [V 43]; covers England [P] | Start with TfL; add Street Manager in phase 2 |
| New York | Street Closures by block and by intersection (updated 21 Sep 2026) [M 44]. Street Construction Permits 2022–present (updated 26 Sep 2026), with `sidewalkshortdesc` and WKT geometry [M 45] | The permit feed is the only candidate feed with a sidewalk field |
| Toronto | Road Restrictions, marked real time, JSON [M 48] | – |
| Seattle | `Road_Closure_View` and street-use layers [M 12] | – |
| Vancouver | Road Ahead: 23 current closures and 68 projects under construction (17 Sep 2026) [M 49] | – |
| US | WZDx registry: 43 feeds, mostly state highways [M 52] | Little pedestrian value |
| Milan | ds925 small excavations (F) | – |

**Entrances.**
- For buildings, OSM is the only source: I found no open building-entrance dataset for any candidate [U].
- For transit, entrances come from the MTA, TfL (NaPTAN metro entrances in the StopPoint API) and the MBTA's GTFS.

**APS requests.** Milo could offer to pre-fill a request after the user crosses at a signal without sound (phase 3 or later):
- San Francisco takes requests through 311 and answers within 90 days [V 9];
- Toronto takes them through 311 [V 15];
- Seattle has an ADA request form [P 54];
- NYC prioritises requests under the court order [P 8].

## 6. Pilot recommendation

| City | OSM pedestrian data | Official APS | Transit and stations | Works feed | Practical | Verdict |
|---|---|---|---|---|---|---|
| London | Dense in the centre; cones tagged at 34% of signalised nodes | Locations only; UK default helps | Best API | TfL, keyless | 1 h from Milan; English; UK GDPR | **Pilot 1** |
| New York | Sidewalks and crossings dense; entrances weak; sound tags stale | Monthly, every APS | Keyless GTFS-RT, entrances, lifts | Permits with sidewalk field | 6 h; Manhattan urban canyons (A, D) | **Pilot 2** |
| Dublin | Signals well surveyed; sidewalks mostly road tags | Locations only; APS look near-universal | GTFS-R | Not checked [U] | 1 h; EU law, same as Milan | **Pilot 3** |
| Toronto | Sidewalk tags on 89% of roads; few kerbs | Every signal, OSM-compatible licence | No live TTC data | Real time | 6 h | Runner-up (North America) |
| Seattle | Best sidewalks and kerbs | Filter by model | Good | Yes | 9 h | Runner-up |
| Melbourne, Sydney | Sidewalks partial | Not needed (near-universal) | Good, CC BY | Not checked | 8–9 h | Later |
| San Francisco, Boston | Good | Stale 2024 data / none | Very good (MBTA) | Not checked | 9 h / 6 h | Later |
| Chicago | Good | APS rare | Weak live data | Not checked | 7 h | Later |
| Edinburgh, Glasgow | Sidewalks not separate; Glasgow sound surveyed 21% | None | GB feed | Not England (no Street Manager) | 1 h | Partner (Scottish Tech Army's Soundscape), not a pilot |

**Why this set.**
- **London and Dublin** anchor the cohort in L's UK/Ireland recommendation. They are close enough to Milan for live support sessions.
- **NYC** brings the largest US tester pool (L), and the one dataset where conflation changes what Milo says at more than half of the APS junctions. Start NYC testers outside Midtown: GNSS there is the worst case (A, D).
- **Toronto** is a better choice than NYC if the team wants data it can also contribute back to OSM, or if Manhattan positioning proves unusable.

**Remote testers elsewhere** still get the OSM-only mode. Say this plainly in onboarding: crossing information outside pilot cities is less complete.

## 7. Conflation work per city

| Scope | Work | Effort (dev-days, estimate) |
|---|---|---|
| All cities | Overlay format, nightly fetcher and attribution screen. Engine changes: read `traffic_signals:vibration`, `traffic_signals:arrow`, `button_operated`, `crossing_ref` (pelican, puffin, toucan, zebra) and `kerb` on nodes (`NODE_TAGS` in `overpass.ts`); add `vibration` and `source` to the `Crossing` type in `zone.ts`; regional defaults (§3.3) chosen by country code | 5–7 |
| Milan | Excavations from ds925 into a hazard overlay; ATM stops (F). No APS data: rely on OSM, and survey with UICI Milano | 2 |
| London | TfL signal sites into "signalised, expect cone" where OSM lacks crossing tags; TfL street disruptions into a closures overlay; StopPoint entrances and lift disruptions for station arrival. Street Manager later | 5 |
| New York | DOT APS (monthly) into the APS overlay; MTA entrances and elevator outages for station arrival; street closures plus sidewalk permits into the hazard overlay; ramps (2021) optional | 5–6 |
| Dublin | DCC signal locations to fill gaps in OSM crossing nodes; NTA GTFS-R key; check whether the city publishes a works feed | 2 |
| Toronto (if chosen) | Signals CSV into the APS overlay via `PX`; Pedestrian Network crosswalk types; Road Restrictions | 3–4 |

Parallel work:
- The engine tag changes and the overlay format can start now.
- City fetchers depend on the overlay format but not on each other, so Daniele and Leonardo, or their agents, can split them by city.
- Transit accessibility (entrances, lifts) depends on the transit re-routing work in N.

## 8. Open questions

1. **Do we contribute official APS data back to OSM, or only use it as an overlay?** Contributing needs a community process for each city. NYC, San Francisco, Seattle and Toronto licences allow it; Dublin and Sydney need a waiver.
2. **Do we recruit testers city by city, or take them from anywhere?** This decides whether the overlays are needed before the English beta.
3. **London live times:** call the TfL arrivals API directly, under TfL's terms and branding rules, or accept scheduled-only Tube times from Transitous?
4. **Street Manager access:** the subscription needs a named organisation that accepts the terms. Who signs, and is a two-person project eligible?
5. **Dublin works data:** I did not check whether Dublin City Council publishes one [U].
6. **Re-check the NYC and San Francisco APS figures at each release.** NYC added about 60–70 intersections a month in 2024–2025 and about 50 a month in 2026 [M 7], under the court order [P 8], and the DataSF column stopped updating in May 2024.

## Sources

1. BBBike city extracts (London, NewYork, CambridgeMa, SanFrancisco, Seattle, Chicago, Toronto, Vancouver, Sydney, Melbourne, Dublin, Edinburgh, Glasgow), Last-Modified 26 Sep 2026: https://download.bbbike.org/osm/bbbike/
2. Lombardy extract: https://download.openstreetmap.fr/extracts/europe/italy/lombardia-latest.osm.pbf
3. pyosmium 4.3.1: https://pypi.org/project/osmium/
4. https://wiki.openstreetmap.org/wiki/Key:traffic_signals:sound (edited 22 Mar 2026)
5. https://wiki.openstreetmap.org/wiki/Key:traffic_signals:vibration
6. https://community.openstreetmap.org/t/pedestrian-crossings-spinners-for-visually-impaired-which-tags/130805
7. https://data.cityofnewyork.us/Transportation/Accessible-Pedestrian-Signal-Locations/de3m-c5p4 (API: https://data.cityofnewyork.us/resource/de3m-c5p4.json)
8. https://dralegal.org/case/american-council-of-the-blind-of-new-york-inc-v-the-city-of-new-york/
9. https://www.sfmta.com/getting-around/walk/accessible-pedestrian-signals
10. https://data.sfgov.org/Transportation/Traffic-Signals/ybh5-27n2 (metadata: https://data.sfgov.org/api/views/ybh5-27n2.json)
11. https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Accessible_Pedestrian_Signals_(Active)/FeatureServer/0
12. SDOT feature services (Sidewalks_(Active), Curb_Ramps_(Active), Marked_Crosswalks_(Active), Road_Closure_View): https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services
13. https://wiki.openstreetmap.org/wiki/Seattle,_Washington/Sidewalk_Import
14. https://open.toronto.ca/dataset/traffic-signals-tabular/ (CKAN: https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=traffic-signals-tabular)
15. https://www.toronto.ca/services-payments/streets-parking-transportation/traffic-management/traffic-signals-street-signs/types-of-traffic-signals/accessible-pedestrian-signals/
16. https://osmfoundation.org/wiki/OGL_Canada_and_local_variants
17. https://gis-tfl.opendata.arcgis.com/datasets/TfL::traffic-signals/about (layer: https://services1.arcgis.com/YswvgzOodUvqkoCN/arcgis/rest/services/SFM/FeatureServer/59)
18. https://www.inclusivecitymaker.com/london-audible-signals-pedestrian-crossings/
19. https://assets.publishing.service.gov.uk/media/61d32bb7d3bf7f1f72b5ffd2/inclusive-mobility-a-guide-to-best-practice-on-access-to-pedestrian-and-transport-infrastructure.pdf
20. https://data.gov.ie/dataset/traffic-signals-and-scats-sites-locations-dcc
21. https://opendata.vancouver.ca/explore/dataset/traffic-signals/
22. https://opendata.transport.nsw.gov.au/dataset/traffic-lights-location
23. https://www.vicroads.vic.gov.au/-/media/files/technical-documents-new/traffic-engineering-manual-v2/tem-vol-2-part-214--as-174214-traffic-signals-v20.ashx
24. https://news.wttw.com/2025/03/14/judge-orders-chicago-speed-efforts-make-crosswalks-accessible-blind-pedestrians-just-85
25. https://osmfoundation.org/wiki/Licence/Licence_Compatibility
26. https://wiki.openstreetmap.org/wiki/Open_Government_Licence
27. https://wiki.openstreetmap.org/wiki/New_York_City
28. Transitous feed definitions (gb, ie, us-ny, us-ma, us-ca, us-wa, us-il, ca, ca-on, ca-bc, au-nsw, au-vic): https://raw.githubusercontent.com/public-transport/transitous/main/feeds/gb.json (same path for the others)
29. https://transitous.org/sources-great-britain
30. Transitous routing API used for the tests: https://api.transitous.org/api/v5/plan
31. https://api.mta.info/ ; feeds tested: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json and https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs
32. https://www.mta.info/developers/display-elevators-NYCT
33. https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja
34. https://cdn.mbta.com/MBTA_GTFS.zip (Last-Modified 24 Sep 2026); https://api-v3.mbta.com/ ; https://cdn.mbta.com/realtime/TripUpdates.pb
35. https://www.mbta.com/developers/gtfs ; https://github.com/mbta/gtfs-documentation/blob/master/developers-license-agreement.pdf
36. https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
37. TfL Unified API: https://api.tfl.gov.uk/Disruptions/Lifts/v2/ ; https://api.tfl.gov.uk/Road/all/Street/Disruption ; https://api.tfl.gov.uk/StopPoint/940GZZLUOXC
38. https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service
39. https://www.bus-data.dft.gov.uk/ ; https://en.wikipedia.org/wiki/Bus_Open_Data_Service
40. https://www.transitchicago.com/developers/
41. https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/
42. https://data.gov.ie/dataset/nta-gtfs ; https://developer.nationaltransport.ie/
43. https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/
44. https://data.cityofnewyork.us/Transportation/Street-Closures-due-to-Construction-Activities-by-/i6b5-j7bu
45. https://data.cityofnewyork.us/Transportation/Street-Construction-Permits-2022-Present-/tqtj-sjs8
46. https://data.cityofnewyork.us/City-Government/NYC-Planimetric-Database-Sidewalk/52n9-sdep ; https://data.cityofnewyork.us/Transportation/Pedestrian-Ramp-Locations/ufzp-rrqu
47. https://open.toronto.ca/dataset/pedestrian-network/
48. https://open.toronto.ca/dataset/road-restrictions/
49. https://opendata.vancouver.ca/explore/dataset/road-ahead-current-road-closures/ ; https://opendata.vancouver.ca/explore/dataset/sidewalk-condition-rating/
50. https://github.com/ProjectSidewalk/SidewalkWebpage (README) ; https://sidewalk-chicago.cs.washington.edu/api ; https://sidewalk-chicago.cs.washington.edu/v3/api/cities
51. https://tdei.cs.washington.edu/opensidewalks/
52. https://data.transportation.gov/Roadways-and-Bridges/Work-Zone-Data-Feed-Registry/69qe-yiui
53. https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-network/
54. https://seattle.gov/transportation/projects-and-programs/programs/ada-program/make-an-ada-request/request-an-accessible-pedestrian-signal-(aps)
55. https://en.wikipedia.org/wiki/PB/5_pedestrian_crossing_button
56. https://www.sdcc.ie/en/services/transport/road-bye-laws/traffic-system-specifications/sdcc-ts-04-issue-6-may-2020.pdf
