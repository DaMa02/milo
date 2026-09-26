# Roadmap

These features can be built on the current engine and app. Each comes with the reason it matters.

## Data

- **Accessible signals, entrances and pavement widths from municipal open data.** Today sound at traffic lights is mapped on only 7 of 70 crossings near Talent Garden, and the engine does not know where a building's entrances are.
- **Tactile paving at crossings in answers and cues.** The engine already reads the `tactile_paving` tag of each crossing but does not say it yet, and tactile paving is a landmark a cane user can find.
- **Opening hours from the web when OpenStreetMap has none, with the source.** Hours are said only when OSM has them, so for other places Milo can only say "the map does not say when it is open".
- **Walking distance in place answers.** "About a place" gives a straight-line distance, which can mislead: near Talent Garden, a point 350 m away is 1,080 m on foot because a railway lies in between.

## Guidance

- **Guidance on public transport** (the stop to wait at, "get off at the next stop"). Milo already plans bus and tram routes, but live guidance works only on routes on foot.
- **Saved routes** ("the way home"). Repeated trips should not need planning again.
- **A camera check on the pavement.** A photo would be compared with what the map claims, for example a crossing that turns out to be blocked, and the result would be labelled as an estimate. The map cannot see temporary obstacles.

## Voice

- **Replies in Italian and a neural voice.** Italian is understood today, but the answers are in English.
- **Spatial audio.** The ways out of a junction would sound from left to right, through the Web Audio `StereoPannerNode`. Direction by sound needs fewer words, and it has to be tested with headphones before it ships.
- **Streamed wording.** With the 3 s budget, about one Claude reply in three falls back to the engine's longer text.

## Platform

- **The engine in the cloud,** with persistent sessions. Today it runs on one Mac, and a restart loses every session.
- **An installable app (PWA).** Milo would open from the home screen, full screen, with no address to type.
- **A native iOS app** with guidance on a locked screen, haptic cues and VoiceOver integration. iOS suspends GPS and audio when a browser tab is locked.

## Community

- **"Report a crossing."** Users would add a missing signal or sound signal by voice, and the data would be sent back to OpenStreetMap. That closes the data gap for every app built on OSM, not only Milo.
- **Co-design with blind pedestrians and orientation-and-mobility instructors.** Milo's speaking rules follow common practice as we understand it, but no blind user has tested them yet.
