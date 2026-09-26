"""Place search and reverse geocoding (contracts: /places/search, /places/reverse), Photon first, the zone map as fallback.

    app.include_router(make_router(lambda: ZONE))

Queries and coordinates stay in request bodies and are never logged.
"""
import logging
from functools import lru_cache
from typing import Optional

import httpx
import osmnx as ox
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lotl.tools import _norm, _places
from lotl.zone import r10

PHOTON = "https://photon.komoot.io"
UA = "LayOfTheLand-hackathon/0.1 (maglionicodaniele@gmail.com)"
NOT_FOUND = "I could not find that place. Say it again with the street or the area."
NAMED = {"building", "tourism", "shop"}  # osm_key whose name is a place worth saying
NAMED_AMENITY = {"university", "school", "hospital", "place_of_worship"}
NOISE = ("!amenity:bicycle_rental", "!highway:bus_stop", "!railway:tram_stop", "!railway:platform",
         "!public_transport:platform", "!public_transport:stop_position")  # stops and bike docks outrank the place asked
logging.getLogger("httpx").setLevel(logging.WARNING)  # httpx logs request URLs, which carry queries and coordinates


class LatLon(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class SearchIn(BaseModel):
    query: str = Field(max_length=200)
    near: Optional[LatLon] = None
    lang: str = "en"


class ReverseIn(LatLon):
    lang: str = "en"


def dist(a, b):
    return ox.distance.great_circle(a[0], a[1], b[0], b[1])


def candidate(name, kind, street, housenumber, city, lat, lon, ref):
    return {"name": name, "kind": kind, "street": street, "housenumber": housenumber, "city": city,
            "lat": lat, "lon": lon, "distance_m": r10(dist(ref, (lat, lon)))}


def from_photon(f, ref):
    p, (lon, lat) = f["properties"], f["geometry"]["coordinates"]
    street = p.get("street") or (p.get("name") if p.get("osm_key") == "highway" else None)
    return candidate(p.get("name") or street, p.get("osm_value"), street, p.get("housenumber"), p.get("city"),
                     lat, lon, ref)


def offline(zone, query, ref):
    """Named streets and features of the zone map that match the query, nearest first."""
    q, pool = _norm(query), _places(zone)
    hits = [p for p in pool if q in (p["name"].lower(), p["label"].lower())] or \
           [p for p in pool if q in p["name"].lower() or set(q.split()) <= set(p["name"].lower().split())]
    out = []
    for p in hits:
        lat, lon = zone.ll(p["geom"].representative_point())
        out.append(candidate(p["name"], p["kind"], p["name"] if p["kind"] == "street" else None, None, None,
                             lat, lon, ref))
    return sorted(out, key=lambda c: c["distance_m"])[:3]


def make_router(get_zone, client=None):
    router = APIRouter()
    client = client or httpx.Client(timeout=3, headers={"User-Agent": UA})

    @lru_cache(maxsize=256)  # failures raise, so only answers are cached
    def photon(path, **params):
        r = client.get(PHOTON + path, params=params)
        r.raise_for_status()
        return tuple(r.json()["features"])

    @router.post("/places/search")
    def search(body: SearchIn):
        query = " ".join(body.query.split())
        if not query:
            raise HTTPException(422, "Which place do you mean? Say its name, the street or the area.")
        zone = get_zone()
        ref = (body.near.lat, body.near.lon) if body.near else tuple(zone.center)
        try:
            feats = photon("/api", q=query, limit=3, lang="en", lat=round(ref[0], 3), lon=round(ref[1], 3),
                           osm_tag=NOISE)
            found = [c for c in (from_photon(f, ref) for f in feats) if c["name"]]
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            found = []
        found = found or offline(zone, query, ref)
        if not found:
            raise HTTPException(422, NOT_FOUND)
        found.sort(key=lambda c: dist(zone.center, (c["lat"], c["lon"])) > zone.dist)  # inside the map first, stable
        return {"query": query, "candidates": found}

    @router.post("/places/reverse")
    def reverse(body: ReverseIn):
        zone, here = get_zone(), (body.lat, body.lon)
        try:
            feats = photon("/reverse", lat=round(body.lat, 5), lon=round(body.lon, 5), limit=5, lang="en")
            props = [(f["properties"], f["geometry"]["coordinates"]) for f in feats]
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            props = []
        addr = next((p for p, _ in props if p.get("street") or p.get("osm_key") == "highway"), None)
        named = next((p for p, (lon, lat) in props if (p.get("osm_key") in NAMED or p.get("osm_key") == "amenity"
                      and p.get("osm_value") in NAMED_AMENITY) and p.get("name") and dist(here, (lat, lon)) <= 25), None)
        if addr:
            street, number = addr.get("street") or addr.get("name"), addr.get("housenumber")
        else:  # Photon down or no street near: the nearest named street of the zone map
            street, number = zone.road_name(zone.xy(*here), 150), None  # Talent Garden sits 48 m from its street
        name = named and named["name"]
        city = next((p.get("city") for p, _ in props if p.get("city")), None)
        label = " ".join(x for x in (street, number) if x) or name
        if not label:
            raise HTTPException(422, NOT_FOUND)
        return {"label": label, "street": street, "housenumber": number, "name": name, "city": city,
                "lat": body.lat, "lon": body.lon}

    return router
