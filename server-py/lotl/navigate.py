"""Live turn-by-turn guidance for a blind walker: one GPS fix in, what to say now out.

step() is called about once a second per session (plus compass heartbeats with the same position); `state` is the
caller's per-session dict (reset whenever the selected route or the plan version changes). Cues come early enough to
act, repeat as the point approaches, and never repeat for a duplicate fix. Nothing here logs or stores coordinates
beyond the last few fixes.
"""
from shapely.geometry import LineString
from shapely.ops import substring

from . import plan as P
from .zone import bearing, clock, mins, plural, r10, rel_angle

TURN_DEG = 35          # a bearing change above this at a path node is a candidate maneuver
BEND_DEG = 60          # below this, a bend along the same street is not a turn
MERGE_M = 20           # two maneuvers closer than this are said as one sentence
CUES = (60, 25)        # "In N metres" cues before a maneuver; then "now" at NOW_M
NOW_M = 8
DONE_M = 15            # "Now on X" this far past a maneuver
CROSS_M, CROSS_NOW_M = 30, 5
QUIET_S = 25           # progress reminder after this long without speech
REPEAT_S = 10          # the same sentence is never said twice within this
BACK_DROP_M, BACK_WIN_S = 12, 6
WRONG_DEG, WRONG_FIXES, WRONG_EVERY_S = 120, 3, 15
WALK_MPS = 0.6         # above this the GPS direction of travel is used, never the compass
LOOK_S = 2.5           # speech latency covered by the lookahead
JUMP_OFF_M = 60
REMIND_S = 12
REROUTE_S, REROUTE_M = 25, 80
NOISY_M = 60
BACK_M = 30            # progress never jumps backwards more than this in one fix (GPS noise)
WINDOW_M = 150         # progress is searched this far ahead, so a route that doubles back does not jump
NO_PLAN = "Ask me how to get there first."
NOT_FOOT = "Live guidance works on walking routes: choose a route on foot first."
COMPASS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")


def _path(zone, doc, rid):
    """The node path of foot route rid, recomputed exactly as lotl.plan does (its graphs are lru-cached there)."""
    o, d, cons = doc["origin"], doc["destination"], doc["constraints"]
    a, b = zone.snap(o["lat"], o["lon"]), zone.snap(d["lat"], d["lon"])
    sp = doc.get("stop") and P._stop_place(zone, doc["stop"]["osm_id"])
    stop = sp and zone.snap(sp["lat"], sp["lon"])
    H = zone.G
    if rid == "A":
        H = P._graph(zone, P._key(cons), P._box(zone, a, b, *([stop] if stop else [])), True)
    if not stop:
        return P._route(zone, H, a, b)[1]
    p1, p2 = P._route(zone, H, a, stop)[1], P._route(zone, H, stop, b)[1]
    return None if p1 is None or p2 is None else p1 + p2


def _m(m):
    m = max(5, int(round(m / 5.0) * 5)) if m < 100 else r10(m)
    return f"{m:,} metres"


def _base(label):
    return label.replace("the pavement of ", "")


def _onto(t):
    """'onto via Brembo', or 'to cross via Brembo' when the turn leads onto a crossing."""
    o = t["onto"]
    return f"to cross {o[16:]}" if o.startswith("the crossing of ") else "to cross" if o == "a crossing" else f"onto {o}"


def _where(b, ref):
    """Absolute bearing b as a clock position from ref (direction of travel or compass), else a compass word."""
    if ref is None:
        return "to the " + COMPASS[int((b + 22.5) // 45) % 8]
    c = clock(rel_angle(b, ref))
    return {"ahead": "straight ahead", "right": "at 3 o'clock", "left": "at 9 o'clock", "behind": "at 6 o'clock"}.get(c, c)


def _prepare(zone, doc, rid, path, origin=None):
    o, d = origin or doc["origin"], doc["destination"]
    ll = [(o["lat"], o["lon"])] + [zone.LL[n] for n in path] + [(d["lat"], d["lon"])]
    line = LineString([zone.xy(o["lat"], o["lon"])] + [zone.nxy(n) for n in path] + [zone.xy(d["lat"], d["lon"])])
    at = [line.project(zone.nxy(n)) for n in path]
    segs = [(at[k], _base(zone.edge_label(n, path[k + 1]))) for k, n in enumerate(path[:-1])] or [(0.0, "the route")]
    turns, cross = [], []
    for k, n in enumerate(path):
        s = at[k]
        same = cross and s - cross[-1]["at"] < 30 and cross[-1]["signals"] == zone.CROSSINGS.get(n, {}).get("signals")
        if n in zone.CROSSINGS and not same:  # both ends of one crossing, or a traffic island, are one cue
            cross.append({"at": s, **zone.CROSSINGS[n]})
        if 0 < k < len(path) - 1:
            here = zone.nxy(n)
            rel = rel_angle(bearing(here, line.interpolate(min(line.length, s + 8))),
                            bearing(line.interpolate(max(0.0, s - 8)), here))
            onto, before = zone.edge_label(n, path[k + 1]), zone.edge_label(path[k - 1], n)
            if abs(rel) <= TURN_DEG or (_base(onto) == _base(before) and abs(rel) < BEND_DEG):
                continue
            side = f"{'sharp ' if abs(rel) > 120 else ''}{'right' if rel > 0 else 'left'}"
            t = {"at": s, "rel": abs(rel), "side": side, "onto": _base(onto), "said": set()}
            if turns and s - turns[-1]["at"] < 15:  # one bend drawn with several nodes: keep its sharpest node
                if t["rel"] > turns[-1]["rel"]:
                    turns[-1] = t
                continue
            turns.append(t)
    merged = []
    for t in turns:
        if merged and t["at"] - merged[-1]["at"] < MERGE_M:
            merged[-1]["side"] += f", then {t['side']}"
            merged[-1]["onto"], merged[-1]["end"] = t["onto"], t["at"]
        else:
            merged.append(t)
    for t in merged:
        if t["onto"].startswith(("the crossing of ", "a crossing")):
            c = next((c for c in cross if -5 <= c["at"] - t["at"] <= 25 and not c.get("said")), None)
            if c:
                c["said"], t["cross"] = True, c
    return {"rid": rid, "line": line, "ll": [list(p) for p in ll], "turns": merged, "cross": cross, "segs": segs,
            "dest": zone.xy(d["lat"], d["lon"]), "name": d.get("name") or "your destination", "progress": None}


def _street(st, s):
    segs = st["segs"]
    k = next((i for i in range(len(segs) - 1, -1, -1) if segs[i][0] <= s + 1), 0)
    if not segs[k][1].startswith(("the crossing of ", "a crossing")):
        return segs[k][1]
    return next((lab for _a, lab in segs[k:] + segs[k::-1] if not lab.startswith(("the crossing of ", "a crossing"))), "the route")


def _ahead_turn(st, lo=-5):
    return next((t for t in st["turns"] if t["at"] - st["progress"] > lo and "done" not in t["said"]), None)


def _walk(st, remaining):
    """'Walk along X for N metres, then turn left onto Y.' from the current progress."""
    t = _ahead_turn(st, 0)
    street = _street(st, st["progress"])
    first = ""
    if street.startswith(("the crossing of ", "a crossing")):
        first = f"First cross {street[16:] or 'the road'}: stop at the kerb and listen. Then "
        street = next((lab for a, lab in st["segs"] if a > st["progress"] and not lab.startswith(
            ("the crossing of ", "a crossing"))), "the route")
    walk = _along("walk", street)
    walk = first + (walk[0].lower() + walk[1:] if first else walk)
    if t is None:
        return f"{walk} for {_m(remaining)} to {st['name']}."
    if t["at"] - st["progress"] < CUES[0]:
        t["said"].add(60)
    return f"{walk} for {_m(t['at'] - st['progress'])}, then turn {t['side']} {_onto(t)}."


def _along(verb, street):
    """'Walk along via Brembo' or, for an unnamed pavement or footpath, 'Walk straight ahead'."""
    named = not street.startswith(("a ", "the route"))
    return f"{verb.capitalize()} {'along ' + street if named else 'straight ahead'}"


def _crossing_words(c):
    if c["signals"] == "yes":
        snd = {"yes": "with a sound signal", "no": "without a sound signal"}.get(
            c["sound"], "the map does not say if it has a sound signal")
        return f"a crossing with traffic lights, {snd}."
    if c["signals"] == "no":
        return "a crossing without signals: stop at the kerb and listen before you cross."
    return "a crossing; the map does not say if it has signals: stop at the kerb and listen."


def _xwords(t):
    """': a crossing with traffic lights, ...' once for a turn onto a crossing, else '.'."""
    if not t.get("cross") or t.get("xsaid"):
        return "."
    t["xsaid"] = True
    return f", {_crossing_words(t['cross'])}"


def _next(st, remaining):
    t = _ahead_turn(st, 0)
    if t:
        return {"instruction": f"Turn {t['side']} {_onto(t)}.", "distance_m": r10(t["at"] - st["progress"])}
    return {"instruction": f"Arrive at {st['name']}.", "distance_m": r10(remaining)}


def _no_route(state, key, text, rid=None):
    said = state.get("key") == key
    state.clear()
    state["key"] = key
    return {"status": "no_route", "text": None if said else text, "route_id": rid, "off_route_m": None,
            "remaining_m": None, "remaining_min": None, "next": None, "route_line": None}


def _cues(st, look, remaining):
    """Maneuver, crossing and 'now on' cues due at the current progress."""
    out, pr = [], st["progress"]
    for i, t in enumerate(st["turns"]):
        ahead = t["at"] - pr
        if "done" in t["said"]:
            continue
        if ahead < -DONE_M:
            t["said"].add("done")
            nt = _ahead_turn(st, 0)
            gap = (nt["at"] - pr) if nt else remaining
            if "now" in t["said"] and gap - CUES[0] >= 40:
                street = _street(st, pr)
                out.append(f"Now on {street}. Continue for {_m(gap)}." if not street.startswith("a ") else
                           f"Now continue straight ahead for {_m(gap)}.")
            continue
        if "now" in t["said"]:
            continue
        if ahead <= NOW_M + look:
            t["said"].update((60, 25, "now"))
            words = f"Turn {t['side']} now, {_onto(t)}" + _xwords(t)
            nt = st["turns"][i + 1] if i + 1 < len(st["turns"]) else None
            c = next((c for c in st["cross"] if not c.get("said") and 0 < c["at"] - t["at"] <= CROSS_M
                      and not (nt and nt["at"] < c["at"])), None)
            if c:
                c["said"] = True
                words += f" Then in {_m(c['at'] - t['at'])}, {_crossing_words(c)}"
            if nt and nt["at"] - t["at"] < CUES[0]:
                nt["said"].add(60)
            if nt and nt["at"] - t["at"] < CUES[0] and not c:  # after a crossing clause, nt keeps its own 25 m cue
                close = nt["at"] - t["at"] < CUES[1] + 15
                if close:
                    nt["said"].add(25)
                words += f" Then in {_m(nt['at'] - t['at'])}, turn {nt['side']} {_onto(nt)}" + (
                    _xwords(nt) if close else ".")
            out.append(words)
        elif ahead <= CUES[1] + look and 25 not in t["said"]:
            t["said"].update((60, 25))
            after = any(pr < c["at"] < t["at"] - 2 for c in st["cross"])
            out.append(f"In {_m(ahead)}, {'after the crossing, ' if after else ''}turn {t['side']} {_onto(t)}"
                       + _xwords(t))
        elif ahead <= CUES[0] + look and 60 not in t["said"]:
            t["said"].add(60)
            out.append(f"In {_m(ahead)}, turn {t['side']} {_onto(t)}.")
        break  # only the next turn is cued; the one after comes with its "now"
    pend = next((t for t in st["turns"] if "now" not in t["said"] and t["at"] > pr - 5), None)
    for c in st["cross"]:
        ahead = c["at"] - pr
        if pend and pend["at"] < c["at"] - 2 and not c.get("said"):
            continue  # a crossing just after a turn comes with that turn's "now", not before it
        if ahead < -5:
            c["said"] = c["now"] = True
        elif not c.get("said") and ahead <= CROSS_M + look:
            c["said"] = True
            if ahead > CROSS_NOW_M + look:
                out.append(f"In {_m(ahead)}, {_crossing_words(c)}")
            else:
                c["now"] = True
                out.append(f"Crossing here: {_crossing_words(c)}")
        elif c["signals"] != "yes" and not c.get("now") and ahead <= CROSS_NOW_M + look:
            c["now"] = True
            out.append("Crossing now.")
    return out


def _reroute(zone, doc, st, lat, lon):
    path = _path(zone, {**doc, "origin": {"lat": lat, "lon": lon}, "stop": None}, "A")
    if not path:
        return False
    new = _prepare(zone, doc, "A", path, {"lat": lat, "lon": lon})
    keep = {k: v for k, v in st.items() if k not in new}
    keep["fixes"] = [{**f, "s": None} for f in st.get("fixes", [])]  # old progress is on the old line
    st.clear()
    st.update(new, **keep)
    st["progress"], st["off"], st["over"], st["new_line"] = 0.0, False, False, True
    return True


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
        state.update(_prepare(zone, doc, rid, path), key=key, fixes=[], said_at={}, last_speech=now, off=False,
                     over=False, off_since=None, warned=0.0, arrived=False, oriented=None, wrong=False, wrong_n=0,
                     wrong_at=-1e9)
    st = state
    heading = heading_deg if heading_deg is not None and 0 <= heading_deg < 360 else None
    acc = accuracy_m if accuracy_m is not None else 15.0
    p = zone.xy(lat, lon)
    line = st["line"]
    off = line.distance(p)
    text = []

    def result():
        spoken = []
        for t in text:  # the same sentence is never said twice within REPEAT_S
            if now - st["said_at"].get(t, -1e9) >= REPEAT_S:
                st["said_at"][t] = now
                spoken.append(t)
        if spoken:
            st["last_speech"] = now
        remaining = max(0.0, st["line"].length - st["progress"])
        new_line = first or st.pop("new_line", False)
        status = "arrived" if st["arrived"] else "off_route" if st["off"] else "on_route"
        return {"status": status, "text": " ".join(spoken) or None, "route_id": st["rid"],
                "off_route_m": int(round(st["line"].distance(p))),
                "remaining_m": 0 if st["arrived"] else r10(remaining),
                "remaining_min": 0 if st["arrived"] else mins(remaining),
                "next": None if st["arrived"] else _next(st, remaining), "route_line": st["ll"] if new_line else None}

    if st["arrived"]:
        return result()
    noisy = acc > NOISY_M
    if noisy and off <= REROUTE_M and not first:
        return result()  # a noisy fix moves nothing and says nothing

    # direction of travel from GPS, speed along the recent fixes
    fx = st["fixes"]
    dup = bool(fx) and fx[-1]["p"].distance(p) < 0.5
    prev = next((f for f in reversed(fx) if now - f["t"] >= 0.8), None)
    moving = travel = None
    if prev and not dup:
        v = prev["p"].distance(p) / max(0.5, now - prev["t"])
        moving = v > WALK_MPS
        if moving and prev["p"].distance(p) >= 1:
            travel = bearing(prev["p"], p)
    old = [f for f in fx if now - f["t"] <= 5 and f.get("s") is not None]
    speed = 0.0
    if len(old) >= 2 and now > old[0]["t"]:
        speed = min(2.0, max(0.0, (old[-1]["s"] - old[0]["s"]) / (old[-1]["t"] - old[0]["t"] or 1)))
    look = max(1.3 if first else speed, speed) * LOOK_S if speed else 1.3 * LOOK_S
    ref = travel if moving else heading  # clock reference: travel while walking, compass when still

    # on / off route
    thr = max(20.0, min(acc, 40.0))
    over = off > thr
    is_off = off > JUMP_OFF_M or (over and (st["over"] or st["off"]))
    st["over"] = over
    if not is_off and not noisy:
        if st["progress"] is None or st["off"]:
            s = line.project(p)
        else:
            lo = max(0.0, st["progress"] - BACK_M)
            s = lo + substring(line, lo, min(line.length, st["progress"] + WINDOW_M)).project(p)
        if st["progress"] is None or s >= st["progress"] - BACK_M:
            st["progress"] = s
    elif st["progress"] is None:
        st["progress"] = line.project(p)
    remaining = max(0.0, line.length - st["progress"])
    route_dir = bearing(line.interpolate(st["progress"]), line.interpolate(min(line.length, st["progress"] + 10)))

    if first:
        text.append(f"Guidance started to {st['name']}: {_m(remaining)}, about {plural(mins(remaining), 'minute')}.")
        if heading is not None and abs(rel_angle(route_dir, heading)) > 45:
            rel = rel_angle(route_dir, heading)
            text.append("Turn around: the route is behind you." if abs(rel) > 135 else
                        f"The route starts {_where(route_dir, heading)}: turn to your {'right' if rel > 0 else 'left'}.")
            st["oriented"] = False
        text.append(_walk(st, remaining))
    elif st["oriented"] is False and heading is not None and not moving and abs(rel_angle(route_dir, heading)) <= 30:
        st["oriented"] = True
        text.append("Good, walk straight ahead.")
    elif st["oriented"] is False and moving and travel is not None and abs(rel_angle(route_dir, travel)) <= 45:
        st["oriented"] = True

    arrive_m = max(15.0, min(acc, 25.0))
    dd = p.distance(st["dest"])
    if not first and not noisy and dd <= arrive_m and (remaining < 60 or not is_off):
        st["arrived"] = True
        b = bearing(p, st["dest"])
        where = f" It is {_where(b, ref)}, about {_m(dd)}." if dd >= 5 else ""
        text.append(f"You have arrived at {st['name']}.{where}")
        st["fixes"] = (fx + [{"t": now, "p": p, "s": st["progress"]}])[-8:]
        return result()

    if is_off:
        near = line.interpolate(line.project(p))
        where = _where(bearing(p, near), ref)
        if not st["off"]:
            st["off"], st["warned"], st["off_since"] = True, now, now
            text.append(f"You are off the route, about {_m(off)} from it. The route is {where}.")
        elif now - st["off_since"] > REROUTE_S or off > REROUTE_M:
            if _reroute(zone, doc, st, lat, lon):
                st["progress"] = 0.0
                text.append("New route. " + _walk(st, st["line"].length))
                st["last_route_at"] = now
            else:
                st["off_since"] = now
        elif now - st["warned"] >= REMIND_S:
            st["warned"] = now
            text.append(f"You are still off the route, about {_m(off)} from it. The route is {where}.")
    elif not noisy:
        if st["off"]:
            st["off"], st["last_route_at"] = False, now
            text.append("Back on the route. " + _walk(st, remaining))
        # wrong way: progress dropping, or GPS travel against the route
        drop = [f["s"] for f in fx if now - f["t"] <= BACK_WIN_S and f.get("s") is not None]
        falling = bool(drop) and max(drop) - st["progress"] > BACK_DROP_M
        against = travel is not None and moving and abs(rel_angle(travel, route_dir)) > WRONG_DEG
        settle = now - st.get("last_route_at", -1e9) < 8  # fixes from before a new route point elsewhere
        falling = falling and not settle
        if not dup:  # a compass heartbeat carries no direction of travel
            st["wrong_n"] = st["wrong_n"] + 1 if against and not settle else 0
        if falling or st["wrong_n"] >= WRONG_FIXES:
            if now - st["wrong_at"] >= WRONG_EVERY_S:
                st["wrong"], st["wrong_at"] = True, now
                text.append("You are going the wrong way. Turn around.")
        elif st["wrong"] and travel is not None and moving and abs(rel_angle(travel, route_dir)) < 60:
            st["wrong"] = False
            text.append("Good, now you are heading the right way.")
        if not st["wrong"]:
            text += _cues(st, look, remaining)
        t = _ahead_turn(st, 0)
        soon = (t and t["at"] - st["progress"] < CUES[1] + look + 5) or any(
            not c.get("said") and 0 < c["at"] - st["progress"] < CROSS_M + look + 5 for c in st["cross"])
        if not text and now - st["last_speech"] >= QUIET_S and not dup and not soon:  # a cue is due soon anyway
            street = _street(st, st["progress"])
            text.append(f"{_along('keep going', street)}: {_m(t['at'] - st['progress'])} to the next turn." if t else
                        f"{_along('keep going', street)}: {_m(remaining)} to {st['name']}.")
    st["fixes"] = (fx + [{"t": now, "p": p, "s": None if is_off else st["progress"]}])[-8:]
    return result()
