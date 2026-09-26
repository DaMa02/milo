"""Live turn-by-turn guidance on the plan's walking route: one GPS fix in, what to say now out.

step() is called about once a second per session; `state` is the caller's per-session dict (reset here whenever the
selected route or the plan version changes). Nothing here logs or stores coordinates beyond the last few fixes.
"""
from shapely.geometry import LineString, Point
from shapely.ops import substring

from . import plan as P
from .zone import bearing, clock, fmt, mins, plural, r10, rel_angle

TURN_DEG = 35          # a bearing change above this at a path node is a maneuver
SAY_AHEAD_M = 35       # an instruction is said once when it is this close ahead
ARRIVE_M = 20
JUMP_OFF_M = 60        # one fix this far from the route is off route at once
BACK_M = 30            # progress never jumps backwards more than this (GPS noise)
WINDOW_M = 150         # progress is searched this far ahead of the last one, so a route that doubles back does not jump
REMIND_S = 15
NO_PLAN = "Ask me how to get there first."
NOT_FOOT = "Live guidance works on walking routes: choose a route on foot first."
COMPASS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
SIDE = {"ahead": "ahead", "right": "to your right", "left": "to your left", "behind": "behind you"}


def _path(zone, doc, rid):
    """The node path of foot route rid, recomputed exactly as lotl.plan does (its graphs are lru-cached there)."""
    o, d, cons = doc["origin"], doc["destination"], doc["constraints"]
    a, b = zone.snap(o["lat"], o["lon"]), zone.snap(d["lat"], d["lon"])
    sp = doc["stop"] and P._stop_place(zone, doc["stop"]["osm_id"])
    stop = sp and zone.snap(sp["lat"], sp["lon"])
    H = zone.G
    if rid == "A":
        H = P._graph(zone, P._key(cons), P._box(zone, a, b, *([stop] if stop else [])), True)
    if not stop:
        return P._route(zone, H, a, b)[1]
    p1, p2 = P._route(zone, H, a, stop)[1], P._route(zone, H, stop, b)[1]
    return None if p1 is None or p2 is None else p1 + p2


def _compass(b):
    return "to the " + COMPASS[int((b + 22.5) // 45) % 8]


def _dir(b, heading):
    """Where absolute bearing b is: a clock position from heading when known, else a compass word."""
    return _compass(b) if heading is None else SIDE.get(clock(rel_angle(b, heading)), clock(rel_angle(b, heading)))


def _prepare(zone, doc, rid, path):
    o, d = doc["origin"], doc["destination"]
    ll = [(o["lat"], o["lon"])] + [zone.LL[n] for n in path] + [(d["lat"], d["lon"])]
    line = LineString([zone.xy(o["lat"], o["lon"])] + [zone.nxy(n) for n in path] + [zone.xy(d["lat"], d["lon"])])
    events, s = [], 0.0
    for k, n in enumerate(path):
        s = line.project(zone.nxy(n))
        if n in zone.CROSSINGS:
            sig = zone.CROSSINGS[n]["signals"]
            events.append({"at": s, "what": "a crossing with signals" if sig == "yes" else "a crossing without signals"
                           if sig == "no" else "a crossing; the map does not say whether it has signals"})
        if k + 1 < len(path):
            here = zone.nxy(n)
            rel = rel_angle(bearing(here, line.interpolate(min(line.length, s + 8))),
                            bearing(line.interpolate(max(0.0, s - 8)), here))
            if abs(rel) > TURN_DEG:
                t = {"at": s, "rel": abs(rel), "what": f"turn {'sharp ' if abs(rel) > 120 else ''}"
                     f"{'right' if rel > 0 else 'left'} onto {zone.edge_label(n, path[k + 1])}"}
                prev = next((e for e in reversed(events) if "rel" in e), None)
                if prev and t["at"] - prev["at"] < 15:  # one bend drawn with several nodes: keep its sharpest node
                    if t["rel"] > prev["rel"]:
                        events[events.index(prev)] = t
                    continue
                events.append(t)
    events.sort(key=lambda e: e["at"])
    start = zone.edge_label(path[0], path[1]) if len(path) > 1 else "the route"
    return {"rid": rid, "line": line, "ll": [list(p) for p in ll], "events": events, "start": start,
            "dest": zone.xy(d["lat"], d["lon"]), "name": d.get("name") or "your destination",
            "progress": None, "over": False, "off": False, "warned": 0.0, "arrived": False, "fixes": []}


def _say(e, ahead):
    m = r10(max(0.0, ahead))
    return f"In {fmt(m)}, {e['what']}." if m else f"Now, {e['what']}."


def _upcoming(st):
    return [e for e in st["events"] if e["at"] > st["progress"] - 5]


def _next(st, remaining):
    up = _upcoming(st)
    if up:
        return {"instruction": up[0]["what"][0].upper() + up[0]["what"][1:] + ".", "distance_m": r10(up[0]["at"] - st["progress"])}
    return {"instruction": f"Arrive at {st['name']}.", "distance_m": r10(remaining)}


def _next_text(st, remaining):
    up = _upcoming(st)
    return _say(up[0], up[0]["at"] - st["progress"]) if up else f"In {fmt(r10(remaining))}, {st['name']}."


def _travel_dir(st, p):
    """Direction of travel from the recent fixes: the oldest of the last few that is at least 8 m away."""
    for q in st["fixes"]:
        if q.distance(p) >= 8:
            return bearing(q, p)
    return None


def _no_route(state, key, text, rid=None):
    said = state.get("key") == key
    state.clear()
    state["key"] = key
    return {"status": "no_route", "text": None if said else text, "route_id": rid, "off_route_m": None,
            "remaining_m": None, "remaining_min": None, "next": None, "route_line": None}


def step(zone, session, state, lat, lon, accuracy_m=None, heading_deg=None, now=0.0):
    doc = session.plan
    if doc is None:
        return _no_route(state, ("none",), NO_PLAN)
    routes = {r["id"]: r for r in doc["routes"]}
    rid = doc["selected_route_id"] or ("A" if "A" in routes else next(iter(routes), None))
    key = (doc["plan_version"], rid)
    if rid is None or routes[rid]["mode"] != "foot":
        return _no_route(state, key, NOT_FOOT, rid)
    first = state.get("key") != key or "line" not in state
    if first:
        path = _path(zone, doc, rid)
        if path is None:
            return _no_route(state, key, NOT_FOOT, rid)
        state.clear()
        state.update(_prepare(zone, doc, rid, path), key=key)
    st = state
    heading = heading_deg if heading_deg is not None and 0 <= heading_deg < 360 else None
    line, p = st["line"], zone.xy(lat, lon)
    off = line.distance(p)
    thr = max(20.0, min(accuracy_m or 15.0, 40.0))
    over = off > thr
    is_off = off > JUMP_OFF_M or (over and st["over"]) or (over and st["off"])
    st["over"] = over
    text = []

    if not is_off:
        if st["progress"] is None or st["off"]:
            s = line.project(p)  # (re)joining: anywhere on the route
        else:
            lo = max(0.0, st["progress"] - BACK_M)
            s = lo + substring(line, lo, min(line.length, st["progress"] + WINDOW_M)).project(p)
        if st["progress"] is None or s >= st["progress"] - BACK_M:
            st["progress"] = s
    elif st["progress"] is None:
        st["progress"] = 0.0
    remaining = max(0.0, line.length - st["progress"])

    if first:
        b = bearing(p, line.interpolate(min(line.length, st["progress"] + 10)))
        text.append(f"Guidance started: {fmt(r10(remaining))}, about {plural(mins(remaining), 'minute')}. "
                    f"Start {_dir(b, heading)} along {st['start']}.")

    if not st["arrived"] and p.distance(st["dest"]) <= ARRIVE_M:
        st["arrived"] = True
        text.append(f"You have arrived at {st['name']}.")
    elif st["arrived"]:
        pass
    elif is_off:
        near = line.interpolate(line.project(p))
        where = _dir(bearing(p, near), heading if heading is not None else _travel_dir(st, p))
        if not st["off"]:
            text.append(f"You are off the route, about {fmt(r10(off))} from it. The route is {where}.")
            st["off"], st["warned"] = True, now
        elif now - st["warned"] >= REMIND_S:
            text.append(f"Still off the route: it is {where}, about {fmt(r10(off))}.")
            st["warned"] = now
    else:
        if st["off"]:
            st["off"] = False
            text.append(f"Back on the route. {_next_text(st, remaining)}")
            for e in st["events"]:  # what that sentence covered is not said again
                if e["at"] - st["progress"] <= SAY_AHEAD_M:
                    e["said"] = True
        for e in st["events"]:
            ahead = e["at"] - st["progress"]
            if e.get("said"):
                continue
            if ahead < -5:
                e["said"] = True  # passed without a fix close to it: too late to say
            elif ahead <= SAY_AHEAD_M:
                e["said"] = True
                text.append(_say(e, ahead))

    st["fixes"] = (st["fixes"] + [p])[-5:]
    status = "arrived" if st["arrived"] else "off_route" if st["off"] else "on_route"
    return {"status": status, "text": " ".join(text) or None, "route_id": rid, "off_route_m": int(round(off)),
            "remaining_m": 0 if st["arrived"] else r10(remaining), "remaining_min": 0 if st["arrived"] else mins(remaining),
            "next": None if st["arrived"] else _next(st, remaining), "route_line": st["ll"] if first else None}
