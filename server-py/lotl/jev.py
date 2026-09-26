"""Jev (TypeSafe System One): one multiple-choice call between the grammar and Claude, ~0.3 s. Only with TYPESAFE_API_KEY.

pick(utterance, ctx, branches) -> (action, params) when every answer it uses has confidence >= SURE and the action copies no
free text from the utterance; otherwise None and the caller asks Claude. Errors and timeouts are None too.
"""
import os

import httpx

from .grammar import PLACE_KINDS, minutes

URL = "https://api.typesafe.ai/v1/systemone"
SURE = 0.8
AVOID = ("unsignalled_crossings", "signals_without_sound", "steps", "construction", "main_roads", "transfers")
OPTIONS = {
    "explore_start": "start exploring the streets around", "explore_forward": "walk on along the current street",
    "explore_left": "turn left", "explore_right": "turn right", "explore_back": "step back",
    "explore_take": "take one named or numbered street at this junction", "explore_home": "go back to where exploring started",
    "explore_where": "where am I now", "overview": "describe the area", "more": "more detail",
    "unknowns": "what the app does not know", "sources": "where the data comes from", "repeat": "say it again",
    "stop": "be quiet, stop talking", "help": "what can I say", "speed_faster": "speak faster", "speed_slower": "speak slower",
    "start_over": "start everything over", "set_origin": "says where they are or start from (a place name)",
    "set_origin_here": "use my current location as the start", "set_destination": "says where they want to go (a place name)",
    "confirm_yes": "yes to what the app proposed", "confirm_no": "no to what the app proposed",
    "confirm_pick": "picks one of the places the app just listed", "route": "plan or read the route to the destination",
    "route_select": "chooses one of the offered routes", "route_avoid": "avoid something on the route: steps, crossings, main roads",
    "route_stop": "add a stop on the way at a shop, supermarket, pharmacy, café, bakery or cash machine",
    "stop_duration": "says how long the stop lasts", "navigate_start": "start turn-by-turn guidance now",
    "navigate_stop": "stop the turn-by-turn guidance",
    "ask": "a question about the map: distance, what is between places, a street, a size, a place's hours or access",
    "chat": "a general question about a place or the destination (what it is, what is there), a web search, or how to use the app",
    "none": "none of these, or not about walking in Milan",
}
SIMPLE = {"overview", "more", "unknowns", "sources", "repeat", "stop", "help", "start_over", "set_origin_here", "route", "chat"}


def choice(instructions, criteria):
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def questions(ctx, branches):
    q = {"action": choice("What does the blind user of a walking app in Milan want the app to do with `utterance`, "
                          "given the app's current `screen` and `pending` question?", OPTIONS),
         "avoid": choice("If the user wants to avoid something on the route, what?", {k: None for k in AVOID}),
         "kind": choice("If the user wants to stop on the way, at what kind of place?", {k: None for k in PLACE_KINDS})}
    if ctx.get("routes"):
        q["route"] = choice("If the user picks a route, which one?", {r["id"]: r.get("label") or None for r in ctx["routes"]})
    if branches:
        q["branch"] = choice("If the user takes a street at this junction (listed left to right), which one?",
                             {b: None for b in dict.fromkeys(branches)})
    cands = ctx.get("stop_candidates") or ctx.get("candidates")
    if cands:
        q["candidate"] = choice("If the user picks one of the places the app listed, which one?", {c: None for c in dict.fromkeys(cands)})
    return q


def call(state, qs, http):
    r = (http or httpx).post(URL, json={"state": state, "model": "jev-latest", "questions": qs}, timeout=1.5,
                             headers={"Authorization": f"Bearer {os.environ['TYPESAFE_API_KEY']}"})
    r.raise_for_status()
    return r.json()["answers"]


def pick(utterance, ctx, branches=(), http=None):
    if not os.environ.get("TYPESAFE_API_KEY"):
        return None
    state = {"utterance": utterance, "screen": ctx.get("view"), "pending": ctx.get("pending"),
             "has_destination": ctx.get("has_destination")}
    try:
        ans = call(state, questions(ctx, branches), http)
        return decide(utterance, ctx, ans)
    except Exception:  # timeout, HTTP error, odd answer: Claude decides
        return None


def decide(utterance, ctx, ans):
    def get(q):
        a = ans.get(q) or {}
        if a.get("confidence", 0) < SURE:
            raise KeyError(q)
        return a["choice"]
    a = get("action")
    if a in SIMPLE:
        return a, {}
    head, _, sub = a.partition("_")
    if head == "explore" and sub != "take":
        return "explore", {"command": sub}
    if a == "explore_take":
        return "explore", {"command": "take", "branch": get("branch")}
    if head == "speed":
        return "speed", {"change": sub}
    if a in ("confirm_yes", "confirm_no"):
        return "confirm", {"answer": sub}
    if a == "confirm_pick":
        return "confirm", {"answer": "yes", "index": (ctx.get("stop_candidates") or ctx.get("candidates")).index(get("candidate"))}
    if head == "navigate":
        return "navigate", {"state": sub}
    if a == "route_select":
        return a, {"route_id": get("route")}
    if a == "route_avoid":
        return a, {"kind": get("avoid")}
    if a == "route_stop":
        d = minutes(utterance.lower())
        return a, {"kind": get("kind"), **({"duration_min": d} if d else {})}
    return None  # set_origin, set_destination, ask, stop_duration, none: free text or a reason, Claude's job


if __name__ == "__main__":
    # live smoke, needs TYPESAFE_API_KEY: python -m lotl.jev
    import time
    routes = [{"id": "A", "label": "main streets, 14 minutes"}, {"id": "B", "label": "the shortest, 12 minutes"}]
    for u, c in (("Could you get the guidance going", {"has_destination": True}), ("I'd love an espresso on my way", {}),
                 ("I'll go with the one on the big streets", {"routes": routes}), ("hmm, no, not that", {"pending": "destination"}),
                 ("please stop guiding me for now", {}), ("I don't want any stairs", {"routes": routes}),
                 ("talk a bit quicker", {}), ("Is the pharmacy on via Ripamonti open?", {})):
        t = time.perf_counter()
        try:
            ans = call({"utterance": u, **c}, questions(c, []), None)
            got = {k: (v["choice"], round(v["confidence"], 2)) for k, v in ans.items()}
        except httpx.HTTPError as e:
            got = type(e).__name__
        print(f"{time.perf_counter() - t:.2f}s", u, "->", got)
