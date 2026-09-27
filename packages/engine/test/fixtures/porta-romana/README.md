# Porta Romana test zone

- `network.json.gz`, `features.json.gz`: Overpass API answers for 1.5 km around Talent Garden, Milan (the walk
  network and the map features), downloaded on 2026-09-27. Map data © OpenStreetMap contributors, available under
  the Open Database License (ODbL): https://www.openstreetmap.org/copyright
- `reference.json.gz`: inputs and outputs of the legacy Python engine (the hackathon `server-py/`) on that data,
  written by `tools/reference/dump.py`. The TypeScript engine's parity tests replay every case and require the same
  answers, word for word.
