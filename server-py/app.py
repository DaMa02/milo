"""Lay of the Land engine: FastAPI over the cached demo zone. Routes sit at the root (the Vite proxy strips /api).

    uvicorn app:app --port 8000
"""
from contextlib import asynccontextmanager
from typing import Literal, Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from lotl.explore import explore
from lotl.overview import overview, ref_heading
from lotl.session import Session
from lotl import llm
from lotl.tools import TOOLS, ask
from lotl.zone import TALENT_GARDEN, Zone, fmt, meta

ZONE = None
SESSIONS = {}  # ponytail: in memory, lost on restart; one process only


@asynccontextmanager
async def lifespan(_app):
    global ZONE
    ZONE = Zone()
    yield


app = FastAPI(title="Lay of the Land", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class Origin(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: Optional[str] = Field(None, min_length=1, max_length=120)


class NewSession(BaseModel):
    lang: Literal["en", "it"] = "en"
    origin: Optional[Origin] = None
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


@app.get("/health")
def health():
    return {"ok": True, "zone": ZONE.name}


@app.post("/session")
def new_session(body: Optional[NewSession] = None):
    body = body or NewSession()
    o = body.origin
    lat, lon, name = (o.lat, o.lon, o.name or "your start point") if o else (*TALENT_GARDEN, "Talent Garden")
    if not ZONE.in_answer_area(lat, lon):
        raise HTTPException(422, f"That point is outside the mapped area: choose a place within "
                                 f"{fmt(ZONE.answer_radius)} of Talent Garden.")
    s = Session(lang=body.lang, origin=(lat, lon, name), heading=(body.heading_deg or 0) % 360)
    SESSIONS[s.id] = s
    return {"session_id": s.id, "overview": overview(ZONE, s)}


@app.get("/session/{sid}/overview")
def get_overview(sid: str):
    return overview(ZONE, get(sid))


@app.post("/session/{sid}/explore")
def do_explore(sid: str, body: ExploreIn):
    s = get(sid)
    h = body.heading_deg
    if h is None and (body.command == "start" or s.start is None):
        h = ref_heading(s)  # (re)starting keeps the stated reference facing unless a new one is given
    if body.command == "take" and body.branch is None:
        raise HTTPException(422, "take needs branch: the index in the previous step's branches, or its name.")
    return explore(ZONE, s, body.command, h, body.branch)


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
    return ask(ZONE, s, tool, params, body.question)


def no_tool(question, missing=None):
    """No tool fits (or the model is unreachable): say what can be asked, in fixed words, never model-written."""
    return {"question": question, "lang": "en", "tool": "none", "text": llm.CLARIFY, "facts": [],
            "unknown": [missing] if missing else [], "meta": meta(mode="live", cache="none")}  # a place it cannot use comes back as a question
