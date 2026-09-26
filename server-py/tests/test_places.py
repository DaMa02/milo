"""Place search and reverse over HTTP with a fake Photon (httpx.MockTransport) and the Talent Garden Zone from cache.
Offline: any real network connection attempt fails the test.

    python tests/test_places.py      (from server-py)
"""
import json
import os
import pathlib
import socket
import sys
from types import SimpleNamespace as NS

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
          feat(45.45, 9.2, osm_key="place", osm_value="postcode"),  # no name: dropped
          feat(14.65, 121.07, name="Manila University", osm_key="amenity", osm_value="university")]  # > 25 km: dropped
MISHEARD = [feat(14.65, 121.07, name="Baconi University", osm_key="amenity", osm_value="university"),
            feat(44.43, 26.1, name="Bacon University", osm_key="amenity", osm_value="university"),
            feat(40.85, 14.27, name="Naples Baconi", osm_key="amenity", osm_value="university")]
REVERSE = [feat(45.44387, 9.20809, name="ATM", osm_key="amenity", osm_value="atm"),
           feat(45.44390, 9.20810, name="Talent Garden", osm_key="building", osm_value="yes",
                street="Via Arcivescovo Calabiana", housenumber="6", city="Milan"),
           feat(45.44500, 9.20800, name="Far School", osm_key="amenity", osm_value="school")]
calls, down = [], [False]


def photon(req):
    calls.append(req.url)
    if down[0]:
        raise httpx.ConnectTimeout("down")
    if req.url.path == "/reverse":
        return httpx.Response(200, json={"features": REVERSE})
    return httpx.Response(200, json={"features": MISHEARD if "baconi" in req.url.params["q"].lower() else SEARCH})


class FakeLLM:
    """Stands in for anthropic.Anthropic: always guesses Bocconi (twice, to test the dedupe), records every call."""
    def __init__(self):
        self.calls = []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kw):
        self.calls.append(kw)
        return NS(stop_reason="end_turn",
                  content=[NS(type="text", text=json.dumps({"names": ["Bocconi University", "Università Bocconi"]}))])


def router(llm=None):
    a = FastAPI()
    a.include_router(make_router(lambda: zone, httpx.Client(transport=httpx.MockTransport(photon)), llm))
    return TestClient(a)


zone = Zone()
llm = FakeLLM()
c = router(llm)

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
check(q["bbox"] == "9.0,45.35,9.35,45.6", f"photon restricted to greater Milan ({q.get('bbox')})")
check(not llm.calls, "Photon found it: no model call")

# misheard: every Photon hit is > 25 km away (Manila, Bucharest, Naples) -> Claude guesses once -> Bocconi
r = c.post("/places/search", json={"query": "Baconi University", "near": {"lat": 45.44386, "lon": 9.20808}})
check(r.status_code == 200 and [x["name"] for x in r.json()["candidates"]] == ["Bocconi University", "Far Place"],
      f"misheard corrected ({r.json()})")
check(len(llm.calls) == 1 and "'Baconi University'" in llm.calls[0]["messages"][0]["content"]
      and llm.calls[0]["output_config"]["effort"] == "low", "one low-effort model call with the query")
check([u.params["q"] for u in calls[-3:]] == ["Baconi University", "Bocconi University", "Università Bocconi"]
      and all(u.params["bbox"] == "9.0,45.35,9.35,45.6" for u in calls[-3:]), "guesses searched inside the bbox")

# no key: no model call, straight to the offline fallback (nothing in the zone map: sayable 422)
os.environ.pop("ANTHROPIC_API_KEY", None)
r = router().post("/places/search", json={"query": "Baconi University"})
check(r.status_code == 422 and r.json()["detail"] == NOT_FOUND, f"no key 422 ({r.json()})")

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
