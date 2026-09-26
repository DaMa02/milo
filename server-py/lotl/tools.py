"""The five questions, answered deterministically from the zone. Each returns an Answer
(contracts/answer.schema.json) in which every spoken number is also a fact.

Places are resolved inside the zone only: an unknown, ambiguous or far place becomes a question back.

    python -m lotl.tools     # self-test, from server-py/
"""
import math
import urllib.parse
from collections import Counter
from functools import lru_cache

import networkx as nx
import numpy as np
import osmnx as ox
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points, polygonize, unary_union

from .zone import DEMO_DESTINATION, SNAPSHOT, SPEED, TALENT_GARDEN, fmt, ids, join_and, lc, meta, mins, plural, r10

TOOLS = ("walking_vs_straight_line", "barrier_between", "street_continuity", "independent_connections", "extent")
DEST_NAME = "the destination on viale Isonzo"
ALIASES = {"talent garden": (TALENT_GARDEN, "Talent Garden"), "destination": (DEMO_DESTINATION, DEST_NAME),
           "party": (DEMO_DESTINATION, DEST_NAME), "viale isonzo": (DEMO_DESTINATION, DEST_NAME)}
HERE = {"here", "me", "my position", "where i am", "start"}
# a kind of place instead of a name ("the construction site") means the nearest one of that kind
KIND_WORDS = {"construction site": ("construction site",), "construction": ("construction site",),
              "building site": ("construction site",), "railway": ("railway",), "railway line": ("railway",),
              "train tracks": ("railway",), "tracks": ("railway",), "park": ("park", "garden"), "garden": ("park", "garden"),
              "supermarket": ("supermarket",)}
RAIL_GLOSS = {"Cintura sud di Milano": "the southern belt railway"}
WATER = {"canal": "canal", "river": "river", "stream": "stream"}  # anything else is a "water channel"
GENERIC = {"a footpath", "a pavement", "a crossing", "steps"}
AREAS = ("park", "garden", "construction site", "railway land")
AREA_M, AREA_CAP = 40, 200  # a place for independent_connections: 40 m around both ends of its snapped edge
BOUND_M, BOUND_MIN = 30, 40  # a bounding street runs at least 40 m within 30 m of the edge of the area
BLOCK_SHARE = 0.6  # "takes the block" when the area covers at least 60% of the block around it
MAIN = ("primary", "secondary", "tertiary", "primary_link", "secondary_link", "tertiary_link")


class PlaceError(Exception):
    """A place that cannot be used. str(e) is said to the user, .unknown says what is missing, .facts back its numbers."""

    def __init__(self, msg, unknown, facts=()):
        super().__init__(msg)
        self.unknown, self.facts = unknown, list(facts)


# ---------- small helpers ----------
def _first(n):
    return n[0] if isinstance(n, list) else n


def _cap(s):
    return s[:1].upper() + s[1:]


def _join_or(items):
    items = list(items)
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " or " + items[-1]


def _street_of(label):
    """'the pavement of via Brembo' -> 'via Brembo'."""
    for pre in ("the crossing of ", "the pavement of "):
        if label.startswith(pre):
            return label[len(pre):]
    return label


def _norm(text):
    q = " ".join(str(text).lower().split())
    for art in ("the ", "a ", "an "):
        if q.startswith(art):
            return q[len(art):]
    return q


def _radius(zone):
    return zone.fact("radius", zone.answer_radius, "m", "unknown", [], {"graph": zone.graph_inputs})


def _outside(zone, what="That is"):
    r = fmt(zone.answer_radius)
    return PlaceError(f"{what} outside the area I have mapped: {r} around Talent Garden.",
                      f"The map I answer from ends {r} from Talent Garden.", [_radius(zone)])


def _kind(row):
    if isinstance(row.get("railway"), str):
        return "railway"
    if isinstance(row.get("waterway"), str):
        return "waterway"
    if row.get("landuse") == "construction":
        return "construction site"
    if isinstance(row.get("leisure"), str):
        return row["leisure"]
    if row.get("landuse") == "railway":
        return "railway land"
    return row["shop"] if isinstance(row.get("shop"), str) else "place"


# ---------- places ----------
@lru_cache(maxsize=2)
def _places(zone):
    """Every named street and named feature: name, spoken label, kind, projected geometry, evidence."""
    out = []
    E = zone.E[zone.E["name"].notna() & ~zone.E["footway"].isin(["sidewalk", "crossing"])]  # sidewalks carry stop names
    for name, grp in E.groupby(E["name"].map(_first)):
        out.append({"name": name, "label": lc(name), "kind": "street", "geom": grp.union_all(),
                    "evidence": ids("way", grp["osmid"].tolist())})
    groups = {}
    for (el, i), row in zone.features[zone.features["name"].notna()].iterrows():
        kind, ev = _kind(row), f"{el}/{i}"
        if row.geometry.geom_type == "Point":  # shops: each one is its own place, told apart by its street
            st = row.get("addr:street")
            st = st if isinstance(st, str) else zone.road_name(row.geometry, 60)
            out.append({"name": row["name"], "label": f"{row['name']} on {lc(st)}" if st else row["name"],
                        "kind": kind, "geom": row.geometry, "evidence": [ev]})
        else:
            g = groups.setdefault((row["name"], kind), {"name": row["name"], "label": row["name"], "kind": kind,
                                                       "geoms": [], "evidence": []})
            g["geoms"].append(row.geometry)
            g["evidence"].append(ev)
    for g in groups.values():
        g["geom"] = unary_union(g.pop("geoms"))
        out.append(g)
    return out


def _rank(p):
    t = p["geom"].geom_type
    return 0 if t in ("Polygon", "MultiPolygon") else 1 if p["kind"] == "street" else 2


def _unusable():
    return PlaceError("Which place do you mean?", "The place was not given in a form I can use.")


def _given(spec):
    """A place was actually given: a name, or a coordinate."""
    if isinstance(spec, str):
        return bool(spec.strip())
    return isinstance(spec, dict) and any(spec.get(k) not in (None, "") for k in ("name", "lat", "lon"))


def _find(zone, text, kinds=None, what="a place"):
    """Places matching a name inside the answer area, best first; PlaceError when none, far, or several."""
    if not isinstance(text, str):
        raise _unusable()
    q = _norm(text)
    if not q:
        raise PlaceError("Which place do you mean?", "No place was given.")
    pool = _places(zone)
    hits = [p for p in pool if q in (p["name"].lower(), p["label"].lower())] or \
           [p for p in pool if q in p["name"].lower() or set(q.split()) <= set(p["name"].lower().split())]
    if not hits and q in KIND_WORDS:  # the nearest place of that kind to the reference point
        c = zone.xy(*zone.center)
        near = sorted((p for p in pool if p["kind"] in KIND_WORDS[q] and p["geom"].distance(c) <= zone.answer_radius),
                      key=lambda p: p["geom"].distance(c))
        if near:
            return [near[0]]
    asked = [{"type": "place_query", "value": str(text), "unit": None, "source": "unknown", "evidence": [],
              "inputs": {"query": str(text)}, "data_date": SNAPSHOT, "completeness": "complete"}]
    if not hits:
        raise PlaceError(f"I cannot find {text} on the map of this area. Can you name a street or a place near it?",
                         f"The map of this area has no place called {text}.", asked)
    if kinds and not any(p["kind"] in kinds for p in hits):
        p = hits[0]
        raise PlaceError(f"{_cap(p['label'])} is a {p['kind']}, not {what}.",
                         f"I can answer this for {what} only.", [_place_fact(zone, p)])
    hits = [p for p in hits if not kinds or p["kind"] in kinds]
    c = zone.xy(*zone.center)
    near = sorted((p for p in hits if p["geom"].distance(c) <= zone.answer_radius), key=lambda p: p["geom"].distance(c))
    if not near:
        raise _outside(zone, f"{_cap(hits[0]['label'])} is")
    groups = {}
    for p in near:  # same name = same place (a street and its square), except shops, which differ by street
        groups.setdefault((p["label"] if p["geom"].geom_type == "Point" else p["name"]).lower(), []).append(p)
    if len(groups) > 1:
        opts = [g[0] for g in groups.values()][:3]
        raise PlaceError("Which one do you mean: " + _join_or(p["label"] for p in opts) + "?",
                         "The name fits more than one place on the map.", [_place_fact(zone, p) for p in opts])
    return sorted(next(iter(groups.values())), key=_rank)


def _point(zone, geom):
    """Where a place is: a shop's point, an area's centroid, a street's point nearest to the zone center."""
    c = zone.xy(*zone.center)
    if geom.geom_type == "Point":
        return geom
    if geom.geom_type in ("Polygon", "MultiPolygon") and geom.centroid.distance(c) <= zone.answer_radius:
        return geom.centroid
    return nearest_points(geom, c)[0]


def _resolve(zone, spec, session=None):
    """(lat, lon, name, place or None). None, '' or 'start' is the session origin; 'here' is the walk position if the
    walk has left the start. A place given in a shape that cannot be used is a PlaceError."""
    if isinstance(spec, str):
        spec = {"name": spec}
    spec = {} if spec is None else spec
    if not isinstance(spec, dict) or not isinstance(spec.get("name") or "", str):
        raise _unusable()
    if spec.get("lat") is not None or spec.get("lon") is not None:
        try:
            lat, lon = float(spec["lat"]), float(spec["lon"])
        except (KeyError, TypeError, ValueError):
            raise _unusable() from None
        if not zone.in_answer_area(lat, lon):
            raise _outside(zone)
        road = None if spec.get("name") else zone.road_name(zone.xy(lat, lon), 60)
        return lat, lon, spec.get("name") or (f"a point on {lc(road)}" if road else "that point"), None
    q = _norm(spec.get("name") or "")
    s = session
    if q in HERE and q != "start" and s is not None and s.start and s.node is not None and s.node != s.start[0]:
        lat, lon = zone.LL[s.node]
        return lat, lon, "your position on the walk", None
    if not q or q in HERE:
        o = session.origin if session is not None and session.origin else (*TALENT_GARDEN, "Talent Garden")
        return o[0], o[1], o[2], None
    if q in ALIASES:
        (lat, lon), name = ALIASES[q]
        return lat, lon, name, None
    p = _find(zone, spec["name"])[0]
    lat, lon = zone.ll(_point(zone, p["geom"]))
    return lat, lon, p["label"], p


def resolve_place(zone, spec, session=None):
    """spec {'lat','lon'[,'name']} | {'name'} | None (the session origin) -> (lat, lon, name), or PlaceError."""
    return _resolve(zone, spec, session)[:3]


def _place_fact(zone, p):
    return zone.fact("place", p["label"], None, "map_tag", p["evidence"][:20],
                     {"match": "name in OSM streets and features", **zone.feature_inputs})


def _place_facts(zone, *places):
    out = []
    for lat, lon, name, p in places:
        if p:
            out.append(zone.fact("place", name, None, "map_tag", p["evidence"][:20],
                                 {"point": [lat, lon], "match": "name in OSM streets and features", **zone.feature_inputs}))
        elif any(ch.isdigit() for ch in name):  # a name the user gave with a coordinate
            out.append(zone.fact("place", name, None, "unknown", [], {"point": [lat, lon]}))
    return out


def _name_facts(zone, names, inputs):
    """Street names with digits in them are numbers too: back each with its ways."""
    out = []
    for n in names:
        p = next((p for p in _places(zone) if p["label"] == n), None)
        if p and any(ch.isdigit() for ch in n):
            out.append(zone.fact("street_name", n, None, "map_tag", p["evidence"][:10], inputs))
    return out


def _pair(zone, session, params):
    if not isinstance(params.get("to"), (str, dict, type(None))):
        raise _unusable()
    if not _given(params.get("to")):
        raise PlaceError("Which place do you mean?", "No destination was given.")
    a, b = _resolve(zone, params.get("from"), session), _resolve(zone, params["to"], session)
    if a[:2] == b[:2]:
        same = f"Both places are {a[2]}." if a[2] == b[2] else f"{_cap(a[2])} and {b[2]} are the same place on the map."
        raise PlaceError(same + " Which other place do you mean?", "The two places given are the same.")
    return a, b


@lru_cache(maxsize=2)
def _rail_places(zone):
    return zone.railway_places()


# ---------- barriers on the straight line ----------
def _barriers(zone, a, b):
    """Railways, water and construction sites crossing the straight line a-b, railway first, one per named feature."""
    line = LineString([zone.xy(a[0], a[1]), zone.xy(b[0], b[1])])
    out = {}
    for (el, i), row in zone.features[zone.features.intersects(line)].iterrows():
        kind = _kind(row)
        if kind not in ("railway", "waterway", "construction site") or str(row.get("tunnel")) in ("yes", "culvert"):
            continue
        name = row["name"] if isinstance(row.get("name"), str) else None
        e = out.setdefault((kind, name), {"kind": kind, "name": name, "evidence": [], "wt": row.get("waterway")})
        e["evidence"].append(f"{el}/{i}")
    res = sorted(out.values(), key=lambda e: ("railway", "waterway", "construction site").index(e["kind"]))
    for e in res:
        n = e["name"]
        if e["kind"] == "railway":
            e["long"] = f"{RAIL_GLOSS[n]}, {n}" if n in RAIL_GLOSS else f"the {n} railway" if n else "a railway"
            e["short"] = RAIL_GLOSS.get(n) or e["long"]
        elif e["kind"] == "waterway":
            wt = WATER.get(e["wt"], "water channel")
            e["long"] = e["short"] = f"the {n} {wt}" if n else f"a {wt}"
        else:
            e["long"] = e["short"] = f"the construction site {n}" if n else "a construction site"
    return res


def _barrier_facts(zone, bars, a, b):
    line_in = {**zone.feature_inputs, "line": [[a[0], a[1]], [b[0], b[1]]]}
    return [zone.fact("barrier", e["name"] or e["long"], None, "map_tag", e["evidence"], line_in) for e in bars]


# ---------- 1 walking vs straight line ----------
def _walking(zone, session, params):
    a, b = _pair(zone, session, params)
    A, B = zone.snap(a[0], a[1]), zone.snap(b[0], b[1])
    oa, ob = r10(A["off"]), r10(B["off"])
    route_in = {"graph": zone.graph_inputs, "origin": [a[0], a[1]], "destination": [b[0], b[1]],
                "speed_m_per_min": SPEED, "origin_snap_m": oa, "destination_snap_m": ob}
    crow = r10(ox.distance.great_circle(a[0], a[1], b[0], b[1]))
    facts = _place_facts(zone, a, b)
    if crow == 0:
        return f"{_cap(a[2])} and {b[2]} are at the same spot on the map.", facts, []
    url = "https://www.openstreetmap.org/directions?route=" + urllib.parse.quote(f"{a[0]},{a[1]};{b[0]},{b[1]}")
    facts.append(zone.fact("straight_line_distance", crow, "m", "computed", [url],
                           {"from": [a[0], a[1]], "to": [b[0], b[1]], "method": "great circle"}))
    m, path = zone.route(zone.G, A, B)
    if m is None:
        return (f"{fmt(crow)} in a straight line, but I find no walking route between {a[2]} and {b[2]} on the map. "
                "A way may exist outside the mapped area.", facts, ["The map shows no walking connection between them."])
    walk, ev = r10(m), zone.path_ways(path) or ids("node", [A["u"], A["v"]])
    ratio = round(walk / crow, 1)
    facts += [zone.fact("walking_distance", walk, "m", "computed", ev, route_in),
              zone.fact("walking_time", mins(m), "min", "computed", ev, route_in),
              zone.fact("detour_ratio", ratio, "ratio", "computed", ev, route_in)]
    bar = _barriers(zone, a, b)[:1] if ratio >= 1.5 else []
    xing = _rail_crossed(zone, A, B, path)
    text = f"{fmt(crow)} in a straight line, {'but' if ratio >= 1.5 else 'and'} {fmt(walk)} on foot, about {plural(mins(m), 'minute')}"
    text += f": {bar[0]['short']} is in between." if bar else "."
    if xing:
        it = "it" if bar and bar[0]["kind"] == "railway" else "the railway"
        text += f" On foot you cross {it} on {join_and(p['name'] for p in xing)}."
    text += f" The walk is {ratio:g} times the straight-line distance." if ratio >= 1.1 else \
        " The walk is about as long as the straight line."
    facts += _barrier_facts(zone, bar, a, b)
    facts += [zone.fact("railway_crossing_on_route", p["name"], None, "computed",
                        [w for w in ev if w in p["evidence"]] or p["evidence"], route_in) for p in xing]
    facts += [zone.fact("snap_distance", oa, "m", "computed", ids("node", [A["u"], A["v"]]), route_in),
              zone.fact("snap_distance", ob, "m", "computed", ids("node", [B["u"], B["v"]]), route_in)]
    off = [f"{fmt(o)} from {n}" for o, n in ((oa, a[2]), (ob, b[2])) if o]
    return text, facts, [f"Distances start and end at the nearest mapped footpath: {join_and(off)}."] if off else []


def _rail_crossed(zone, A, B, path):
    """Railway crossing places the walked line itself crosses, snapped access pieces included."""
    rail = zone.railway()
    if rail is None or rail.empty:
        return []
    ends = [LineString([zone.nxy(s["u"]), zone.nxy(s["v"])]).interpolate(s["su"]) for s in (A, B)]
    line = LineString([ends[0]] + [zone.nxy(n) for n in path] + [ends[1]])
    hit = line.intersection(_rail_union(zone))
    return [p for p in _rail_places(zone) if not hit.is_empty and any(q.distance(hit) < 40 for q in p["pts"])]


@lru_cache(maxsize=2)
def _rail_union(zone):
    return zone.railway().union_all()


# ---------- 2 barrier between ----------
def _barrier(zone, session, params):
    a, b = _pair(zone, session, params)
    bars = _barriers(zone, a, b)
    facts = _place_facts(zone, a, b) + _barrier_facts(zone, bars, a, b)
    if not bars:
        return (f"No. The map shows no railway, water or construction site on the straight line between {a[2]} and {b[2]}.",
                facts, ["Only railways, water and construction sites are checked; buildings, fences and walls are not."])
    longs = [e["long"] for e in bars]
    if len(longs) > 1 and "," in longs[-2]:  # "the southern belt railway, Cintura sud di Milano, and ..."
        longs[-2] += ","
    text, unknown = "Yes. In a straight line you would cross " + join_and(longs) + ".", []
    if any(e["kind"] == "railway" for e in bars):
        pa, r = zone.xy(a[0], a[1]), fmt(zone.answer_radius)
        places = sorted(({**p, "d": r10(min(q.distance(pa) for q in p["pts"]))} for p in _rail_places(zone)),
                        key=lambda p: p["d"])
        if places:
            text += (f" Within {r} of Talent Garden the railway can be crossed on foot in {plural(len(places), 'place')}: "
                     + " and ".join(f"{p['phrase']}, {fmt(p['d'])} away in a straight line" for p in places) + ".")
        else:
            text += f" Within {r} of Talent Garden there is no place to cross the railway on foot."
        facts.append(zone.fact("railway_crossing_places", len(places), "count", "computed",
                               [e for p in places for e in p["evidence"]] or bars[0]["evidence"],
                               {"graph": zone.graph_inputs, "railway": bars[0]["name"], "cluster_m": 40,
                                "radius_m": zone.answer_radius}, "unknown"))
        facts += [zone.fact("railway_crossing_distance", p["d"], "m", "computed", p["evidence"],
                            {"graph": zone.graph_inputs, "from": [a[0], a[1]], "method": "straight line to nearest point",
                             "place": p["name"]}) for p in places]
        facts.append(_radius(zone))
        unknown.append(f"Crossings farther than {r} from Talent Garden are not counted, so there may be more.")
    sites = sum(e["kind"] == "construction site" for e in bars)
    if sites:
        unknown.append("The map does not say whether the construction site blocks any pavement." if sites == 1 else
                       "The map does not say whether the construction sites block any pavement.")
    return text, facts, unknown


# ---------- 3 street continuity ----------
@lru_cache(maxsize=2)
def _nodes(zone):
    ns = list(zone.G.nodes)
    xy = np.array([(zone.G.nodes[n]["x"], zone.G.nodes[n]["y"]) for n in ns])
    return ns, xy, {n: i for i, n in enumerate(ns)}


def _near(zone, n, r):
    ns, xy, idx = _nodes(zone)
    d = np.hypot(*(xy - xy[idx[n]]).T)
    return [ns[i] for i in np.flatnonzero(d <= r)]


def _street(zone, p):
    """A street's ends, dead ends, length and what its ends connect to, with the completeness note."""
    name = p["name"]
    edges = [(u, v, d) for u, v, d in zone.G.edges(data=True) if d.get("footway") not in ("sidewalk", "crossing")
             and name in (d.get("name") if isinstance(d.get("name"), list) else [d.get("name")])]
    # a service lane that carries the street's name is not the street itself
    S = nx.Graph()
    for u, v, d in [e for e in edges if e[2].get("highway") != "service"] or edges:
        if not S.has_edge(u, v) or S[u][v]["length"] > d["length"]:
            S.add_edge(u, v, length=d["length"])
    ends = [n for n in S if S.degree(n) == 1]
    # degree 1 in the walk graph is not enough: where a road's pavements are mapped apart, the roadway stops
    # but the pavements go on, and there a junction lies within 30 m
    junctions = {n: [m for m in _near(zone, n, 30) if m not in S and zone.degree(m) >= 3] for n in ends}
    loose = [n for n in ends if zone.G.nodes[n].get("noexit") != "yes" and n not in zone.BOUNDARY
             and zone.degree(n) == 1 and not junctions[n]]
    # a main road does not end in town: its roadway stops where the map allows no walking on it
    opened = [n for n in loose if _first(zone.edata(n, next(iter(S[n]))).get("highway")) in MAIN]
    dead = [n for n in ends if zone.G.nodes[n].get("noexit") == "yes" or (n in loose and n not in opened)]
    names = set()
    for n in ends:
        if n in dead:
            continue
        at = [n] if zone.degree(n) > 1 else junctions[n]
        names |= {_street_of(zone.edge_label(x, y)) for x in at for y in zone.G[x] if not S.has_edge(x, y)}
    names = sorted(names - GENERIC - {p["label"]}, key=str.lower)
    metres = _length(zone, S)
    ev = ids("way", [zone.edata(u, v)["osmid"] for u, v in S.edges])
    st_in = {"graph": zone.graph_inputs, "street": name, "method": "street ends checked for other walkable links; "
             "length: the longer of the walk along its longest piece and the straight line between its farthest points"}
    note, nfacts, comp, unk = "", [], "complete", []
    if any(n in zone.BOUNDARY for n in ends):
        note, comp = " One end reaches the edge of the downloaded map, so this may not be the whole story.", "unknown"
        unk = ["One end of the street is at the edge of the downloaded map."]
    elif any(not zone.in_answer_area(*zone.LL[n]) for n in ends):
        note, comp = (f" One end is more than {fmt(zone.answer_radius)} from Talent Garden, beyond the area I answer for, "
                      "so this may not be the whole story."), "unknown"
        nfacts, unk = [_radius(zone)], ["One end of the street is beyond the area I answer for."]
    if opened:
        unk.append("In places the map allows no walking on the roadway; there I count the street as going on "
                   "along its pavements.")
    conn = (join_and(names) if len(names) <= 5 else ", ".join(names[:5]) + " and other streets") if names \
        else "footpaths only"
    names = names[:5]
    return {"label": p["label"], "ends": ends, "dead": dead, "names": names, "conn": conn, "metres": metres, "length": r10(metres),
            "ev": ev, "inputs": st_in, "note": note, "note_facts": nfacts, "comp": comp, "unk": unk,
            "facts": [_place_fact(zone, p)] + nfacts + _name_facts(zone, names, st_in)}


def _length(zone, S):
    """A street's length, each carriageway once: the longer of its longest walkable piece and its straight span."""
    if not S:
        return 0
    ends = [n for n in S if S.degree(n) == 1]
    if not ends and all(S.degree(n) == 2 for n in S):
        return S.size(weight="length")  # a loop
    walk = max(max(nx.single_source_dijkstra_path_length(S, n, weight="length").values()) for n in (ends or S))
    xy = np.array([(zone.G.nodes[n]["x"], zone.G.nodes[n]["y"]) for n in S])
    span = max(np.hypot(*(xy - q).T).max() for q in xy)
    return max(walk, float(span))


def _continuity(zone, session, params):
    if not params.get("street"):
        raise PlaceError("Which street do you mean?", "No street was given.")
    st = _street(zone, _find(zone, params["street"], {"street"}, "a street")[0])
    s, L, dead, conn = st["label"], fmt(st["length"]), st["dead"], st["conn"]
    if not st["ends"]:
        text = f"On foot, {s} forms a loop: it is about {L} long."
    elif dead:
        d = "a dead end" if len(dead) == 1 else f"{len(dead)} dead ends"
        rest = f"its other ends connect to {conn}" if len(dead) < len(st["ends"]) else "no end connects to another way"
        text = f"On foot, {s} does not go through: it is about {L} long, it has {d}, and {rest}."
    else:
        text = f"On foot, {s} goes through: it is about {L} long, and its ends connect to {conn}."
    text += st["note"]
    facts = [zone.fact("street_continuity", "ends" if dead else "goes_through", None, "computed",
                       ids("node", st["ends"]) + st["ev"], st["inputs"], st["comp"]),
             zone.fact("street_length", st["length"], "m", "computed", st["ev"], st["inputs"])] + st["facts"]
    if len(dead) > 1:
        facts.append(zone.fact("dead_ends", len(dead), "count", "computed", ids("node", dead), st["inputs"], st["comp"]))
    unknown = st["unk"] \
        + (["The map does not mark the dead end as such: the walkable way simply stops there."]
           if any(zone.G.nodes[n].get("noexit") != "yes" for n in dead) else []) \
        + ["The map does not say whether the street has pavements on both sides."]
    return text, facts, unknown


# ---------- 4 independent connections ----------
@lru_cache(maxsize=2)
def _junctions(zone):
    """The walk graph with each crossing merged into its junction, so both pavements and the crossing count once."""
    uf = nx.utils.UnionFind(zone.G.nodes)
    for u, v, d in zone.G.edges(data=True):
        if d.get("footway") == "crossing":
            uf.union(u, v)
    for pl in zone.railway_places(radius=math.inf):  # a railway bridge, its pavements and the underpass beside it: one passage
        ends = [n for r in pl["rows"] for n in r.name[:2]]
        uf.union(*ends)
    rep = {n: uf[n] for n in zone.G.nodes}
    return nx.Graph((rep[u], rep[v]) for u, v in zone.G.edges() if rep[u] != rep[v]), rep


def _area(zone, s, rep):
    """Junctions within 40 m on foot of either end of the snapped edge, nearest first, capped."""
    near = {}
    for n in (s["u"], s["v"]):
        for m, d in nx.single_source_dijkstra_path_length(zone.G, n, cutoff=AREA_M, weight="length").items():
            near[m] = min(d, near.get(m, d))
    return {rep[m] for m in sorted(near, key=near.get)[:AREA_CAP]}


def _junction_label(zone, nodes):
    ways = {w for n in nodes for m in zone.G[n] for w in zone.path_ways([n, m])}
    for pl in _rail_places(zone):
        if ways & set(pl["evidence"]):
            return pl["name"]
    c = Counter(_street_of(zone.edge_label(n, m)) for n in nodes for m in zone.G[n])
    names = [s for s, _ in c.most_common() if s not in GENERIC][:2]
    return "a footpath" if not names else names[0] if len(names) == 1 else f"the corner of {names[0]} and {names[1]}"


def _connections(zone, session, params):
    a, b = _pair(zone, session, params)
    A, B = zone.snap(a[0], a[1]), zone.snap(b[0], b[1])
    Q, rep = _junctions(zone)
    SA, TB = _area(zone, A, rep), _area(zone, B, rep)
    facts = _place_facts(zone, a, b)
    if SA & TB:
        return (f"{_cap(a[2])} and {b[2]} are practically the same place on the map, so there are no separate ways "
                "between them to count."), facts, []
    H = Q.copy()
    H.add_edges_from(("S", n) for n in SA)
    H.add_edges_from(("T", n) for n in TB)
    cut = nx.minimum_node_cut(H, "S", "T") if nx.has_path(H, "S", "T") else set()
    k = len(cut)  # Menger: the size of a minimum cut is the node connectivity
    H.remove_nodes_from(cut)
    bset = {rep[n] for n in zone.BOUNDARY}
    comp = "complete" if not nx.node_connected_component(H, "S") & bset or not nx.node_connected_component(H, "T") & bset \
        else "unknown"
    members = {}
    for n, r in rep.items():
        if r in cut:
            members.setdefault(r, []).append(n)
    x, y = a[2], b[2]
    labels = [_junction_label(zone, ns) for ns in members.values()] if k <= 2 else []
    if k == 0:
        text = f"I find no walking way between {x} and {y} on the map."
    elif k == 1:
        text = f"There is only 1 way between {x} and {y}: every route passes through {labels[0]}."
    elif k == 2 and labels[0] == labels[1]:
        text = (f"There are 2 independent ways between {x} and {y}, sharing no junction: "
                f"both pass along {labels[0]}, one from each end.")
    elif k == 2:
        text = (f"There are 2 independent ways between {x} and {y}, sharing no junction: "
                f"one through {labels[0]}, the other through {labels[1]}.")
    else:
        text = f"There are {k} independent ways between {x} and {y}, sharing no junction."
    if comp == "unknown":
        text += " A way outside the mapped area could add more." if k else " A way may exist outside the mapped area."
    c_in = {"graph": zone.graph_inputs, "from": [a[0], a[1]], "to": [b[0], b[1]], "area_m": AREA_M,
            "method": "minimum node cut between the two areas, crossings merged into their junction"}
    ev = ids("node", sorted(n for ns in members.values() for n in ns))[:20] or ids("node", [A["u"], A["v"], B["u"], B["v"]])
    facts += [zone.fact("independent_ways", k, "count", "computed", ev, c_in, comp)] + _name_facts(zone, labels, c_in)
    unknown = (["Ways that leave the mapped area are not counted."] if comp == "unknown" else []) \
        + ["The pavements on the two sides of a street count as one way only where a mapped crossing joins them."]
    return text, facts, unknown


# ---------- 5 extent ----------
@lru_cache(maxsize=2)
def _blocks(zone):
    """The blocks the named roads enclose (where pavements are mapped apart the ring may stay open: no block)."""
    faces = list(polygonize(unary_union(list(zone.ROADS.geometry))))
    return faces, shapely.STRtree(faces)


def _extent(zone, session, params):
    q = params.get("place") or params.get("street")
    if not q:
        raise PlaceError("Which place do you mean?", "No place was given.")
    p = _find(zone, q, AREAS + ("street",), "a park, a garden, a construction site or a street")[0]
    if p["kind"] == "street":
        st = _street(zone, p)
        text = (f"{_cap(st['label'])} is about {fmt(st['length'])} long, about {plural(mins(st['metres']), 'minute')} "
                f"on foot; its ends connect to {st['conn']}.{st['note']}")
        facts = [zone.fact("street_length", st["length"], "m", "computed", st["ev"], st["inputs"], st["comp"]),
                 zone.fact("street_walk_time", mins(st["metres"]), "min", "computed", st["ev"],
                           {**st["inputs"], "speed_m_per_min": SPEED}, st["comp"])] + st["facts"]
        return text, facts, st["unk"] + ["The map does not say whether the street has pavements on both sides."]
    geom, name = p["geom"], p["label"]
    spoken = f"the construction site {name}" if p["kind"] == "construction site" else name
    ring = geom.boundary.buffer(BOUND_M)
    R = zone.ROADS[zone.ROADS.intersects(ring)]
    streets = R.assign(n=R["name"].map(_first), near=R.geometry.intersection(ring).length)
    by = streets.groupby("n")["near"].sum().sort_values(ascending=False)
    bound = [n for n, m in by.items() if m >= BOUND_MIN][:4]
    cs = list(geom.minimum_rotated_rectangle.exterior.coords)
    side = max(Point(cs[i]).distance(Point(cs[i + 1])) for i in range(len(cs) - 1))
    perim = (geom if geom.geom_type == "Polygon" else geom.convex_hull).exterior.length
    labels = [lc(n) for n in bound]
    faces, tree = _blocks(zone)
    block = next((faces[i] for i in tree.query(geom.representative_point(), predicate="within")), None)
    fills = block is not None and geom.area >= BLOCK_SHARE * block.area
    where = f"{'takes the block between' if fills else 'lies along'} {join_and(labels)}" if len(labels) > 1 else \
        f"lies along {labels[0]}" if labels else "is not bounded by a named street on the map"
    text = (f"{_cap(spoken)} {where}; its longest side is about {plural(mins(side), 'minute')} on foot, {fmt(r10(side))}; "
            f"walking all around it takes about {plural(mins(perim), 'minute')}.")
    e_in = {"place": name, "method": "minimum rotated rectangle and outline of the OSM area",
            "speed_m_per_min": SPEED, "snapshot": SNAPSHOT}
    b_in = {"place": name, "buffer_m": BOUND_M, "min_length_m": BOUND_MIN, "snapshot": SNAPSHOT}
    facts = [_place_fact(zone, p)]
    facts += [zone.fact("bounding_street", lc(n), None, "computed", ids("way", streets[streets["n"] == n]["osmid"].tolist())[:10],
                        b_in) for n in bound]
    facts += [zone.fact("longest_side", r10(side), "m", "computed", p["evidence"], e_in),
              zone.fact("longest_side_time", mins(side), "min", "computed", p["evidence"], e_in),
              zone.fact("walk_around_time", mins(perim), "min", "computed", p["evidence"], e_in)]
    unknown = ["The map does not say where the entrances are."]
    if p["kind"] == "construction site":
        unknown.append("The map does not say whether the construction site blocks any pavement.")
    return text, facts, unknown


_RUN = dict(zip(TOOLS, (_walking, _barrier, _continuity, _connections, _extent)))


def ask(zone, session, tool, params, question):
    """Run one tool and return an Answer. A place that cannot be used is answered with a question back."""
    if tool not in _RUN:
        raise ValueError(f"unknown tool {tool!r}; expected one of {', '.join(TOOLS)}")
    params = dict(params or {})
    for k in ("place", "street"):  # the contract's place shape {name} is accepted wherever a bare name is
        if isinstance(params.get(k), dict) and isinstance(params[k].get("name"), str):
            params[k] = params[k]["name"]
    try:
        text, facts, unknown = _RUN[tool](zone, session, params)
    except PlaceError as e:
        text, facts, unknown = str(e), e.facts, [e.unknown]
    return {"question": question or tool.replace("_", " "), "lang": "en", "tool": tool, "text": text,
            "facts": facts, "unknown": unknown, "meta": meta()}


if __name__ == "__main__":
    import json
    import pathlib
    import sys
    import time

    from jsonschema import Draft7Validator

    from .session import Session
    from .zone import Zone

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "contracts"))
    import validate as V

    def problems(doc):
        out = [f"{'/'.join(map(str, e.absolute_path))}: {e.message}"
               for e in Draft7Validator(V.SCHEMAS["answer"], registry=V.REGISTRY).iter_errors(doc)]
        backed = V.backed_numbers(doc)
        return out + [f"number {t!r} in {k} has no fact" for k, v in V.walk(doc) if k in V.SPOKEN and isinstance(v, str)
                      for t in V.NUM.findall(v) if V.norm(t) not in backed]

    z = Zone()
    s = Session(origin=(*TALENT_GARDEN, "Talent Garden"))
    DEST = {"name": "the party"}
    cases = [
        ("walking_vs_straight_line", {"to": DEST}, "Is it close to here?"),
        ("walking_vs_straight_line", {"from": {"name": "via Brembo"}, "to": {"name": "Giardino Franca Helg"}}, "How far?"),
        ("barrier_between", {"to": DEST}, "Is there anything between here and viale Isonzo?"),
        ("barrier_between", {"to": {"name": "via Brembo"}}, "Anything between here and via Brembo?"),
        ("street_continuity", {"street": "Via Arcivescovo Calabiana"}, "Does via Calabiana go through?"),
        ("street_continuity", {"street": "corso Lodi"}, "Does corso Lodi go through?"),
        ("independent_connections", {"from": {"name": "talent garden"}, "to": DEST}, "How many ways are there?"),
        ("independent_connections", {"to": {"lat": 45.4452, "lon": 9.2045}}, "How many ways to there?"),
        ("extent", {"place": "Villaggio Olimpico 2026 - Parco Porta Romana"}, "How big is the construction site?"),
        ("extent", {"place": "Giardino Calabiana"}, "How big is the garden?"),
        ("extent", {"place": "via Brembo"}, "How long is via Brembo?"),
        ("walking_vs_straight_line", {"to": {"name": "calabiana"}}, "How far is Calabiana?"),
        ("walking_vs_straight_line", {"to": {"name": "Piazza San Marco"}}, "How far is Piazza San Marco?"),
        ("barrier_between", {"to": {"lat": 45.4600, "lon": 9.1900}}, "Anything between here and there?"),
        ("street_continuity", {"street": "Giardino Franca Helg"}, "Does it go through?"),
        ("extent", {"place": "Esselunga"}, "How big is Esselunga?"),
    ]
    docs = []
    for tool, params, q in cases:
        t = time.time()
        doc = json.loads(json.dumps(ask(z, s, tool, params, q)))  # also proves it is plain JSON
        bad = problems(doc)
        print(f"{'ok  ' if not bad else 'FAIL'} {tool} ({time.time() - t:.2f} s): {doc['text']}")
        for u in doc["unknown"]:
            print("       unknown:", u)
        for b in bad:
            print("       !!", b)
        assert not bad
        docs.append(doc)
    v = {f["type"]: f["value"] for f in docs[0]["facts"]}
    assert (v["straight_line_distance"], v["walking_distance"], v["walking_time"]) == (350, 1080, 14), v
    assert docs[0]["text"] == json.loads((pathlib.Path(V.HERE) / "fixtures/answer.detour-ratio.json").read_text())["text"]
    assert docs[11]["text"].startswith("Which one do you mean"), docs[11]["text"]
    assert docs[12]["text"].startswith("I cannot find"), docs[12]["text"]
    assert "outside the area I have mapped" in docs[13]["text"], docs[13]["text"]
    assert resolve_place(z, None, s) == (*TALENT_GARDEN, "Talent Garden")
    try:
        ask(z, s, "no_such_tool", {}, "?")
        raise AssertionError("unknown tool accepted")
    except ValueError:
        pass
    print(f"{len(cases)} answers valid")
