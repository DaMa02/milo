"""End to end over HTTP with FastAPI's TestClient (lifespan included, so the real cached zone is loaded).
Every Overview / ExploreStep / Answer body is validated against contracts/, number-fact rule included.

    python tests/test_api.py      (from server-py)
"""
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = HERE.parent.parent / "contracts"
sys.path[:0] = [str(HERE.parent), str(CONTRACTS)]
os.environ["LOTL_ZONE"] = "porta-romana"  # the small cached zone: fast, and the numbers below are its numbers

from fastapi.testclient import TestClient  # noqa: E402
from jsonschema import Draft7Validator  # noqa: E402
from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk  # noqa: E402

from app import app  # noqa: E402
from lotl.tools import TOOLS  # noqa: E402

passed, failed = 0, []
ASKS = {  # tool -> (question, params)
    "walking_vs_straight_line": ("Is it close to here?", {"to": {"name": "the party"}}),
    "barrier_between": ("Is there anything between here and viale Isonzo?", {"to": {"lat": 45.44658, "lon": 9.20584}}),
    "street_continuity": ("Does via Arcivescovo Calabiana go through?", {"street": "Via Arcivescovo Calabiana"}),
    "independent_connections": ("How many ways are there?", {"from": {"name": "talent garden"}, "to": {"name": "the party"}}),
    "extent": ("How big is the construction site?", {"place": "Villaggio Olimpico 2026 - Parco Porta Romana"}),
    "place_info": ("Is the pharmacy open?", {"place": {"name": "the pharmacy"}}),
}


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


def call(c, method, url, status=200, schema=None, **kw):
    r = c.request(method, url, **kw)
    check(r.status_code == status, f"{method} {url} -> {r.status_code}, expected {status}: {r.text[:200]}")
    body = r.json()
    if schema and r.status_code == 200:
        valid(body, schema, f"{method} {url}")
    return body


def main():
    fixture = json.loads((CONTRACTS / "fixtures/overview.porta-romana.json").read_text())
    with TestClient(app) as c:
        h = call(c, "GET", "/health")
        check(h.get("ok") is True and h.get("zone"), f"health body {h}")

        # session and overview, default origin: same substance as the fixture
        s = call(c, "POST", "/session", json={})
        sid, ov = s["session_id"], s["overview"]
        valid(ov, "overview", "POST /session overview")
        check(ov["reference"]["heading_deg"] == 0 and ov["reference"]["place"] == fixture["reference"]["place"],
              f"default reference {ov['reference']}")
        key = lambda b: (b["name"], b["kind"], b["relative_direction"], b["distance_m"])  # noqa: E731
        check({key(b) for b in fixture["barriers"]} <= {key(b) for b in ov["barriers"]}, "fixture barriers present")
        check({key(b) for b in fixture["landmarks"]} == {key(b) for b in ov["landmarks"]}, "fixture landmarks equal")
        check(ov["barriers"][0]["crossings_on_foot"] == 2, "railway crossed in 2 places")
        check("160 m ahead" in ov["text"] and "the corso Lodi bridge, 410 m at 2 o'clock" in ov["text"], ov["text"])
        call(c, "GET", f"/session/{sid}/overview", schema="overview")
        call(c, "POST", "/session", json={}, schema=None)  # empty body object is fine
        call(c, "POST", "/session", schema=None)  # no body at all is fine too

        # another origin and facing inside the area; the reference facing carries into the walk
        s2 = call(c, "POST", "/session", json={"origin": {"lat": 45.4489, "lon": 9.2045, "name": "Piazza Trento 3"},
                                                "heading_deg": 90})
        valid(s2["overview"], "overview", "POST /session custom origin overview")
        check(s2["overview"]["reference"]["heading_deg"] == 90, "custom heading kept in the reference")
        st = call(c, "POST", f"/session/{s2['session_id']}/explore", json={"command": "where"}, schema="explore-step")
        check(st["command"] == "start" and st["heading_deg"] == 90, f"first command acts as start, facing kept: {st['command']}")

        # explore sequence
        seq = {}
        for cmd in ("start", "forward", "left", "right", "back", "home", "where"):
            seq[cmd] = call(c, "POST", f"/session/{sid}/explore", json={"command": cmd}, schema="explore-step")
            check(seq[cmd]["command"] == cmd, f"explore {cmd} answers as {seq[cmd]['command']}")
        check(seq["start"]["junction_stack_depth"] == 0 and seq["forward"]["junction_stack_depth"] == 1, "stack after forward")
        check(seq["back"]["junction_stack_depth"] == seq["right"]["junction_stack_depth"] - 1, "back pops one junction")
        check(seq["home"]["position"] == seq["start"]["position"] and seq["home"]["junction_stack_depth"] == 0, "home")
        check(seq["home"]["heading_deg"] == 0, "home faces the start facing")
        # take: any branch by its index in the previous step (0 = leftmost), or by name
        n = len(seq["home"]["branches"])
        tk = call(c, "POST", f"/session/{sid}/explore", json={"command": "take", "branch": n - 1}, schema="explore-step")
        check(tk["junction_stack_depth"] == 1 and tk["position"] != seq["home"]["position"], "take moves along the rightmost branch")
        stay = call(c, "POST", f"/session/{sid}/explore", json={"command": "take", "branch": 99}, schema="explore-step")
        check(stay["position"] == tk["position"] and stay["text"].startswith("There is no way"), "take with a bad index stays put")
        check(c.post(f"/session/{sid}/explore", json={"command": "take"}).status_code == 422, "take without branch is 422")
        call(c, "POST", f"/session/{sid}/explore", json={"command": "home"}, schema="explore-step")
        call(c, "GET", f"/session/{sid}/overview", schema="overview")  # still the start reference after walking
        check(c.get(f"/session/{sid}/overview").json()["reference"]["heading_deg"] == 0, "reference unchanged by the walk")

        # question only: the model picks the tool (stubbed here, tests never call a paid API)
        import lotl.llm as L
        real = L.interpret
        try:
            L.interpret = lambda q, llm=None: ("walking_vs_straight_line", {"to": {"name": "destination"}})
            a = call(c, "POST", f"/session/{sid}/ask", json={"question": "Is the party close to here?"}, schema="answer")
            check(a["tool"] == "walking_vs_straight_line" and "1,080 m on foot" in a["text"], "question-only ask runs the picked tool")
            L.interpret = lambda q, llm=None: ("none", {})
            a = call(c, "POST", f"/session/{sid}/ask", json={"question": "What colour is the sky?"}, schema="answer")
            check(a["tool"] == "none" and a["text"] == L.CLARIFY and not a["unknown"], "no tool fits: fixed text")

            def down(q, llm=None):
                raise L.Unavailable("offline")
            L.interpret = down
            a = call(c, "POST", f"/session/{sid}/ask", json={"question": "Is it far?"}, schema="answer")
            check(a["tool"] == "none" and a["unknown"], "model unreachable: fixed text and the reason in unknown")
        finally:
            L.interpret = real
        # the real module without a key: fixed text, no network, no crash
        import os
        saved = os.environ.pop("ANTHROPIC_API_KEY", None)
        try:
            a = call(c, "POST", f"/session/{sid}/ask", json={"question": "Is it far?"}, schema="answer")
            check(a["tool"] == "none" and a["unknown"], "no API key: fixed text, not a 500")
        finally:
            if saved is not None:
                os.environ["ANTHROPIC_API_KEY"] = saved

        # place given in the contract's {name} shape for extent / street_continuity
        a = call(c, "POST", f"/session/{sid}/ask", json={"question": "How big?", "tool": "extent", "params": {"place": {"name": "the construction site"}}}, schema="answer")
        check("Villaggio Olimpico" in a["text"], "extent accepts place {name}")
        a = call(c, "POST", f"/session/{sid}/ask", json={"question": "Through?", "tool": "street_continuity", "params": {"street": {"name": "via Brembo"}}}, schema="answer")
        check("via Brembo" in a["text"] and "Which place" not in a["text"], "street_continuity accepts street {name}")

        # the five tools
        check(set(ASKS) == set(TOOLS), f"test covers every tool {TOOLS}")
        for tool, (q, params) in ASKS.items():
            a = call(c, "POST", f"/session/{sid}/ask", json={"question": q, "tool": tool, "params": params}, schema="answer")
            check(a.get("tool") == tool and a.get("question") == q, f"ask {tool} echoes tool and question")
        a = call(c, "POST", f"/session/{sid}/ask", schema="answer",
                 json={"question": "How far is Piazza San Marco?", "tool": "walking_vs_straight_line",
                       "params": {"to": {"name": "Piazza San Marco"}}})
        check(a["text"].startswith("I cannot find"), f"unknown place is a question back: {a['text']}")

        # regressions from review (majors)
        def ask(tool, params, q="q", sid=sid):
            return call(c, "POST", f"/session/{sid}/ask", json={"question": q, "tool": tool, "params": params},
                        schema="answer")

        def fact(doc, type_):
            return next((f["value"] for f in doc["facts"] if f["type"] == type_), None)

        for tool, params in [("walking_vs_straight_line", {"to": 5}), ("walking_vs_straight_line", {"to": ["via Brembo"]}),
                             ("walking_vs_straight_line", {"to": {"lat": 45.4455}}),
                             ("walking_vs_straight_line", {"to": {"lat": "abc", "lon": 9.2}}),
                             ("walking_vs_straight_line", {"to": {"lat": 45.4455, "lon": None}}),
                             ("walking_vs_straight_line", {"from": 7, "to": {"name": "the party"}}),
                             ("walking_vs_straight_line", {"to": {"name": None, "lat": None, "lon": None}}),
                             ("barrier_between", {"to": True}), ("barrier_between", {"to": {"lat": 45.44, "lon": "x"}}),
                             ("independent_connections", {"to": 1}), ("street_continuity", {"street": {"name": 7}}),
                             ("extent", {"place": ["x"]})]:
            a = ask(tool, params)
            check(a["text"] == "Which place do you mean?", f"bad place shape {params} is a question back: {a['text']}")
        for street in ("viale Isonzo", "corso Lodi", "Via Arcivescovo Calabiana"):  # roadway stops, pavements go on
            a = ask("street_continuity", {"street": street})
            check(fact(a, "street_continuity") == "goes_through" and "goes through" in a["text"], f"{street}: {a['text']}")
        a = ask("walking_vs_straight_line", {"from": {"lat": 45.443741, "lon": 9.208687},
                                             "to": {"lat": 45.444256, "lon": 9.208454}})  # both on one 136 m edge
        check(fact(a, "walking_distance") == 60, f"same-edge walk is 60 m: {a['text']}")
        a = ask("independent_connections", {"from": {"name": "talent garden"}, "to": {"name": "the party"}})
        check(fact(a, "independent_ways") == 4, f"4 railway passages, bridges beyond 800 m merged too: {a['text']}")
        check("The walk starts at the nearest junction, 70 m along it." in seq["start"]["text"]
              and any(f["type"] == "start_offset" and f["value"] == 70 for f in seq["start"]["facts"]),
              f"start says the move to the junction: {seq['start']['text'][:160]}")
        s3 = call(c, "POST", "/session", json={"origin": {"lat": 45.44658, "lon": 9.20584, "name": "the party"},
                                                "heading_deg": 90})["session_id"]
        for cmd in ("start", "forward", "forward", "left"):
            st = call(c, "POST", f"/session/{s3}/explore", json={"command": cmd}, schema="explore-step")
        check("a footpath, left, 110 m to a junction; 3 crossings on the way: 1 without a signal," in st["text"]
              and any(f["type"] == "branch_crossings" and f["value"] == 3 for f in st["facts"]),
              f"every crossing on a branch is said: {st['text'][:200]}")

        # errors
        call(c, "POST", "/session", 422, json={"origin": {"lat": 45.4642, "lon": 9.1900}})  # Duomo, outside
        call(c, "POST", "/session", 422, json={"lang": "fr"})
        call(c, "GET", "/session/nope/overview", 404)
        call(c, "POST", "/session/nope/explore", 404, json={"command": "start"})
        call(c, "POST", "/session/nope/ask", 404, json={"question": "q", "tool": "extent", "params": {}})
        call(c, "POST", f"/session/{sid}/explore", 422, json={"command": "jump"})
        call(c, "POST", f"/session/{sid}/ask", 422, json={"question": "q", "tool": "teleport", "params": {}})
        call(c, "POST", f"/session/{sid}/ask", 422, json={"question": "", "tool": "extent", "params": {}})

    print(f"{passed} checks passed" + (f", {len(failed)} failed" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
