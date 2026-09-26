"""Level 2 plan endpoints (contracts/README.md, "Plan"): every call returns the whole Plan.

    app.include_router(make_router(lambda: ZONE, get))

4xx means nothing was applied: PlanError keeps its status, a place that cannot be used is 422, a stale if_version is 409.
"""
import threading
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from lotl import plan
from lotl.plan import PlanError
from lotl.tools import PlaceError

Kind = Literal["unsignalled_crossings", "signals_without_sound", "steps", "construction", "main_roads", "transfers",
               "walking_over_min"]
Version = Optional[int]
ISO = plan.DATETIME.pattern  # date and time with Z or an offset, as in fact.schema.json


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a misspelt field is a 422, not a change silently ignored


class Place(Body):
    """{lat, lon, name?} or {name}."""
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)
    name: Optional[str] = Field(None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def _point_or_name(self):
        if (self.lat is None) != (self.lon is None) or (self.lat is None and self.name is None):
            raise ValueError("a place is {lat, lon, name?} or {name}")
        return self


class Constraint(Body):
    kind: Kind
    strength: Literal["avoid_when_possible", "require"] = "avoid_when_possible"  # the default strength (one-pager)
    value: Optional[float] = Field(None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def _minutes(self):
        if self.kind == "walking_over_min" and self.value is None:
            raise ValueError("walking_over_min needs value, in minutes")
        return self


class Tolerance(Body):
    min: float = Field(ge=0, allow_inf_nan=False)
    pct: float = Field(ge=0, allow_inf_nan=False)


class CreateIn(Body):
    destination: Optional[Place] = None  # None: the session destination (lotl.plan)
    origin: Optional[Place] = None
    depart_at: Optional[str] = Field(None, pattern=ISO)
    constraints: Optional[List[Constraint]] = None
    detour_tolerance: Optional[Tolerance] = None


class SelectIn(Body):
    route_id: str = Field(min_length=1, max_length=8)
    if_version: Version = None


class CandidatesIn(Body):
    kind: Literal["supermarket"] = "supermarket"
    if_version: Version = None


class StopIn(Body):
    osm_id: Optional[str] = Field(pattern=plan.OSM_ID.pattern)  # required; null removes the stop
    duration_min: Optional[int] = Field(None, ge=1, le=180)
    if_version: Version = None


class ConstraintsIn(Body):
    constraints: List[Constraint]
    detour_tolerance: Optional[Tolerance] = None
    if_version: Version = None


class DepartIn(Body):
    depart_at: str = Field(pattern=ISO)
    if_version: Version = None


def dump(m):
    return m and m.model_dump(exclude_none=True)


def make_router(get_zone, get_session):
    router = APIRouter()
    locks = {}  # session id -> lock: one plan change at a time per session, so if_version checks cannot race

    def run(sid, fn):
        s = get_session(sid)  # 404 itself
        with locks.setdefault(sid, threading.Lock()):
            try:
                return fn(getattr(s, "zone", None) or get_zone(), s)
            except PlanError as e:
                raise HTTPException(e.status, e.message) from None
            except PlaceError as e:
                raise HTTPException(422, str(e)) from None

    # plain def routes: FastAPI runs them in its threadpool, the graph work does not block the event loop
    @router.post("/session/{sid}/plan")
    def create_plan(sid: str, body: CreateIn):
        return run(sid, lambda z, s: plan.create(  # places are resolved inside the mapped area by lotl.tools.resolve_place
            z, s, dump(body.destination), dump(body.origin), body.depart_at,
            None if body.constraints is None else [dump(c) for c in body.constraints], dump(body.detour_tolerance)))

    @router.get("/session/{sid}/plan")
    def get_plan(sid: str):
        return run(sid, plan.get)

    @router.post("/session/{sid}/plan/select")
    def select_route(sid: str, body: SelectIn):
        return run(sid, lambda z, s: plan.select(z, s, body.route_id, if_version=body.if_version))

    @router.post("/session/{sid}/plan/stop/candidates")
    def stop_candidates(sid: str, body: Optional[CandidatesIn] = None):
        body = body or CandidatesIn()
        return run(sid, lambda z, s: plan.candidates(z, s, kind=body.kind, if_version=body.if_version))

    @router.post("/session/{sid}/plan/stop")
    def set_stop(sid: str, body: StopIn):
        return run(sid, lambda z, s: plan.set_stop(z, s, body.osm_id, duration_min=body.duration_min,
                                                   if_version=body.if_version))

    @router.post("/session/{sid}/plan/constraints")
    def set_constraints(sid: str, body: ConstraintsIn):
        return run(sid, lambda z, s: plan.set_constraints(z, s, [dump(c) for c in body.constraints],
                                                          detour_tolerance=dump(body.detour_tolerance),
                                                          if_version=body.if_version))

    @router.post("/session/{sid}/plan/depart")
    def set_depart(sid: str, body: DepartIn):
        return run(sid, lambda z, s: plan.set_depart(z, s, body.depart_at, if_version=body.if_version))

    return router
