"""Level 2 plan story over HTTP with FastAPI's TestClient: its own app with the plan router, one real Zone, one
Session at Talent Garden. Every Plan body is validated against contracts/ (schema + number-fact rule) and the story
steps are compared with the plan fixtures. Offline from caches only: any network connection attempt fails the test.

    python tests/test_plan.py      (from server-py; LOTL_CONTRACTS=<dir> validates against another contracts folder)
"""
import json
import os
import pathlib
import re
import socket
import sys

os.environ["LOTL_OFFLINE"] = "1"  # transit answers only from the cache: 16:00Z is cached, 17:00Z is not
HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = pathlib.Path(os.environ.get("LOTL_CONTRACTS", HERE.parent.parent / "contracts")).resolve()
sys.path[:0] = [str(HERE.parent), str(CONTRACTS)]
NET = []


def _no_network(_sock, address, *_a):
    NET.append(address)
    raise OSError("network disabled in test_plan")


socket.socket.connect = _no_network

import networkx as nx  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from jsonschema import Draft7Validator  # noqa: E402
from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk  # noqa: E402

from lotl.session import Session  # noqa: E402
from lotl.zone import TALENT_GARDEN, Zone, mins  # noqa: E402
from plan_api import make_router  # noqa: E402

AVOID = [{"kind": "unsignalled_crossings", "strength": "avoid_when_possible"}]
REQUIRE = [{"kind": "unsignalled_crossings", "strength": "require"}]
CREATE = {"destination": {"lat": 45.44658, "lon": 9.20584, "name": "viale Isonzo"},
          "depart_at": "2026-09-26T18:00:00+02:00", "constraints": AVOID}  # 16:00Z, given with an offset
LATER = "2026-09-26T17:00:00Z"  # not in the transit cache
LIDL = "node/10571089360"
CLOCK = re.compile(r"\b\d{1,2}:\d{2}\b")
passed, failed = 0, []


def check(cond, what):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(what)
        print("FAIL", what)


def valid(doc, what):
    probs = [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
             for e in Draft7Validator(SCHEMAS["plan"], registry=REGISTRY).iter_errors(doc)]
    backed = backed_numbers(doc)
    for key, val in walk(doc):
        if key in SPOKEN and isinstance(val, str):
            probs += [f"number {t!r} in {key!r} has no fact: {val[:70]}" for t in NUM.findall(val) if norm(t) not in backed]
    probs += [f"clock time in {key!r}: {val[:70]}" for key, val in walk(doc) if key in SPOKEN and isinstance(val, str)
              and CLOCK.search(val)]
    check(not probs, f"{what} is a valid plan: {probs[:3]}")
    if probs:
        return
    ids = [r["id"] for r in doc["routes"]]
    check(doc["selected_route_id"] in ids + [None], f"{what}: selection {doc['selected_route_id']} among {ids}")
    for r in doc["routes"]:
        check([c["kind"] for c in r["constraint_status"]] == [c["kind"] for c in doc["constraints"]],
              f"{what}: route {r['id']} reports every constraint")
        stops = [leg for leg in r["legs"] if leg["mode"] == "stop"]
        want = [doc["stop"]["duration_min"]] if doc["stop"] else []
        check([leg["duration_min"] for leg in stops] == want, f"{what}: route {r['id']} stop legs {stops} for stop {doc['stop']}")


def call(c, method, url, status=200, **kw):
    r = c.request(method, url, **kw)
    check(r.status_code == status, f"{method} {url} {kw.get('json')} -> {r.status_code}, expected {status}: {r.text[:200]}")
    body = r.json()
    if r.status_code == 200:
        valid(body, f"{method} {url}")
    elif status in (404, 409):
        check(isinstance(body.get("detail"), str) and body["detail"], f"{method} {url}: {status} says why: {body}")
    return body


def strip(doc):
    return {k: v for k, v in doc.items() if k != "meta"}


def refused(c, sid, status, method, url, **kw):
    """A 4xx applies nothing: the plan (or its absence) is the same before and after."""
    before = c.get(f"/session/{sid}/plan").json()
    call(c, method, url, status, **kw)
    check(strip(c.get(f"/session/{sid}/plan").json()) == strip(before), f"plan unchanged after {status} on {method} {url} {kw}")


ROUTE = ("mode", "duration_min", "walk_min", "transfers", "leave_at", "arrive_at", "trade_off", "constraint_status")


def routes(doc):
    out = {"route ids": [r["id"] for r in doc["routes"]]}
    for r in doc["routes"]:
        out |= {f"{r['id']}.{k}": r[k] for k in ROUTE}
        out[f"{r['id']}.crossings"] = [x["osm_id"] for x in r["crossings"]]
        out[f"{r['id']}.legs"] = [(leg["mode"], leg["line"], leg["duration_min"]) for leg in r["legs"]]
    return out


def substance(doc):
    """What must match the fixture: numbers, ids, times; not the wording or computed_at."""
    return {k: doc[k] for k in ("origin", "destination", "depart_at", "constraints", "detour_tolerance",
                                "compliant_route_available", "stop")} | routes(doc) | {
        "stop_candidates": [(k["place"], k["osm_id"], k["detour_min"]) for k in doc["stop_candidates"]]}


def like(doc, fx, what, skip=()):
    got, want = substance(doc), substance(fx)
    diff = {k: (got.get(k), want.get(k)) for k in {**got, **want} if got.get(k) != want.get(k) and not k.startswith(skip)}
    check(not diff, f"{what} has the substance of its fixture (got, fixture): {diff}")


def changed(prev, new, what):
    check(new["plan_version"] == prev["plan_version"] + 1, f"{what}: version {prev['plan_version']} -> {new['plan_version']}")
    check(bool(new["differences"]), f"{what}: differences say what changed")


def fewest(zone, a, b):
    """Independent check of the way offered first on foot: fewest crossings known to have no signal, then fewest
    unknown, then shortest, crossings at both ends included. (violations, unknowns, minutes)."""
    K = {n: 1e7 * (x["signals"] == "no") + 1e4 * (x["signals"] == "unknown") for n, x in zone.CROSSINGS.items()}
    H = nx.DiGraph()
    for u, v, d in zone.G.edges(data=True):
        for x, y in ((u, v), (v, u)):
            if not H.has_edge(x, y) or H[x][y]["length"] > d["length"]:
                H.add_edge(x, y, length=d["length"], w=d["length"] + K.get(y, 0))
    for n, m in ((a["u"], a["su"]), (a["v"], a["sv"])):
        H.add_edge("S", n, length=m, w=m + K.get(n, 0))
    for n, m in ((b["u"], b["su"]), (b["v"], b["sv"])):
        H.add_edge(n, "T", length=m, w=m)
    path = nx.shortest_path(H, "S", "T", weight="w")
    xs = [zone.CROSSINGS[n] for n in path[1:-1] if n in zone.CROSSINGS]
    m = nx.path_weight(H, path, "length") + a["off"] + b["off"]
    return sum(x["signals"] == "no" for x in xs), sum(x["signals"] == "unknown" for x in xs), mins(m)


def main():
    fx = {n: json.loads((CONTRACTS / f"fixtures/plan.{n}.json").read_text()) for n in
          ("initial-comparison", "stop-candidates", "two-foot-routes-and-transit", "stop-5-min", "no-compliant-route")}
    zone, sessions = Zone(), {}

    def get(sid):
        if sid not in sessions:
            raise HTTPException(404, "No such session: start a new one.")
        return sessions[sid]

    app = FastAPI()
    app.include_router(make_router(lambda: zone, get))
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    sessions[s.id] = s
    sid, P = s.id, f"/session/{s.id}/plan"

    with TestClient(app) as c:
        # unknown session, no plan yet, bad create bodies: nothing created
        call(c, "GET", "/session/nope/plan", 404)
        call(c, "POST", "/session/nope/plan", 404, json=CREATE)
        for url, body in (("/select", {"route_id": "A"}), ("/stop/candidates", {}), ("/stop", {"osm_id": None}),
                          ("/constraints", {"constraints": AVOID}), ("/depart", {"depart_at": LATER})):
            call(c, "POST", f"/session/nope/plan{url}", 404, json=body)
        call(c, "GET", P, 404)
        for bad in ({}, {"destination": {}}, {"destination": {"lat": 45.446}}, {**CREATE, "depart_at": "2026-09-26T16:00:00"},
                    {**CREATE, "depart_at": "tomorrow"}, {**CREATE, "constraints": [{"kind": "stairs", "strength": "require"}]},
                    {**CREATE, "constraints": [{"kind": "steps", "strength": "maybe"}]},
                    {**CREATE, "constraints": [{"kind": "walking_over_min", "strength": "require"}]},
                    {**CREATE, "detour_tolerance": {"min": -1, "pct": 25}},
                    {**CREATE, "destination": {"lat": 45.4642, "lon": 9.1900, "name": "Duomo"}},  # outside the mapped area
                    {**CREATE, "destination": {"name": "Piazza San Marco"}},  # not on the map
                    {**CREATE, "destination": {"name": "Talent Garden"}}):  # where the user already is
            refused(c, sid, 422, "POST", P, json=bad)

        # v1: the comparison, 16:00Z from the cache
        v1 = call(c, "POST", P, json=CREATE)
        check(v1["plan_version"] == 1 and v1["selected_route_id"] is None and v1["stop"] is None and v1["differences"] == [],
              f"v1 fresh: {v1['plan_version']} {v1['selected_route_id']} {v1['stop']} {v1['differences']}")
        check(v1["meta"]["mode"] == "offline" and v1["meta"]["cache"] == "hit", f"v1 meta {v1['meta']}")
        like(v1, fx["initial-comparison"], "v1", skip="C.")  # C: the engine takes the bus that arrives first, the fixture
        check(strip(call(c, "GET", P)) == strip(v1), "GET returns v1")
        refused(c, sid, 422, "POST", P + "/stop", json={"osm_id": "node/10571089360", "duration_min": 15})  # nothing selected

        # v2: route A chosen; stale and unknown selections refused
        v2 = call(c, "POST", P + "/select", json={"route_id": "A", "if_version": 1})
        changed(v1, v2, "select A")
        check(v2["selected_route_id"] == "A", f"A selected: {v2['selected_route_id']}")
        check(routes(v2) == routes(v1), "selecting does not change the routes")
        refused(c, sid, 409, "POST", P + "/select", json={"route_id": "B", "if_version": 1})
        refused(c, sid, 422, "POST", P + "/select", json={"route_id": "Z"})
        refused(c, sid, 422, "POST", P + "/select", json={})
        refused(c, sid, 422, "POST", P + "/select", json={"route": "B"})  # misspelt field

        # supermarkets along A: the plan itself is unchanged (same version)
        refused(c, sid, 409, "POST", P + "/stop/candidates", json={"kind": "supermarket", "if_version": 1})
        refused(c, sid, 422, "POST", P + "/stop/candidates", json={"kind": "pharmacy"})
        k = call(c, "POST", P + "/stop/candidates", json={"kind": "supermarket", "if_version": 2})
        check(k["plan_version"] == 2, f"candidates keep version 2: {k['plan_version']}")
        check(call(c, "GET", P)["plan_version"] == 2, "GET after candidates still version 2")
        like(k, fx["stop-candidates"], "candidates", skip="C.")  # picked the Lodi M3 one (make_fixtures v1)
        d = [x["detour_min"] for x in k["stop_candidates"]]
        check(d and d == sorted(d), f"candidates best first: {d}")
        best = k["stop_candidates"][0]["osm_id"] if k["stop_candidates"] else "node/10571089360"

        # v3: stop 15 minutes at the best one
        for bad in ({"osm_id": best, "duration_min": 0}, {"osm_id": best, "duration_min": 181}, {"duration_min": 15},
                    {"osm_id": best[5:], "duration_min": 15}, {"osm_id": "node/1", "duration_min": 15},  # not on the map
                    {"osm_id": best, "duration_min": 15, "if_version": 1}):
            refused(c, sid, 409 if "if_version" in bad else 422, "POST", P + "/stop", json=bad)
        v3 = call(c, "POST", P + "/stop", json={"osm_id": best, "duration_min": 15, "if_version": 2})
        changed(v2, v3, "stop 15 min")
        like(v3, fx["two-foot-routes-and-transit"], "v3")

        # v4: same stop, 5 minutes
        v4 = call(c, "POST", P + "/stop", json={"osm_id": best, "duration_min": 5})
        changed(v3, v4, "stop 5 min")
        like(v4, fx["stop-5-min"], "v4")

        # v5: stop removed, the routes of v2 come back
        v5 = call(c, "POST", P + "/stop", json={"osm_id": None, "if_version": 4})
        changed(v4, v5, "stop removed")
        check(v5["stop"] is None and routes(v5) == routes(v2), "without the stop the routes are v2's")

        # v6: signals required: nothing verified compliant, every route known to violate is dropped
        for bad in ({"constraints": [{"kind": "noise", "strength": "require"}]}, {"constraints": "require"}, {}):
            refused(c, sid, 422, "POST", P + "/constraints", json=bad)
        v6 = call(c, "POST", P + "/constraints", json={"constraints": REQUIRE, "if_version": 5})
        changed(v5, v6, "require")
        like(v6, fx["no-compliant-route"], "v6")

        # v7: a departure time with no cached transit answer: no bus route, said as a miss
        for bad in ({"depart_at": "2026-09-26T17:00:00"}, {"depart_at": "5 pm"}, {}):
            refused(c, sid, 422, "POST", P + "/depart", json=bad)
        refused(c, sid, 409, "POST", P + "/depart", json={"depart_at": LATER, "if_version": 5})
        v7 = call(c, "POST", P + "/depart", json={"depart_at": LATER, "if_version": 6})
        changed(v6, v7, "depart 17:00Z")
        check(v7["compliant_route_available"] == "unknown" and "the bus could not be checked" in v7["text"],
              f"v7 without the bus compliance is unknown: {v7['compliant_route_available']} {v7['text']}")
        check(v7["depart_at"] == LATER and "C" not in [r["id"] for r in v7["routes"]], f"v7 at {v7['depart_at']} without C")
        check(v7["meta"]["mode"] == "offline" and v7["meta"]["cache"] == "miss", f"v7 meta {v7['meta']}")

        # v8: relaxed again at 17:00Z: the foot routes of v1, leaving at the new time, still no bus
        v8 = call(c, "POST", P + "/constraints", json={"constraints": AVOID})
        changed(v7, v8, "avoid again")
        feet = {r["id"]: (r["duration_min"], r["trade_off"]) for r in v1["routes"] if r["mode"] == "foot"}
        check({r["id"]: (r["duration_min"], r["trade_off"]) for r in v8["routes"]} == feet, f"v8 foot routes {feet}")
        check(all(r["leave_at"] == LATER for r in v8["routes"]), "v8 routes leave at the new time")
        check(v8["meta"]["cache"] == "miss", f"v8 meta {v8['meta']}")
        check(strip(call(c, "GET", P)) == strip(v8), "GET returns v8")
        check(v8["compliant_route_available"] == "unknown", f"v8 without the bus: {v8['compliant_route_available']}")

        def fresh(origin=None):
            s2 = Session(origin=origin or (*TALENT_GARDEN, "Talent Garden"))
            sessions[s2.id] = s2
            return f"/session/{s2.id}/plan"

        # a stop kept while nothing is offered: the way offered instead goes through it, and it can still be re-timed
        Q = fresh()
        call(c, "POST", Q, json=CREATE)
        call(c, "POST", Q + "/select", json={"route_id": "A"})
        w3 = call(c, "POST", Q + "/stop", json={"osm_id": LIDL, "duration_min": 15})
        w4 = call(c, "POST", Q + "/constraints", json={"constraints": REQUIRE})
        check("With a stop at the supermarket Lidl for 15 minutes: The route with the fewest is route A, 30 minutes with the "
              "shopping" in w4["text"] and w4["stop"] == w3["stop"], f"require keeps the stop: {w4['text']} {w4['stop']}")
        w5 = call(c, "POST", Q + "/stop", json={"osm_id": LIDL, "duration_min": 5})
        changed(w4, w5, "re-timed stop with nothing offered")
        check("Lidl for 5 minutes: The route with the fewest is route A, 20 minutes" in w5["text"], f"w5 {w5['text']}")

        # ids keep their role: dropping the constraint drops route A, the one chosen, and says so
        Q = fresh()
        u1 = call(c, "POST", Q, json=CREATE)
        u2 = call(c, "POST", Q + "/select", json={"route_id": "A"})
        u3 = call(c, "POST", Q + "/constraints", json={"constraints": []})
        check([r["id"] for r in u3["routes"]] == ["B", "C"] and u3["selected_route_id"] is None
              and "Route A, which you chose, is no longer offered." in u3["differences"]
              and u3["routes"][0]["crossings"] == u1["routes"][1]["crossings"], f"u3 {u3['differences']} {u3['selected_route_id']}")
        u4 = call(c, "POST", Q + "/constraints", json={"constraints": [], "detour_tolerance": {"min": 0, "pct": 0}})
        changed(u3, u4, "detour tolerance")
        call(c, "POST", Q + "/depart", json={"depart_at": "2026-09-27T01:00:00+02:00"})  # clock times: checked by valid()
        check(u2["selected_route_id"] == "A", "u2 selected A")

        # a required walking limit: the way offered instead is the real shortest walk, route B, and no "So"
        far = {"origin": {"lat": 45.4460, "lon": 9.2020, "name": "the start"},
               "destination": {"lat": 45.4400, "lon": 9.2120, "name": "the end"}, "depart_at": CREATE["depart_at"]}
        Q = fresh()
        f1 = call(c, "POST", Q, json={**far, "constraints": AVOID + [
            {"kind": "walking_over_min", "strength": "require", "value": 15}]})
        f2 = call(c, "POST", Q + "/constraints", json={"constraints": AVOID + [
            {"kind": "walking_over_min", "strength": "avoid_when_possible", "value": 15}]})
        b = next((r for r in f2["routes"] if r["id"] == "B"), None)
        check(b and f"The shortest walk, route B, takes {b['duration_min']} minutes." in f1["text"] and "So no" not in f1["text"],
              f"fallback is the shortest walk: {f1['text']}")

        # route A has the fewest crossings without a signal, counting one at either end, then is the shortest
        for org, dst in (((45.443851, 9.201337), (45.439259, 9.203267)), (TALENT_GARDEN, (45.441429, 9.205678))):
            doc = call(c, "POST", fresh(), json={"origin": {"lat": org[0], "lon": org[1], "name": "the start"},
                                                 "destination": {"lat": dst[0], "lon": dst[1], "name": "the end"},
                                                 "depart_at": CREATE["depart_at"], "constraints": AVOID})
            r = doc["routes"][0]
            v, u, m = fewest(zone, zone.snap(*org), zone.snap(*dst))
            check((r["trade_off"]["violating_crossings"], r["trade_off"]["unknown_crossings"]) == (v, u)
                  and abs(r["duration_min"] - m) <= 1, f"route {r['id']} from {org}: {r['trade_off']} {r['duration_min']} min, "
                                                       f"fewest is {(v, u, m)}")

        # the way offered instead says main-road metres: they are facts too (checked by valid())
        call(c, "POST", fresh(), json={"destination": {"lat": 45.44745, "lon": 9.209488, "name": "the end"},
                                       "depart_at": CREATE["depart_at"],
                                       "constraints": REQUIRE + [{"kind": "main_roads", "strength": "avoid_when_possible"}]})

    check(not NET, f"no network connection attempted: {NET}")
    print(f"{passed} checks passed" + (f", {len(failed)} failed" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
