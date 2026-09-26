"""POST /interpret: any utterance -> one action for the app. Grammar first (no model), then Jev (lotl/jev.py, only with
TYPESAFE_API_KEY, sure answers without free text), then Claude picks from a schema.

    app.include_router(make_router(get, lambda: ZONE))

No key or a model error -> grammar only, else none{reason: "model_unavailable"}. The model only picks an action and
copies names from the utterance; the app runs the action through the normal endpoints.
"""
import json
import os
from typing import List, Literal, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lotl import grammar, jev
from lotl.explore import branches
from lotl.llm import MODEL, TOOLS, client

ACTIONS = ("explore", "ask", "overview", "more", "unknowns", "sources", "repeat", "stop", "help", "speed", "start_over",
           "set_origin", "set_origin_here", "set_destination", "confirm", "route", "route_select", "route_avoid", "route_stop",
           "stop_duration", "navigate", "none")
COMMANDS = ("start", "forward", "left", "right", "take", "back", "home", "where")
KINDS = ("unsignalled_crossings", "signals_without_sound", "steps", "construction", "main_roads", "transfers")

SYSTEM = """You turn one utterance from a blind person using a walking app in Milan into exactly one action. You never answer it yourself.

Actions:
- explore: move through the street network. command: start, forward, left, right, take (branch = the street name or its 0-based index, left to right), back, home (back to the start), where.
- ask: a question about the map, answered by one of five tools:
  walking_vs_straight_line (from_place optional, to_place): how far, how close, how long on foot, is it near.
  barrier_between (from_place optional, to_place): is there anything between two places, what separates them, can I cross.
  independent_connections (from_place optional, to_place): how many different ways connect two places.
  street_continuity (street): does a street go through or end.
  extent (place): how big a park, square, site or street is.
  place_info (place): is a shop, pharmacy, café or other place open, its hours, its wheelchair access; place may be a kind: "the pharmacy".
- overview (describe the area), more (more detail), unknowns (what the app does not know), sources, repeat, stop (be quiet), help, speed (change: faster|slower), start_over.
- set_origin (query: where the user is or starts from), set_origin_here (use the device location), set_destination (query: where the user is going).
- confirm (answer: yes|no; index: 0-based choice among the candidates, or stop_candidates when pending is "stop", -1 if none): only when something is pending.
- route (plan or read the route to the destination), route_select (route_id: one of the offered routes' ids), route_avoid (kind: unsignalled_crossings, signals_without_sound, steps, construction, main_roads, transfers; strength: avoid_when_possible, or require for "never" / "only side streets").
- route_stop (kind: supermarket, pharmacy, cafe, bakery, atm, or shop for anything else to buy; minutes: how long, -1 if not said): a stop on the way.
- stop_duration (minutes): how long the stop lasts, when a stop is pending or was just added.
- navigate (state: start|stop): start or stop turn-by-turn guidance.
- none: nothing fits (reason: no_fit), the place is clearly outside Milan (outside_area), or the utterance is unclear (unclear).

Rules:
- Copy place and street names exactly as the user wrote them. Never translate, correct or invent places, numbers or coordinates.
- Leave from_place empty when the user means where they are now. The trip's destination (the party, my destination, there) is to_place "destination".
- Fill only the fields the chosen action uses; leave the others as empty strings (index -1)."""

S = {"type": "string"}
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["action", "command", "branch", "tool", "from_place", "to_place", "street", "place", "query", "answer",
                 "index", "change", "route_id", "kind", "strength", "reason", "state", "minutes"],
    "properties": {
        "action": {"type": "string", "enum": list(ACTIONS)},
        "command": {"type": "string", "enum": ["", *COMMANDS]},
        "branch": S, "tool": {"type": "string", "enum": ["", *TOOLS]},
        "from_place": S, "to_place": S, "street": S, "place": S, "query": S,
        "answer": {"type": "string", "enum": ["", "yes", "no"]},
        "index": {"type": "integer"},
        "change": {"type": "string", "enum": ["", "faster", "slower"]},
        "route_id": S, "kind": {"type": "string", "enum": ["", *KINDS, *grammar.PLACE_KINDS]},
        "state": {"type": "string", "enum": ["", "start", "stop"]}, "minutes": {"type": "integer"},
        "strength": {"type": "string", "enum": ["", "avoid_when_possible", "require"]},
        "reason": {"type": "string", "enum": ["", "no_fit", "outside_area", "unclear"]},
    },
}


class Route(BaseModel):
    id: str
    label: str = ""


class Context(BaseModel):
    view: Optional[str] = None
    pending: Optional[Literal["origin", "destination", "stop"]] = None
    candidates: List[str] = []
    stop_candidates: List[str] = []
    last_action: Optional[str] = None
    has_destination: bool = False
    routes: List[Route] = []


class InterpretIn(BaseModel):
    utterance: str = ""
    lang: str = "en"
    session_id: Optional[str] = None
    context: Optional[Context] = None


class Unavailable(Exception):
    pass


def ask_params(tool, out):
    place = lambda s: {"name": s} if s else None
    if tool == "street_continuity":
        return {"street": out["street"]}
    if tool == "extent":
        return {"place": out["place"]}
    if tool == "place_info":
        return {"place": {"name": grammar.place_ref(out["place"])}}
    return {k: v for k, v in (("from", place(out["from_place"])), ("to", place(out["to_place"]))) if v}


def to_action(out, ctx):
    """The model's flat answer -> (action, params); anything unusable becomes none."""
    a = out["action"]
    if a == "explore" and out["command"] in COMMANDS:
        p = {"command": out["command"]}
        if out["command"] == "take":
            b = out["branch"].strip()
            if not b:
                return "none", {"reason": "unclear"}
            p["branch"] = int(b) if b.isdigit() else b
        return a, p
    if a == "ask" and out["tool"] in TOOLS:
        return a, {"tool": out["tool"], "params": ask_params(out["tool"], out)}
    if a in ("set_origin", "set_destination") and out["query"].strip():
        return a, {"query": out["query"].strip()}
    if a == "confirm" and out["answer"]:
        return a, {"answer": out["answer"], **({"index": out["index"]} if out["index"] >= 0 else {})}
    if a == "speed" and out["change"]:
        return a, {"change": out["change"]}
    if a == "route_select" and out["route_id"] in [r["id"] for r in ctx["routes"]]:
        return a, {"route_id": out["route_id"]}
    n = out.get("minutes", -1)
    if a == "route_stop" and out["kind"] in grammar.PLACE_KINDS:
        return a, {"kind": out["kind"], **({"duration_min": n} if n > 0 else {})}
    if a == "stop_duration" and n > 0:
        return a, {"minutes": n}
    if a == "navigate" and out.get("state"):
        return a, {"state": out["state"]}
    if a == "route_avoid" and out["kind"] in KINDS:
        return a, {"kind": out["kind"], **({"strength": out["strength"]} if out["strength"] else {})}
    if a in ("overview", "more", "unknowns", "sources", "repeat", "stop", "help", "start_over", "set_origin_here", "route"):
        return a, {}
    if a == "none":
        return a, {"reason": out["reason"] or "no_fit"}
    return "none", {"reason": "unclear"}


def claude(llm, utterance, ctx):
    try:
        r = llm.beta.messages.create(
            model=MODEL, max_tokens=1024, system=SYSTEM,
            messages=[{"role": "user", "content": f"Context: {json.dumps(ctx)}\nUtterance: {utterance}"}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
    except anthropic.AnthropicError as e:  # no key, network, rate limit, server error: all mean "not now"
        raise Unavailable() from e
    if r.stop_reason == "refusal":
        raise Unavailable()
    return json.loads(next(b.text for b in r.content if b.type == "text"))


def make_router(get_session, get_zone=lambda: None, llm=None, jev_http=None):
    """llm: a client with .beta.messages.create (tests pass a fake); default: lotl.llm.client() when a key is set.
    jev_http: an httpx.Client for Jev (tests pass a fake transport); default: httpx."""
    router = APIRouter()

    def branch_names(sid):
        if not sid:
            return []
        try:
            s, z = get_session(sid), get_zone()
        except HTTPException:
            return []  # a stale session id does not stop interpreting
        if z is None or s.node is None:
            return []
        return [b["name"] for b in branches(z, s) if b.get("name")]

    @router.post("/interpret")
    def interpret(body: InterpretIn):
        if not body.utterance.strip() or len(body.utterance) > 500:
            raise HTTPException(422, "I did not catch that: please say it again, in one short sentence.")
        ctx = (body.context or Context()).model_dump()
        hit, via = grammar.parse(body.utterance, ctx), "grammar"
        names = []
        if not hit:
            names = branch_names(body.session_id)
            hit, via = jev.pick(body.utterance, ctx, names, jev_http), "jev"
        if hit:
            action, params = hit
            if action == "ask":
                params = {"question": body.utterance, **params}
            return {"utterance": body.utterance, "action": action, "params": params, "via": via}
        c = llm or (client() if os.environ.get("ANTHROPIC_API_KEY") else None)
        if c is None:
            return {"utterance": body.utterance, "action": "none", "params": {"reason": "model_unavailable"}, "via": "grammar"}
        try:
            out = claude(c, body.utterance, {**ctx, "lang": body.lang, "branches": names})
            action, params = to_action(out, ctx)
        except (Unavailable, ValueError, KeyError, StopIteration):
            return {"utterance": body.utterance, "action": "none", "params": {"reason": "model_unavailable"}, "via": "grammar"}
        if action == "ask":
            params = {"question": body.utterance, **params}
        return {"utterance": body.utterance, "action": action, "params": params, "via": "claude"}

    return router
