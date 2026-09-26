"""Place search and reverse over HTTP with a fake Photon (httpx.MockTransport) and the Talent Garden Zone from cache.
Offline: any real network connection attempt fails the test.

    python tests/test_places.py      (from server-py)
"""
import pathlib
import socket
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
NET = []


def _no_network(_sock, address, *_a):
    NET.append(address)
    raise OSError("network disabled in test_places")


socket.socket.connect = _no_network

import httpx  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from lotl.zone import Zone  # noqa: E402
from places_api import NOT_FOUND, make_router  # noqa: E402

passed, failed = 0, []


def check(cond, what):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(what)
        print("FAIL", what)


def feat(lat, lon, **props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


SEARCH = [feat(45.5, 9.4, name="Far Place", osm_key="amenity", osm_value="cafe", city="Elsewhere"),  # outside the map
          feat(45.4466, 9.2058, name="Bocconi University", osm_key="amenity", osm_value="university",
               street="Via Roberto Sarfatti", housenumber="25", city="Milan"),
          feat(45.45, 9.2, osm_key="place", osm_value="postcode")]  # no name: dropped
REVERSE = [feat(45.44387, 9.20809, name="ATM", osm_key="amenity", osm_value="atm"),
           feat(45.44390, 9.20810, name="Talent Garden", osm_key="building", osm_value="yes",
                street="Via Arcivescovo Calabiana", housenumber="6", city="Milan"),
           feat(45.44500, 9.20800, name="Far School", osm_key="amenity", osm_value="school")]
calls, down = [], [False]


def photon(req):
    calls.append(req.url)
    if down[0]:
        raise httpx.ConnectTimeout("down")
    return httpx.Response(200, json={"features": REVERSE if req.url.path == "/reverse" else SEARCH})


zone = Zone()
app = FastAPI()
app.include_router(make_router(lambda: zone, httpx.Client(transport=httpx.MockTransport(photon))))
c = TestClient(app)

# search: mapping, inside-the-map first, distance from near rounded to 10 m
r = c.post("/places/search", json={"query": "the bocconi university milan", "near": {"lat": 45.44386, "lon": 9.20808}})
check(r.status_code == 200, f"search 200 ({r.status_code})")
cands = r.json()["candidates"]
b = cands[0]
check([x["name"] for x in cands] == ["Bocconi University", "Far Place"], f"inside first ({[x['name'] for x in cands]})")
check(b == {**b, "kind": "university", "street": "Via Roberto Sarfatti", "housenumber": "25", "city": "Milan",
            "lat": 45.4466, "lon": 9.2058}, f"mapping ({b})")
check(b["distance_m"] % 10 == 0 and 200 < b["distance_m"] < 600, f"distance ({b['distance_m']})")
check(set(b) == {"name", "kind", "street", "housenumber", "city", "lat", "lon", "distance_m"}, "candidate keys")
q = calls[-1].params
check(q["limit"] == "3" and q["lang"] == "en" and q["lat"] == "45.444", f"photon params ({q})")

# identical query: served from the cache
n = len(calls)
c.post("/places/search", json={"query": "the bocconi university milan", "near": {"lat": 45.44386, "lon": 9.20808}})
check(len(calls) == n, "cached query makes no call")

# empty query: a sayable 422
r = c.post("/places/search", json={"query": "   "})
check(r.status_code == 422 and isinstance(r.json()["detail"], str), "empty query 422")

# reverse: street and number first, name only for a real building within 25 m (not the ATM)
r = c.post("/places/reverse", json={"lat": 45.44386, "lon": 9.20808, "lang": "en"})
d = r.json()
check(d == {"label": "Via Arcivescovo Calabiana 6", "street": "Via Arcivescovo Calabiana", "housenumber": "6",
            "name": "Talent Garden", "city": "Milan", "lat": 45.44386, "lon": 9.20808}, f"reverse ({d})")

# Photon down: offline fallback on the zone map
down[0] = True
r = c.post("/places/search", json={"query": "viale Isonzo"})
check(r.status_code == 200 and r.json()["candidates"][0]["name"] == "Viale Isonzo"
      and r.json()["candidates"][0]["kind"] == "street", f"offline search ({r.json()})")
r = c.post("/places/search", json={"query": "nowhere at all xyz"})
check(r.status_code == 422 and r.json()["detail"] == NOT_FOUND, "offline nothing found 422")
r = c.post("/places/reverse", json={"lat": 45.44658, "lon": 9.20584})
check(r.status_code == 200 and r.json()["street"] and r.json()["name"] is None, f"offline reverse ({r.json()})")
r = c.post("/places/reverse", json={"lat": 45.4438, "lon": 9.2080})  # Talent Garden, 48 m from its street
check(r.status_code == 200 and r.json()["street"] == "Via Arcivescovo Calabiana", f"offline reverse TG ({r.json()})")

check(not NET, f"no network ({NET})")
print(f"{passed} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
