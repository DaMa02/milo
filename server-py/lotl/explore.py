"""Free exploration: a virtual walk junction to junction, with the start point and facing as the one reference.

    explore(zone, session, command, heading_deg=None) -> ExploreStep (contracts/explore-step.schema.json)
"""
from collections import Counter

from .zone import clock, fmt, meta, r10, rel_angle, join_and

CARDINAL = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
# command -> (target angle, lowest, highest relative angle accepted, how "none" is said)
TURNS = {"forward": (0, -45, 45, "ahead"), "left": (-90, -150, -30, "to your left"),
         "right": (90, 30, 150, "to your right")}
SOUND = {"yes": ", with sound", "no": ", without sound", "unknown": ", the map does not say whether it has sound"}
# several crossings on one branch: how each kind is said, in this order
KINDS = {("no", "no"): "without a signal", ("yes", "yes"): "with a signal and sound",
         ("yes", "no"): "with a signal but no sound",
         ("yes", "unknown"): "with a signal where the map does not say whether it has sound",
         ("unknown", "unknown"): "where the map does not say whether it has a signal"}


def cardinal(heading):
    return CARDINAL[int(round(heading / 45.0)) % 8]


def label(zone, path):
    """Name of a walked path: the label covering most of its length, as Zone.branch names it."""
    c = Counter()
    for u, v in zip(path, path[1:]):
        c[zone.edge_label(u, v)] += zone.edata(u, v)["length"]
    return c.most_common(1)[0][0]


def branches(zone, s):
    """Ways out of the current node except the one walked in on, left to right relative to the facing."""
    out = {}
    for path, name, metres in zone.branches(s.node, exclude=s.came[-2] if s.came else None):
        rel = rel_angle(zone.first_dir(path), s.heading)
        xs = zone.path_crossings(path[1:])
        b = {"rel": rel, "path": path, "name": name, "leads_to": zone.leads_to(path, name),
             "relative_direction": clock(rel), "distance_m": r10(metres), "metres": metres,
             "crossing": dict(xs[0]) if xs else None, "crossings": xs}
        # two ways to the same junction that sound the same are one way: keep the one with crossing data, then the shorter
        key = (path[-1], name, b["relative_direction"])
        if key not in out or (xs == [], metres) < (out[key]["crossings"] == [], out[key]["metres"]):
            out[key] = b
    return sorted(out.values(), key=lambda b: b["rel"])


def kinds(xs):
    """Crossings on a branch counted by kind: [(phrase, count)] in KINDS order."""
    c = Counter((x["signals"], x["sound"] if x["signals"] == "yes" else x["signals"]) for x in xs)
    return [(KINDS[k], c[k]) for k in KINDS if c[k]]


def _they(kind):
    return kind.replace("it has", "they have")


def say(b, again=False):
    """One branch; `again` when an earlier branch in the list sounds the same."""
    d = fmt(b["distance_m"]) if b["distance_m"] else "a few metres"
    n = b["name"]
    if again:
        n = "another " + n[2:] if n.startswith("a ") else f"another way along {n}"
    s = f"{n}, {b['relative_direction']}, {d} to {b['leads_to']}"
    c = b["crossing"]
    if len(b["crossings"]) > 1:
        ks, total = kinds(b["crossings"]), len(b["crossings"])
        if len(ks) == 1:
            s += f"; {total} crossings on the way, {'both' if total == 2 else 'all'} {_they(ks[0][0])}"
        else:
            s += f"; {total} crossings on the way: " + join_and(f"{k} {w if k == 1 else _they(w)}" for w, k in ks)
    elif c and c["signals"] == "unknown":
        s += "; the map does not say whether its crossing has a signal"
    elif c and c["signals"] == "yes":
        s += "; its crossing has a signal" + SOUND[c["sound"]]
    elif c:
        s += "; its crossing has no signal"
    return s


def describe(zone, s, brs):
    """The junction: ways left to right, the mapped-area edge, and where the walker came from."""
    at_edge = s.node in zone.BOUNDARY
    if not brs:
        t = "There is no other way from here." + ("" if at_edge else " This is a dead end.")
    elif len(brs) == 1:
        t = f"1 way: {say(brs[0])}."
    else:
        heads = [(b["name"], b["relative_direction"], b["distance_m"], b["leads_to"]) for b in brs]
        t = f"{len(brs)} ways, from left to right: " + "; ".join(say(b, h in heads[:i]) for i, (b, h) in
                                                                  enumerate(zip(brs, heads))) + "."
    if at_edge:
        t += " This is the edge of the mapped area: ways may continue beyond it."
    if s.came:
        t += f" Behind you: {label(zone, s.came)}, where you came from."
    return t


def explore(zone, session, command, heading_deg=None, branch=None):
    """Run one command (start, forward, left, right, take, back, home, where), update the session, return an ExploreStep.

    take follows `branch`: its index in the current branches, left to right from 0, or its name."""
    s = session
    lat, lon, name = s.origin
    if command != "start" and s.start is None:
        command = "start"  # every walk begins by stating the reference
    g = zone.graph_inputs
    intro, extra = "", []
    if command == "start":
        a = zone.snap(lat, lon)
        s.node, s.heading = int(a["node"]), float(heading_deg or 0) % 360
        s.start, s.stack, s.came = (s.node, s.heading), [], None
        intro = f"Start at {name}, facing {cardinal(s.heading)}. You are on {zone.edge_label(a['u'], a['v'])}. "
        d = r10(a["su"] if s.node == a["u"] else a["sv"])
        if d:  # the walk goes from a node of the map: say how far along the way it is (rule 8)
            kind = "junction" if zone.degree(s.node) > 2 else "dead end" if zone.degree(s.node) == 1 else "mapped point"
            intro += f"The walk starts at the nearest {kind}, {fmt(d)} along it. "
            extra = [zone.fact("start_offset", d, "m", "computed", [f"node/{a['u']}", f"node/{a['v']}"],
                               {"graph": g, "origin": [lat, lon], "node": s.node, "method": "along the nearest way"})]
    elif command in TURNS or command == "take":
        brs0 = branches(zone, s)
        if command == "take":
            ok = [b for i, b in enumerate(brs0) if branch == i or (isinstance(branch, str) and branch.lower() == b["name"].lower())]
            where = "with that name or number here" if isinstance(branch, str) else "with that number here"
            ok, target = ok[:1], None
        else:
            target, lo, hi, where = TURNS[command]
            ok = [b for b in brs0 if lo <= b["rel"] <= hi]
        if not ok:
            intro = f"There is no way {where}. "
        else:
            b = ok[0] if target is None else min(ok, key=lambda b: abs(b["rel"] - target))
            p = b["path"]
            s.stack.append((s.node, s.heading, s.came))
            s.node, s.heading, s.came = p[-1], zone.arrival_dir(p), p
            intro = f"You walked {fmt(b['distance_m'])} along {b['name']} and now face the way you walked. "
            extra = [zone.fact("walked_distance", b["distance_m"], "m", "computed", zone.path_ways(p),
                               {"graph": g, "path_nodes": [p[0], p[-1]]}),
                     zone.fact("heading", round(s.heading) % 360, "deg", "computed", [f"node/{p[-2]}", f"node/{p[-1]}"],
                               {"graph": g, "segment": [p[-2], p[-1]]})]
    elif command == "back":
        if s.stack:
            s.node, s.heading, s.came = s.stack.pop()
            intro = "Back at the previous junction, facing the way you faced there. "
        else:
            intro = "You are at the start; there is no earlier junction. "
    elif command == "home":
        (s.node, s.heading), s.stack, s.came = s.start, [], None
        intro = f"Back at the start, {name}, facing {cardinal(s.heading)} again. "
    elif command == "where":
        here = sorted({zone.edge_label(s.node, m) for m in zone.G[s.node]})
        crow = r10(zone.xy(lat, lon).distance(zone.nxy(s.node)))
        on = f"on {here[0]}" if len(here) == 1 else f"where {join_and(here)} meet"
        far = f"{fmt(crow)} in a straight line from {name}" if crow else f"right at {name}"
        intro = f"You are {on}, {far}. "
        extra = [zone.fact("straight_line_distance", crow, "m", "computed", [f"node/{s.node}"],
                           {"graph": g, "from": [lat, lon], "node": s.node})]
    else:
        raise ValueError(f"unknown explore command: {command}")

    brs = branches(zone, s)
    facts = [zone.fact("branch_distance", b["distance_m"], "m", "computed", [f"node/{s.node}", f"node/{b['path'][-1]}"],
                       {"graph": g, "from_node": s.node, "to_node": b["path"][-1], "heading_deg": s.heading})
             for b in brs]
    for b in brs:
        if len(b["crossings"]) > 1:  # back every count said for a branch with several crossings
            ev = [x["osm_id"] for x in b["crossings"]]
            b_in = {"graph": g, "from_node": s.node, "to_node": b["path"][-1]}
            facts.append(zone.fact("branch_crossings", len(ev), "count", "computed", ev, b_in))
            ks = kinds(b["crossings"])
            facts += [zone.fact("branch_crossings_of_kind", n, "count", "computed", ev, {**b_in, "kind": k})
                      for k, n in ks if len(ks) > 1]
    facts.append(zone.fact("branch_count", len(brs), "count", "computed", [f"node/{s.node}"],
                           {"graph": g, "node": s.node, "heading_deg": s.heading},
                           "unknown" if s.node in zone.BOUNDARY else "complete"))
    if any(ch.isdigit() for ch in name):  # a house number in the origin name is spoken: said by the user
        facts.append(zone.fact("origin_name", name, None, "unknown", [], {"origin": [lat, lon]}))
    lat_n, lon_n = zone.LL[s.node]
    return {"command": command, "lang": "en",
            "position": {"lat": lat_n, "lon": lon_n, "osm_node": f"node/{s.node}"},
            "heading_deg": round(s.heading) % 360, "text": intro + describe(zone, s, brs),
            "branches": [{k: b[k] for k in ("name", "leads_to", "relative_direction", "distance_m", "crossing")}
                         for b in brs],
            "came_from": {"name": label(zone, s.came), "relative_direction": "behind", "osm_node": f"node/{s.came[-2]}"}
            if s.came else None,
            "junction_stack_depth": len(s.stack), "at_boundary": s.node in zone.BOUNDARY,
            "facts": facts + extra, "meta": meta()}


if __name__ == "__main__":
    import json
    import pathlib
    import sys

    from jsonschema import Draft7Validator

    from .session import Session
    from .zone import Zone

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "contracts"))
    from validate import NUM, REGISTRY, SCHEMAS, SPOKEN, backed_numbers, norm, walk

    z = Zone()
    ses = Session(origin=(45.44386, 9.20808, "Talent Garden"))
    v = Draft7Validator(SCHEMAS["explore-step"], registry=REGISTRY)
    fixtures = pathlib.Path(__file__).resolve().parents[2] / "contracts/fixtures"
    bad, outs = 0, []
    for cmd in ("start", "forward", "left", "right", "back", "back", "home", "where", "forward", "forward", "forward"):
        out = json.loads(json.dumps(explore(z, ses, cmd)))
        backed = backed_numbers(out)
        problems = [e.message for e in v.iter_errors(out)]
        problems += [f"unbacked number {t!r}" for k, val in walk(out) if k in SPOKEN and isinstance(val, str)
                     for t in NUM.findall(val) if norm(t) not in backed]
        bad += len(problems)
        outs.append(out)
        print(f"[{cmd}] depth={out['junction_stack_depth']} {'FAIL ' + str(problems) if problems else 'ok'}\n  {out['text']}")
    # same walk as the fixtures: position and ways (the wording has moved on; fixtures regenerate in contracts/)
    for i, f in ((0, "explore-step.start.json"), (1, "explore-step.first-junction.json")):
        fx = json.loads((fixtures / f).read_text())
        assert outs[i]["position"] == fx["position"], f
        assert [(b["relative_direction"], b["distance_m"]) for b in outs[i]["branches"]] == \
               [(b["relative_direction"], b["distance_m"]) for b in fx["branches"]], f
    assert outs[5]["position"] == outs[0]["position"] and outs[5]["junction_stack_depth"] == 0  # back, back = start
    assert outs[6]["position"] == outs[0]["position"] and outs[6]["came_from"] is None           # home
    print("problems:", bad)
    sys.exit(1 if bad else 0)
