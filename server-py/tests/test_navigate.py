"""Live guidance for a blind walker on the city zone: Talent Garden -> Bocconi University, one fix a second at
1.3 m/s with GPS noise and compass heartbeats. Offline, no network. Writes the spoken transcript to
tests/guidance_transcript.txt.

    python tests/test_navigate.py      (from server-py)
"""
import math
import os
import pathlib
import random
import socket
import sys
import time

os.environ["LOTL_OFFLINE"] = "1"
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))


def _no_network(_sock, address, *_a):
    raise OSError("network disabled in test_navigate")


socket.socket.connect = _no_network

from lotl import navigate, plan  # noqa: E402
from lotl.session import Session  # noqa: E402
from lotl.zone import Zone  # noqa: E402

TALENT = (45.44386, 9.20808)
DUOMO = (45.4642, 9.19)
CENTRALE = {"lat": 45.4855, "lon": 9.2036, "name": "Stazione Centrale"}
BOCCONI = {"lat": 45.4499044, "lon": 9.1892641, "name": "Bocconi University"}
failed, slow, log = [], [], []


def check(cond, what):
    if not cond:
        failed.append(what)
        print("FAIL", what)


def m_between(a, b):
    return math.hypot((b[0] - a[0]) * 111_000, (b[1] - a[1]) * 111_000 * math.cos(math.radians(a[0])))


def walk_points(line, step_m=1.3):
    """Points every step_m metres along [[lat, lon], ...]."""
    out, carry = [tuple(line[0])], 0.0
    for a, b in zip(line, line[1:]):
        L = m_between(a, b)
        d = step_m - carry
        while d <= L:
            out.append((a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L))
            d += step_m
        carry = L - (d - step_m)
    return out + [tuple(line[-1])]


def offset(p, dn, de):
    return (p[0] + dn / 111_000, p[1] + de / (111_000 * math.cos(math.radians(p[0]))))


class Walk:
    def __init__(self, zone, session, label):
        self.zone, self.s, self.state, self.t, self.label = zone, session, {}, 0.0, label
        self.said = []  # (t, text)

    def fix(self, p, acc=8.0, heading=None, noise=1.5, beat=True):
        rnd = random.random
        q = (p[0] + (rnd() - .5) * noise / 111_000, p[1] + (rnd() - .5) * noise / 76_000)
        t0 = time.perf_counter()
        r = navigate.step(self.zone, self.s, self.state, *q, acc, heading, self.t)
        ms = (time.perf_counter() - t0) * 1000
        if ms > 100 and r["route_line"] is None:  # the first call and a re-route compute a path
            slow.append(round(ms))
        if r["text"]:
            self.said.append((self.t, r["text"]))
            log.append(f"[{self.label} {self.t:6.1f}s] {r['text']}")
        if beat:  # compass heartbeat: same position, new heading
            hb = navigate.step(self.zone, self.s, self.state, *q, acc, (heading or 0) + 7 * rnd(), self.t + 0.5)
            check(hb["text"] is None or r["text"] is None or hb["text"] != r["text"], "heartbeat repeats speech")
            if hb["text"]:
                self.said.append((self.t + 0.5, hb["text"]))
                log.append(f"[{self.label} {self.t + .5:6.1f}s] {hb['text']}")
        self.t += 1
        return r

    def texts(self, since=0):
        return [x for t, x in self.said if t >= since]


def main():
    random.seed(7)
    zone = Zone(center=(45.4642, 9.19), dist=4000, answer_radius=4000, name="central Milan")
    s = Session(origin=(*TALENT, "Talent Garden"))
    st = {}
    r = navigate.step(zone, s, st, *TALENT)
    check(r["status"] == "no_route" and r["text"] == navigate.NO_PLAN, f"no plan: {r}")
    check(navigate.step(zone, s, st, *TALENT)["text"] is None, "no-plan said once")
    doc = plan.create(zone, s, destination=BOCCONI, depart_at="2026-09-26T15:00:00+02:00")
    ids = [x["id"] for x in doc["routes"]]
    if "C" in ids:
        plan.select(zone, s, "C")
        r = navigate.step(zone, s, {}, *TALENT)
        check(r["status"] == "no_route" and r["text"].startswith("Live guidance works"), f"transit: {r}")
    plan.select(zone, s, "A")

    # 1. the full walk
    w = Walk(zone, s, "walk")
    first = w.fix(TALENT, beat=False)
    line = first["route_line"]
    check(first["text"].startswith("Guidance started to Bocconi University: "), f"start: {first['text']}")
    turns = [dict(t) for t in w.state["turns"]]
    cross = list(w.state["cross"])
    pts = walk_points(line)
    for p in pts[1:]:
        r = w.fix(p)
        if r["status"] == "arrived":
            break
        check(r["status"] == "on_route", f"walking the line stays on route at {w.t}: {r['off_route_m']}")
    check(r["status"] == "arrived", f"arrived: {r['status']}")
    all_ = w.texts()
    arr = [x for x in all_ if x.startswith("You have arrived")]
    check(len(arr) == 1, f"arrival said exactly once: {arr}")
    r = w.fix(pts[-1])
    check(r["text"] is None and r["status"] == "arrived", "nothing after arrival")
    cur = 0  # turns in route order: an early cue, then the 'now' cue, each after the previous turn's 'now'
    for t in turns:
        now = next((i for i in range(cur, len(all_)) if f"Turn {t['side']} now, {navigate._onto(t)}" in all_[i]), None)
        check(now is not None, f"'now' cue for turn {t['side']} onto {t['onto']}")
        if now is None:
            continue
        early = [i for i in range(max(0, cur - 1), now) if f"turn {t['side']} {navigate._onto(t)}" in all_[i]]
        check(early, f"early cue before 'now' for {t['side']} onto {t['onto']}")
        cur = now + 1
    n_cross = sum(x.count("a crossing") + x.count("Crossing here") for x in all_)
    check(n_cross >= len(cross), f"every crossing cued: {n_cross} of {len(cross)}")
    times = [t for t, _ in w.said]
    gaps = [b - a for a, b in zip(times, times[1:])]
    check(max(gaps) <= 30, f"no silence over 30 s while walking: {max(gaps)}")
    for i, (ta, xa) in enumerate(w.said):
        check(not any(xb == xa and tb - ta < 10 for tb, xb in w.said[i + 1:]), f"repeated within 10 s: {xa}")

    # 2. start facing away from the route, then turn to it
    w2 = Walk(zone, s, "orient")
    away = (navigate.bearing(zone.xy(*line[0]), zone.xy(*line[4])) + 180) % 360
    r = w2.fix(TALENT, heading=away, beat=False)
    check("Turn around" in r["text"] or "o'clock" in r["text"], f"orientation: {r['text']}")
    ln = w2.state["line"]
    rb = navigate.bearing(ln.interpolate(w2.state["progress"]), ln.interpolate(w2.state["progress"] + 10))
    r = w2.fix(TALENT, heading=rb, beat=False)
    check(r["text"] == "Good, walk straight ahead.", f"oriented: {r['text']}")

    # 3. U-turn after 150 m -> wrong way, then the right way again
    k = int(150 / 1.3)
    for p in pts[1:k]:
        w2.fix(p)
    t0 = w2.t
    for p in reversed(pts[k - 20:k]):
        w2.fix(p)
    check(any("wrong way" in x for x in w2.texts(t0)), "U-turn -> wrong way")
    t1 = w2.t
    for p in pts[k - 20:k + 20]:
        w2.fix(p)
    check(any("right way" in x for x in w2.texts(t1)), "right way again")

    # 4. 50 m sidestep -> off route, then back
    base = pts[k + 20]
    far = max((offset(base, 50 * math.cos(math.radians(a)), 50 * math.sin(math.radians(a))) for a in range(0, 360, 15)),
              key=lambda q: min(m_between(q, x) for x in pts))
    t2 = w2.t
    for _ in range(3):
        w2.fix(far)
    check(any(x.startswith("You are off the route, about") for x in w2.texts(t2)), f"off route: {w2.texts(t2)}")
    t3 = w2.t
    w2.fix(base)
    check(any(x.startswith("Back on the route.") for x in w2.texts(t3)), f"back: {w2.texts(t3)}")

    # 5. 90 m detour for 30 s -> re-route
    base = pts[k + 60]
    far = max((offset(base, 90 * math.cos(math.radians(a)), 90 * math.sin(math.radians(a))) for a in range(0, 360, 15)),
              key=lambda q: min(m_between(q, x) for x in pts))
    t4 = w2.t
    for _ in range(30):
        w2.fix(far)
    check(any(x.startswith("New route. ") for x in w2.texts(t4)), f"re-route: {w2.texts(t4)}")
    check(not any("wrong way" in x for x in w2.texts(t4)), f"no 'wrong way' right after a re-route: {w2.texts(t4)}")

    # 6. a noisy fix says nothing
    r = w2.fix(offset(far, 30, 0), acc=90)
    check(r["text"] is None, f"noisy fix silent: {r['text']}")

    # 7. a second route, starting while facing away: Duomo -> Stazione Centrale
    s2 = Session(origin=(*DUOMO, "Duomo"))
    d2 = plan.create(zone, s2, destination=CENTRALE, depart_at="2026-09-26T15:00:00+02:00")
    plan.select(zone, s2, next(x["id"] for x in d2["routes"] if x["mode"] == "foot"))
    w3 = Walk(zone, s2, "centrale")
    l3 = navigate.step(zone, s2, {}, *DUOMO)["route_line"]
    away = (navigate.bearing(zone.xy(*l3[0]), zone.xy(*l3[min(4, len(l3) - 1)])) + 180) % 360
    r = w3.fix(DUOMO, heading=away, beat=False)
    check("Turn around" in r["text"] or "o'clock" in r["text"], f"centrale orientation: {r['text']}")
    for p in walk_points(l3)[1:]:
        r = w3.fix(p, heading=away)
        if r["status"] == "arrived":
            break
    check(r["status"] == "arrived", f"centrale arrived: {r['status']}")
    all3 = w3.texts()
    check(sum(x.startswith("You have arrived") for x in all3) == 1, "centrale arrival once")
    check(not any("wrong way" in x for x in all3), "centrale: no false 'wrong way' walking the line")
    check(not any("along a " in x or "along the crossing" in x for x in all3), "centrale: no 'along a pavement'")
    t3s = [t for t, _ in w3.said]
    check(max(b - a for a, b in zip(t3s, t3s[1:])) <= 30, "centrale: no silence over 30 s")

    (HERE / "guidance_transcript.txt").write_text("\n".join(log) + "\n")
    print("\n".join(log))
    check(not slow, f"calls over 100 ms: {slow[:10]}")
    print(f"{'FAIL' if failed else 'OK'}: {len(failed)} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
