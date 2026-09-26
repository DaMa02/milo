"""POST /interpret over HTTP with FastAPI's TestClient: grammar phrases, then Claude through a fake client. No Zone,
no network, no key: any network connection attempt fails the test.

    python tests/test_interpret.py      (from server-py)
"""
import json
import os
import pathlib
import socket
import sys
from types import SimpleNamespace as NS

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
os.environ.pop("ANTHROPIC_API_KEY", None)


def _no_network(_sock, address, *_a):
    raise OSError("network disabled in test_interpret")


socket.socket.connect = _no_network

import anthropic  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from interpret_api import make_router  # noqa: E402


def no_session(sid):
    raise HTTPException(404, "No such session: start a new one.")


def blank(**kw):
    out = {k: "" for k in ("action", "command", "branch", "tool", "from_place", "to_place", "street", "place", "query",
                           "answer", "change", "route_id", "kind", "strength", "reason")}
    return {**out, "index": -1, **kw}


class Fake:
    """Stands in for anthropic.Anthropic: answers from a dict keyed by utterance, records every call."""
    def __init__(self, answers):
        self.answers, self.calls = answers, []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kw):
        self.calls.append(kw)
        u = kw["messages"][0]["content"].rsplit("Utterance: ", 1)[1]
        if u not in self.answers:
            raise anthropic.APIConnectionError(request=None)
        return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps(self.answers[u]))])


ROUTES = [{"id": "A", "label": "Shortest"}, {"id": "B", "label": "Main streets"}, {"id": "C", "label": "Bus 90"}]
EXPLORE = {"view": "explore", "routes": ROUTES}
PLAN = {"view": "plan", "has_destination": True, "routes": ROUTES}
REAL = {"view": "plan", "has_destination": True, "routes": [  # labels as the plan's summaries say them
    {"id": "A", "label": "Route A, on foot, 14 minutes, the same time as the shortest: 1 crossing without a signal."},
    {"id": "B", "label": "Route B, on foot, the shortest, 14 minutes: 3 crossings without a signal."},
    {"id": "C", "label": "Route C, bus 92 from Viale Umbria: you arrive 29 minutes after it; route B on foot takes 14."}]}
PENDING = {"view": "home", "pending": "destination", "candidates": ["Bocconi University", "Bocconi Library"]}

GRAMMAR = [  # (utterance, context, action, params)
    ("Use my location.", {}, "set_origin_here", {}),
    ("Yes.", PENDING, "confirm", {"answer": "yes"}),
    ("I'm going to Bocconi University.", {}, "set_destination", {"query": "Bocconi University"}),
    ("How do I get there?", {"has_destination": True}, "route", {}),
    ("Take the shortest.", PLAN, "route_select", {"route_id": "A"}),
    ("Let's walk.", PLAN, "explore", {"command": "forward"}),
    ("Take the footpath.", EXPLORE, "explore", {"command": "take", "branch": "footpath"}),
    ("Where am I?", EXPLORE, "explore", {"command": "where"}),
    ("Start from the Duomo instead.", {}, "set_origin", {"query": "Duomo"}),
    ("I'm going to Stazione Centrale.", {}, "set_destination", {"query": "Stazione Centrale"}),
    ("Start from Monza.", {}, "set_origin", {"query": "Monza"}),
    ("Stop", {}, "stop", {}),
    ("Forward", EXPLORE, "explore", {"command": "forward"}),
    ("go ahead", EXPLORE, "explore", {"command": "forward"}),
    ("Keep going.", EXPLORE, "explore", {"command": "forward"}),
    ("go on", EXPLORE, "explore", {"command": "forward"}),
    ("Turn left", EXPLORE, "explore", {"command": "left"}),
    ("turn right.", EXPLORE, "explore", {"command": "right"}),
    ("Take the second one", EXPLORE, "explore", {"command": "take", "branch": 1}),
    ("number 2", EXPLORE, "explore", {"command": "take", "branch": 1}),
    ("Take via Brembo", EXPLORE, "explore", {"command": "take", "branch": "via Brembo"}),
    ("take 3", EXPLORE, "explore", {"command": "take", "branch": 2}),
    ("Go back", EXPLORE, "explore", {"command": "back"}),
    ("Back to the start.", EXPLORE, "explore", {"command": "home"}),
    ("home", EXPLORE, "explore", {"command": "home"}),
    ("Repeat", {}, "repeat", {}),
    ("Say that again?", {}, "repeat", {}),
    ("Quiet!", {}, "stop", {}),
    ("shut up", {}, "stop", {}),
    ("More detail", {}, "more", {}),
    ("Tell me more.", {}, "more", {}),
    ("What don't you know?", {}, "unknowns", {}),
    ("Sources", {}, "sources", {}),
    ("Help", {}, "help", {}),
    ("What can I say?", {}, "help", {}),
    ("Faster", {}, "speed", {"change": "faster"}),
    ("slow down", {}, "speed", {"change": "slower"}),
    ("Start over", {}, "start_over", {}),
    ("yeah", PENDING, "confirm", {"answer": "yes"}),
    ("That's right.", PENDING, "confirm", {"answer": "yes"}),
    ("Correct", PENDING, "confirm", {"answer": "yes"}),
    ("No.", PENDING, "confirm", {"answer": "no"}),
    ("nope", PENDING, "confirm", {"answer": "no"}),
    ("The second one.", PENDING, "confirm", {"answer": "yes", "index": 1}),
    ("I'm here", {}, "set_origin_here", {}),
    ("I'm at Talent Garden", {}, "set_origin", {"query": "Talent Garden"}),
    ("Starting from Bocconi University", {}, "set_origin", {"query": "Bocconi University"}),
    ("Take me to the Duomo.", {}, "set_destination", {"query": "Duomo"}),
    ("Go to Stazione Centrale", {}, "set_destination", {"query": "Stazione Centrale"}),
    ("My destination is Porta Romana.", {}, "set_destination", {"query": "Porta Romana"}),
    ("Directions", {"has_destination": True}, "route", {}),
    ("route", {"has_destination": True}, "route", {}),
    ("Take the main streets.", PLAN, "route_select", {"route_id": "B"}),
    ("Take the bus.", PLAN, "route_select", {"route_id": "C"}),
    ("the second one", PLAN, "route_select", {"route_id": "B"}),
    ("Avoid crossings without signals.", PLAN, "route_avoid", {"kind": "unsignalled_crossings"}),
    ("Avoid signals without sound", PLAN, "route_avoid", {"kind": "signals_without_sound"}),
    ("No stairs please", PLAN, "route_avoid", {"kind": "steps"}),
    ("avoid construction", PLAN, "route_avoid", {"kind": "construction"}),
    ("Avoid main roads", PLAN, "route_avoid", {"kind": "main_roads"}),
    ("Only side streets.", PLAN, "route_avoid", {"kind": "main_roads", "strength": "require"}),
    ("Never use steps", PLAN, "route_avoid", {"kind": "steps", "strength": "require"}),
    ("avoid transfers", PLAN, "route_avoid", {"kind": "transfers"}),
    # Italian
    ("Avanti", EXPLORE, "explore", {"command": "forward"}),
    ("sinistra", EXPLORE, "explore", {"command": "left"}),
    ("Gira a destra", EXPLORE, "explore", {"command": "right"}),
    ("Indietro", EXPLORE, "explore", {"command": "back"}),
    ("Torna all'inizio", EXPLORE, "explore", {"command": "home"}),
    ("Dove sono?", EXPLORE, "explore", {"command": "where"}),
    ("Ripeti", {}, "repeat", {}),
    ("Basta", {}, "stop", {}),
    ("Più dettagli", {}, "more", {}),
    ("Aiuto", {}, "help", {}),
    ("Sì", PENDING, "confirm", {"answer": "yes"}),
    ("No", PENDING, "confirm", {"answer": "no"}),
    ("Usa la mia posizione.", {}, "set_origin_here", {}),
    ("Parto da Piazza Duomo", {}, "set_origin", {"query": "Piazza Duomo"}),
    ("Vado a Porta Romana", {}, "set_destination", {"query": "Porta Romana"}),
    ("Come ci arrivo?", {"has_destination": True}, "route", {}),
    ("Take the shortest.", REAL, "route_select", {"route_id": "B"}),
    ("Take the main streets.", REAL, "route_select", {"route_id": "A"}),
    ("Take the bus.", REAL, "route_select", {"route_id": "C"}),
    ("Take route B.", REAL, "route_select", {"route_id": "B"}),
    ("No, the second one.", PENDING, "confirm", {"answer": "yes", "index": 1}),
    ("The last one.", PENDING, "confirm", {"answer": "yes", "index": 1}),
    ("Take me there.", {"has_destination": True}, "route", {}),
    ("Go to the left.", EXPLORE, "explore", {"command": "left"}),
]

BETWEEN = "Is there anything between me and Bocconi?"
FESTA = "La festa è vicina?"
CLAUDE = [  # (utterance, context, fake model answer, action, params)
    (BETWEEN, PLAN, blank(action="ask", tool="barrier_between", to_place="Bocconi"),
     "ask", {"question": BETWEEN, "tool": "barrier_between", "params": {"to": {"name": "Bocconi"}}}),
    (FESTA, {}, blank(action="ask", tool="walking_vs_straight_line", to_place="destination"),
     "ask", {"question": FESTA, "tool": "walking_vs_straight_line", "params": {"to": {"name": "destination"}}}),
    ("Does via Brembo go through?", {}, blank(action="ask", tool="street_continuity", street="via Brembo"),
     "ask", {"question": "Does via Brembo go through?", "tool": "street_continuity", "params": {"street": "via Brembo"}}),
    ("Could you describe the neighbourhood for me", {}, blank(action="overview"), "overview", {}),
    ("I would rather avoid the busy stuff", PLAN, blank(action="route_avoid", kind="main_roads"),
     "route_avoid", {"kind": "main_roads"}),
    ("Let's go with the one on the big streets", PLAN, blank(action="route_select", route_id="B"),
     "route_select", {"route_id": "B"}),
    ("Can we do route Z", PLAN, blank(action="route_select", route_id="Z"), "none", {"reason": "unclear"}),
    ("I'm somewhere near the cathedral", {}, blank(action="set_origin", query="the cathedral"),
     "set_origin", {"query": "the cathedral"}),
    ("Book me a flight to Rome", {}, blank(action="none", reason="outside_area"), "none", {"reason": "outside_area"}),
    ("What colour is the sky?", {}, blank(action="none", reason="no_fit"), "none", {"reason": "no_fit"}),
    ("Go down the street on my left", EXPLORE, blank(action="explore", command="take", branch="0"),
     "explore", {"command": "take", "branch": 0}),
]


def post(client, utterance, ctx):
    r = client.post("/interpret", json={"utterance": utterance, "lang": "en", "context": ctx})
    assert r.status_code == 200, (utterance, r.status_code, r.text)
    return r.json()


def main():
    errors = []
    # grammar only: no key, no client -> every command answers without a model
    app = FastAPI()
    app.include_router(make_router(no_session))
    bare = TestClient(app)
    for u, ctx, action, params in GRAMMAR:
        got = post(bare, u, ctx)
        if (got["action"], got["params"], got["via"], got["utterance"]) != (action, params, "grammar", u):
            errors.append(f"{u!r}: {got['action']} {got['params']} via {got['via']}, expected {action} {params}")
    got = post(bare, "Is it far?", REAL)  # a short question never picks a route by a shared word
    if got["action"] != "none":
        errors.append(f"'Is it far?': {got}")
    got = post(bare, BETWEEN, PLAN)
    if (got["action"], got["params"]) != ("none", {"reason": "model_unavailable"}):
        errors.append(f"no key: {got}")

    # Claude through a fake client; grammar phrases never reach it
    fake = Fake({u: a for u, _, a, _, _ in CLAUDE})
    app = FastAPI()
    app.include_router(make_router(no_session, llm=fake))
    c = TestClient(app)
    for u, ctx, _, action, params in CLAUDE:
        got = post(c, u, ctx)
        if (got["action"], got["params"], got["via"]) != (action, params, "claude"):
            errors.append(f"{u!r}: {got['action']} {got['params']} via {got['via']}, expected {action} {params}")
    n = len(fake.calls)
    for u, ctx, action, params in GRAMMAR:
        post(c, u, ctx)
    if len(fake.calls) != n:
        errors.append("a grammar phrase reached the model")
    call = fake.calls[0]
    if call["output_config"]["format"]["type"] != "json_schema" or '"routes"' not in call["messages"][0]["content"]:
        errors.append("the model call lacks the schema or the context")
    got = post(c, "Something the fake does not know", {})  # the fake raises an anthropic error
    if (got["action"], got["params"], got["via"]) != ("none", {"reason": "model_unavailable"}, "grammar"):
        errors.append(f"anthropic error: {got}")
    r = c.post("/interpret", json={"utterance": "", "context": {}})
    if r.status_code != 422 or not isinstance(r.json()["detail"], str):
        errors.append(f"empty utterance: {r.status_code} {r.text}")
    if c.post("/interpret", json={"utterance": "Stop", "context": None}).json()["action"] != "stop":
        errors.append("context null")
    got = c.post("/interpret", json={"utterance": "Stop", "session_id": "gone"}).json()
    if got["action"] != "stop":
        errors.append(f"stale session: {got}")

    print(f"{len(GRAMMAR)} grammar + {len(CLAUDE)} model utterances, {len(errors)} errors")
    for e in errors:
        print("FAIL", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
