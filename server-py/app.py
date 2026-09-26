"""Lay of the Land engine: FastAPI over the cached demo zone. Routes sit at the root (the Vite proxy strips /api).

    uvicorn app:app --port 8000
"""
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Literal, Optional, Union

import osmnx as ox
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from lotl.explore import explore
from lotl.overview import _static, overview, ref_heading
from lotl.session import Session
from lotl import llm
from lotl.tools import TOOLS, _blocks, _junctions, _nodes, _places, _rail_places, _rail_union, ask
from lotl.zone import TALENT_GARDEN, Zone, centre_name, fmt, meta

CITY = dict(center=(45.4642, 9.19), dist=4000, answer_radius=4000, name="central Milan")  # same call: osmnx cache key
ZONE = None
ZONES = {}     # rounded centre -> zone built for an origin outside the city
SESSIONS = {}  # ponytail: in memory, lost on restart; one process only


@asynccontextmanager
async def lifespan(_app):
    global ZONE
    ZONE = Zone() if os.environ.get("LOTL_ZONE") == "porta-romana" else Zone(**CITY)
    # railway places, roads and the /ask caches: once here, not on the first question; threads overlap shapely's work
    with ThreadPoolExecutor() as ex:
        list(ex.map(lambda warm: warm(ZONE), (_static, _rail_places, _junctions, _places, _rail_union, _nodes, _blocks)))
    yield


app = FastAPI(title="Lay of the Land", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class Origin(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: Optional[str] = Field(None, min_length=1, max_length=120)


class Place(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: str = Field("the destination", min_length=1, max_length=120)


class NewSession(BaseModel):
    lang: Literal["en", "it"] = "en"
    origin: Optional[Origin] = None
    destination: Optional[Place] = None
    heading_deg: Optional[float] = Field(None, allow_inf_nan=False)


class ExploreIn(BaseModel):
    command: Literal["start", "forward", "left", "right", "take", "back", "home", "where"]
    heading_deg: Optional[float] = Field(None, allow_inf_nan=False)
    branch: Optional[Union[int, str]] = None  # take: index in the previous step's branches (0 = leftmost) or name


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    tool: Optional[str] = None  # without it, Claude picks one of the five tools from the question
    params: dict = Field(default_factory=dict)


def get(sid):
    if sid not in SESSIONS:
        raise HTTPException(404, "No such session: start a new one.")
    return SESSIONS[sid]


def zone_of(s):
    return s.zone or ZONE


def zone_for(lat, lon, name):
    """(zone, source): the city zone, else a 1.5 km zone around the origin, built once per rounded centre."""
    if ZONE.in_answer_area(lat, lon):
        return ZONE, "city"
    if ZONE.dist < CITY["dist"]:  # the small demo zone: no downloads
        raise HTTPException(422, f"That point is outside the mapped area: choose a place within "
                                 f"{fmt(ZONE.answer_radius)} of {centre_name(ZONE)}.")
    key = (round(lat, 3), round(lon, 3))
    if key in ZONES:
        return ZONES[key], "cache"
    try:
        ZONES[key] = Zone(center=(lat, lon), dist=1500, answer_radius=800, name=name)
    except Exception:
        raise HTTPException(503, "The map for that area could not be loaded just now.") from None
    return ZONES[key], "download"


def set_destination(s, d):
    z = zone_of(s)
    if not z.in_answer_area(d.lat, d.lon):
        raise HTTPException(422, f"That destination is outside the mapped area: choose a place within "
                                 f"{fmt(z.answer_radius)} of {centre_name(z)}.")
    s.destination = {"lat": d.lat, "lon": d.lon, "name": d.name}


@app.get("/health")
def health():
    return {"ok": True, "zone": ZONE.name}


@app.post("/session")
def new_session(body: Optional[NewSession] = None):
    body = body or NewSession()
    o = body.origin
    lat, lon, name = (o.lat, o.lon, o.name or "your start point") if o else (*TALENT_GARDEN, "Talent Garden")
    zone, source = zone_for(lat, lon, name)
    s = Session(lang=body.lang, origin=(lat, lon, name), heading=(body.heading_deg or 0) % 360,
                zone=None if zone is ZONE else zone)
    if body.destination:
        set_destination(s, body.destination)
    SESSIONS[s.id] = s
    return {"session_id": s.id, "overview": overview(zone, s), "zone": {"name": zone.name, "source": source}}


@app.post("/session/{sid}/destination")
def new_destination(sid: str, body: Place):
    s = get(sid)
    set_destination(s, body)
    d, o = s.destination, s.origin
    return {"destination": d, "straight_line_m": round(ox.distance.great_circle(o[0], o[1], d["lat"], d["lon"]))}


@app.get("/session/{sid}/overview")
def get_overview(sid: str):
    s = get(sid)
    return overview(zone_of(s), s)


@app.post("/session/{sid}/explore")
def do_explore(sid: str, body: ExploreIn):
    s = get(sid)
    h = body.heading_deg
    if h is None and (body.command == "start" or s.start is None):
        h = ref_heading(s)  # (re)starting keeps the stated reference facing unless a new one is given
    if body.command == "take" and body.branch is None:
        raise HTTPException(422, "take needs branch: the index in the previous step's branches, or its name.")
    return explore(zone_of(s), s, body.command, h, body.branch)


@app.post("/session/{sid}/ask")
def do_ask(sid: str, body: AskIn):
    s = get(sid)
    tool, params = body.tool, body.params
    if tool is None:
        try:
            tool, params = llm.interpret(body.question)
        except llm.Unavailable:
            return no_tool(body.question, "I could not interpret the question just now.")
        if tool == "none":
            return no_tool(body.question)
    if tool not in TOOLS:
        raise HTTPException(422, f"Unknown tool {tool!r}: use one of {', '.join(TOOLS)}.")
    return ask(zone_of(s), s, tool, params, body.question)


def no_tool(question, missing=None):
    """No tool fits (or the model is unreachable): say what can be asked, in fixed words, never model-written."""
    return {"question": question, "lang": "en", "tool": "none", "text": llm.CLARIFY, "facts": [],
            "unknown": [missing] if missing else [], "meta": meta(mode="live", cache="none")}  # a place it cannot use comes back as a question


# level 2: plan endpoints (contracts/README.md)
from plan_api import make_router  # noqa: E402

app.include_router(make_router(lambda: ZONE, get))

# voice: speech to text (Parakeet) and voice health
from voice_api import make_router as make_voice_router  # noqa: E402

app.include_router(make_voice_router())

from places_api import make_router as places_router  # noqa: E402
app.include_router(places_router(lambda: ZONE))

from interpret_api import make_router as interpret_router  # noqa: E402
app.include_router(interpret_router(get, lambda: ZONE))

from navigate_api import make_router as make_nav_router  # noqa: E402
app.include_router(make_nav_router(lambda: ZONE, get))

from tts_api import make_router as make_tts_router  # noqa: E402
app.include_router(make_tts_router())
