"""Sessions anywhere in central Milan, over HTTP with the real city zone (about 40 s to load from the osmnx cache).

    python tests/test_city.py      (from server-py)
"""
import os
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = HERE.parent.parent / "contracts"
sys.path[:0] = [str(HERE.parent), str(CONTRACTS)]
os.environ.pop("LOTL_ZONE", None)

from fastapi.testclient import TestClient  # noqa: E402
from jsonschema import Draft7Validator  # noqa: E402
from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk  # noqa: E402

from app import app  # noqa: E402

BOCCONI = {"lat": 45.4505, "lon": 9.1893, "name": "Bocconi University"}
TALENT = {"lat": 45.44386, "lon": 9.20808, "name": "Talent Garden"}
DUOMO = {"lat": 45.4642, "lon": 9.1900, "name": "the Duomo"}
CENTRALE = {"lat": 45.4855, "lon": 9.2036, "name": "Stazione Centrale"}
passed, failed = 0, []


def check(cond, what):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(what)
        print("FAIL", what)


def valid(doc, schema, what):
    probs = [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
             for e in Draft7Validator(SCHEMAS[schema], registry=REGISTRY).iter_errors(doc)]
    backed = backed_numbers(doc)
    for key, val in walk(doc):
        if key in SPOKEN and isinstance(val, str):
            probs += [f"number {t!r} in {key!r} has no fact: {val[:70]}" for t in NUM.findall(val) if norm(t) not in backed]
    check(not probs, f"{what} is a valid {schema}: {probs[:3]}")


def timed(c, method, url, **kw):
    t = time.perf_counter()
    r = c.request(method, url, **kw)
    ms = (time.perf_counter() - t) * 1000
    check(r.status_code == 200, f"{method} {url} -> {r.status_code}: {r.text[:200]}")
    return r.json(), ms


def main():
    with TestClient(app) as c:
        s, ms = timed(c, "POST", "/session", json={"origin": BOCCONI, "lang": "en"})
        print(f"POST /session (Bocconi): {ms:.0f} ms")
        check(ms < 2000, f"POST /session under 2 s: {ms:.0f} ms")
        check(s["zone"] == {"name": "central Milan", "source": "city"}, f"city zone: {s['zone']}")
        ov = s["overview"]
        valid(ov, "overview", "Bocconi overview")
        spoken = " ".join([ov["text"], *ov["details"], *ov["unknown"]])
        check("Bocconi" in ov["text"] and "Talent Garden" not in spoken, f"overview from Bocconi: {spoken[:300]}")
        ov2, ms = timed(c, "GET", f"/session/{s['session_id']}/overview")
        print(f"GET overview (Bocconi): {ms:.0f} ms")
        check(ms < 1000, f"overview under 1 s: {ms:.0f} ms")
        st, _ = timed(c, "POST", f"/session/{s['session_id']}/explore", json={"command": "start"})
        check(st["branches"], "exploration starts at Bocconi")

        def straight(a):
            return next((f["value"] for f in a["facts"] if f["type"] == "straight_line_distance"), None)

        s, _ = timed(c, "POST", "/session", json={"origin": TALENT, "destination": BOCCONI})
        sid = s["session_id"]
        for tool in ("barrier_between", "walking_vs_straight_line"):
            a, ms = timed(c, "POST", f"/session/{sid}/ask", json={"question": "q", "tool": tool, "params": {"to": "destination"}})
            valid(a, "answer", tool)
            check(a["text"].startswith(("Yes", "No", "1,6")), f"{tool} to the destination: {a['text'][:200]}")
        check(1550 < (straight(a) or 0) < 1750, f"destination Bocconi is used: {a['text'][:120]}")
        a, _ = timed(c, "POST", f"/session/{sid}/ask", json={"question": "q", "tool": "extent", "params": {"place": "the construction site"}})
        check("Villaggio Olimpico" in a["text"], f"the construction site nearest Talent Garden, not the Duomo: {a['text'][:120]}")
        d, _ = timed(c, "POST", f"/session/{sid}/destination", json=DUOMO)
        check(d["destination"] == DUOMO and 2000 < d["straight_line_m"] < 3000, f"destination set: {d}")
        a, _ = timed(c, "POST", f"/session/{sid}/ask", json={"question": "q", "tool": "walking_vs_straight_line",
                                                             "params": {"to": {"name": "there"}}})
        check(abs((straight(a) or 0) - d["straight_line_m"]) <= 20, f"'there' is the new destination: {a['text'][:120]}")

        s, _ = timed(c, "POST", "/session", json={"origin": DUOMO})
        a, ms = timed(c, "POST", f"/session/{s['session_id']}/ask",
                      json={"question": "How far is the central station?", "tool": "walking_vs_straight_line",
                            "params": {"to": CENTRALE}})
        print(f"ask Duomo -> Stazione Centrale: {ms:.0f} ms")
        valid(a, "answer", "Duomo -> Centrale")
        check(any(f["type"] == "walking_distance" and f["value"] > 2000 for f in a["facts"]), f"Duomo -> Centrale: {a['text'][:200]}")

    print(f"{passed} checks passed" + (f", {len(failed)} failed" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
