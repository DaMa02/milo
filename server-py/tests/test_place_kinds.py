"""Place kinds: opening hours, place_info, stop candidates for every kind (small zone, and timed on the city zone),
and POST /session answering 503 while a new zone is still being built. Offline.

    python tests/test_place_kinds.py      (from server-py; about 40 s more to load the city graph from the osmnx cache)
"""
import json
import os
import pathlib
import sys
import threading
import time
from datetime import datetime

os.environ["LOTL_OFFLINE"] = "1"
HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = pathlib.Path(os.environ.get("LOTL_CONTRACTS", HERE.parent.parent / "contracts")).resolve()
sys.path[:0] = [str(HERE.parent), str(CONTRACTS)]

from fastapi import HTTPException  # noqa: E402
from jsonschema import Draft7Validator  # noqa: E402
from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk  # noqa: E402

import app  # noqa: E402
from lotl import plan  # noqa: E402
from lotl.session import Session  # noqa: E402
from lotl.tools import ROME, ask, hours_now  # noqa: E402
from lotl.zone import DEMO_DESTINATION, TALENT_GARDEN, Zone  # noqa: E402

failed = []


def check(cond, what):
    if not cond:
        failed.append(what)
        print("FAIL", what)


def valid(doc, schema, what):
    doc = json.loads(json.dumps(doc))
    probs = [f"{'/'.join(map(str, e.absolute_path))}: {e.message}"
             for e in Draft7Validator(SCHEMAS[schema], registry=REGISTRY).iter_errors(doc)]
    backed = backed_numbers(doc)
    probs += [f"number {t!r} in {k} has no fact" for k, v in walk(doc) if k in SPOKEN and isinstance(v, str)
              for t in NUM.findall(v) if norm(t) not in backed]
    check(not probs, f"{what}: {probs}")
    return doc


def hours():
    wed = datetime(2026, 9, 23, 10, 30, tzinfo=ROME)  # a Wednesday, 10:30
    sat_eve = datetime(2026, 9, 26, 18, 0, tzinfo=ROME)  # a Saturday, 18:00
    table = [
        ("Mo-Fr 08:00-20:00; Sa 09:00-13:00", wed, (True, "open until 20:00")),
        ("Mo-Fr 08:00-20:00; Sa 09:00-13:00", sat_eve, (False, "closed now, it opens on Monday at 08:00")),
        ("24/7", wed, (True, "open 24 hours a day")),
        ("Mo-Su 07:00-22:00", wed, (True, "open until 22:00")),
        ("Mo-Su 07:00-22:00", sat_eve, (True, "open until 22:00")),
        ("Mo-Sa 08:30-12:30,15:00-19:30", wed, (True, "open until 12:30")),
        ("Mo-Sa 11:00-12:30,15:00-19:30", wed, (False, "closed now, it opens today at 11:00")),
        ("Mo,We,Fr 09:00-18:00", datetime(2026, 9, 22, 10, 0, tzinfo=ROME), (False, "closed now, it opens tomorrow at 09:00")),
        ("Mo-Su 18:00-02:00", datetime(2026, 9, 24, 1, 0, tzinfo=ROME), (True, "open until 02:00")),
        ("Mo-Fr 08:00-20:00; We off", wed, (False, "closed now, it opens tomorrow at 08:00")),
        ("Mo-Fr 08:00-20:00; PH off", wed, (True, "open until 20:00")),
        ("Mo-Sa 08:00-20:00, Su 10:00-20:00", sat_eve, (True, "open until 20:00")),
        ("Mo-Sa 10:00-19:30, Su 10:00-13:00, Su 14:30-19:30", datetime(2026, 9, 27, 14, 0, tzinfo=ROME),
         (False, "closed now, it opens today at 14:30")),
        ("Mo-Sa 08:00-21:00; Su,PH 09:00-20:00", sat_eve, (True, "open until 21:00")),
        ("Mo-Fr 25:00-99:99", wed, (None, None)),
        (" ; ", wed, (None, None)),
        ("Tu-Th 9-17", wed, (None, None)),
        ("sunrise-sunset", wed, (None, None)),
        ("", wed, (None, None)),
    ]
    for raw, now, want in table:
        got = hours_now(raw, now)
        check(got == want, f"hours {raw!r} at {now:%a %H:%M}: {got} != {want}")


def small():
    z = Zone()
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    for place, noun in (("the pharmacy", "a pharmacy"), ("café", "a café"), ("cash machine", "a cash machine")):
        a = valid(ask(z, s, "place_info", {"place": {"name": place}}, f"Tell me about {place}"), "answer", place)
        print(a["text"])
        check(noun in a["text"], f"place_info {place}: {a['text']}")
    s.destination = {"lat": DEMO_DESTINATION[0], "lon": DEMO_DESTINATION[1], "name": "the destination"}
    plan.select(z, s, plan.create(z, s)["routes"][0]["id"])
    for kind in ("pharmacy", "cafe", "supermarket"):
        c = valid(plan.candidates(z, s, kind=kind), "plan", kind)
        print(c["text"])
        check(c["stop_candidates"], f"{kind} candidates near Talent Garden")


def city():
    z = Zone(**app.CITY)
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    s.destination = {"lat": 45.4505, "lon": 9.1893, "name": "Bocconi University"}
    plan.select(z, s, plan.create(z, s, depart_at="2026-09-26T16:00:00Z")["routes"][0]["id"])
    plan.candidates(z, s, kind="cafe")  # warm-up
    for kind in ("supermarket", "pharmacy", "cafe"):
        dts = []
        for _ in range(2):  # best of two: other processes on the machine slow a single run
            t = time.time()
            c = valid(plan.candidates(z, s, kind=kind), "plan", f"city {kind}")
            dts.append(time.time() - t)
        dt = min(dts)
        print(f"city {kind} candidates: {dt:.2f} s: {c['text']}")
        check(dt < 2, f"city {kind} candidates took {dt:.2f} s")


def slow_build():
    calls = []

    def fake(**kw):
        calls.append(kw)
        time.sleep(0.6)
        return "zone"

    class Far:  # a city zone the origin is outside of
        dist = app.CITY["dist"]

        def in_answer_area(self, lat, lon):
            return False

    app.ZONE, app.BUILD_ZONE, app.BUILD_WAIT_S = Far(), fake, 0.1
    errs = []

    def first():
        try:
            app.zone_for(45.5, 9.3, "Sesto")
        except HTTPException as e:
            errs.append(e)
    ts = [threading.Thread(target=first) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    check(len(errs) == 2 and all(e.status_code == 503 and "still loading the map around Sesto" in e.detail for e in errs),
          f"503 while building: {[(e.status_code, e.detail) for e in errs]}")
    time.sleep(0.8)
    check(app.zone_for(45.5, 9.3, "Sesto") == ("zone", "download"), "ready on the next request")
    check(app.zone_for(45.5, 9.3, "Sesto") == ("zone", "cache"), "then from the cache")
    check(len(calls) == 1, f"built once: {len(calls)}")


if __name__ == "__main__":
    hours()
    slow_build()
    small()
    city()
    print("all place-kind checks passed" if not failed else f"{len(failed)} failed")
    sys.exit(1 if failed else 0)
