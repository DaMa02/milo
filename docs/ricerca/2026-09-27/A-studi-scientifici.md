# Milo evidence review: BLV pedestrian navigation (peer-reviewed, 2005–2026)

[weak] = small N, lab-only, sighted participants or preliminary. [contested] = studies disagree.

## 1. Turn-by-turn instructions
- Users over-rotate by ~15–17°. "Slight" turns (22.5–60°) are worst (≈56° done vs ≈39° asked); ample turns become ≈90°. Anticipating the "stop" cue cut error from 30.1° to 18.8°. Ahmetovic et al. 2018, ASSETS, doi:10.1145/3234695.3236363; 2019, TACCESS, doi:10.1145/3349264. **Milo:** avoid "slight left"; name the target street.
- NavCog3 (BLE, 1.65 m error) gave distance and next action after each turn, then "approaching", then the turn. 93.8% of 260 turns succeeded; 45° turns were harder; fail-safe re-guidance recovered most misses. Sato et al. 2017, ASSETS, doi:10.1145/3132525.3132535. **Milo:** copy this pattern, with lead distances widened to GPS error.
- Reactions vary significantly between users, and wanted messages change with expertise (Ohn-Bar et al. 2018, IMWUT, doi:10.1145/3264941; Ahmetovic et al. 2019, W4A, doi:10.1145/3315002.3317561). Localization error is associated with route deviation (Kacorri et al. 2018, CHI, doi:10.1145/3173574.3173630). **Milo:** time cues from walking speed; anchor them to junctions.
- [contested] All 8 BLV users preferred precise turn-by-turn to clock-face "as the crow flies" guidance (Jain et al. 2024, UIST, doi:10.1145/3654777.3676333). Others asked for clock or degree terms instead of "slight" (Guerreiro et al. 2020, IJHCS, doi:10.1016/j.ijhcs.2019.102369). **Milo:** left/right for turns; clock for oblique branches.
- Blind people's own written directions warn when you have gone too far (Scheuerman et al. 2017, CHI EA, doi:10.1145/3027063.3053260). **Milo:** add "if you reach X, you've passed it" cues.

## 2. Street crossings
- Without APS (48 users, 416 crossings), 48.6% of crossings started during WALK, the mean start delay was 6.4 s, and 58.4% ended inside the crosswalk (Barlow et al. 2005, JVIB, doi:10.1177/0145482X0509901003). APS cut the delay by ≈2 s and improved independent timing (Scott et al. 2008, TRR, doi:10.3141/2073-11). **Milo:** prefer APS signals and say whether one is present.
- The best underfoot cues still leave ≈6° alignment error (Scott et al. 2011, JVIB, doi:10.1177/0145482X1110501011). A guidance surface raised correct alignment from 52.1% to 77.3% (Bentzen et al. 2017, TRR, doi:10.3141/2661-14); beaconing APS reduced veering (Barlow et al. 2013, TRR, doi:10.3141/2393-17). **Milo:** phones cannot align users; announce tactile paving and APS; leave alignment to O&M.
- Verbal intersection descriptions (22 blind users) improved deciding when to cross, but not staying in the crosswalk (Guth et al. 2019, TRR, doi:10.1177/0361198118821673). Geometry information raised comfort (Guy & Truong 2012, CHI, doi:10.1145/2207676.2207733). **Milo:** brief each crossing: lanes, island, control, zebra, tactile paving.
- Italian O&M experts favour marked crossings whenever possible; US experts stress standard technique at any legal crossing (Ahmetovic et al. 2017, TACCESS, doi:10.1145/3046790). **Milo:** in Italy, route via zebra crossings.
- [weak] Camera crosswalk and signal systems had only preliminary, small user tests (Coughlan & Shen 2013, J Assist Technol, doi:10.1108/17549451311328808; Tian et al. 2021, IEEE TNSRE, doi:10.1109/TNSRE.2021.3096379). 49 surveyed users said apps lack traffic-light and crossroad information; over 63% had been injured outdoors (El-taher et al. 2023, IEEE Access, doi:10.1109/ACCESS.2023.3244073). **Milo:** never say "cross now" based on vision.

## 3. The last few meters
- Of 22 users surveyed, 11 found locating the right door the hardest part, 17 relied on sighted help, and 16 named imprecision the top complaint. Users wanted tactile landmarks, countdowns ("50, 25, 10 feet") and less chatter. Saha et al. 2019, ASSETS, doi:10.1145/3308561.3353776. **Milo:** an arrival mode (street side, entrance, neighbouring shops); never "arrived" within GPS error.
- Vision-based positioning significantly improved navigation for 18 BLV users (Chen et al. 2026, CHI, doi:10.1145/3772318.3790589). Street cameras brought 8 users 2.9× closer to destinations than a GPS app (Jain et al. 2024). **Milo:** plan a VPS or camera hand-off.
- Landmarks locate bus stops; crowd workers audited them from Street View with 82.5% accuracy (Hara et al. 2015, TACCESS, doi:10.1145/2717513). Stop details enabled new trips (Campbell et al. 2014, ASSETS, doi:10.1145/2661334.2661378). **Milo:** describe the stop's shelter, bench and pole.
- Trip planning to unknown buildings shows large gaps: entrances, accessibility, indoor maps (Engel et al. 2020, ASSETS, doi:10.1145/3373625.3417022; Müller et al. 2022, TACCESS, doi:10.1145/3514255). **Milo:** say when OSM lacks the data.

## 4. Pre-journey learning
- Virtual "leap" (turn to turn) and "walk" (step by step) modes let most of 14 VI users learn route sequences (Guerreiro et al. 2017, ASSETS, doi:10.1145/3132525.3132545). After three days of home practice, 12 of 14 blind users walked a short real route unassisted, nearly as well as with guidance; the preview gave no significant benefit once live guidance was on (Guerreiro et al. 2020). **Milo:** the virtual walk is evidence-backed.
- Audio-only virtual environments transfer to real spaces, and game-like exploration beat directed instruction for shortcuts (Connors et al. 2014, Front Hum Neurosci, doi:10.3389/fnhum.2014.00223; Picinali et al. 2014, IJHCS, doi:10.1016/j.ijhcs.2013.12.008). **Milo:** allow free exploration, not only playback.
- [contested] Verbal descriptions alone did worse than audio-tactile maps (Papadopoulos et al. 2018, Assistive Technology, doi:10.1080/10400435.2017.1307879). A verbal virtual display transferred worse than visual learning, perhaps from lack of movement (Giudice et al. 2010, ACM TAP, doi:10.1145/1658349.1658352) [weak: sighted]. **Milo:** have users physically turn to face each leg.
- Turn-by-turn breeds passive navigation; spatial-audio cues built better cognitive maps (Clemenson et al. 2021, Sci Rep, doi:10.1038/s41598-021-87148-4) [weak: sighted].

## 5. Audio and speech output
- Spatialized speech gave the fastest travel of five displays (15 VI users; Loomis et al. 2005, JVIB, doi:10.1177/0145482X0509900404). Virtual sound imposed less cognitive load than spatial language (Klatzky et al. 2006, J Exp Psychol Appl, doi:10.1037/1076-898X.12.4.223). [weak: older lab studies] **Milo:** an optional spatial heading beacon.
- In a meta-analysis, speech and spearcons beat auditory icons, which beat earcons (Nees & Liebman 2023, Auditory Perception & Cognition, doi:10.1080/25742442.2023.2219201). **Milo:** few earcons, always paired with speech.
- BLV people listen faster than sighted people (Bragg et al. 2018, CHI, doi:10.1145/3173574.3174018). **Milo:** a high, user-set speech rate.
- Bone conduction localizes virtual sound nearly as well as headphones (MacDonald et al. 2006, Int J Audiol, doi:10.1080/14992020600876519), yet still degrades localization of real sounds (May & Walker 2017, Appl Ergon, doi:10.1016/j.apergo.2017.01.009) [weak: sighted]. **Milo:** stay quiet at the kerb.
- [contested] Parsimonious instructions (10 blind users) improved clarity and safety at no time cost (Mascetti et al. 2025, IMWUT, doi:10.1145/3749537), yet in iMove logs a passive, verbose mode was the most popular (Kacorri et al. 2018, TACCESS, doi:10.1145/3178853). Users found 42% of aid errors acceptable in context (Abdolrahmani et al. 2017, CHI, doi:10.1145/3025453.3025528). **Milo:** a terse default plus an optional ambient mode.

## 6. Voice assistants and LLM tools
- Blind voice-assistant users (N=14) struggled with input, uncontrollable responses, privacy and trust (Abdolrahmani et al. 2018, ASSETS, doi:10.1145/3234695.3236344). Guidelines modelled on human conversation hinder them (Branham & Mukkath Roy 2019, ASSETS, doi:10.1145/3308561.3353797), and they want efficiency (Abdolrahmani et al. 2019, TACCESS, doi:10.1145/3368426). **Milo:** terse, interruptible, repeatable; no small talk.
- Speech input was ≈5× faster than typing, but 80.3% of the time went on fixing errors (Azenkot & Lee 2013, ASSETS, doi:10.1145/2513383.2513440). **Milo:** read back recognised street names.
- In ChitChatGuide (11 users), the LLM handled vague, contextual questions and made exploring more enjoyable (Kaniwa et al. 2024, PACM HCI, doi:10.1145/3676492). **Milo:** the LLM for Phase-1 Q&A; deterministic routing.
- Be My AI and similar tools hallucinate and misread intent (Xie et al. 2025, CHI, doi:10.1145/3706598.3714210). Users form flawed mental models (Adnin & Das 2024, ASSETS, doi:10.1145/3663548.3675631) and verify by cross-checking (Alharbi et al. 2024, ASSETS, doi:10.1145/3663548.3675659). AI scene descriptions scored 2.76/5 for satisfaction and 2.43/4 for trust (Gonzalez Penuela et al. 2024, CHI, doi:10.1145/3613904.3642211). **Milo:** ground answers in OSM, cite the source, never invent opening hours.

## 7. Smartphone positioning
- Phones: 5.0–8.5 m median static error, maximum 30 m (Zandbergen & Barbeau 2011, J Navig, doi:10.1017/S0373463311000051); 7–13 m in a city (Merry & Bettinger 2019, PLOS ONE, doi:10.1371/journal.pone.0219890). **Milo:** design for 5–15 m, with 30 m outliers.
- Urban canyons hurt cross-street accuracy most. In London, phone GNSS put users on the correct side of the street only 24.8% of the time, versus 54.5% with 3D shadow matching (Wang et al. 2015, J Navig, doi:10.1017/S0373463314000836). In Hong Kong it was within 10 m 30% of the time; adding pedestrian dead reckoning (PDR) and beacons reached 80% (Ye et al. 2019, Remote Sens, doi:10.3390/rs11182174). **Milo:** never infer the sidewalk side from GNSS.
- Dual-frequency: 4.57 m DRMS on E5 alone (Robustelli et al. 2019, Electronics, doi:10.3390/electronics8010091); 1.75 m with L5 differential GNSS, though antennas limit RTK and PPP (Yun et al. 2022, Sensors, doi:10.3390/s22249879) [not urban canyon]. Google VPS can reach sub-metre accuracy (Horvath et al. 2025, IEEE/ION PLANS, doi:10.1109/plans61210.2025.11028337) [preliminary]. BLE beacons plus inertial sensing gave 1.65 m indoors, but need installed infrastructure (Sato et al. 2017; method: Murata et al. 2019, Pervasive Mob Comput, doi:10.1016/j.pmcj.2019.04.003).
- PDR must be trained on blind walkers' gait (Flores & Manduchi 2018, TACCESS, doi:10.1145/3161711; Ren et al. 2021, Sensors, doi:10.3390/s21124033). Anchoring PDR to detected crosswalk crossings halved error for VI walkers, who often leave mapped paths (Daniş et al. 2025, IPIN, doi:10.1109/ipin66788.2025.11212908). **Milo:** tolerant map-matching; crossings as anchors.

## 8. Reviews and adoption
- Designs repeatedly misunderstand heterogeneous users (81% are over 49) and lack core features (Real & Araujo 2019, Sensors, doi:10.3390/s19153404; Kuriakose et al. 2022, IETE Tech Rev, doi:10.1080/02564602.2020.1819893).
- No comprehensive solution exists. Good routes are "safe, well supported" (fewer turns, more traffic lights), not the shortest. Centreline routing degrades instructions, and public transport is rarely integrated (El-taher et al. 2021, Sensors, doi:10.3390/s21093103). **Milo:** route on sidewalks and crossings with safety-weighted costs.
- 29.3% of assistive devices were abandoned. Predictors were users not being consulted, poor performance and changing needs (Phillips & Zhao 1993, Assistive Technology, doi:10.1080/10400435.1993.10132205). Complex feedback overwhelms attention (Cuturi et al. 2016, Neurosci Biobehav Rev, doi:10.1016/j.neubiorev.2016.08.019). The cane and guide dog still dominate (Hersh 2022, Sensors, doi:10.3390/s22145454).
- Users combine apps that fill each other's gaps (Kameswaran et al. 2020, ASSETS, doi:10.1145/3373625.3416995). Among 4,700+ Soundscape users, first-use duration and spatial callouts predicted retention (Liu et al. 2022, CHI EA, doi:10.1145/3491101.3519862). **Milo:** coexist with other apps; invest in onboarding.

## Top 10 design implications (ranked)
1. **Crossings first:** route cost ranks APS > signal > zebra > uncontrolled; brief each crossing. (§2 Barlow, Guth, Ahmetovic 2017)
2. **Design for 5–15 m error**, worse across the street: debounce off-route alerts; say "approaching", not "arrived". (§7 Wang, Ye; §3 Saha)
3. **Inform, don't command, at the kerb:** alignment and signal timing belong to O&M, APS and tactile cues. (§2 Scott, Bentzen, Guth)
4. **Turn pattern:** distance, then "approaching", then "turn now", timed to walking speed; avoid "slight". (§1 Sato, Ahmetovic, Ohn-Bar)
5. **Terse by default**, with adaptive verbosity. (§5 Mascetti; §1 Ahmetovic 2019; counter: Kacorri)
6. **An interactive virtual walk** with leap and walk modes, physical turning and exploration. (§4 Guerreiro, Connors)
7. **An arrival mode:** street side, entrance, landmarks, then hand-off to VPS or human help. (§3 Saha, Chen)
8. **Grounded Q&A:** the LLM parses questions; OSM supplies facts, with the source stated. (§6 Kaniwa, Xie, Alharbi)
9. **Voice UX for experts:** barge-in, fast speech, read-back of recognised names. (§6 Branham, Azenkot; §5 Bragg)
10. **Keep the ears open:** open-ear audio, few earcons, coexistence with other apps. (§5 May & Walker, Nees; §8 Kameswaran)

## Evidence gaps and caveats
- Clock face vs left/right: no controlled comparison found.
- Verbosity findings conflict; Kuriakose et al. 2023 (IJHCS, doi:10.1016/j.ijhcs.2023.103098) found no preference.
- Turn-timing evidence is indoor BLE (≈1.6 m).
- Crossing research is US-centric, and LLM studies are small and qualitative.

*Method:* Scite exposed no search tools (so no `report_citations`). Papers were verified via Crossref, Semantic Scholar, OpenAlex, Europe PMC and full texts. Sources I could not read (Gaunet 2006; Bradley & Dunlop 2005) were excluded.
