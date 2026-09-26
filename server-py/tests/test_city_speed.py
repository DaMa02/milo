"""After startup on the real city zone, each of the five /ask tools answers in under 1.5 s on its first call
(Talent Garden to Bocconi, destination set on the session). About 60 s: the city zone loads and warms first.

    python tests/test_city_speed.py      (from server-py)
"""
import os
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
os.environ.pop("LOTL_ZONE", None)
os.environ["LOTL_OFFLINE"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402

TALENT = {"lat": 45.44386, "lon": 9.20808, "name": "Talent Garden"}
BOCCONI = {"lat": 45.4499044, "lon": 9.1892641, "name": "Bocconi University"}
LIMIT_MS = 1500
ASKS = [("walking_vs_straight_line", {"to": "destination"}),
        ("barrier_between", {"to": "destination"}),
        ("street_continuity", {"street": "viale Isonzo"}),
        ("independent_connections", {"to": "destination"}),
        ("extent", {"place": "the construction site"})]


def main():
    t = time.perf_counter()
    with TestClient(app) as c:
        print(f"startup: {time.perf_counter() - t:.1f} s")
        sid = c.post("/session", json={"origin": TALENT, "destination": BOCCONI}).json()["session_id"]
        slow = []
        for tool, params in ASKS:
            t = time.perf_counter()
            r = c.post(f"/session/{sid}/ask", json={"question": "q", "tool": tool, "params": params})
            ms = (time.perf_counter() - t) * 1000
            print(f"{'ok  ' if ms < LIMIT_MS and r.status_code == 200 else 'SLOW'} {tool}: {ms:.0f} ms: {r.json().get('text', r.text)[:110]}")
            if ms >= LIMIT_MS or r.status_code != 200:
                slow.append(tool)
    print("all five under 1.5 s" if not slow else f"FAIL: {', '.join(slow)}")
    return 1 if slow else 0


if __name__ == "__main__":
    sys.exit(main())
