"""Level 2 plan on the city graph: Talent Garden -> Bocconi. Route A keeps to main streets (more main-road metres
than the shortest way B), an explicit "avoid main_roads" switches that off, and plan create / edits are timed.
Every Plan is validated against contracts/ (schema + number-fact rule). Offline: transit only from the cache.

    python tests/test_plan_city.py      (from server-py; about 40 s to load the city graph from the osmnx cache)
"""
import json
import os
import pathlib
import sys
import time

os.environ["LOTL_OFFLINE"] = "1"
HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = pathlib.Path(os.environ.get("LOTL_CONTRACTS", HERE.parent.parent / "contracts")).resolve()
sys.path[:0] = [str(HERE.parent), str(CONTRACTS)]

from jsonschema import Draft7Validator  # noqa: E402
from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk  # noqa: E402

from lotl import plan  # noqa: E402
from lotl.session import Session  # noqa: E402
from lotl.zone import TALENT_GARDEN, Zone  # noqa: E402

BOCCONI = {"lat": 45.4505, "lon": 9.1893, "name": "Bocconi University"}
DEPART = "2026-09-26T16:00:00Z"
failed = []


def check(cond, what):
    if not cond:
        failed.append(what)
        print("FAIL", what)


def valid(doc, what):
    doc = json.loads(json.dumps(doc))
    probs = [f"{'/'.join(map(str, e.absolute_path))}: {e.message}"
             for e in Draft7Validator(SCHEMAS["plan"], registry=REGISTRY).iter_errors(doc)]
    backed = backed_numbers(doc)
    probs += [f"number {t!r} in {k} has no fact" for k, v in walk(doc) if k in SPOKEN and isinstance(v, str)
              for t in NUM.findall(v) if norm(t) not in backed]
    check(not probs, f"{what}: {probs}")
    return doc


def main_m(doc, rid):
    r = next(r for r in doc["routes"] if r["id"] == rid)
    return next(f["value"] for f in r["facts"] if f["type"] == "route_main_road_distance")


def timed(what, limit, fn, *a, **kw):
    t = time.time()
    doc = fn(*a, **kw)
    dt = time.time() - t
    print(f"{what}: {dt:.2f} s (target < {limit} s)")
    check(dt < limit, f"{what} took {dt:.2f} s")
    return valid(doc, what)


def main():
    t = time.time()
    z = Zone(center=(45.4642, 9.19), dist=4000, answer_radius=4000, name="central Milan")
    print(f"city zone loaded in {time.time() - t:.1f} s")
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    s.destination = BOCCONI  # create() without a destination takes the session's
    plan.create(z, s, depart_at=DEPART)  # warm-up: main-road and construction indexes of the city graph
    v1 = timed("create", 3, plan.create, z, s, depart_at=DEPART)
    print(v1["text"])
    ids = [r["id"] for r in v1["routes"]]
    check(v1["destination"] == BOCCONI and ids[:2] == ["A", "B"], f"A and B offered: {ids}")
    if ids[:2] == ["A", "B"]:
        check(main_m(v1, "A") > main_m(v1, "B"), f"A along more main road than B: {main_m(v1, 'A')} {main_m(v1, 'B')}")
        check("along main streets" in v1["routes"][0]["summary"], v1["routes"][0]["summary"])
    v2 = timed("avoid main roads", 2, plan.set_constraints, z, s, [{"kind": "main_roads", "strength": "avoid_when_possible"}])
    print(v2["text"])
    first = v2["routes"][0]["id"]  # A, or only B when the shortest way already avoids main roads
    check("along main streets" not in v2["text"], f"avoid main roads wins: {v2['text']}")
    check(main_m(v2, first) <= main_m(v1, "B"), f"route {first} along no more main road than B: {main_m(v2, first)}")
    timed("select", 2, plan.select, z, s, first)
    c = timed("stop candidates", 10, plan.candidates, z, s)
    check(c["stop_candidates"], "supermarkets found near the route")
    timed("depart later", 2, plan.set_depart, z, s, "2026-09-26T16:30:00Z")
    print("all city plan checks passed" if not failed else f"{len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
