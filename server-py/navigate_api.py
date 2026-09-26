"""Live guidance endpoints: one GPS fix in, what to say now out (lotl/navigate.py).

    app.include_router(make_router(lambda: ZONE, get))

Guidance state is per session, in memory. Coordinates are never logged.
"""
import threading
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from lotl import navigate


class Fix(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    heading_deg: Optional[float] = Field(None, allow_inf_nan=False)  # outside 0-360 (iOS sends -1) counts as unknown


def make_router(get_zone, get_session):
    router = APIRouter()
    states, locks = {}, {}  # session id -> guidance state / lock

    @router.post("/session/{sid}/navigate")
    def navigate_fix(sid: str, body: Fix):
        s = get_session(sid)  # 404 itself
        with locks.setdefault(sid, threading.Lock()):
            return navigate.step(get_zone(), s, states.setdefault(sid, {}), body.lat, body.lon,
                                 body.accuracy_m, body.heading_deg, time.monotonic())

    @router.post("/session/{sid}/navigate/stop")
    def navigate_stop(sid: str):
        get_session(sid)
        states.pop(sid, None)
        return {"status": "stopped"}

    return router
