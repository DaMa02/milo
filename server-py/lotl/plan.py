"""Level 2: routes under the user's constraints, the route they pick, a stop along it, and what changed.

Every call returns the whole Plan (contracts/plan.schema.json), keeps it in session.plan and follows the number
rule: every number said is also a fact. Texts follow the templates of contracts/make_fixtures.py.
Transit comes from Transitous v6 through the shared cache in $TOOLS/py/transit-cache; LOTL_OFFLINE=1 never calls it.

    python -m lotl.plan     # self-test, from server-py/ (CONTRACTS=<dir> validates against another contracts folder)
"""
import copy
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import networkx as nx
from shapely.geometry import LineString

from .tools import PlaceError, resolve_place
from .zone import SPEED, TOOLS, fmt, ids, join_and, lc, meta, mins, plural, r10

KINDS = ("unsignalled_crossings", "signals_without_sound", "steps", "construction", "main_roads", "transfers", "walking_over_min")
STRENGTHS = ("avoid_when_possible", "require")
TOLERANCE = {"min": 5, "pct": 25}
BAD = {"unsignalled_crossings": lambda x: x["signals"] == "no",
       "signals_without_sound": lambda x: x["signals"] == "yes" and x["sound"] == "no"}
UNK = {"unsignalled_crossings": lambda x: x["signals"] == "unknown",
       "signals_without_sound": lambda x: x["signals"] != "no" and not BAD["signals_without_sound"](x)
       and "unknown" in (x["signals"], x["sound"])}
PATH_KINDS = ("unsignalled_crossings", "signals_without_sound", "steps", "main_roads", "construction")
MAIN = {"primary", "primary_link", "secondary", "secondary_link", "trunk", "trunk_link"}
VIOLATION, UNKNOWN, MAIN_PER_M = 1e7, 1e4, 1e4  # fewest known violations, then fewest unknowns, then shortest
XING_M = 10  # an OSM crossing node this close to a Transitous walking trace is on that trace
PAVEMENT_M = 15  # a pavement (footway=sidewalk) this close to a main road runs along it
UA = "bainsa-hackathon-2026/0.1 (maglionicodaniele@gmail.com)"
TRANSIT = "https://api.transitous.org/api/v6/plan?"
TRANSIT_CACHE = TOOLS / "py/transit-cache"
DATETIME = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$")
OSM_ID = re.compile(r"^(node|way|relation)/([0-9]+)$")
ABBR = {"v.le ": "viale ", "p.za ": "piazza ", "c.so ": "corso ", "l.go ": "largo ", "p.ta ": "porta "}
WORD = {"bus": "bus", "tram": "tram", "subway": "metro", "rail": "train", "other": "line"}
UNMAPPED = "Crossings at points where the map has no crossing are not counted."
# kind -> what is avoided, what is required ("... are now required"), why a route is dropped, "every way ..."
SAY = {
    "unsignalled_crossings": ("crossings without a signal", "signals at every crossing", "Signals at every crossing are",
                              "crossings known to have no signal", "has at least one crossing without a signal"),
    "signals_without_sound": ("signals without sound", "sound at every signalled crossing", "Sound at every signalled crossing is",
                              "signals known to have no sound", "has at least one signalled crossing without sound"),
    "steps": ("steps", "a way without steps", "A way without steps is", "steps", "has steps"),
    "main_roads": ("walking along main roads", "a way off main roads", "A way off main roads is",
                   "walking along main roads", "runs along a main road"),
    "construction": ("construction sites", "a way past no construction site", "A way past no construction site is",
                     "construction sites", "passes a construction site"),
    "transfers": ("transfers", "no transfers", "A trip without transfers is", "transfers", None),
    "walking_over_min": ("more than {v} minutes of walking", "at most {v} minutes of walking",
                         "At most {v} minutes of walking are", "more walking than that", None),
}


class PlanError(Exception):
    """Nothing was applied. status: 404 no plan, 409 stale if_version, 422 bad input; message is said to the user."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


# ---------- small helpers ----------
def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _at(depart, minutes):
    return _iso(_dt(depart) + timedelta(minutes=minutes))


def _between(a, b):
    return round((_dt(b) - _dt(a)).total_seconds() / 60)


def _cap(s):
    return s[:1].upper() + s[1:]


def _hw(d):
    h = d.get("highway")
    return set(h) if isinstance(h, list) else {h}


def _say(kind, i, value=None):
    return SAY[kind][i].format(v=f"{value:g}" if isinstance(value, (int, float)) else value)


def _name_facts(zone, items):
    """A fact for every spoken name that contains a number, so the number rule holds for 'via Brembo 12'."""
    return [zone.fact("place_name", name, None, src, ev, {"said_as": "place name"}) for name, src, ev in items
            if re.search(r"\d", name)]


# ---------- graphs under constraints ----------
@lru_cache(maxsize=2)
def _construction(zone):
    """Edge (u, v) -> construction sites (landuse=construction) it runs through."""
    f = zone.features
    sites = f[f["landuse"] == "construction"] if "landuse" in f else f.iloc[:0]
    out = {}
    for (el, i), row in sites.iterrows():
        for pos in zone.E.sindex.query(row.geometry, predicate="intersects"):
            u, v, _k = zone.E.index[pos]
            out.setdefault((min(u, v), max(u, v)), []).append(f"{el}/{i}")
    return sites, out


@lru_cache(maxsize=2)
def _main_edges(zone):
    """Edges (u, v) that walk along a main road: the road itself, or a pavement mapped beside it."""
    E = zone.E
    roads = E[E["highway"].map(lambda h: bool(_hw({"highway": h}) & MAIN))]
    side = E[E["footway"] == "sidewalk"] if "footway" in E else E.iloc[:0]
    # ponytail: nearest main road within 15 m, a side street's pavement at a junction can match; tune PAVEMENT_M
    near = roads.sindex.nearest(side.geometry, max_distance=PAVEMENT_M, return_all=False)
    return {(min(u, v), max(u, v)) for u, v, _k in list(roads.index) + list(side.index[near[0]])}


def _edge_bad(zone, kind, u, v, d):
    if kind == "steps":
        return "steps" in _hw(d)
    return (min(u, v), max(u, v)) in (_main_edges(zone) if kind == "main_roads" else _construction(zone)[1])


@lru_cache(maxsize=32)
def _graph(zone, key):
    """Walk graph for constraints key ((kind, strength), ...): require removes known violations, avoid makes each
    one cost 10,000 km (main roads: 10 km per metre); unknown crossings cost 10 km, so verified ways win ties."""
    if not key:
        return zone.G
    req = {k for k, s in key if s == "require"}
    kinds = {k for k, _s in key}

    def node_cost(n):
        x = zone.CROSSINGS.get(n)
        if x is None:
            return 0.0
        if any(BAD[k](x) for k in req if k in BAD):
            return None
        return sum(VIOLATION for k in kinds - req if k in BAD and BAD[k](x)) + \
            sum(UNKNOWN for k in kinds if k in UNK and UNK[k](x))

    cost = {n: node_cost(n) for n in zone.CROSSINGS}
    H = nx.Graph()
    for u, v, d in zone.G.edges(data=True):
        cu, cv = cost.get(u, 0.0), cost.get(v, 0.0)
        if cu is None or cv is None:
            continue
        bad = [k for k in kinds & {"steps", "main_roads", "construction"} if _edge_bad(zone, k, u, v, d)]
        if any(k in req for k in bad):
            continue
        w = d["length"] + (cu + cv) / 2 + sum(MAIN_PER_M * d["length"] if k == "main_roads" else VIOLATION for k in bad)
        if not H.has_edge(u, v) or H[u][v]["w"] > w:
            H.add_edge(u, v, length=d["length"], w=w)
    H.graph["pen"] = {n: c for n, c in cost.items() if c}  # for _route: the cost of a crossing at a snap node
    return H


def _route(zone, H, a, b):
    """zone.route on H, with a crossing at a snap node charged in full: each edge of H carries half of its nodes' cost,
    the snapped point's own edge none."""
    pen = H.graph.get("pen") or {}
    ends = [(name, n, w) for name, s in (("A", a), ("B", b)) for n, w in ((s["u"], s["su"]), (s["v"], s["sv"]))
            if pen.get(n) and n in H]
    if ends:
        H = nx.Graph(H)
        for name, n, w in ends:  # zone.route's add_edge(length=...) keeps this w
            H.add_edge(name, n, length=w, w=w + pen[n] / 2)
    return zone.route(H, a, b)


def _key(constraints, strength=None):
    return tuple(sorted((c["kind"], strength or c["strength"]) for c in constraints if c["kind"] in PATH_KINDS))


# ---------- what a way passes ----------
def _eval(xs=(), steps=(), main=(), main_m=0.0, constr=()):
    return {"xs": list(xs), "steps": list(steps), "main": list(main), "main_m": main_m, "constr": list(constr)}


def _merge(*evs):
    out = _eval()
    for e in evs:
        out["xs"] += e["xs"]
        out["steps"] += [w for w in e["steps"] if w not in out["steps"]]
        out["main"] += [w for w in e["main"] if w not in out["main"]]
        out["constr"] += [c for c in e["constr"] if c not in out["constr"]]
        out["main_m"] += e["main_m"]
    return out


def _path_eval(zone, path):
    ce, me = _construction(zone)[1], _main_edges(zone)
    e = _eval(zone.path_crossings(path))
    for u, v in zip(path, path[1:]):
        if not zone.G.has_edge(u, v):
            continue
        d = zone.edata(u, v)
        if "steps" in _hw(d):
            e["steps"] += ids("way", [d["osmid"]])
        if (min(u, v), max(u, v)) in me:
            e["main"] += ids("way", [d["osmid"]])
            e["main_m"] += d["length"]
        e["constr"] += ce.get((min(u, v), max(u, v)), [])
    return _merge(e)  # dedupes the id lists


def decode_polyline(points, precision):
    """Google encoded polyline -> [(lat, lon)]."""
    coords, idx, lat, lon, f = [], 0, 0, 0, 10 ** precision
    while idx < len(points):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(points[idx]) - 63
                idx += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += d
            else:
                lon += d
        coords.append((lat / f, lon / f))
    return coords


def _trace_eval(zone, geo):
    """Crossings and ways along a Transitous walking leg: mapped crossings within 10 m of its geometry, in order;
    graph edges lying inside a 10 m buffer of it (main roads and their pavements only when longer than 20 m, so
    crossing one is not walking along it); construction sites it touches."""
    pts = [zone.xy(la, lo) for la, lo in decode_polyline(geo["points"], geo["precision"])]
    if len(pts) < 2:
        return _eval()
    trace = LineString(pts)
    xs = [zone.CROSSINGS[n] for _, n in sorted((trace.project(zone.nxy(n)), n) for n in zone.CROSSINGS
                                                if trace.distance(zone.nxy(n)) <= XING_M)]
    e = _eval(xs)
    # ponytail: buffer match, a trace along a road 10 m away counts as on it; map-matching if that misleads
    me = _main_edges(zone)
    for pos in zone.E.sindex.query(trace.buffer(XING_M), predicate="contains"):
        row, (u, v, _k) = zone.E.iloc[pos], zone.E.index[pos]
        if "steps" in _hw(row):
            e["steps"] += ids("way", [row["osmid"]])
        if (min(u, v), max(u, v)) in me and row["length"] > 2 * XING_M:
            e["main"] += ids("way", [row["osmid"]])
            e["main_m"] += float(row["length"])
    sites = _construction(zone)[0]
    e["constr"] = [f"{el}/{i}" for (el, i) in sites.index[sites.intersects(trace)]]
    return _merge(e)


# ---------- Transitous ----------
def _offline():
    return os.environ.get("LOTL_OFFLINE") == "1"


def _fetch(ctx, frm, to, time, extra):
    """Transitous v6 plan, cached by URL exactly as contracts/make_fixtures.py does. None when not available."""
    q = {"fromPlace": f"{frm[0]},{frm[1]}", "toPlace": f"{to[0]},{to[1]}", "time": time,
         "maxTransfers": 2, "maxTravelTime": 60, **extra}
    url = TRANSIT + urllib.parse.urlencode(q)
    f = TRANSIT_CACHE / (urllib.parse.quote(url, safe="")[-120:] + ".json")
    got = "miss"
    try:
        js = json.loads(f.read_text())
        # the file name keeps only the URL's tail: never reuse an answer for another trip
        same = all(abs(js[k][c] - p[j]) < 1e-5 for k, p in (("from", frm), ("to", to)) for j, c in enumerate(("lat", "lon")))
        got = "hit" if same else "miss"
    except (OSError, ValueError, KeyError, TypeError):
        js = None
    if got == "miss" and not _offline():
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20).read()
            js, got = json.loads(raw), "live"
            if not f.exists():
                TRANSIT_CACHE.mkdir(parents=True, exist_ok=True)
                f.write_bytes(raw)
        except (OSError, ValueError):
            got = "error"
    ctx["cache"].append(got)
    return url, (js if got in ("hit", "live") else None)


def _itinerary(js):
    its = [i for i in (js or {}).get("itineraries", []) if any(L["mode"] != "WALK" for L in i["legs"])]
    return min(its, key=lambda i: i["endTime"]) if its else None


def _leg_mode(m):
    if m == "WALK":
        return "foot"
    if m in ("BUS", "COACH"):
        return "bus"
    if m in ("TRAM", "CABLE_CAR"):
        return "tram"
    if m in ("SUBWAY", "METRO"):
        return "subway"
    return "rail" if "RAIL" in m or m in ("SUBURBAN", "LONG_DISTANCE", "NIGHT_RAIL") else "other"


def _stop_name(s, start, end):
    if s in ("START", "END"):
        return start if s == "START" else end
    for k, v in ABBR.items():
        s = s.replace(k, v)
    return s.title()


def _transit_legs(ctx, itin, start):
    """Legs, walking seconds and what the walking legs pass, following Transitous' own walking geometry."""
    legs, walk_s, evs = [], 0, []
    for L in itin["legs"]:
        pt = {k: {"name": _stop_name(L[k]["name"], start, ctx["d"]["name"]),
                  "lat": round(L[k]["lat"], 6), "lon": round(L[k]["lon"], 6)} for k in ("from", "to")}
        line = L.get("routeShortName")
        legs.append({"mode": _leg_mode(L["mode"]), "from": pt["from"], "to": pt["to"],
                     "distance_m": r10(L["distance"]) if L.get("distance") else None,
                     "duration_min": round(L["duration"] / 60), "line": None if line is None else str(line),
                     "departure": L["startTime"], "arrival": L["endTime"]})
        if L["mode"] == "WALK":
            walk_s += L["duration"]
            if L.get("legGeometry"):
                evs.append(_trace_eval(ctx["zone"], L["legGeometry"]))
    return legs, walk_s, _merge(*evs)


def _lines(legs):
    """'bus 92' or 'bus 92, then metro M3', and where the first one is caught."""
    ride = [L for L in legs if L["mode"] not in ("foot", "stop")]
    return ", then ".join(f"{WORD[L['mode']]} {L['line']}" if L["line"] else WORD[L["mode"]] for L in ride), ride[0]["from"]["name"]


# ---------- routes ----------
def _leg(frm, to, m, minutes=None):
    return {"mode": "foot", "from": frm, "to": to, "distance_m": r10(m), "duration_min": mins(m) if minutes is None else minutes,
            "line": None, "departure": None, "arrival": None}


def _foot(ctx, rid, H, m, path, label):
    z, walk = ctx["zone"], mins(m)
    return {"id": rid, "mode": "foot", "duration_min": walk, "walk_min": walk, "transfers": 0,
            "leave_at": ctx["depart"], "arrive_at": _at(ctx["depart"], walk),
            "legs": [_leg(ctx["o"], ctx["d"], m, walk)], "crossings": z.path_crossings(path),
            "_m": m, "_p": path, "_eval": _path_eval(z, path), "_ev": z.path_ways(path) or ctx["snap_ev"],
            "_in": {**ctx["rin"], "filter": label}, "_H": H, "_label": label}


def _foot_stop(ctx, base, stop):
    """build_stop() of make_fixtures: the same route's graph, origin -> stop -> destination."""
    z, s, pt = ctx["zone"], stop["snap"], stop["pt"]
    (m1, p1), (m2, p2) = _route(z, base["_H"], ctx["a"], s), _route(z, base["_H"], s, ctx["b"])
    if m1 is None or m2 is None:
        return None
    det = mins(max(0.0, m1 + m2 - base["_m"]))
    walk = base["walk_min"] + det
    xs = z.path_crossings(p1) + z.path_crossings(p2)
    return {**base, "duration_min": walk + stop["min"], "walk_min": walk, "arrive_at": _at(ctx["depart"], walk + stop["min"]),
            "legs": [_leg(ctx["o"], pt, m1), stop["leg"], _leg(pt, ctx["d"], m2, max(0, walk - mins(m1)))],
            "crossings": xs, "_m": m1 + m2, "_p": p1 + p2, "_det": det, "_new": [x for x in xs if x not in base["crossings"]],
            "_eval": _merge(_path_eval(z, p1), _path_eval(z, p2)),
            "_ev": [stop["id"]] + z.path_ways(p1) + z.path_ways(p2),
            "_in": {**base["_in"], "stop": stop["id"], "stop_duration_min": stop["min"]}}


def _transit(ctx):
    """Route C from the origin at depart_at: the itinerary that arrives first."""
    o, d, t = ctx["o"], ctx["d"], ctx["depart"]
    url, js = _fetch(ctx, (o["lat"], o["lon"]), (d["lat"], d["lon"]), t, {"directModes": ""})
    it = _itinerary(js)
    if it is None:
        return None, url, js is not None
    legs, walk_s, ev = _transit_legs(ctx, it, o["name"])
    line, frm = _lines(legs)
    extra = [ctx["zone"].fact("transit_line", L["line"], None, "transit_api", [url], {"request": url})
             for L in legs if L["line"]]
    wait0 = _between(t, it["startTime"])
    extra.append(ctx["zone"].fact("wait_before_leaving", wait0, "min", "transit_api", [url], {"request": url, "depart_at": t}))
    return {"id": "C", "mode": "transit", "duration_min": _between(t, it["endTime"]), "walk_min": round(walk_s / 60),
            "transfers": it["transfers"], "leave_at": it["startTime"], "arrive_at": it["endTime"], "legs": legs,
            "crossings": ev["xs"], "_eval": ev, "_ev": [url], "_extra": extra, "_url": url,
            "_in": {"request": url, "depart_at": t, "graph": ctx["zone"].graph_inputs,
                    "crossings_method": f"OSM crossing nodes within {XING_M} m of the Transitous walking leg geometry"},
            "_say": (line, frm, wait0)}, url, True


def _transit_stop(ctx, stop):
    """Route C through the stop, as build_stop(): the shortest walk there, the stop, then the bus part queried from its end."""
    z, s, pt, d = ctx["zone"], stop["snap"], stop["pt"], ctx["d"]
    m1, p1 = _route(z, z.G, ctx["a"], s)
    if m1 is None:
        return None, None, True
    t2 = _at(ctx["depart"], mins(m1) + stop["min"])
    url, js = _fetch(ctx, (pt["lat"], pt["lon"]), (d["lat"], d["lon"]), t2, {"directModes": ""})
    it = _itinerary(js)
    if it is None:
        return None, url, js is not None
    legs2, walk2_s, ev2 = _transit_legs(ctx, it, pt["name"])
    line, frm = _lines(legs2)
    wait = _between(t2, it["startTime"])
    extra = [z.fact("transit_line", L["line"], None, "transit_api", [url], {"request": url}) for L in legs2 if L["line"]]
    extra.append(z.fact("wait_after_stop", wait, "min", "transit_api", [url], {"request": url, "stop_ends_at": t2}))
    return {"id": "C", "mode": "transit", "duration_min": _between(ctx["depart"], it["endTime"]),
            "walk_min": mins(m1) + round(walk2_s / 60), "transfers": it["transfers"], "leave_at": ctx["depart"],
            "arrive_at": it["endTime"], "legs": [_leg(ctx["o"], pt, m1), stop["leg"]] + legs2,
            "crossings": z.path_crossings(p1) + ev2["xs"], "_eval": _merge(_path_eval(z, p1), ev2),
            "_ev": [stop["id"], url] + z.path_ways(p1), "_extra": extra, "_url": url,
            "_in": {"graph": z.graph_inputs, "stop": stop["id"], "stop_duration_min": stop["min"], "request_after_stop": url,
                    "crossings_method": f"walk to the stop on the OSM graph; after it, OSM crossing nodes within {XING_M} m "
                                        "of the Transitous walking legs"},
            "_say": (line, frm, wait), "_after_stop": True}, url, True


def _check(c, r):
    """(known violations, unknowns) of one constraint on one route, as lists of evidence (None when there is none)."""
    k, e = c["kind"], r["_eval"]
    if k in BAD:
        return [x["osm_id"] for x in e["xs"] if BAD[k](x)], [x["osm_id"] for x in e["xs"] if UNK[k](x)]
    if k in ("steps", "main_roads", "construction"):
        return e[{"steps": "steps", "main_roads": "main", "construction": "constr"}[k]], []
    if k == "transfers":
        return [None] * r["transfers"], []
    return ([None] if r["walk_min"] > c.get("value", 0) else []), []


def _phrase(kind, bad, unk, r):
    n, u = len(bad), len(unk)
    if kind in BAD:
        what = "crossing" if kind == "unsignalled_crossings" else "signalled crossing"
        return (plural(n, what) if n else "no " + what) + (" without a signal" if kind == "unsignalled_crossings" else
                                                          " without sound") + (f" and {u} where the map does not say" if u else "")
    if kind == "steps":
        return plural(n, "flight") + " of steps" if n else "no steps"
    if kind == "main_roads":
        return f"{fmt(r10(r['_eval']['main_m']))} along main roads" if n else "no walking along main roads"
    if kind == "construction":
        return "past " + plural(n, "construction site") if n else "no construction site"
    if kind == "transfers" and r["mode"] == "transit":
        return plural(n, "transfer") if n else "no transfers"
    return None


def _warning(kind, bad, unk, r, c):
    n, u = len(bad), len(unk)
    out = []
    if kind == "unsignalled_crossings":
        out += [f"{plural(n, 'crossing')} without a signal."] if n else []
        out += [f"{plural(u, 'crossing')} where the map does not say whether there is a signal."] if u else []
    elif kind == "signals_without_sound":
        out += [f"{plural(n, 'signalled crossing')} without sound."] if n else []
        out += [f"{plural(u, 'crossing')} where the map does not say whether the signal has sound."] if u else []
    elif kind == "walking_over_min" and n:
        out.append(f"{plural(r['walk_min'], 'minute')} of walking, more than {c['value']:g}.")
    elif n and _phrase(kind, bad, unk, r):
        out.append(_cap(_phrase(kind, bad, unk, r)) + ".")
    return out


def _finish(ctx, r, shortest, fewest=False):
    """Statuses, trade-off, facts, summary and warnings of one route; drops the private keys."""
    z, cons, stop = ctx["zone"], ctx["cons"], ctx["stop"]
    ev, rin = r["_ev"], r["_in"]
    src = "transit_api" if r["mode"] == "transit" else "computed"
    checks = [(c, *_check(c, r)) for c in cons]
    r["constraint_status"] = [{"kind": c["kind"], "status": "violated" if bad else "unknown" if unk else "satisfied"}
                              for c, bad, unk in checks]
    tk = next((c["kind"] for c in cons if c["kind"] in BAD), "unsignalled_crossings")
    tb, tu = next(((bad, unk) for c, bad, unk in checks if c["kind"] == tk), None) or _check({"kind": tk}, r)
    extra_min = r["duration_min"] - shortest
    r["trade_off"] = {"extra_min": extra_min, "violating_crossings": len(tb), "unknown_crossings": len(tu)}
    xs = r["crossings"]
    r["facts"] = [z.fact("route_duration", r["duration_min"], "min", src, ev, rin),
                  z.fact("route_walk_time", r["walk_min"], "min", src, ev, rin),
                  z.fact("route_crossings", len(xs), "count", "computed", [x["osm_id"] for x in xs] or ev, rin),
                  z.fact("route_violating_crossings", len(tb), "count", "computed", tb or ev, {**rin, "constraint": tk}),
                  z.fact("route_unknown_crossings", len(tu), "count", "computed", tu or ev, {**rin, "constraint": tk}),
                  z.fact("route_extra_time", extra_min, "min", "computed", ev, rin)] + r.get("_extra", [])
    if "_m" in r:
        r["facts"].append(z.fact("route_distance", r10(r["_m"]), "m", "computed", ev, rin))
    for c, bad, unk in checks:
        if c["kind"] == tk:
            continue
        cin = {**rin, "constraint": c["kind"]}
        if c["kind"] == "main_roads":
            r["facts"].append(z.fact("route_main_road_distance", r10(r["_eval"]["main_m"]), "m", "computed", bad or ev, cin))
        r["facts"].append(z.fact("constraint_violations", len(bad), "count", "computed", [b for b in bad if b] or ev, cin))
        if unk:
            r["facts"].append(z.fact("constraint_unknown", len(unk), "count", "computed", unk, cin))
    said = [(c, bad, unk) for c, bad, unk in checks if _phrase(c["kind"], bad, unk, r)] or \
        [({"kind": tk}, tb, tu)]
    phr = ", ".join(_phrase(c["kind"], bad, unk, r) for c, bad, unk in said)
    r["warnings"] = [w for c, bad, unk in said for w in _warning(c["kind"], bad, unk, r, c)] + \
        [w for c, bad, unk in checks if c["kind"] == "walking_over_min" for w in _warning(c["kind"], bad, unk, r, c)]
    dur = plural(r["duration_min"], "minute") + (f" {stop['with']}" if stop else "")
    if r["mode"] == "foot" and r["_label"] == "shortest":
        r["summary"] = f"Route {r['id']}, on foot, the shortest, {dur}: {phr}."
    elif r["mode"] == "foot":
        same = ", the same time as the shortest" if extra_min == 0 else \
            f", {extra_min} more than the shortest" if extra_min > 0 else ", less than the shortest"
        r["summary"] = f"Route {r['id']}, on foot, {dur}{same}: {phr}" + \
            (", the fewest of any route in the mapped area" if fewest and any(
                bad for c, bad, _u in checks if c["kind"] in PATH_KINDS) else "") + "."
    else:
        line, frm, wait = r["_say"]
        r["facts"] += _name_facts(z, [(frm, "transit_api", [r["_url"]])])
        if r.get("_after_stop"):
            r["summary"] = (f"Route C, on foot to {stop['name']}, then {line} from {frm}: {dur}"
                            + (f" and {plural(wait, 'minute')} of waiting after it" if wait else "")
                            + f", {r['walk_min']} of them on foot, with {phr}.")
        else:
            leave = f"you leave {plural(wait, 'minute')} after the time you gave" if wait else "you leave at the time you gave"
            r["summary"] = (f"Route C, {line} from {frm}: {leave} and arrive {plural(r['duration_min'], 'minute')} after it, "
                            f"{r['walk_min']} of them on foot, with {phr}.")  # _compute adds how long the shortest walk takes
    r["_checks"] = checks
    return r


def _public(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}


# ---------- the plan ----------
def _stop_place(zone, osm_id):
    m = OSM_ID.match(osm_id) if isinstance(osm_id, str) else None
    key = (m.group(1), int(m.group(2))) if m else None
    if key is None or key not in zone.features.index:
        raise PlanError(422, "I cannot find that place on the map of this area.")
    row = zone.features.loc[key]
    g = row.geometry
    lat, lon = zone.ll(g if g.geom_type == "Point" else g.centroid)
    if not zone.in_answer_area(lat, lon):
        raise PlanError(422, f"That place is outside the area I have mapped: {fmt(zone.answer_radius)} around Talent Garden.")
    shop = row.get("shop") if isinstance(row.get("shop"), str) else None
    kind = "supermarket" if shop == "supermarket" else "shop" if shop else "place"
    name = row["name"] if isinstance(row.get("name"), str) else f"an unnamed {kind}"
    return {"id": osm_id, "name": name, "lat": lat, "lon": lon, "shop": bool(shop),
            "noun": f"the {kind}" if shop else "the stop",
            "phrase": name if name.startswith("an unnamed") else f"the {kind} {name}" if shop else name,
            "with": "with the shopping" if shop else "with the stop", "doing": "of shopping" if shop else "at the stop"}


def _compute(zone, st, prev=None, op=None):
    """The whole Plan for state st; differences against the previous Plan `prev`."""
    o, d, depart, cons = st["origin"], st["destination"], st["depart_at"], st["constraints"]
    a, b = zone.snap(o["lat"], o["lon"]), zone.snap(d["lat"], d["lon"])
    rin = {"graph": zone.graph_inputs, "origin": [o["lat"], o["lon"]], "destination": [d["lat"], d["lon"]],
           "speed_m_per_min": SPEED, "origin_snap_m": round(a["off"]), "destination_snap_m": round(b["off"])}
    stop = None
    if st["stop"]:
        stop = _stop_place(zone, st["stop"]["osm_id"])
        stop["min"] = st["stop"]["duration_min"]
        stop["snap"] = zone.snap(stop["lat"], stop["lon"])
        stop["pt"] = {"name": stop["name"], "lat": stop["lat"], "lon": stop["lon"]}
        stop["leg"] = {"mode": "stop", "from": stop["pt"], "to": stop["pt"], "distance_m": None, "duration_min": stop["min"],
                       "line": None, "departure": None, "arrival": None}
    ctx = {"zone": zone, "o": o, "d": d, "a": a, "b": b, "depart": depart, "cons": cons, "stop": stop, "rin": rin,
           "cache": [], "snap_ev": ids("node", [a["u"], b["u"]])}

    # foot: B always the shortest, A the route under the constraints, offered only when it is another way;
    # ids keep their role across versions, so the selection and differences[] keep meaning the same route
    key = _key(cons)
    mB, pB = _route(zone, zone.G, a, b)
    if mB is None:
        raise PlanError(422, "I cannot find a walking route between these two points on the map.")
    HA = _graph(zone, key)
    mA, pA = _route(zone, HA, a, b) if key else (None, None)
    kinds = ", ".join(k for k, _s in key)
    foot = [_foot(ctx, "B", zone.G, mB, pB, "shortest")]
    if mA is not None:
        foot.insert(0, _foot(ctx, "A", HA, mA, pA, f"fewest known violations of {kinds}, then shortest"))
    if stop:
        foot = [x for x in (_foot_stop(ctx, r, stop) for r in foot) if x]
    if len(foot) == 2 and foot[0]["_p"] == foot[1]["_p"]:
        foot = foot[1:]

    unknown = []
    if stop:
        C, url, answered = _transit_stop(ctx, stop)
    else:
        C, url, answered = _transit(ctx)
    if C is None and url:
        unknown.append("Bus routes for this departure time are not available offline." if "miss" in ctx["cache"] and _offline()
                       else "Bus routes for this departure time could not be retrieved." if not answered
                       else f"Transitous returned no bus connection {'from ' + stop['noun'] if stop else 'for this trip'}, "
                            "so route C is not offered.")

    shortest = next((r["duration_min"] for r in foot if r["_label"] == "shortest"), foot[0]["duration_min"] if foot else 0)
    single = len([c for c in cons if c["kind"] in PATH_KINDS]) == 1
    computed = [_finish(ctx, r, shortest, fewest=single and r.get("_label") != "shortest") for r in foot + ([C] if C else [])]
    req = [c for c in cons if c["strength"] == "require"]
    dropped = [(r["id"], [c["kind"] for c, bad, _u in r["_checks"] if bad and c["strength"] == "require"]) for r in computed]
    dropped = [(rid, ks) for rid, ks in dropped if ks]
    if key and mA is None:  # route A itself is what the requirement removed
        dropped.insert(0, ("A", [k for k, s in key if s == "require"]))
    offered = [r for r in computed if r["id"] not in dict(dropped)]
    ids_ = [r["id"] for r in offered]
    short = next((r for r in offered if r.get("_label") == "shortest"), None)
    for r in offered:  # the bus compared with our own shortest walk, not Transitous' (make_fixtures, PR #14)
        if r["mode"] == "transit" and not r.get("_after_stop") and short:
            r["summary"] = r["summary"][:-1] + f"; route {short['id']} on foot takes {short['duration_min']}."

    sel = st["selected"] if st["selected"] in ids_ else None
    bus_unknown = C is None and not answered  # offline miss or error: the bus may meet what the walks do not
    comp = "yes" if any(all(not bad and not unk for _c, bad, unk in r["_checks"]) for r in offered) else \
        "unknown" if bus_unknown else "no"

    facts = [zone.fact("radius", zone.dist, "m", "unknown", [], {"graph": zone.graph_inputs}),
             zone.fact("compliant_routes", sum(all(s["status"] == "satisfied" for s in r["constraint_status"]) for r in offered),
                       "count", "computed", [f"node/{a['u']}"], {**rin, "filter": "every constraint satisfied"}, "unknown")]
    facts += [zone.fact("walking_limit", c["value"], "min", "unknown", [], {"said_by_user": True})
              for c in cons if c["kind"] == "walking_over_min"]
    facts += _name_facts(zone, [(o["name"], "unknown", []), (d["name"], "unknown", [])])
    unknown = [f"Routes that go farther than {fmt(zone.dist)} from Talent Garden were not considered.", UNMAPPED] + unknown

    # what the map says about every way, not only the offered ones
    every_k = [k for k, _s in key if SAY[k][4] and _route(zone, _graph(zone, ((k, "require"),)), a, b)[0] is None]
    every = [_say(k, 4) for k in every_k]
    fewest = None
    if req and not offered:  # the way to offer instead: fewest violations of a required path kind, else the shortest walk
        path_req = any(c["kind"] in PATH_KINDS for c in req)
        HF = _graph(zone, _key(cons, "avoid_when_possible")) if path_req else zone.G
        mF, pF = _route(zone, HF, a, b)
        fr = mF is not None and _foot(ctx, "A" if path_req else "B", HF, mF, pF,
                                      "fewest known violations" if path_req else "shortest")
        if fr and stop:
            fr = _foot_stop(ctx, fr, stop)
        if fr:
            fewest = _finish(ctx, fr, shortest)
            facts += [f for f in fewest["facts"] if f["type"] in (
                "route_duration", "route_violating_crossings", "route_unknown_crossings", "route_main_road_distance",
                "constraint_violations", "constraint_unknown")]

    # the stop, measured on the selected route (or the first one offered, or the one offered instead)
    stop_doc = None
    det, new_unknown = 0, []
    if stop:
        on = next((r for r in offered if r["id"] == sel), offered[0] if offered else fewest)
        method = "A->S->B minus A->B"
        base_c = on and on["mode"] == "transit" and _transit(dict(ctx, stop=None))[0]  # its miss shows in meta
        if on and on["mode"] == "foot":
            det, new_unknown = on["_det"], [x for x in on["_new"] if x["signals"] == "unknown"]
        elif base_c:  # transit: the walking it adds
            det, method = max(0, on["walk_min"] - base_c["walk_min"]), "walking of route C with the stop minus without it"
        else:  # no route to measure on: the shortest walk
            g = _foot_stop(ctx, _foot(ctx, "B", zone.G, mB, pB, "shortest"), stop)
            det, method = (g["_det"] if g else 0), "A->S->B minus A->B on the shortest walk"
        stop_doc = {"place": stop["name"], "osm_id": stop["id"], "detour_min": det, "duration_min": stop["min"]}
        stop_in = {**rin, "stop": stop["id"], "stop_point": [stop["lat"], stop["lon"]], "route": on and on["id"],
                   "method": method}
        facts += [zone.fact("stop_detour", det, "min", "computed", [stop["id"]] + (on["_ev"][:20] if on else []), stop_in),
                  zone.fact("stop_duration", stop["min"], "min", "unknown", [], {"said_by_user": True}),
                  zone.fact("stop_new_unknown_crossings", len(new_unknown), "count", "computed",
                            [x["osm_id"] for x in new_unknown] or [stop["id"]], stop_in)]
        facts += _name_facts(zone, [(stop["name"], "map_tag", [stop["id"]])])
        if stop["shop"]:
            unknown.append(f"The map does not say whether {stop['noun']} is open at that time.")

    signalled = [x for r in computed for x in r["crossings"] if x["signals"] != "no"]
    if any(c["kind"] in BAD for c in req) and signalled and \
            sum(x["sound"] == "unknown" for x in signalled) > len(signalled) / 2:
        unknown.append("For most crossings the map does not say whether the signal has sound.")

    # text
    dname = d["name"]
    parts = []
    if every:
        parts.append(f"In the mapped area, every way to {dname} " + join_and(every) + ".")
    what, bus = ("walking route", "; the bus could not be checked.") if bus_unknown else ("route", ".")
    if not offered:
        reqs = "the requirement of " + join_and(_say(c["kind"], 1, c.get("value")) for c in req) if req else "every constraint"
        so = any(c["kind"] in every_k for c in req)  # "So" only when the sentence before implies it
        parts.append((f"So no {what} there meets " if so else f"No {what} in the mapped area meets ") + reqs + bus)
        if fewest:
            if stop:
                parts.append(f"With a stop at {stop['phrase']} for {plural(stop['min'], 'minute')}:")
            dur = plural(fewest["duration_min"], "minute") + (f" {stop['with']}" if stop else "")
            if fewest["_label"] == "shortest":
                parts.append(f"The shortest walk, route {fewest['id']}, takes {dur}.")
            else:
                fp = ", ".join(p for c, bad, unk in fewest["_checks"] if (p := _phrase(c["kind"], bad, unk, fewest))) or \
                    _phrase("unsignalled_crossings", *_check({"kind": "unsignalled_crossings"}, fewest), fewest)
                parts.append(f"The route with the fewest is route {fewest['id']}, {dur}, with {fp}.")
        if req:
            parts.append("Do you want me to relax the requirement to avoid when possible?")
    else:
        if not every and cons and comp != "yes":
            unsure = any(unk for r in offered for _c, _b, unk in r["_checks"])
            parts.append(f"In the mapped area, no {what} to {dname} {'is verified to meet' if unsure else 'meets'} "
                         f"every constraint{bus}")
        if stop:
            parts.append(f"With a stop at {stop['phrase']} for {plural(stop['min'], 'minute')}:")
        parts += [r["summary"] for r in offered]
        if op == "select" and sel:
            parts = [f"You chose route {sel}.", next(r["summary"] for r in offered if r["id"] == sel)]
        elif sel:
            parts.append(f"You chose route {sel}.")
        else:
            tol = st["detour_tolerance"]
            A_, B_ = (next((r for r in offered if r["id"] == i and r["mode"] == "foot"), None) for i in ("A", "B"))
            if A_ and B_ and A_["trade_off"]["extra_min"] > max(tol["min"], B_["duration_min"] * tol["pct"] / 100):
                pa = ", ".join(_phrase(c["kind"], bad, unk, A_) for c, bad, unk in A_["_checks"] if _phrase(c["kind"], bad, unk, A_))
                pb = ", ".join(_phrase(c["kind"], bad, unk, B_) for c, bad, unk in B_["_checks"] if _phrase(c["kind"], bad, unk, B_))
                parts.append(f"Route A takes {plural(A_['trade_off']['extra_min'], 'minute')} more than route B"
                             + (f", with {pa} instead of {pb}." if pa and pb else "."))
            parts.append("Which one?" if len(offered) > 1 else f"Do you want route {offered[0]['id']}?")

    doc = {"origin": o, "destination": d, "depart_at": depart, "lang": "en", "plan_version": st["version"],
           "constraints": cons, "detour_tolerance": st["detour_tolerance"], "text": " ".join(parts),
           "routes": [_public(r) for r in offered], "compliant_route_available": comp, "selected_route_id": sel,
           "stop": stop_doc, "stop_candidates": [], "differences": [], "facts": facts, "unknown": unknown,
           "meta": meta("offline" if _offline() else "live",
                        "miss" if {"miss", "error"} & set(ctx["cache"]) else
                        "hit" if ctx["cache"] and all(c == "hit" for c in ctx["cache"]) else "none")}
    if prev is not None:
        doc["differences"] = _differences(zone, prev, doc, st, dropped, stop, new_unknown)
    return doc


def _differences(zone, prev, doc, st, dropped, stop, new_unknown):
    """What changed since `prev`, in the fixtures' wording; the numbers said are added to doc['facts']."""
    out, facts = [], doc["facts"]
    was = {r["id"]: r for r in prev["routes"]}
    now = {r["id"]: r for r in doc["routes"]}
    sel, psel = doc["selected_route_id"], prev["selected_route_id"]

    def before(rid, value):  # rid is offered in both versions
        facts.append(zone.fact("route_duration_before", value, "min", "computed", now[rid]["facts"][0]["evidence"][:5],
                               {"route": rid, "version": prev["plan_version"]}))

    if sel and sel != psel:
        out.append(f"You chose route {sel}.")
    if prev["depart_at"] != doc["depart_at"]:  # said relative to the previous time: no clock times
        h, m = divmod(abs(_between(prev["depart_at"], doc["depart_at"])), 60)
        said = [plural(h, "hour")] * bool(h) + [plural(m, "minute")] * bool(m)
        way = "later" if doc["depart_at"] > prev["depart_at"] else "earlier"
        out.append(f"You now leave {join_and(said) if said else 'less than a minute'} {way} than before.")
        tin = {"depart_at": doc["depart_at"], "previous_depart_at": prev["depart_at"]}
        facts += ([zone.fact("departure_change_hours", h, None, "unknown", [], {**tin, "unit": "hour"})] if h else []) + \
            ([zone.fact("departure_change", m, "min", "unknown", [], tin)] if m else [])
    told = set()
    old_c, new_c = {c["kind"]: c for c in prev["constraints"]}, {c["kind"]: c for c in doc["constraints"]}
    for k, c in new_c.items():
        p = old_c.get(k)
        if c == p:
            continue
        if c["strength"] == "require":
            gone = [rid for rid, ks in dropped if k in ks and rid in was]
            told |= set(gone)
            s = f"{_say(k, 2, c.get('value'))} now required"
            if gone:
                s += (": " + join_and(f"route {r}" for r in gone) + (" is" if len(gone) == 1 else " are")
                      + f" no longer offered, because of {SAY[k][3]}")
            out.append(s + ".")
        elif p and p["strength"] == "require":
            out.append(f"{_say(k, 2, p.get('value'))} no longer required; now avoiding {_say(k, 0, c.get('value'))} when possible.")
        else:
            out.append(f"Now avoiding {_say(k, 0, c.get('value'))} when possible.")
    for k, p in old_c.items():
        if p.get("value") is not None and p != new_c.get(k):
            facts.append(zone.fact("previous_walking_limit", p["value"], "min", "unknown", [], {"said_by_user": True}))
        if k not in new_c:
            out.append(f"{_say(k, 2, p.get('value'))} no longer required." if p["strength"] == "require"
                       else f"No longer avoiding {_say(k, 0, p.get('value'))}.")

    if prev["detour_tolerance"] != doc["detour_tolerance"]:  # in minutes on route B, as the text weighs A against B
        tol, b = doc["detour_tolerance"], now.get("B")
        n = round(max(tol["min"], b["duration_min"] * tol["pct"] / 100) if b else tol["min"], 1)
        n = int(n) if n == int(n) else n
        out.append(f"You now accept a detour of up to {plural(n, 'minute')}." if n else "You now accept no detour.")
        facts.append(zone.fact("detour_tolerance", n, "min", "unknown", [],
                               {"said_by_user": True, **tol, "shortest_min": b and b["duration_min"]}))

    ps, ns = prev["stop"], doc["stop"]
    delta_sel = None
    if ns and (not ps or ps["osm_id"] != ns["osm_id"]):
        s = f"Stop added at {ns['place']}" if not ps else f"The stop is now at {ns['place']} instead of {ps['place']}"
        if sel in was and sel in now:
            before(sel, was[sel]["duration_min"])
            s += (f": route {sel} now takes {plural(now[sel]['duration_min'], 'minute')} instead of {was[sel]['duration_min']}, "
                  f"{plural(ns['detour_min'], 'minute')} more on foot and {plural(ns['duration_min'], 'minute')} {stop['doing']}")
        out.append(s + ".")
        if "C" in now and "C" in was:
            out.append(f"Route C was recomputed: its bus part now starts after {'the shopping' if stop['shop'] else 'the stop'}.")
        if new_unknown:
            out.append(f"The way to and from {stop['noun']} adds {plural(len(new_unknown), 'crossing')} "
                       "where the map does not say whether there is a signal.")
        told |= set(now)  # the durations are all new: said by the summaries
    elif ns and ps and ns["duration_min"] != ps["duration_min"]:
        s = f"The stop at {ns['place']} now lasts {plural(ns['duration_min'], 'minute')} instead of {ps['duration_min']}"
        facts.append(zone.fact("previous_stop_duration", ps["duration_min"], "min", "unknown", [], {"said_by_user": True}))
        if sel in was and sel in now:
            before(sel, was[sel]["duration_min"])
            s += f": route {sel} now takes {plural(now[sel]['duration_min'], 'minute')} instead of {was[sel]['duration_min']}"
            delta_sel = now[sel]["duration_min"] - was[sel]["duration_min"]
            told.add(sel)
        out.append(s + ".")
    elif ps and not ns:
        s = f"The stop at {ps['place']} was removed"
        if sel in was and sel in now:
            before(sel, was[sel]["duration_min"])
            s += f": route {sel} now takes {plural(now[sel]['duration_min'], 'minute')} instead of {was[sel]['duration_min']}"
            delta_sel = now[sel]["duration_min"] - was[sel]["duration_min"]
            told.add(sel)
        out.append(s + ".")

    for rid, r in now.items():
        if rid in told:
            continue
        if rid not in was:
            out.append(f"Route {rid} is now offered.")
        elif r["duration_min"] != was[rid]["duration_min"] and r["duration_min"] - was[rid]["duration_min"] != delta_sel:
            before(rid, was[rid]["duration_min"])
            out.append(f"Route {rid} now takes {plural(r['duration_min'], 'minute')} instead of {was[rid]['duration_min']}.")
    for rid in was:
        if rid not in now and rid not in told:
            out.append(f"Route {rid}, which you chose, is no longer offered." if rid == psel else f"Route {rid} is no longer offered.")
    return out


# ---------- input ----------
def _now_depart():
    now = datetime.now(timezone.utc)
    t = now.replace(second=0, microsecond=0)
    return _iso(t + timedelta(minutes=1) if t < now else t)


def _depart(v):
    if v is None:
        return _now_depart()
    if not isinstance(v, str) or not DATETIME.match(v):
        raise PlanError(422, "I did not understand the departure time: give a date and a time with its time zone.")
    try:
        return _iso(_dt(v))
    except ValueError:
        raise PlanError(422, "I did not understand the departure time: give a date and a time with its time zone.") from None


def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0 and v == v and v != float("inf")


def _constraints(v):
    if v is None:
        return []
    if not isinstance(v, list):
        raise PlanError(422, "I did not understand the constraints.")
    out = {}
    for c in v:
        if not isinstance(c, dict) or c.get("kind") not in KINDS:
            raise PlanError(422, "I can plan around crossings without a signal, signals without sound, steps, construction "
                                 "sites, main roads, transfers and walking time only.")
        s = c.get("strength") or "avoid_when_possible"
        if s not in STRENGTHS:
            raise PlanError(422, "A constraint is either avoided when possible or required.")
        item = {"kind": c["kind"], "strength": s}
        if c["kind"] == "walking_over_min":
            if not _number(c.get("value")):
                raise PlanError(422, "How many minutes of walking at most?")
            item["value"] = c["value"]
        out[c["kind"]] = item  # one per kind: the last one said wins
    return list(out.values())


def _tolerance(v, default):
    if v is None:
        return dict(default)
    if not isinstance(v, dict) or not _number(v.get("min")) or not _number(v.get("pct")):
        raise PlanError(422, "I did not understand the detour you accept: give minutes and a percentage.")
    return {"min": v["min"], "pct": v["pct"]}


def _point(zone, spec, session):
    try:
        lat, lon, name = resolve_place(zone, spec, session)
    except PlaceError as e:
        raise PlanError(422, str(e)) from None
    except (ValueError, TypeError, KeyError, AttributeError):
        raise PlanError(422, "I did not understand that place: give a name, or a latitude and a longitude.") from None
    return {"name": name, "lat": lat, "lon": lon}


def _current(session, if_version):
    if session.plan is None:
        raise PlanError(404, "There is no plan yet: tell me where you want to go.")
    if if_version is not None and if_version != session.plan["plan_version"]:
        raise PlanError(409, "The plan changed in the meantime: listen to the current plan first.")
    return session.plan


def _state(doc):
    return {"origin": doc["origin"], "destination": doc["destination"], "depart_at": doc["depart_at"],
            "constraints": doc["constraints"], "detour_tolerance": doc["detour_tolerance"],
            "selected": doc["selected_route_id"], "version": doc["plan_version"],
            "stop": {"osm_id": doc["stop"]["osm_id"], "duration_min": doc["stop"]["duration_min"]} if doc["stop"] else None}


def _apply(zone, session, st, op):
    prev = session.plan
    st = {**st, "version": prev["plan_version"] + 1}
    session.plan = _compute(zone, copy.deepcopy(st), prev, op)  # computed fully before it replaces the old plan
    return copy.deepcopy(session.plan)


# ---------- the API ----------
def create(zone, session, destination, origin=None, depart_at=None, constraints=None, detour_tolerance=None):
    if not destination or isinstance(destination, dict) and destination.get("lat") is None and not destination.get("name"):
        raise PlanError(422, "Where do you want to go?")
    o, d = _point(zone, origin, session), _point(zone, destination, session)
    if (o["lat"], o["lon"]) == (d["lat"], d["lon"]):  # as lotl.tools._pair
        raise PlanError(422, (f"Both places are {d['name']}." if o["name"] == d["name"] else
                              f"{_cap(o['name'])} and {d['name']} are the same place on the map.") + " Where do you want to go?")
    st = {"origin": o, "destination": d, "depart_at": _depart(depart_at), "constraints": _constraints(constraints),
          "detour_tolerance": _tolerance(detour_tolerance, TOLERANCE), "selected": None, "stop": None, "version": 1}
    session.plan = _compute(zone, st)
    return copy.deepcopy(session.plan)


def get(zone, session):
    return copy.deepcopy(_current(session, None))


def select(zone, session, route_id, if_version=None):
    doc = _current(session, if_version)
    offered = [r["id"] for r in doc["routes"]]
    if route_id not in offered:
        raise PlanError(422, f"There is no route {route_id} in this plan." if offered else "There is no route to choose in this plan.")
    if route_id == doc["selected_route_id"]:
        return copy.deepcopy(doc)
    return _apply(zone, session, {**_state(doc), "selected": route_id}, "select")


def candidates(zone, session, kind="supermarket", if_version=None):
    """Supermarkets ranked by the walking they add to the selected route, best 3; the plan itself is unchanged."""
    doc = _current(session, if_version)
    if kind != "supermarket":
        raise PlanError(422, "I can look for supermarkets only.")
    sel = doc["selected_route_id"]
    if not sel:
        raise PlanError(422, "Choose a route first: then I can look for supermarkets along it.")
    o, d = doc["origin"], doc["destination"]
    a, b = zone.snap(o["lat"], o["lon"]), zone.snap(d["lat"], d["lon"])
    H = _graph(zone, _key(doc["constraints"])) if sel == "A" else zone.G
    m0, _p = _route(zone, H, a, b)
    if m0 is None:  # require: route A's own graph has no way
        H = zone.G
        m0, _p = _route(zone, H, a, b)
    f = zone.features
    shops = f[f["shop"] == "supermarket"] if "shop" in f else f.iloc[:0]
    found = []
    for (el, i), row in shops.iterrows():
        g = row.geometry
        lat, lon = zone.ll(g if g.geom_type == "Point" else g.centroid)
        if not zone.in_answer_area(lat, lon):
            continue
        s = zone.snap(lat, lon)
        (m1, p1), (m2, p2) = _route(zone, H, a, s), _route(zone, H, s, b)
        if m1 is None or m2 is None:
            continue
        name = row["name"] if isinstance(row.get("name"), str) else "an unnamed supermarket"
        street = row.get("addr:street") if isinstance(row.get("addr:street"), str) else zone.road_name(g, 60)
        found.append({"det_m": m1 + m2 - m0, "name": name, "street": street, "id": f"{el}/{i}", "lat": lat, "lon": lon,
                      "path": p1 + p2})
    found = sorted(found, key=lambda c: c["det_m"])[:3]
    for c in found:  # two shops with one name are told apart by their street
        if [k["name"] for k in found].count(c["name"]) > 1 and c["street"]:
            c["name"] = f"{c['name']} on {lc(c['street'])}"
    cand = [{"place": c["name"], "osm_id": c["id"], "lat": c["lat"], "lon": c["lon"], "detour_min": mins(max(0.0, c["det_m"]))}
            for c in found]
    rin = {"graph": zone.graph_inputs, "origin": [o["lat"], o["lon"]], "destination": [d["lat"], d["lon"]],
           "speed_m_per_min": SPEED, "route": sel,
           "method": "A->S->B minus A->B" + (" on the shortest walk" if H is zone.G and sel != "B" else "")}
    cfacts = [zone.fact("stop_candidate_detour", c["detour_min"], "min", "computed", [c["osm_id"]] + zone.path_ways(k["path"])[:20],
                        {**rin, "stop": c["osm_id"]}) for c, k in zip(cand, found)]
    cfacts += _name_facts(zone, [(c["place"], "map_tag", [c["osm_id"]]) for c in cand])
    OPEN = "The map does not say whether these supermarkets are open at that time."
    out = copy.deepcopy(doc)
    out["stop_candidates"] = cand
    near = "the shortest walk" if sel == "C" else f"route {sel}"  # route C walks to the stop on the shortest walk
    out["text"] = (f"Supermarkets near {near}: "
                   + "; ".join(f"{c['place']}, {plural(c['detour_min'], 'minute')} more on foot" for c in cand)
                   + (". Route C would take the bus from the one you choose" if sel == "C" else "")
                   + ". Which one, and for how long?") if cand else \
        f"I found no supermarket near {near} in the mapped area."
    out["facts"] = [f for f in out["facts"] if f["type"] != "stop_candidate_detour"] + cfacts
    out["unknown"] = [u for u in out["unknown"] if u != OPEN] + ([OPEN] if cand else [])
    session.plan = out
    return copy.deepcopy(out)


def set_stop(zone, session, osm_id, duration_min=None, if_version=None):
    """Add, move or re-time the stop (every route goes through it); osm_id None removes it."""
    doc = _current(session, if_version)
    st = _state(doc)
    if osm_id is None:
        if doc["stop"] is None:
            return copy.deepcopy(doc)
        return _apply(zone, session, {**st, "stop": None}, "stop")
    if not doc["selected_route_id"] and doc["stop"] is None:  # a stop already in the plan can be moved or re-timed
        raise PlanError(422, "Choose a route first: then I can add a stop along it.")
    place = _stop_place(zone, osm_id)
    old = doc["stop"]
    if duration_min is None:
        if old is None:
            raise PlanError(422, f"How many minutes will you spend at {place['name']}?")
        duration_min = old["duration_min"]
    if not _number(duration_min) or duration_min > 600:
        raise PlanError(422, "How many minutes will you spend there?")
    if old and old["osm_id"] == osm_id and old["duration_min"] == duration_min:
        return copy.deepcopy(doc)
    return _apply(zone, session, {**st, "stop": {"osm_id": osm_id, "duration_min": duration_min}}, "stop")


def set_constraints(zone, session, constraints, detour_tolerance=None, if_version=None):
    doc = _current(session, if_version)
    cons = _constraints(constraints)
    tol = _tolerance(detour_tolerance, doc["detour_tolerance"])
    if cons == doc["constraints"] and tol == doc["detour_tolerance"]:
        return copy.deepcopy(doc)
    return _apply(zone, session, {**_state(doc), "constraints": cons, "detour_tolerance": tol}, "constraints")


def set_depart(zone, session, depart_at, if_version=None):
    doc = _current(session, if_version)
    t = _depart(depart_at)
    if t == doc["depart_at"]:
        return copy.deepcopy(doc)
    return _apply(zone, session, {**_state(doc), "depart_at": t}, "depart")


if __name__ == "__main__":
    import pathlib
    import sys
    import time

    from jsonschema import Draft7Validator

    from .session import Session
    from .zone import DEMO_DESTINATION, TALENT_GARDEN, Zone

    os.environ["LOTL_OFFLINE"] = "1"  # the demo answers are cached: the test never calls Transitous
    sys.path.insert(0, os.environ.get("CONTRACTS", str(pathlib.Path(__file__).resolve().parents[2] / "contracts")))
    import validate as V

    def check(doc, what):
        doc = json.loads(json.dumps(doc))  # plain JSON
        bad = [f"{'/'.join(map(str, e.absolute_path))}: {e.message}"
               for e in Draft7Validator(V.SCHEMAS["plan"], registry=V.REGISTRY).iter_errors(doc)]
        backed = V.backed_numbers(doc)
        bad += [f"number {t!r} in {k} has no fact: {v[:70]}" for k, v in V.walk(doc) if k in V.SPOKEN and isinstance(v, str)
                for t in V.NUM.findall(v) if V.norm(t) not in backed]
        print(f"{'ok  ' if not bad else 'FAIL'} v{doc['plan_version']} {what} [{doc['meta']['cache']}]: {doc['text']}")
        for r in doc["routes"]:
            print(f"       {r['id']} {r['duration_min']} min, walk {r['walk_min']}, {[s['status'] for s in r['constraint_status']]}, "
                  f"trade-off {r['trade_off']}, legs {[(L['mode'], L['line'], L['duration_min']) for L in r['legs']]}")
        for x in doc["differences"]:
            print("       diff:", x)
        for b in bad:
            print("       !!", b)
        assert not bad, what
        return doc

    def refused(status, fn, *args, **kw):
        before = copy.deepcopy(s.plan)
        try:
            fn(*args, **kw)
        except PlanError as e:
            assert e.status == status, (e.status, e.message)
            assert s.plan == before, "state changed on a refused call"
            print(f"ok   {status}: {e.message}")
            return
        raise AssertionError(f"{fn.__name__} accepted, expected {status}")

    fx = {n: json.loads((pathlib.Path(V.HERE) / f"fixtures/plan.{n}.json").read_text()) for n in
          ("initial-comparison", "stop-candidates", "two-foot-routes-and-transit", "stop-5-min", "no-compliant-route")}
    t0 = time.time()
    z = Zone()
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    AVOID = [{"kind": "unsignalled_crossings", "strength": "avoid_when_possible"}]
    refused(404, get, z, s)
    refused(422, create, z, s, {"lat": 45.47, "lon": 9.19})
    v1 = check(create(z, s, {"lat": DEMO_DESTINATION[0], "lon": DEMO_DESTINATION[1], "name": "viale Isonzo"},
                      depart_at="2026-09-26T16:00:00Z", constraints=AVOID), "create")
    refused(422, set_stop, z, s, "node/10571089360", 15)  # no route chosen yet
    refused(422, candidates, z, s)
    v2 = check(select(z, s, "A"), "select A")
    refused(409, select, z, s, "B", if_version=1)
    refused(422, select, z, s, "Z")
    c = check(candidates(z, s, if_version=2), "candidates")
    assert c["plan_version"] == 2 and c["routes"] == v2["routes"] and c["differences"] == v2["differences"]
    best = c["stop_candidates"][0]
    v3 = check(set_stop(z, s, best["osm_id"], 15), "stop 15 min")
    v4 = check(set_stop(z, s, best["osm_id"], 5, if_version=3), "stop 5 min")
    assert set_stop(z, s, best["osm_id"], 5)["plan_version"] == 4  # same stop, same duration: nothing applied
    v5 = check(set_constraints(z, s, [{"kind": "unsignalled_crossings", "strength": "require"}]), "require")
    v6 = check(set_depart(z, s, "2026-09-26T16:30:00Z"), "depart 18:30, not cached")
    assert v6["meta"]["cache"] == "miss" and "C" not in [r["id"] for r in v6["routes"]], v6["meta"]
    assert "Bus routes for this departure time are not available offline." in v6["unknown"]
    assert get(z, s) == v6 and [d["plan_version"] for d in (v1, v2, v3, v4, v5, v6)] == [1, 2, 3, 4, 5, 6]
    v7 = check(set_stop(z, s, None), "stop removed")
    v8 = check(set_constraints(z, s, AVOID), "relaxed")

    s2 = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    w = check(create(z, s2, {"name": "the party"}, depart_at="2026-09-26T16:00:00Z",
                     constraints=[{"kind": "steps", "strength": "avoid_when_possible"},
                                  {"kind": "main_roads", "strength": "require"},
                                  {"kind": "construction", "strength": "avoid_when_possible"},
                                  {"kind": "transfers", "strength": "avoid_when_possible"},
                                  {"kind": "walking_over_min", "strength": "avoid_when_possible", "value": 10}]), "other kinds")
    for r in w["routes"]:
        st_ = {x["kind"]: x["status"] for x in r["constraint_status"]}
        assert st_["main_roads"] != "violated", r["id"]  # required: routes known to violate are never offered
        assert st_["walking_over_min"] == ("violated" if r["walk_min"] > 10 else "satisfied")
    w2 = check(set_depart(z, s2, "2026-09-26T16:07:00Z"), "uncached departure")
    assert w2["meta"]["cache"] == "miss" and all(r["mode"] == "foot" for r in w2["routes"])

    assert v6["compliant_route_available"] == "unknown"  # nothing offered on foot, the bus unknown offline
    assert [c["text"], v3["text"], v4["text"]] == [fx[n]["text"] for n in ("stop-candidates", "two-foot-routes-and-transit", "stop-5-min")]
    assert [v3["differences"], v4["differences"], v5["differences"]] == \
        [fx[n]["differences"] for n in ("two-foot-routes-and-transit", "stop-5-min", "no-compliant-route")]
    # v5 keeps the 5-minute stop, the no-compliant-route fixture has none: the way offered instead goes through it
    assert "With a stop at the supermarket Lidl for 5 minutes: The route with the fewest is route A, 20 minutes with the " \
           "shopping, with 1 crossing without a signal." in v5["text"] and v5["stop"]["detour_min"] == v4["stop"]["detour_min"], v5

    # v1 differs in route C only: the engine takes the bus that arrives first, the fixture picked the Lodi M3 one;
    # v5 keeps the stop, the no-compliant-route fixture has none
    def nums(doc):
        return {r["id"]: (r["duration_min"], r["walk_min"], r["trade_off"]["violating_crossings"], len(r["crossings"]))
                for r in doc["routes"]}
    for name, doc in zip(fx, (v1, c, v3, v4, v5)):
        same = doc["text"] == fx[name]["text"]
        print(f"{'same' if same else 'DIFF'} text vs {name}")
        if not same:
            print("       fixture:", fx[name]["text"])
            print("       fixture routes:", nums(fx[name]), "engine:", nums(doc))
            print("       fixture diffs:", fx[name]["differences"])
    print(f"all plan checks passed in {time.time() - t0:.1f} s")
