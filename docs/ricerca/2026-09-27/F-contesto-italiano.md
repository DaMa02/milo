# F. Italian context for Milo

Research date: 27 Sep 2026. Tags: **[V]** verified in a primary source fetched for this report; **[P]** press or secondary source; **[M]** my own measurement (Overpass, taginfo, downloaded datasets); **[U]** could not verify. Not legal advice.

## Key takeaways

1. **The associations accept apps only as a supplement.** UICI and ADV, through INMACI, call tactile paths the *ausilio primario*. They say GPS or beacon guidance "non si sono rivelate efficaci" and accept it only as extra information [V][1]. Milo should present itself as a complement to the cane, guide dog and O&M training, and involve UICI Milano early.
2. **Milan's OSM data is rich** (22,660 crossings, 2,442 km of sidewalks, 1,409 crossings with sound), but no one in Italy maps the type of tactile paving [M].
3. **Milan has no open data on acoustic signals**; Florence does [M][19]. ATM has no GTFS-RT and no open feed of lift status.
4. **Liability.** From 9 Dec 2026, EU law treats software as a "product"; non-commercial open-source software is excluded [V][27].

## 1. Tactile paving

- **History.** LOGES ("Linea di Orientamento Guida E Sicurezza") has been in use since 1995 [V][1][14]. In 2013 INMACI released Loges-Vet-Evolution (LVE), with refined tile profiles and voice tags [V][2]. RFI adopted the LVE guidelines for stations in 2016 [V][2].
- **The six codes** [V][1][3]:

| Code | Form | Meaning |
|---|---|---|
| Direzione rettilinea | 60 cm strip, grooves along the walking direction | Guide line |
| Svolta obbligata | 60×60 cm, curved grooves | 90° turn |
| Incrocio (+/T) | 60×60 cm, alternating dashes | Junction: stop and choose a direction |
| Attenzione/servizio | Transverse ridges | Door, stairs, map or other service |
| Arresto/pericolo | Domes | Absolute stop, e.g. platform edge |
| Pericolo valicabile | 20 cm attenzione + 20 cm arresto | Crossing ramp, stairs going down |

- **At crossings** [V][1]. A strip of *direzione rettilinea* runs across the sidewalk and ends in a *pericolo valicabile* band. At signalized crossings the strip passes within 40–60 cm of the pole, so the user can find the button. The user instructions say: if there is a pole within half a metre, the crossing is signalized; if not, it is a zebra crossing without signals.
- **TAG-RFG** (vendors call it "RFID"). Passive tags sit under the tiles every 60 cm and are read by an electronic cane. Programming the tags is optional ("rimessa alla decisione del committente"), so many installed tags may say nothing [V][1]. I could not find how common silent tags are [U].
- **LETIsmart is a separate system.** It uses radio beacons and a talking cane handle, with no smartphone involved.
  - Trieste: all 300 buses and more than 100 crossings (2020) [P][4].
  - Milan pilot, Oct 2024: 31 beacons at signalized crossings and at the M1 Palestro entrance, donated by UICI, the Istituto dei Ciechi and the Lions [P][5][V][6].
- **Where it is installed.**
  - All M4 and M5 stations and "most" other ATM stations have LOGES. Platform-edge relief is missing at M2 Villa Fiorita, Bussero and Villa Pompea, and on M4/M5, which have screen doors [V][14].
  - Coverage of Milan's street crossings: [U].
- **In OSM.**
  - The values in use are `tactile_paving=yes/no/incorrect/partial/primitive/contrasted` [V][7]. There is no Italian wiki page or Italian convention.
  - `tactile_paving:type` exists worldwide (553 `warning_block`, 405 `directional_block`, 331 `attention_block`) but has 0 uses in Italy [M].
  - Our proposal: map arresto as `warning_block`, direzione as `directional_block` and attenzione/servizio as `attention_block`. Incrocio, svolta and pericolo valicabile would need new values agreed with the community.

## 2. Accessible pedestrian signals

- **What the law requires.**
  - DPR 503/1996 art. 6: new or replaced signals "devono essere dotati di avvisatori acustici" [V][8].
  - Regolamento CdS art. 162: 60 pulses a minute on green, 120 on yellow, silence on red. The sound may run all the time or on request [V][9].
  - CdS art. 191(3): drivers must stop for a person with a white cane or a guide dog [V][10].
- **Technical standard.**
  - CEI 214-7 (1999, amended 2001) is the reference for homologation [P][11].
  - INMACI adds these requirements [V][1]:
    - Sound on request is preferred, and a beep confirms the press.
    - The button sits under the box, with a raised arrow showing the crossing direction.
    - The sound is 5–10 dB above street noise.
    - A remote control may be offered only in addition to the button.
  - I found no rule for vibrating signals and no UNI standard [U].
- **Funding.** The 2021 ministry grant call (€878k) required tactile paths that meet INMACI rules [V][12].
- **Milan.** The city has 740 signal installations [V][13] but no official count of acoustic ones [U]. OSM has 5,532 signalized crossing nodes; 40% are surveyed for sound (1,409 yes, 827 no) and 463 have vibration. Italy-wide: sound yes 4,453, no 8,800 [M].
- **Tagging caveats.** The Italian *pulsante per non vedenti* turns on the sound; it does not necessarily call the green light. This makes `button_operated` easy to misuse. There is a separate tag, `traffic_signals:sound:radio_activated`, for signals activated remotely [V][15].

## 3. Open data and transit

- **Comune di Milano** (CC BY 4.0). There is no dataset on signals or crossings [M]. Useful datasets:
  - **Avvisi di manomissione (ds925):** daily list of about 200 active small excavations (up to 60 m², 40 days) with coordinates, dates and sidewalk/roadway flag. I found no dataset for large building sites [U].
  - **DBT 2020 topographic database:** 53,978 sidewalk polygons. It has no crossings.
  - House numbers with coordinates, Zone 30 areas, ATM stops.
  - **GTFS**, updated every 2–4 weeks: 4,897 stops, with `wheelchair_boarding` filled in for 58%. It has no stations, pathways or levels.
- **ATM.**
  - There is no GTFS-RT. The Mobility Database lists real-time feeds for Rome, Turin and Venice, but none for Milan [M][16].
  - Lift status is shown in real time on atm.it and in the ATM app [P][17]; I found no API for it [U].
  - Real-time waiting times are available through the regional E015 API, but the policy forbids modifying the data and requires showing when it was last updated [V][18].
- **Other cities.**
  - Florence publishes each signal installation with its acoustic status: 201 complete, 33 partial, 122 none (CC BY 4.0) [M][19].
  - Bologna reports 339 intersections with acoustic signals [P][20].
  - UICI Torino keeps a list of about 150 acoustic signals [P][21].
  - Rome ATAC is fitting more than 435 shelters with NaviLens codes that give real-time arrivals [P][22].

## 4. OSM completeness

Milan figures are Overpass counts for the Comune (27 Sep 2026). Italy figures come from Geofabrik taginfo and count all nodes carrying the key, so they are approximate [M].

| Feature | Milan | Italy |
|---|---|---|
| `highway=crossing` | 22,660 | 533,650 |
| …with `crossing=*` | 85% | 408k |
| …with `crossing:markings` | 49% | 270k |
| …with `tactile_paving` | 41% (yes: 841) | yes 26k, no 271k |
| `kerb` nodes | 37,108 | 118,897 |
| `footway=sidewalk` | 2,442 km | 167k ways |
| Main roads | 1,808 km (28% tagged `sidewalk=separate`) | n/a |

- **Sidewalk coverage.** Milan has 1.35 km of sidewalk per km of road; sidewalks on both sides everywhere would give 2.0. 46% of road length carries some `sidewalk*` tag.
- **Why Milan is well covered.** AMAT's pedestrian-graph project (2016–19) uploaded its data to OSM [V][23][24]. The ViaLibera project mapped Municipio 9 [V][25].
- **National campaign.** The March 2026 OSM Italia campaign mapped crossings and sidewalks [V][26].
- I found no independent study of completeness [U].

## 5. The blind community

- **Positions.** Besides INMACI's stance (takeaway 1), UICI Torino calls apps "utilissime" but says they cannot replace announcements on board, because many older people are not comfortable with technology [V][28].
- **Apps.**
  - The UICI newspaper (2019) lists Google Maps, Moovit, Seeing AI and Be My Eyes [V][29].
  - Ariadne GPS, made by an Italian developer, was last updated in 2020 [V][30].
  - BlindSquare is available in Italian and uses OSM [V][31].
  - I found no usage figures [U].
- **Surveys.** A University of Milan survey ran in 2024 [V][32]; I found no published results [U].
- **O&M training.** ANIOMAP instructors teach cane technique, crossings and public transport [V][33]. INMACI recommends an O&M course before relying on tactile paths [V][1]. I could not find what the Istituto dei Ciechi di Milano teaches about apps [U].
- **Directions.** INMACI uses left and right, and metres ("a meno di mezzo metro sulla destra") [V][3]. I found no source for clock positions or counting steps [U]. Make the format configurable.

## 6. Legal

- **European Accessibility Act** (Directive 2019/882; Italian D.Lgs. 82/2022) [V][34][35]:
  - For urban transport, only self-service terminals are covered.
  - Navigation maps are excluded if their essential information is accessible.
  - Microenterprises providing services are exempt.
  - My reading: a free walking app is probably outside its scope. Use WCAG anyway.
- **Product liability** (Directive 2024/2853) [V][27]:
  - It covers software placed on the market after 9 Dec 2026.
  - Non-commercial open-source software is excluded. Supplying it for money, or for personal data used beyond security and compatibility, makes it commercial.
  - A disclaimer cannot exclude this liability.
  - Italian civil code art. 1229 voids clauses that exclude liability for intent or gross negligence [V][36].
- **Medical devices.** Under MDR 2017/745, software meant for "compensation for… disability" is a medical device, likely Class I under Rule 11 [V][37]. Word Milo's intended purpose carefully. I could not find whether regulators actually treat walking apps this way [U].
- **GDPR.**
  - Using an app for blind people can reveal a disability. EU court case C-184/20 treats data that indirectly reveals sensitive information as special-category data [V][38].
  - Keep routing on the device, with no accounts and no location tracking, and carry out a data protection impact assessment.
- **Disclaimers used by similar apps.**
  - BlindSquare: "it will never substitute good orientation and traveling skills" [V][31].
  - Ariadne GPS: "Non affidarti completamente ad essa" [V][30].

## Sources

1. LVE Guidelines ed. 23 (INMACI): https://www.mobilitaautonoma.org/documenti/Linee%20Guida%20LVE%20(Ed.%2023%20-%202025%2004%2009%20-%20Ita).pdf
2. ADV/INMACI good-practice sheet: http://www.urbanisticainformazioni.it/IMG/pdf/scheda_linguaggio_tattilo_vocale.pdf
3. https://www.mobilitaautonoma.org/percorsi-e-segnali-tattili-lve-menu/i-6-codici and …/istruzioni-per-l-uso-di-lve
4. https://giornale.uici.it/trieste-avviato-il-sistema-letismart-su-tutta-la-citta/ ; https://www.triesteprima.it/cronaca/trieste-pioniera-italia-non-vedenti.html
5. https://milano.notizie.it/cronaca-milano/2024/10/06/milano-diventa-una-citta-inclusiva-grazie-allimplementazione-di-segnali-sonori-per-persone-non-vedenti/
6. https://www.letismart.it/city/progetto-europeo-elaborator-smartcity-milano-con-il-sistema-sistema-uici-letismart/
7. https://wiki.openstreetmap.org/wiki/Key:tactile_paving
8. https://handylex.org/semafori-acustici-per-non-vedenti/
9. https://www.circolazione-stradale.it/Regolamento-CdS/Articolo-162-Regolamento-CdS
10. https://www.brocardi.it/codice-della-strada/titolo-v/art191.html
11. https://www.voltimum.it/articolo/notizie-tecnico-normative/la-norma-cei
12. https://www.mobilitaautonoma.org/riconoscimenti-menu/mit-bando-semafori-acustici-e-tattilo-plantare-inmaci
13. https://www.amat-mi.it/it/temi/impianti-semaforici/
14. https://www.atm.it/it/AltriServizi/Disabili/Pagine/DisabilitaVisiva.aspx
15. https://wiki.openstreetmap.org/wiki/Key:traffic_signals:sound
16. https://files.mobilitydatabase.org/feeds_v2.csv ; https://dati.comune.milano.it/dataset/ds929-orari-del-trasporto-pubblico-locale-nel-comune-di-milano-in-formato-gtfs
17. https://ledhamilano.it/aggiornamenti/laccessibilita-della-metro-di-milano-in-tempo-reale/
18. https://www.e015.regione.lombardia.it/site/api-detail?id=336 (policy: …/site/download-policy?id=336)
19. Comune di Firenze "Impianti semaforici" via https://dati.toscana.it ; SHP: https://data.comune.fi.it/datastore/download.php?id=5139&type=99&format=url&file_format=shp&file_id=16657
20. https://www.renonews.it/primo-piano/2024/01/18/bologna-citta-30-il-ruolo-della-centrale-di-controllo-semaforico-del-comune-di-bologna/
21. https://www.uictorino.it/semafori-sonori/
22. https://canaledieci.it/2026/01/25/nuove-pensiline-atac-con-tecnologia-navilens-roma-diventa-piu-inclusiva-per-ciechi-e-ipovedenti/
23. https://wiki.openstreetmap.org/wiki/Accessibilit%C3%A0_Milano_(2018)
24. https://www.wikimedia.it/news/accessibilita-openstreetmap-un-confronto-amat-nellambito-della-milano-digital-week/
25. https://wiki.openstreetmap.org/wiki/IT:ViaLibera
26. https://community.openstreetmap.org/t/progetto-del-mese-marzo-2026-attraversamenti-e-marciapiedi/141952 ; https://osmit-podoma.wmcloud.org
27. Directive (EU) 2024/2853: http://publications.europa.eu/resource/celex/32024L2853
28. https://giornale.uici.it/torino-mezzi-pubblici-e-disabilita-visiva/
29. https://giornale.uici.it/app-che-non-possono-mancare-sul-nostro-dispositivo-di-giuseppe-fornaro/
30. https://apps.apple.com/it/app/ariadne-gps/id441063072
31. https://www.blindsquare.com/about/ ; https://www.blindsquare.com/user-guide/
32. https://giornale.uici.it/questionario-sulla-mobilita-sostenibile-delle-persone-con-disabilita-visiva/
33. https://www.aniomap.it/ ; https://www.aniomap.it/pdf/opuscolo-om.pdf
34. Directive (EU) 2019/882: http://publications.europa.eu/resource/celex/32019L0882
35. D.Lgs. 82/2022: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2022-05-27;82
36. https://www.brocardi.it/codice-civile/libro-quarto/titolo-i/capo-iii/art1229.html
37. Regulation (EU) 2017/745: http://publications.europa.eu/resource/celex/32017R0745
38. CJEU C-184/20: http://publications.europa.eu/resource/celex/62020CJ0184

Data used for the [M] figures: https://dati.comune.milano.it (ds925, ds2889, ds634, ds1438), Overpass (maps.mail.ru mirror, Comune di Milano area 3600044915), https://taginfo.geofabrik.de/europe:italy/ and https://taginfo.openstreetmap.org
