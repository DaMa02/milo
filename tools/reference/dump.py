"""Dump reference outputs of the legacy Python engine (server-py/) for the TypeScript engine's parity tests.

Runs the Python engine on the Porta Romana zone, from the osmnx cache in $TOOLS, with the clock frozen and
public transport offline, and writes every input and output to a gzipped JSON file:

    TOOLS=<osmnx cache parent> LOTL_OFFLINE=1 python tools/reference/dump.py <out.json.gz>

The raw Overpass answers it used are copied next to it (network.json.gz, features.json.gz).
"""
import datetime as _dt
import gzip
import json
import math
import os
import pathlib
import random
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server-py"))
os.environ["LOTL_OFFLINE"] = "1"

import osmnx as ox  # noqa: E402

# the osmnx cache is keyed by the request URL: use the endpoint the cache was filled from
ox.settings.overpass_url = os.environ.get("OVERPASS_URL", "https://maps.mail.ru/osm/tools/overpass/api")

FROZEN = _dt.datetime(2026, 9, 26, 17, 30, tzinfo=_dt.timezone.utc)  # Saturday 19:30 in Rome


class FrozenDatetime(_dt.datetime):
    @classmethod
    def now(cls, tz=None):
        return FROZEN.astimezone(tz) if tz else FROZEN.replace(tzinfo=None)


from lotl import explore as E, navigate as N, overview as O, plan as P, tools as T, zone as Z  # noqa: E402

T.datetime = FrozenDatetime
P.datetime = FrozenDatetime
Z.now_iso = lambda: "2026-09-26T17:30:00Z"

from lotl.session import Session  # noqa: E402

out_path = pathlib.Path(sys.argv[1])
zone = Z.Zone()
G = zone.G


def plain(o):
    return o.item() if hasattr(o, "item") else str(o)


def jsonable(doc):
    return json.loads(json.dumps(doc, default=plain))


# ---------- graph ----------
nodes = list(G.nodes)
graph = {
    "nodes": [[n, G.nodes[n]["x"], G.nodes[n]["y"], zone.LL[n][0], zone.LL[n][1]] for n in nodes],
    "adj": [[m for m in G[n]] for n in nodes],
    "street_count": [G.nodes[n].get("street_count", 0) for n in nodes],
    "boundary": sorted(zone.BOUNDARY),
    "crossings": {str(k): v for k, v in zone.CROSSINGS.items()},
    "edges": [[u, v, k, zone.E.loc[(u, v, k)]["osmid"], float(zone.E.loc[(u, v, k)]["length"])] for u, v, k in zone.E.index],
    "crs": str(zone.crs),
}
feats = [[el, int(i), row.geometry.geom_type] for (el, i), row in zone.features.iterrows()]
rail = [{k: (v if k not in ("pts", "rows", "point") else None) for k, v in p.items()} | {
    "pts": [[q.x, q.y] for q in p["pts"]], "point": [p["point"].x, p["point"].y]} for p in zone.railway_places()]
labels = {f"{u},{v}": zone.edge_label(u, v) for u, v, _k in list(zone.E.index)[:4000]}

cases = []


def case(kind, inp, fn):
    try:
        out = jsonable(fn())
    except Exception as e:  # noqa: BLE001 - errors are part of the contract
        out = {"error": type(e).__name__, "status": getattr(e, "status", None), "message": str(e)}
    cases.append({"kind": kind, "input": inp, "output": out})
    return out


# ---------- overview ----------
ORIGINS = [(45.44386, 9.20808, "Talent Garden"), (45.4452, 9.2045, "a point on viale Isonzo"),
           (45.4420, 9.2100, "the south side"), (45.4465, 9.2110, "corso Lodi"), (45.4400, 9.2030, "the railway yard")]
for lat, lon, name in ORIGINS:
    for h in (0, 90, 200):
        s = Session(origin=(lat, lon, name), heading=h)
        case("overview", {"origin": [lat, lon, name], "heading": h}, lambda: O.overview(zone, s))

# ---------- explore ----------
SEQS = [["start", "forward", "left", "right", "back", "back", "home", "where", "forward", "forward", "forward"],
        ["start", ["take", 0], ["take", 1], "where", "back", ["take", 2], "home"],
        ["start", "right", "right", "right", "left", "forward", "where"]]
for lat, lon, name in ORIGINS[:3]:
    for h in (0, 135):
        for seq in SEQS:
            s = Session(origin=(lat, lon, name), heading=h)
            steps = []
            for cmd in seq:
                c, b = (cmd, None) if isinstance(cmd, str) else cmd
                steps.append(case("explore", {"origin": [lat, lon, name], "heading": h, "command": c, "branch": b,
                                              "seq": seq}, lambda: E.explore(zone, s, c, h if c == "start" else None, b)))
            # take by name: the first branch of the last step
            last = steps[-1]
            if isinstance(last, dict) and last.get("branches"):
                nm = last["branches"][0]["name"]
                case("explore", {"origin": [lat, lon, name], "heading": h, "command": "take", "branch": nm, "seq": seq},
                     lambda: E.explore(zone, s, "take", None, nm))

# ---------- ask ----------
DEST = {"name": "the party"}
ASKS = [
    ("walking_vs_straight_line", {"to": DEST}),
    ("walking_vs_straight_line", {"from": {"name": "via Brembo"}, "to": {"name": "Giardino Franca Helg"}}),
    ("barrier_between", {"to": DEST}),
    ("barrier_between", {"to": {"name": "via Brembo"}}),
    ("street_continuity", {"street": "Via Arcivescovo Calabiana"}),
    ("street_continuity", {"street": "corso Lodi"}),
    ("street_continuity", {"street": "via Brembo"}),
    ("street_continuity", {"street": "viale Isonzo"}),
    ("independent_connections", {"from": {"name": "talent garden"}, "to": DEST}),
    ("independent_connections", {"to": {"lat": 45.4452, "lon": 9.2045}}),
    ("independent_connections", {"to": {"name": "via Brembo"}}),
    ("extent", {"place": "Villaggio Olimpico 2026 - Parco Porta Romana"}),
    ("extent", {"place": "Giardino Calabiana"}),
    ("extent", {"place": "via Brembo"}),
    ("extent", {"place": "the park"}),
    ("walking_vs_straight_line", {"to": {"name": "calabiana"}}),
    ("walking_vs_straight_line", {"to": {"name": "Piazza San Marco"}}),
    ("barrier_between", {"to": {"lat": 45.4600, "lon": 9.1900}}),
    ("street_continuity", {"street": "Giardino Franca Helg"}),
    ("extent", {"place": "Esselunga"}),
    ("place_info", {"place": {"name": "the pharmacy"}}),
    ("place_info", {"place": {"name": "the supermarket"}}),
    ("place_info", {"place": {"name": "the cafe"}}),
    ("place_info", {"place": {"name": "Esselunga"}}),
    ("place_info", {"place": {"name": "the atm"}}),
    ("walking_vs_straight_line", {"to": {"name": "the railway"}}),
    ("walking_vs_straight_line", {"to": {"lat": 45.4400, "lon": 9.2030}}),
    ("walking_vs_straight_line", {"from": {"lat": 45.4465, "lon": 9.2110}, "to": {"lat": 45.4420, "lon": 9.2100}}),
    ("barrier_between", {"from": {"lat": 45.4465, "lon": 9.2110}, "to": {"lat": 45.4400, "lon": 9.2030}}),
    ("walking_vs_straight_line", {}),
    ("walking_vs_straight_line", {"to": "talent garden"}),
]
for lat, lon, name in ORIGINS[:2]:
    for tool, params in ASKS:
        s = Session(origin=(lat, lon, name))
        case("ask", {"origin": [lat, lon, name], "tool": tool, "params": params},
             lambda: T.ask(zone, s, tool, params, "q"))

# ---------- hours ----------
HOURS = ["Mo-Fr 08:00-20:00; Sa 09:00-13:00", "24/7", "Mo-Su 07:00-23:00", "Mo-Sa 08:30-12:30,15:00-19:30",
         "Tu-Su 10:00-02:00", "Mo-Fr 09:00-18:00; PH off", "sunrise-sunset", "Mo-Fr 08:00-20:00, Sa 09:00-13:00", ""]
WHEN = [_dt.datetime(2026, 9, 26, 19, 30, tzinfo=T.ROME), _dt.datetime(2026, 9, 28, 7, 0, tzinfo=T.ROME),
        _dt.datetime(2026, 9, 29, 1, 30, tzinfo=T.ROME), _dt.datetime(2026, 9, 27, 12, 0, tzinfo=T.ROME)]
for h in HOURS:
    for w in WHEN:
        cases.append({"kind": "hours", "input": {"raw": h, "now": w.isoformat()},
                      "output": list(T.hours_now(h, w))})

# ---------- plan ----------
AVOID = [{"kind": "unsignalled_crossings", "strength": "avoid_when_possible"}]
s = Session(origin=(*Z.TALENT_GARDEN, "Talent Garden"))
sid = "p1"
flow = [
    ("get", {}), ("create", {"destination": {"lat": 45.47, "lon": 9.19}}),
    ("create", {"destination": {"lat": Z.DEMO_DESTINATION[0], "lon": Z.DEMO_DESTINATION[1], "name": "viale Isonzo"},
                "depart_at": "2026-09-26T16:00:00Z", "constraints": AVOID}),
    ("set_stop", {"osm_id": "node/10571089360", "duration_min": 15}),
    ("candidates", {}),
    ("select", {"route_id": "A"}),
    ("select", {"route_id": "B", "if_version": 1}),
    ("select", {"route_id": "Z"}),
    ("candidates", {"if_version": 2}),
    ("set_stop", {"osm_id": "$best", "duration_min": 15}),
    ("set_stop", {"osm_id": "$best", "duration_min": 5, "if_version": 3}),
    ("set_constraints", {"constraints": [{"kind": "unsignalled_crossings", "strength": "require"}]}),
    ("set_depart", {"depart_at": "2026-09-26T16:30:00Z"}),
    ("set_stop", {"osm_id": None}),
    ("set_constraints", {"constraints": AVOID}),
    ("candidates", {"kind": "pharmacy"}),
    ("candidates", {"kind": "cafe"}),
    ("select", {"route_id": "B"}),
    ("candidates", {"kind": "atm"}),
]
best = None


def run_plan(sess, op, args):
    global best
    a = dict(args)
    if a.get("osm_id") == "$best":
        a["osm_id"] = best
    if op == "get":
        return P.get(zone, sess)
    if op == "create":
        return P.create(zone, sess, a.get("destination"), a.get("origin"), a.get("depart_at"), a.get("constraints"),
                        a.get("detour_tolerance"))
    if op == "select":
        return P.select(zone, sess, a["route_id"], if_version=a.get("if_version"))
    if op == "candidates":
        r = P.candidates(zone, sess, kind=a.get("kind", "supermarket"), if_version=a.get("if_version"))
        if r["stop_candidates"] and a.get("kind", "supermarket") == "supermarket":
            best = r["stop_candidates"][0]["osm_id"]
        return r
    if op == "set_stop":
        return P.set_stop(zone, sess, a["osm_id"], duration_min=a.get("duration_min"), if_version=a.get("if_version"))
    if op == "set_constraints":
        return P.set_constraints(zone, sess, a["constraints"], detour_tolerance=a.get("detour_tolerance"),
                                 if_version=a.get("if_version"))
    if op == "set_depart":
        return P.set_depart(zone, sess, a["depart_at"], if_version=a.get("if_version"))
    raise ValueError(op)


for op, args in flow:
    case("plan", {"session": sid, "op": op, "args": args, "origin": [*Z.TALENT_GARDEN, "Talent Garden"]},
         lambda: run_plan(s, op, args))

s2 = Session(origin=(*Z.TALENT_GARDEN, "Talent Garden"))
OTHER = [{"kind": "steps", "strength": "avoid_when_possible"}, {"kind": "main_roads", "strength": "require"},
         {"kind": "construction", "strength": "avoid_when_possible"}, {"kind": "transfers", "strength": "avoid_when_possible"},
         {"kind": "walking_over_min", "strength": "avoid_when_possible", "value": 10}]
for op, args in [("create", {"destination": {"name": "the party"}, "depart_at": "2026-09-26T16:00:00Z", "constraints": OTHER}),
                 ("set_depart", {"depart_at": "2026-09-26T16:07:00Z"}),
                 ("set_constraints", {"constraints": [{"kind": "signals_without_sound", "strength": "avoid_when_possible"}],
                                      "detour_tolerance": {"min": 2, "pct": 10}}),
                 ("select", {"route_id": "A"}),
                 ("candidates", {"kind": "bakery"})]:
    case("plan", {"session": "p2", "op": op, "args": args, "origin": [*Z.TALENT_GARDEN, "Talent Garden"]},
         lambda: run_plan(s2, op, args))

for i, (lat, lon, name) in enumerate(ORIGINS[1:4]):
    s3 = Session(origin=(lat, lon, name))
    for dest in ({"lat": 45.4470, "lon": 9.2000, "name": "somewhere north"}, {"name": "via Brembo"}):
        case("plan", {"session": f"p3-{i}-{dest.get('name')}", "op": "create",
                      "args": {"destination": dest, "depart_at": "2026-09-26T16:00:00Z",
                               "constraints": [{"kind": "steps", "strength": "avoid_when_possible"}]},
                      "origin": [lat, lon, name]},
             lambda: run_plan(s3, "create", {"destination": dest, "depart_at": "2026-09-26T16:00:00Z",
                                            "constraints": [{"kind": "steps", "strength": "avoid_when_possible"}]}))

# ---------- navigate ----------
rng = random.Random(7)


def m_between(a, b):
    return math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 111_000 * math.cos(math.radians(a[0])))


def walk_points(line, step_m=1.3):
    out, carry = [tuple(line[0])], 0.0
    for a, b in zip(line, line[1:]):
        L = m_between(a, b)
        if L == 0:
            continue
        d = step_m - carry
        while d <= L:
            out.append((a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L))
            d += step_m
        carry = L - (d - step_m)
    return out + [tuple(line[-1])]


def offset(p, dn, de):
    return (p[0] + dn / 111_000, p[1] + de / (111_000 * math.cos(math.radians(p[0]))))


def simulate(label, origin, dest, rid, mutate):
    sess = Session(origin=origin)
    P.create(zone, sess, dest, None, "2026-09-26T16:00:00Z", AVOID)
    if rid:
        try:
            P.select(zone, sess, rid)
        except P.PlanError:
            pass
    state, t, fixes = {}, 0.0, []
    first = N.step(zone, sess, state, origin[0], origin[1], 8.0, 45.0, t)
    fixes.append({"t": t, "lat": origin[0], "lon": origin[1], "acc": 8.0, "heading": 45.0, "out": jsonable(first)})
    line = first["route_line"]
    pts = walk_points(line)
    pts = mutate(pts)
    for p in pts:
        t += 1.0
        q = (p[0] + (rng.random() - .5) * 1.5 / 111_000, p[1] + (rng.random() - .5) * 1.5 / 76_000)
        acc = 8.0
        heading = (rng.random() * 360) if rng.random() < 0.3 else None
        r = N.step(zone, sess, state, q[0], q[1], acc, heading, t)
        fixes.append({"t": t, "lat": q[0], "lon": q[1], "acc": acc, "heading": heading, "out": jsonable(r)})
        if r["status"] == "arrived":
            break
    cases.append({"kind": "navigate", "input": {"label": label, "origin": list(origin), "destination": dest,
                                                "route_id": rid, "constraints": AVOID}, "output": fixes})


def straight(p):
    return p


def detour(p):  # walk 60 m off the route for a while, then come back
    k = len(p) // 3
    side = [offset(q, 0, min(60, 3 * i)) for i, q in enumerate(p[k:k + 40])]
    return p[:k] + side + p[k + 40:]


def wrong_way(p):  # walk back the way you came for 20 fixes, then on
    k = len(p) // 2
    return p[:k] + list(reversed(p[k - 20:k])) + p[k - 20:]


def lost(p):  # leave the route for good: re-route
    k = len(p) // 4
    return p[:k] + [offset(p[k], 3 * i, 3 * i) for i in range(1, 60)]


TG = (*Z.TALENT_GARDEN, "Talent Garden")
DEST_I = {"lat": Z.DEMO_DESTINATION[0], "lon": Z.DEMO_DESTINATION[1], "name": "viale Isonzo"}
simulate("isonzo-A", TG, DEST_I, "A", straight)
simulate("isonzo-B", TG, DEST_I, "B", straight)
simulate("isonzo-detour", TG, DEST_I, "A", detour)
simulate("isonzo-wrong", TG, DEST_I, "A", wrong_way)
simulate("north-lost", TG, {"lat": 45.4470, "lon": 9.2000, "name": "somewhere north"}, None, lost)
simulate("south", (45.4465, 9.2110, "corso Lodi"), {"lat": 45.4420, "lon": 9.2100, "name": "the south side"}, "B", straight)

# ---------- places offline ----------
import places_api  # noqa: E402

PQ = ["via Brembo", "Esselunga", "calabiana", "Giardino Franca Helg", "corso Lodi", "nowhere street", "the pharmacy"]
for q in PQ:
    cases.append({"kind": "places_offline", "input": {"query": q, "ref": list(Z.TALENT_GARDEN)},
                  "output": jsonable(places_api.offline(zone, q, Z.TALENT_GARDEN))})

doc = {"generated_from": "server-py (legacy Python engine), osmnx " + ox.__version__,
       "zone": {"center": list(zone.center), "dist": zone.dist, "answer_radius": zone.answer_radius, "name": zone.name},
       "frozen_now": FROZEN.isoformat(), "graph": graph, "features": feats, "railway_places": rail, "labels": labels,
       "cases": cases}
with gzip.open(out_path, "wt") as f:
    json.dump(doc, f, default=plain)
cache = pathlib.Path(os.environ["TOOLS"]) / "py/osmnx-cache"
for fn in cache.glob("*.json"):
    d = json.loads(fn.read_text())
    kinds = {e["type"] for e in d["elements"]}
    name = "features.json.gz" if "relation" in kinds or len(d["elements"]) < 10000 else "network.json.gz"
    with gzip.open(out_path.parent / name, "wt") as f:
        json.dump(d, f)
print(len(cases), "cases written to", out_path)
