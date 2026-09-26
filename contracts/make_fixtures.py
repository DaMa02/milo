"""Regenerate contracts/fixtures/*.json from real data: the cached OSM walk graph of the demo zone,
Overpass features and Transitous v6. Mac only (needs the osmnx cache in $TOOLS).

    source "$HOME/Desktop/hackaton BAINSA/tools/env.sh"
    python contracts/make_fixtures.py && python contracts/validate.py

Text is built from the facts with fixed English templates, under the speaking rules in docs/one-pager.md.
"""
import json, math, os, pathlib, urllib.parse, urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import LineString, Point

TOOLS = pathlib.Path(os.environ.get("TOOLS", pathlib.Path.home() / "Desktop/hackaton BAINSA/tools"))
OUT = pathlib.Path(__file__).resolve().parent / "fixtures"
TRANSIT_CACHE = TOOLS / "py/transit-cache"
ox.settings.cache_folder = str(TOOLS / "py/osmnx-cache")
ox.settings.log_console = False
ox.settings.useful_tags_node += ["crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving", "noexit"]
ox.settings.useful_tags_way += ["footway", "layer", "crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving"]

ORIGIN = (45.44386, 9.20808)  # Talent Garden Calabiana
DEST = (45.44658, 9.20584)    # demo destination on viale Isonzo
R = 800                       # graph radius around the origin, metres
DATE = "2026-09-26"
DEPART = "2026-09-26T16:00:00Z"  # 18:00 in Milan
SPEED = 80                       # metres per walking minute (one-pager, speaking rule 1)
UA = "bainsa-hackathon-2026/0.1 (maglionicodaniele@gmail.com)"
GRAPH = {"center": list(ORIGIN), "dist_m": R, "network_type": "walk", "simplify": False,
         "snap": "nearest_edge", "snapshot": DATE, "source": "OpenStreetMap via Overpass, osmnx " + ox.__version__}
META = {"mode": "offline", "cache": "hit", "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
TOLERANCE = {"min": 5, "pct": 25}
XING_M = 10  # an OSM crossing node this close to a Transitous walking trace is on that trace

# ---------- graph ----------
G0 = ox.graph_from_point(ORIGIN, dist=R, network_type="walk", simplify=False)
LL = {n: (round(d["y"], 6), round(d["x"], 6)) for n, d in G0.nodes(data=True)}
G = ox.convert.to_undirected(ox.project_graph(G0))
CRS = G.graph["crs"]
TO_XY = Transformer.from_crs(4326, CRS, always_xy=True).transform
E = ox.convert.graph_to_gdfs(G, nodes=False)
FOOT = ("footway", "path", "pedestrian", "steps", "cycleway")
ROADS = E[E["name"].notna() & ~E["highway"].astype(str).str.contains("|".join(FOOT))]
# osmnx counts streets per node before truncating the graph: fewer neighbours now = the node sits on the cut
BOUNDARY = {n for n, d in G.nodes(data=True) if len(set(G[n])) < d.get("street_count", 0)}


def xy(lat, lon):
    return Point(*TO_XY(lon, lat))


def nxy(n):
    return Point(G.nodes[n]["x"], G.nodes[n]["y"])


def edata(u, v):
    return min(G[u][v].values(), key=lambda d: d["length"])


def ids(kind, vals):
    out = []
    for v in vals:
        for i in (v if isinstance(v, list) else [v]):
            if f"{kind}/{i}" not in out:
                out.append(f"{kind}/{i}")
    return out


def r10(m):
    return int(round(m / 10.0) * 10)


def mins(m):
    return max(1, int(round(m / SPEED)))


def plural(n, word):
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def fmt(m):
    return f"{m:,} m"


def bearing(p, q):
    return math.degrees(math.atan2(q.x - p.x, q.y - p.y)) % 360


def clock(rel):
    h = int(round((rel % 360) / 30.0)) % 12
    return {0: "ahead", 3: "right", 6: "behind", 9: "left"}.get(h, f"at {h} o'clock")


def fact(type_, value, unit, source, evidence, inputs, completeness="complete"):
    return {"type": type_, "value": value, "unit": unit, "source": source, "evidence": evidence,
            "inputs": inputs, "data_date": DATE, "completeness": completeness}


def road_name(geom, within=30):
    d = ROADS.distance(geom.interpolate(0.5, normalized=True) if geom.geom_type == "LineString" else geom)
    if d.min() > within:
        return None
    n = ROADS.loc[d.idxmin()]["name"]
    return n[0] if isinstance(n, list) else n


def lc(name):  # "Via Brembo" -> "via Brembo", as spoken mid-sentence
    return name[0].lower() + name[1:] if name and name.split()[0] in ("Via", "Viale", "Corso", "Piazza", "Piazzale", "Largo") else name


def edge_label(u, v):
    d = edata(u, v)
    geom = LineString([nxy(u), nxy(v)])
    if d.get("footway") == "crossing":
        n = road_name(geom, 20)
        return f"the crossing of {lc(n)}" if n else "a crossing"
    if isinstance(d.get("name"), (str, list)):
        return lc(d["name"][0] if isinstance(d["name"], list) else d["name"])
    if d.get("footway") == "sidewalk":
        n = road_name(geom)
        return f"the pavement of {lc(n)}" if n else "a pavement"
    return "a footpath"


# ---------- crossings ----------
def crossing_tags(n):
    t = dict(G.nodes[n])
    for m in G[n]:
        w = edata(n, m)
        if w.get("footway") == "crossing":
            for k in ("crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving"):
                if isinstance(w.get(k), str):
                    t.setdefault(k, w[k])
    return t


def is_crossing(n):
    h = G.nodes[n].get("highway")
    return h == "crossing" or (h == "traffic_signals" and any(edata(n, m).get("footway") == "crossing" for m in G[n]))


def classify(n):
    t = crossing_tags(n)
    c, cs = t.get("crossing"), t.get("crossing:signals")
    if cs == "yes" or c == "traffic_signals" or t.get("highway") == "traffic_signals":
        sig = "yes"
    elif cs == "no" or c in ("uncontrolled", "marked", "zebra", "unmarked", "no", "informal"):
        sig = "no"
    else:
        sig = "unknown"
    s = t.get("traffic_signals:sound")
    sound = "no" if sig == "no" else "yes" if s in ("yes", "walk") else "no" if s in ("no", "locate") else "unknown"
    tp = t.get("tactile_paving")
    tactile = "yes" if tp == "yes" else "no" if tp in ("no", "incorrect") else "unknown"
    return {"osm_id": f"node/{n}", "signals": sig, "sound": sound, "tactile_paving": tactile}


CROSSINGS = {n: classify(n) for n in G.nodes if is_crossing(n)}


# ---------- routing ----------
def snap(lat, lon):
    p = xy(lat, lon)
    d = E.distance(p)
    (u, v, _k) = d.idxmin()
    g = LineString([nxy(u), nxy(v)])
    s = g.project(p)
    return {"u": u, "v": v, "su": s, "sv": g.length - s, "off": d.min(), "node": u if s <= g.length / 2 else v}


def route(H, a, b):
    """Shortest walk between two snapped points on graph H: (metres incl. access, node path)."""
    H = nx.Graph(H)
    for name, s in (("A", a), ("B", b)):
        for n, w in ((s["u"], s["su"]), (s["v"], s["sv"])):
            if n in H:
                H.add_edge(name, n, length=w)
    try:
        path = nx.shortest_path(H, "A", "B", weight=lambda u, v, d: d.get("w", d["length"]))
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None, None
    return nx.path_weight(H, path, "length") + a["off"] + b["off"], path[1:-1]


def without(pred):
    return G.subgraph([n for n in G.nodes if not (n in CROSSINGS and pred(CROSSINGS[n]))])


def penalised(pred, cost=10_000):
    """Avoid when possible: each crossing matching pred costs 10 km, so the route has the fewest of them, then is shortest."""
    H = nx.Graph()
    for u, v, d in G.edges(data=True):
        w = d["length"] + sum(cost / 2 for n in (u, v) if n in CROSSINGS and pred(CROSSINGS[n]))
        if not H.has_edge(u, v) or H[u][v]["w"] > w:
            H.add_edge(u, v, length=d["length"], w=w)
    return H


def path_crossings(path):
    return [CROSSINGS[n] for n in path if n in CROSSINGS]


def path_ways(path):
    return ids("way", [edata(u, v)["osmid"] for u, v in zip(path, path[1:]) if G.has_edge(u, v)])


def status(kind, xs):
    if kind == "unsignalled_crossings":
        bad, unk = [x for x in xs if x["signals"] == "no"], [x for x in xs if x["signals"] == "unknown"]
    else:  # signals_without_sound
        sig = [x for x in xs if x["signals"] != "no"]
        bad = [x for x in sig if x["signals"] == "yes" and x["sound"] == "no"]
        unk = [x for x in sig if x not in bad and "unknown" in (x["signals"], x["sound"])]
    return ("violated" if bad else "unknown" if unk else "satisfied"), bad, unk


A, B = snap(*ORIGIN), snap(*DEST)
ROUTE_IN = {"graph": GRAPH, "origin": list(ORIGIN), "destination": list(DEST), "speed_m_per_min": SPEED,
            "origin_snap_m": round(A["off"]), "destination_snap_m": round(B["off"])}
crow = r10(ox.distance.great_circle(*ORIGIN, *DEST))
walk_m, walk_path = route(G, A, B)
walk = r10(walk_m)

# ---------- barriers ----------
FEATS = ox.features_from_point(ORIGIN, {"railway": ["rail", "light_rail"], "waterway": True,
                                        "landuse": ["railway", "construction"]}, dist=R).to_crs(CRS)
FEAT_IN = {"center": list(ORIGIN), "dist_m": R, "tags": {"railway": ["rail", "light_rail"], "waterway": True,
           "landuse": ["railway", "construction"]}, "snapshot": DATE}
line = LineString([xy(*ORIGIN), xy(*DEST)])
between = FEATS[FEATS.intersects(line)]
rail = FEATS[FEATS["railway"].notna()]
rail_u = rail.union_all()
rail_name = rail["name"].dropna().mode()[0]
rail_ids = ids("way", [i[1] for i in rail.index])
constr = between[between["landuse"] == "construction"]
constr_name, constr_id = constr.iloc[0]["name"], f"way/{constr.index[0][1]}"

# walkable edges that cross the railway, grouped into places 40 m apart
xing = E[E.intersects(rail_u)]
pts = [(idx, row, row.geometry.intersection(rail_u).centroid) for idx, row in xing.iterrows()]
places = []
for idx, row, p in pts:
    for pl in places:
        if any(p.distance(q) < 40 for q in pl["pts"]):
            pl["pts"].append(p); pl["rows"].append(row)
            break
    else:
        places.append({"pts": [p], "rows": [row]})
o_xy = xy(*ORIGIN)
for pl in places:
    names = [r["name"] for r in pl["rows"] if isinstance(r["name"], str) and r["highway"] not in FOOT]
    pl["name"] = f"the {lc(names[0])} bridge" if names else "an unnamed bridge"
    pl["underpass"] = any(r.get("tunnel") == "yes" for r in pl["rows"])
    c = pl["pts"][0]
    pl["dist"] = r10(c.distance(o_xy))
    pl["clock"] = clock(bearing(o_xy, c))
    pl["evidence"] = ids("way", [r["osmid"] for r in pl["rows"]])
places.sort(key=lambda p: p["dist"])
places_fact = fact("railway_crossing_places", len(places), "count", "computed",
                   [e for p in places for e in p["evidence"]],
                   {"graph": GRAPH, "railway": rail_name, "cluster_m": 40, "radius_m": R}, "unknown")


def place_phrase(p):
    return p["name"] + (", with an underpass beside it" if p["underpass"] else "")


def write(name, obj):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=lambda o: o.item()) + "\n")
    print("wrote", name)


# ---------- overview ----------
def near(geom):
    p = geom.boundary if geom.geom_type == "Polygon" else geom
    q = p.interpolate(p.project(o_xy)) if p.geom_type in ("LineString", "LinearRing") else \
        min((g.interpolate(g.project(o_xy)) for g in getattr(p, "geoms", [p])), key=lambda z: z.distance(o_xy))
    return r10(q.distance(o_xy)), clock(bearing(o_xy, q))


rail_d, rail_c = near(rail_u)
con_d, con_c = near(constr.iloc[0].geometry)
minx, miny, maxx, maxy = rail_u.bounds
main = E[E["highway"].astype(str).str.contains("primary|secondary|trunk") & E["name"].notna()].copy()
main["n"] = main["name"].map(lambda n: n[0] if isinstance(n, list) else n)
roads = []
for n, grp in main.groupby("n"):
    d, c = near(grp.union_all())
    if d <= 500:
        roads.append({"name": lc(n), "dist": d, "clock": c, "evidence": ids("way", grp["osmid"].tolist())[:10]})
roads.sort(key=lambda r: r["dist"])
REF = {"place": "Talent Garden, via Arcivescovo Calabiana", "lat": ORIGIN[0], "lon": ORIGIN[1], "heading_deg": 0}
dist_in = lambda: {"graph": GRAPH, "from": list(ORIGIN), "method": "straight line to nearest point"}
ov_facts = [fact("barrier_distance", rail_d, "m", "computed", rail_ids, {**dist_in(), "feature": rail_name}),
            fact("barrier_distance", con_d, "m", "computed", [constr_id], {**dist_in(), "feature": constr_name}),
            places_fact]
ov_facts += [fact("railway_crossing_distance", p["dist"], "m", "computed", p["evidence"], {**dist_in(), "place": p["name"]})
             for p in places]
ov_facts += [fact("barrier", rail_name, None, "map_tag", rail_ids, FEAT_IN),
             fact("barrier", constr_name, None, "map_tag", [constr_id], FEAT_IN),
             fact("radius", R, "m", "unknown", [], {"graph": GRAPH})]
ov_facts += [fact("main_road_distance", r["dist"], "m", "computed", r["evidence"], {**dist_in(), "road": r["name"]})
             for r in roads]
across = "from your left to your right" if maxx - minx > maxy - miny else "from ahead to behind you"
overview = {
    "zone": {"name": "Porta Romana, Milan", "center": {"lat": ORIGIN[0], "lon": ORIGIN[1]}, "radius_m": R},
    "lang": "en",
    "reference": {**REF, "text": "Standing at Talent Garden on via Arcivescovo Calabiana, facing north."},
    "text": (f"Facing north from Talent Garden. The southern belt railway runs {across}, {fmt(rail_d)} ahead, "
             f"and splits the area in two; you are on this side. Within {fmt(R)} you can cross it on foot in "
             f"{len(places)} places, the nearest is {places[0]['name']}, {fmt(places[0]['dist'])} {places[0]['clock']}."),
    "details": [
        f"Between you and the railway there is a construction site, {constr_name}, {fmt(con_d)} {con_c}.",
        "Main roads you will hear: " + "; ".join(f"{r['name']}, {fmt(r['dist'])} {r['clock']}" for r in roads) + ".",
        "Railway crossings on foot: " + "; ".join(f"{place_phrase(p)}, {fmt(p['dist'])} {p['clock']}" for p in places) + ".",
    ],
    "landmarks": [{"name": f"{place_phrase(p)}", "kind": "bridge", "relative_direction": p["clock"],
                   "distance_m": p["dist"], "osm_ids": p["evidence"][:5]} for p in places]
                 + [{"name": r["name"], "kind": "main_road", "relative_direction": r["clock"],
                     "distance_m": r["dist"], "osm_ids": r["evidence"][:5]} for r in roads],
    "barriers": [{"name": rail_name, "kind": "railway", "relative_direction": rail_c, "distance_m": rail_d,
                  "osm_ids": rail_ids[:5], "crossings_on_foot": len(places)},
                 {"name": constr_name, "kind": "construction", "relative_direction": con_c, "distance_m": con_d,
                  "osm_ids": [constr_id], "crossings_on_foot": None}],
    "facts": ov_facts,
    "unknown": [f"The area is mapped only within {fmt(R)} of Talent Garden: railway crossings farther away are not counted.",
                "The map does not say whether the construction site blocks any pavement."],
    "meta": META,
}
write("overview.porta-romana", overview)


# ---------- explore ----------
def branch(n, m):
    """Walk from junction n through neighbour m to the next junction, dead end or boundary node."""
    path, prev, cur = [n, m], n, m
    while len(set(G[cur])) == 2 and cur not in BOUNDARY:
        nxt = next(x for x in G[cur] if x != prev)
        if nxt in path:
            break
        path.append(nxt); prev, cur = cur, nxt
    labels = Counter()
    for u, v in zip(path, path[1:]):
        labels[edge_label(u, v)] += edata(u, v)["length"]
    return path, labels.most_common(1)[0][0], sum(edata(u, v)["length"] for u, v in zip(path, path[1:]))


def leads_to(path, name):
    end = path[-1]
    if end in BOUNDARY:
        return "the edge of the mapped area"
    if len(set(G[end])) == 1:
        return "a dead end"
    others = sorted({edge_label(end, x) for x in G[end] if x != path[-2]} - {name})
    return "a junction with " + " and ".join(others) if others else "a junction"


def first_dir(path):
    p, i = nxy(path[0]), 1
    while i < len(path) - 1 and p.distance(nxy(path[i])) < 8:
        i += 1
    return bearing(p, nxy(path[i]))


def step(node, heading, came=None, depth=0, command="start", intro=""):
    brs, todo = [], [branch(node, m) for m in G[node] if not (came and m == came[-2])]
    while todo:
        path, name, length = todo.pop()
        if length < 8 and len(set(G[path[-1]])) > 2 and path[-1] not in BOUNDARY:
            for m2 in G[path[-1]]:
                if m2 != path[-2] and m2 not in path:
                    p2, n2, l2 = branch(path[-1], m2)
                    todo.append((path + p2[1:], n2, length + l2))
            continue
        rel = (first_dir(path) - heading + 180) % 360 - 180
        xs = [CROSSINGS[x] for x in path[1:] if x in CROSSINGS]
        brs.append({"rel": rel, "path": path, "name": name, "leads_to": leads_to(path, name),
                    "relative_direction": clock(rel), "distance_m": r10(length),
                    "crossing": {k: xs[0][k] for k in ("signals", "sound", "tactile_paving")} | {"osm_id": xs[0]["osm_id"]}
                    if xs else None})
    brs.sort(key=lambda b: b["rel"])
    facts = [fact("branch_distance", b["distance_m"], "m", "computed", ids("node", b["path"][:1] + b["path"][-1:]),
                  {"graph": GRAPH, "from_node": node, "to_node": b["path"][-1], "heading_deg": heading})
             for b in brs]
    facts.append(fact("branch_count", len(brs), "count", "computed", [f"node/{node}"],
                      {"graph": GRAPH, "node": node, "heading_deg": heading},
                      "unknown" if node in BOUNDARY else "complete"))
    parts = []
    for b in brs:
        s = f"{b['name']}, {b['relative_direction']}, {fmt(b['distance_m'])} to {b['leads_to']}"
        if b["crossing"] and b["crossing"]["signals"] == "unknown":
            s += "; the map does not say whether its crossing has a signal"
        elif b["crossing"] and b["crossing"]["signals"] == "yes":
            s += "; its crossing has a signal" + (", with sound" if b["crossing"]["sound"] == "yes" else
                                                  ", the map does not say whether it has sound" if b["crossing"]["sound"] == "unknown" else ", without sound")
        elif b["crossing"]:
            s += "; its crossing has no signal"
        parts.append(s)
    back = f" Behind you: {came_name}, where you came from." if came else ""
    text = f"{intro}{len(brs)} ways, from left to right: " + "; ".join(parts) + "." + back
    out = {"command": command, "lang": "en",
           "position": {"lat": LL[node][0], "lon": LL[node][1], "osm_node": f"node/{node}"},
           "heading_deg": round(heading), "text": text,
           "branches": [{k: b[k] for k in ("name", "leads_to", "relative_direction", "distance_m", "crossing")} for b in brs],
           "came_from": {"name": came_name, "relative_direction": "behind", "osm_node": f"node/{came[-2]}"} if came else None,
           "junction_stack_depth": depth, "at_boundary": node in BOUNDARY, "facts": facts, "meta": META}
    return out, brs


start = A["node"]
came_name = None
s1, brs = step(start, 0, intro="Start at Talent Garden, facing north. You are on "
               + edge_label(A["u"], A["v"]) + ". ")
write("explore-step.start", s1)
fwd = min(brs, key=lambda b: abs(b["rel"]))
p = fwd["path"]
came_name = fwd["name"]
arrive = bearing(nxy(p[-2]), nxy(p[-1]))
s2, _ = step(p[-1], arrive, came=p, depth=1, command="forward",
             intro=f"You walked {fmt(fwd['distance_m'])} along {fwd['name']} and now face the way you walked. ")
s2["facts"].append(fact("walked_distance", fwd["distance_m"], "m", "computed", ids("way", [edata(u, v)["osmid"] for u, v in zip(p, p[1:])]),
                        {"graph": GRAPH, "path_nodes": [p[0], p[-1]]}))
s2["facts"].append(fact("heading", round(arrive), "deg", "computed", [f"node/{p[-2]}", f"node/{p[-1]}"],
                        {"graph": GRAPH, "segment": [p[-2], p[-1]]}))
write("explore-step.first-junction", s2)

# ---------- answers ----------
walk_ev = path_ways(walk_path)
ratio = round(walk / crow, 1)
bridge = next((p for p in places if "corso" in p["name"]), places[0])
f_crow = fact("straight_line_distance", crow, "m", "computed",
              ["https://www.openstreetmap.org/directions?route=" + urllib.parse.quote(f"{ORIGIN[0]},{ORIGIN[1]};{DEST[0]},{DEST[1]}")],
              {"from": list(ORIGIN), "to": list(DEST), "method": "great circle"})
f_walk = fact("walking_distance", walk, "m", "computed", walk_ev, ROUTE_IN)
f_min = fact("walking_time", mins(walk_m), "min", "computed", walk_ev, ROUTE_IN)
f_ratio = fact("detour_ratio", ratio, "ratio", "computed", walk_ev, ROUTE_IN)
f_rail = fact("barrier", rail_name, None, "map_tag", rail_ids, {**FEAT_IN, "line": [list(ORIGIN), list(DEST)]})
f_con = fact("barrier", constr_name, None, "map_tag", [constr_id], {**FEAT_IN, "line": [list(ORIGIN), list(DEST)]})
f_bridge = fact("railway_crossing_on_route", bridge["name"], None, "computed",
                [w for w in walk_ev if w in bridge["evidence"]] or bridge["evidence"], ROUTE_IN)
ans_meta = {"lang": "en", "meta": META}
f_snap = [fact("snap_distance", round(A["off"]), "m", "computed", ids("node", [A["u"], A["v"]]), ROUTE_IN),
          fact("snap_distance", round(B["off"]), "m", "computed", ids("node", [B["u"], B["v"]]), ROUTE_IN)]

write("answer.detour-ratio", {
    "question": "Is it close to here?", **ans_meta, "tool": "walking_vs_straight_line",
    "text": (f"{fmt(crow)} in a straight line, but {fmt(walk)} on foot, about {mins(walk_m)} minutes: "
             f"the southern belt railway is in between. On foot you cross it on {bridge['name']}. "
             f"The walk is {ratio} times the straight-line distance."),
    "facts": [f_crow, f_walk, f_min, f_ratio, f_rail, f_bridge] + f_snap,
    "unknown": ["Distances start and end at the nearest mapped footpath: "
                f"{round(A['off'])} m from Talent Garden and {round(B['off'])} m from the destination point."]})

write("answer.barrier-between", {
    "question": "Is there anything between here and viale Isonzo?", **ans_meta, "tool": "barrier_between",
    "text": (f"Yes. In a straight line you would cross the southern belt railway, {rail_name}, and the construction "
             f"site {constr_name}. Within {fmt(R)} the railway can be crossed on foot in {len(places)} places: "
             + " and ".join(place_phrase(p) + f", {fmt(p['dist'])} away in a straight line" for p in places) + "."),
    "facts": [f_rail, f_con, places_fact] + [fact("railway_crossing_distance", p["dist"], "m", "computed", p["evidence"],
                                                  {**dist_in(), "place": p["name"]}) for p in places]
             + [fact("radius", R, "m", "unknown", [], {"graph": GRAPH})],
    "unknown": [f"Crossings farther than {fmt(R)} from Talent Garden are not in the downloaded map, so there may be more.",
                "The map does not say whether the construction site blocks any pavement."]})

# does via Arcivescovo Calabiana go through or end?
STREET = "Via Arcivescovo Calabiana"
se = [(u, v) for u, v, dd in G.edges(data=True) if dd.get("name") == STREET or (isinstance(dd.get("name"), list) and STREET in dd["name"])]
S = nx.Graph(se)
ends = [n for n in S if S.degree(n) == 1]
through = [n for n in ends if len(set(G[n])) > 1]
dead = [n for n in ends if len(set(G[n])) == 1]
on_cut = [n for n in ends if n in BOUNDARY]
comp = "unknown" if on_cut else "complete"
st_in = {"graph": GRAPH, "street": STREET, "method": "street ends checked for other walkable links"}
st_len = r10(sum(edata(u, v)["length"] for u, v in se))
end_names = sorted({edge_label(n, x) for n in through for x in G[n]} - {lc(STREET)})
verdict = "goes through" if not dead else "ends"
txt = (f"On foot, via Arcivescovo Calabiana {'goes through' if not dead else 'does not go through'}: "
       f"it is about {fmt(st_len)} long, "
       + ("and its ends connect to " if not dead else "it has a dead end, and its other ends connect to ")
       + ", ".join(end_names[:-1]) + " and " + end_names[-1] + ".")
if comp == "unknown":
    txt += " One end reaches the edge of the downloaded map, so this may not be the whole story."
write("answer.street-through", {
    "question": "Does via Arcivescovo Calabiana go through or does it end?", **ans_meta, "tool": "street_continuity",
    "text": txt,
    "facts": [fact("street_continuity", verdict.replace(" ", "_"), None, "computed", ids("node", ends) + ids("way", [edata(u, v)["osmid"] for u, v in se]), st_in, comp),
              fact("street_length", st_len, "m", "computed", ids("way", [edata(u, v)["osmid"] for u, v in se]), st_in)],
    "unknown": ([] if comp == "complete" else ["One end of the street is at the edge of the downloaded area."])
               + ["The map does not say whether the street has pavements on both sides."]})

# no tool fits: the engine says what it can answer (fixed text, never written by the model)
write("answer.no-tool", {
    "question": "What colour is the sky?", **ans_meta, "tool": "none",
    "text": ("I can answer five kinds of question about this area: how far a place is on foot, what lies between two places, "
             "how many independent ways connect them, whether a street goes through or ends, and how big a place is. Which one would you like?"),
    "facts": [], "unknown": []})

# ---------- plans ----------
def transit(frm, to, time, extra):
    q = {"fromPlace": f"{frm[0]},{frm[1]}", "toPlace": f"{to[0]},{to[1]}", "time": time,
         "maxTransfers": 2, "maxTravelTime": 60, **extra}
    url = "https://api.transitous.org/api/v6/plan?" + urllib.parse.urlencode(q)
    TRANSIT_CACHE.mkdir(parents=True, exist_ok=True)
    f = TRANSIT_CACHE / (urllib.parse.quote(url, safe="")[-120:] + ".json")
    if not f.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
    return url, json.loads(f.read_text())


def decode_polyline(points, precision):
    """Google encoded polyline -> [(lat, lon)]."""
    coords, idx, lat, lon, f = [], 0, 0, 0, 10 ** precision
    while idx < len(points):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(points[idx]) - 63
                idx += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += d
            else:
                lon += d
        coords.append((lat / f, lon / f))
    return coords


def at(minutes):
    """ISO time `minutes` after the plan's departure."""
    return (datetime.fromisoformat(DEPART.replace("Z", "+00:00")) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


def minutes_between(a, b):
    return round((datetime.fromisoformat(b.replace("Z", "+00:00")) - datetime.fromisoformat(a.replace("Z", "+00:00"))).total_seconds() / 60)


def iso_min(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def foot_route(rid, H, label, constraints):
    m, path = route(H, A, B)
    xs = path_crossings(path)
    ev = path_ways(path)
    rin = {**ROUTE_IN, "filter": label}
    cs = []
    for c in constraints:
        st, bad, unk = status(c["kind"], xs)
        cs.append({"kind": c["kind"], "status": st, "_bad": len(bad), "_unk": len(unk)})
    return {"id": rid, "mode": "foot", "_m": m, "_path": path, "duration_min": mins(m), "walk_min": mins(m), "transfers": 0,
            "leave_at": DEPART, "arrive_at": at(mins(m)),
            "legs": [{"mode": "foot", "from": {"name": "Talent Garden", "lat": ORIGIN[0], "lon": ORIGIN[1]},
                      "to": {"name": "viale Isonzo", "lat": DEST[0], "lon": DEST[1]},
                      "distance_m": r10(m), "duration_min": mins(m), "line": None, "departure": None, "arrival": None}],
            "crossings": xs, "constraint_status": cs, "_ev": ev, "_in": rin}


def finish(r, shortest, facts_extra=()):
    bad = r["constraint_status"][0]["_bad"] if r["constraint_status"] else 0
    unk = r["constraint_status"][0]["_unk"] if r["constraint_status"] else 0
    r["trade_off"] = {"extra_min": r["duration_min"] - shortest["duration_min"], "violating_crossings": bad, "unknown_crossings": unk}
    ev, rin = r.pop("_ev"), r.pop("_in")
    r["facts"] = [fact("route_duration", r["duration_min"], "min", r.get("_src", "computed"), ev, rin),
                  fact("route_walk_time", r["walk_min"], "min", r.get("_src", "computed"), ev, rin),
                  fact("route_crossings", len(r["crossings"]), "count", "computed", [x["osm_id"] for x in r["crossings"]] or ev, rin),
                  fact("route_violating_crossings", bad, "count", "computed", [x["osm_id"] for x in r["crossings"] if x["signals"] == "no"] or ev, rin),
                  fact("route_unknown_crossings", unk, "count", "computed", [x["osm_id"] for x in r["crossings"] if x["signals"] == "unknown"] or ev, rin),
                  fact("route_extra_time", r["trade_off"]["extra_min"], "min", "computed", ev, rin)] + list(facts_extra)
    if "_m" in r:
        r["facts"].append(fact("route_distance", r10(r["_m"]), "m", "computed", ev, rin))
    for c in r["constraint_status"]:
        c.pop("_bad"); c.pop("_unk")
    for k in [k for k in r if k.startswith("_")]:
        r.pop(k)
    return r


C1 = [{"kind": "unsignalled_crossings", "strength": "avoid_when_possible"}]
NO_SIG = lambda x: x["signals"] == "no"
shortest = foot_route("B", G, "none", C1)
avoid = foot_route("A", penalised(NO_SIG), "fewest crossings known to have no signal, then shortest", C1)
# a verified compliant route needs every crossing mapped as signalled: none exists in this map
verified_m, _ = route(without(lambda x: x["signals"] != "yes"), A, B)
compliant = "no" if verified_m is None else "yes"
tol = max(TOLERANCE["min"], shortest["duration_min"] * TOLERANCE["pct"] / 100)

# transit via Lodi M3; directModes empty, otherwise Transitous answers with walking only (it is faster)
t_url, t_json = transit(ORIGIN, DEST, DEPART, {"directModes": ""})
d_url, d_json = transit(ORIGIN, DEST, DEPART, {})
it = next(i for i in t_json["itineraries"] if "lodi m3" in i["legs"][0]["to"]["name"].lower())
ABBR = {"v.le ": "viale ", "p.za ": "piazza ", "c.so ": "corso ", "l.go ": "largo ", "p.ta ": "porta "}


def end_name(s, start="Talent Garden"):
    if s in ("START", "END"):
        return start if s == "START" else "viale Isonzo"
    for k, v in ABBR.items():
        s = s.replace(k, v)
    return s.title()


def transit_legs(itin, start="Talent Garden"):
    """Legs, walking seconds and crossings of a Transitous itinerary; crossings follow Transitous' own walking geometry."""
    out, walk_s, xs = [], 0, []
    for L in itin["legs"]:
        fr, to = L["from"], L["to"]
        out.append({"mode": "foot" if L["mode"] == "WALK" else L["mode"].lower(),
                    "from": {"name": end_name(fr["name"], start), "lat": round(fr["lat"], 6), "lon": round(fr["lon"], 6)},
                    "to": {"name": end_name(to["name"], start), "lat": round(to["lat"], 6), "lon": round(to["lon"], 6)},
                    "distance_m": r10(L["distance"]) if L.get("distance") else None, "duration_min": round(L["duration"] / 60),
                    "line": L.get("routeShortName"), "departure": L["startTime"], "arrival": L["endTime"]})
        if L["mode"] == "WALK":
            walk_s += L["duration"]
            geo = L["legGeometry"]
            trace = LineString([xy(la, lo) for la, lo in decode_polyline(geo["points"], geo["precision"])])
            xs += [CROSSINGS[n] for _, n in sorted((trace.project(nxy(n)), n) for n in CROSSINGS if trace.distance(nxy(n)) <= XING_M)]
    return out, walk_s, xs


legs, walk_s, t_xs = transit_legs(it)
bus = next(l for l in legs if l["mode"] != "foot")
wait0 = minutes_between(DEPART, it["startTime"])


def statuses(constraints, xs):
    out = []
    for c in constraints:
        st, bad, unk = status(c["kind"], xs)
        out.append({"kind": c["kind"], "status": st, "_bad": len(bad), "_unk": len(unk)})
    return out


# duration counts from the time the user gave, so a later bus shows up as a longer trip
t_route = {"id": "C", "mode": "transit", "_src": "transit_api", "duration_min": minutes_between(DEPART, it["endTime"]),
           "walk_min": round(walk_s / 60), "transfers": it["transfers"], "legs": legs, "crossings": t_xs,
           "leave_at": it["startTime"], "arrive_at": it["endTime"],
           "constraint_status": statuses(C1, t_xs), "_ev": [t_url],
           "_in": {"request": t_url, "depart_at": DEPART, "graph": GRAPH,
                   "crossings_method": f"OSM crossing nodes within {XING_M} m of the Transitous walking leg geometry"}}
direct_min = round(d_json["direct"][0]["duration"] / 60)

# ---------- level 2 plan story ----------
# v1 initial comparison -> v2 route A chosen + stop candidates -> v3 stop 15 min -> v4 stop 5 min;
# separately, v2 of the same trip with the constraint required (no compliant route).
BASE = {r["id"]: {k: r[k] for k in ("id", "_m", "walk_min", "crossings", "_in")} for r in (avoid, shortest)}
SEL_G = penalised(NO_SIG)
to_ll = Transformer.from_crs(CRS, 4326, always_xy=True).transform
TG_PT = {"name": "Talent Garden", "lat": ORIGIN[0], "lon": ORIGIN[1]}
DEST_PT = {"name": "viale Isonzo", "lat": DEST[0], "lon": DEST[1]}

# supermarkets in the mapped area, ranked by the walking they add to route A
shops = ox.features_from_point(ORIGIN, {"shop": "supermarket"}, dist=R).to_crs(CRS)
cands = []
for idx, row in shops.iterrows():
    lon, lat = to_ll(row.geometry.centroid.x, row.geometry.centroid.y)
    s_ = snap(lat, lon)
    (m1, p1), (m2, p2) = route(SEL_G, A, s_), route(SEL_G, s_, B)
    if m1 is None or m2 is None:
        continue
    cands.append({"det_m": m1 + m2 - avoid["_m"], "name": row["name"] if isinstance(row.get("name"), str) else "an unnamed supermarket",
                  "id": f"{idx[0]}/{idx[1]}", "lat": round(lat, 6), "lon": round(lon, 6), "path": p1 + p2})
cands = sorted(cands, key=lambda c: c["det_m"])[:3]
best = cands[0]
cand_in = {**ROUTE_IN, "route": "A", "filter": "fewest crossings known to have no signal, then shortest", "method": "A->S->B minus A->B"}


def foot_leg(frm, to, m):
    return {"mode": "foot", "from": frm, "to": to, "distance_m": r10(m), "duration_min": mins(m),
            "line": None, "departure": None, "arrival": None}


def build_stop(stop, stop_min):
    """Routes A, B and C recomputed through `stop` for `stop_min` minutes of shopping."""
    s_ = snap(stop["lat"], stop["lon"])
    pt = {"name": stop["name"], "lat": stop["lat"], "lon": stop["lon"]}
    leg = {"mode": "stop", "from": pt, "to": pt, "distance_m": None, "duration_min": stop_min, "line": None, "departure": None, "arrival": None}
    out = {}
    for rid, H in (("A", SEL_G), ("B", G)):
        base = BASE[rid]
        (m1, p1), (m2, p2) = route(H, A, s_), route(H, s_, B)
        det = mins(max(0.0, m1 + m2 - base["_m"]))
        walk = base["walk_min"] + det
        xs = path_crossings(p1) + path_crossings(p2)
        out[rid] = {"id": rid, "mode": "foot", "_m": m1 + m2, "_det": det, "duration_min": walk + stop_min, "walk_min": walk,
                    "transfers": 0, "leave_at": DEPART, "arrive_at": at(walk + stop_min),
                    "legs": [foot_leg(TG_PT, pt, m1), leg, foot_leg(pt, DEST_PT, m2) | {"duration_min": walk - mins(m1)}],
                    "crossings": xs, "constraint_status": statuses(C1, xs), "_new": [x for x in xs if x not in base["crossings"]],
                    "_ev": [stop["id"]] + path_ways(p1) + path_ways(p2), "_in": {**base["_in"], "stop": stop["id"], "stop_duration_min": stop_min}}
    # bus: walk to the shop, shop, then the bus part is queried from the time the shopping ends
    m1, p1 = route(G, A, s_)
    t2 = at(mins(m1) + stop_min)
    url2, js2 = transit((stop["lat"], stop["lon"]), DEST, t2, {"directModes": ""})
    if js2.get("itineraries"):
        it2 = min(js2["itineraries"], key=lambda i: i["endTime"])
        legs2, walk2_s, xs2 = transit_legs(it2, start=stop["name"])
        xs_c = path_crossings(p1) + xs2
        out["C"] = {"id": "C", "mode": "transit", "duration_min": minutes_between(DEPART, it2["endTime"]),
                    "walk_min": mins(m1) + round(walk2_s / 60), "transfers": it2["transfers"], "leave_at": DEPART, "arrive_at": it2["endTime"],
                    "legs": [foot_leg(TG_PT, pt, m1), leg] + legs2, "crossings": xs_c, "constraint_status": statuses(C1, xs_c),
                    "_bus": next(l for l in legs2 if l["mode"] != "foot"), "_from": legs2[0]["to"]["name"],
                    "_wait": minutes_between(t2, it2["startTime"]), "_url": url2,
                    "_ev": [stop["id"], url2] + path_ways(p1),
                    "_in": {"graph": GRAPH, "stop": stop["id"], "stop_duration_min": stop_min, "request_after_stop": url2,
                            "crossings_method": f"walk to the stop on the OSM graph; after it, OSM crossing nodes within {XING_M} m of the Transitous walking legs"}}
    keep = {"_det": out["A"]["_det"], "_new": out["A"]["_new"]}
    b = finish(out["B"], out["B"])
    a = finish(out["A"], b) | keep
    a["summary"] = (f"Route A, on foot, {plural(a['duration_min'], 'minute')} with the shopping{same_or_more(a)}: "
                    f"{xing_phrase(a)}, the fewest of any route in the mapped area.")
    b["summary"] = f"Route B, on foot, the shortest, {plural(b['duration_min'], 'minute')} with the shopping: {xing_phrase(b)}."
    routes = [a, b]
    if "C" in out:
        bus_, from_, wait_, url_ = (out["C"].pop(k) for k in ("_bus", "_from", "_wait", "_url"))
        c = finish(out["C"], b, [fact("transit_line", bus_["line"], None, "transit_api", [url_], {"request": url_}),
                                 fact("wait_after_stop", wait_, "min", "transit_api", [url_], {"request": url_, "stop_ends_at": t2})])
        c["summary"] = (f"Route C, on foot to {stop['name']}, then bus {bus_['line']} from {from_}: "
                        f"{plural(c['duration_min'], 'minute')} with the shopping" + (f" and {wait_} minutes of waiting after it" if wait_ else "")
                        + f", {c['walk_min']} of them on foot, with {xing_phrase(c)}.")
        routes.append(c)
    for r in routes:
        add_warnings(r)
    return routes


sh = finish(shortest, shortest)
sa = finish(avoid, sh)
tr = finish(t_route, sh, [fact("transit_line", bus["line"], None, "transit_api", [t_url], {"request": t_url}),
                          fact("transit_direct_walk", direct_min, "min", "transit_api", [d_url], {"request": d_url}),
                          fact("wait_before_leaving", wait0, "min", "transit_api", [t_url], {"request": t_url, "depart_at": DEPART})])
n_a = len(sa["crossings"])


def xing_phrase(r):
    t = r["trade_off"]
    out = plural(t["violating_crossings"], "crossing") + " without a signal"
    return out + (f" and {t['unknown_crossings']} where the map does not say" if t["unknown_crossings"] else "")


def same_or_more(r):
    x = r["trade_off"]["extra_min"]
    return f", {x} more than the shortest" if x else ", the same time as the shortest"


def add_warnings(r):
    r["warnings"] = []
    if r["trade_off"]["violating_crossings"]:
        r["warnings"].append(f"{plural(r['trade_off']['violating_crossings'], 'crossing')} without a signal.")
    if r["trade_off"]["unknown_crossings"]:
        r["warnings"].append(f"{r['trade_off']['unknown_crossings']} crossings where the map does not say whether there is a signal.")


sa["summary"] = (f"Route A, on foot, {plural(sa['duration_min'], 'minute')}{same_or_more(sa)}: "
                 f"{xing_phrase(sa)}, the fewest of any route in the mapped area.")
sh["summary"] = f"Route B, on foot, the shortest, {plural(sh['duration_min'], 'minute')}: {xing_phrase(sh)}."
tr["summary"] = (f"Route C, bus {bus['line']} from {legs[0]['to']['name']}: you leave {wait0} minutes after the time you gave "
                 f"and arrive {tr['duration_min']} minutes after it, {tr['walk_min']} of them on foot, with {xing_phrase(tr)}; "
                 f"walking takes {direct_min} minutes.")
sa["facts"].append(fact("route_crossings_total", n_a, "count", "computed", [x["osm_id"] for x in sa["crossings"]], ROUTE_IN))
for r in (sa, sh, tr):
    add_warnings(r)


def copy(r):
    return json.loads(json.dumps(r, default=lambda o: o.item()))


OUTSIDE = f"Routes that leave the mapped area, {fmt(R)} around Talent Garden, were not considered."
UNMAPPED = "Crossings at points where the map has no crossing are not counted."
NO_VERIFIED = "In the mapped area, every way to viale Isonzo has at least one crossing without a signal."
COMMON_FACTS = [fact("radius", R, "m", "unknown", [], {"graph": GRAPH}),
                fact("compliant_routes", 0 if verified_m is None else 1, "count", "computed", [f"node/{A['node']}"],
                     {**ROUTE_IN, "filter": "only crossings mapped as signalled"}, "unknown")]


def plan_doc(version, constraints, text, routes, selected, stop, candidates, differences, facts, unknown):
    return {"origin": TG_PT, "destination": DEST_PT, "depart_at": DEPART, "lang": "en", "plan_version": version,
            "constraints": constraints, "detour_tolerance": TOLERANCE, "text": text, "routes": routes,
            "compliant_route_available": compliant, "selected_route_id": selected, "stop": stop, "stop_candidates": candidates,
            "differences": differences, "facts": COMMON_FACTS + facts, "unknown": [OUTSIDE, UNMAPPED] + unknown, "meta": META}


# v1: the comparison the user hears first
write("plan.initial-comparison", plan_doc(
    1, C1, f"{NO_VERIFIED} {sa['summary']} {sh['summary']} {tr['summary']} Which one?",
    [copy(sa), copy(sh), copy(tr)], None, None, [], [], [], []))

# v2: route A chosen, supermarkets offered along it
cand_list = [{"place": c["name"], "osm_id": c["id"], "lat": c["lat"], "lon": c["lon"], "detour_min": mins(c["det_m"])} for c in cands]
cand_facts = [fact("stop_candidate_detour", c["detour_min"], "min", "computed", [c["osm_id"]] + path_ways(k["path"])[:20],
                   {**cand_in, "stop": c["osm_id"]}) for c, k in zip(cand_list, cands)]
write("plan.stop-candidates", plan_doc(
    2, C1, "Supermarkets near route A: " + "; ".join(f"{c['place']}, {plural(c['detour_min'], 'minute')} more on foot" for c in cand_list)
    + ". Which one, and for how long?",
    [copy(sa), copy(sh), copy(tr)], "A", None, cand_list, ["You chose route A."], cand_facts,
    ["The map does not say whether these supermarkets are open at that time."]))


def stop_fixture(version, stop_min, prev):
    routes = build_stop(best, stop_min)
    a = routes[0]
    new_unknown = [x for x in a.pop("_new") if x["signals"] == "unknown"]
    det = a.pop("_det")
    stop_in = {**ROUTE_IN, "stop": best["id"], "stop_point": [best["lat"], best["lon"]], "method": "A->S->B minus A->B"}
    facts = [fact("stop_detour", det, "min", "computed", [best["id"]] + path_ways(best["path"])[:20], stop_in),
             fact("stop_duration", stop_min, "min", "unknown", [], {"said_by_user": True}),
             fact("stop_new_unknown_crossings", len(new_unknown), "count", "computed", [x["osm_id"] for x in new_unknown] or [best["id"]], stop_in)]
    if prev is None:  # the stop was just added
        facts.append(fact("route_duration_before", sa["duration_min"], "min", "computed", [best["id"]], {**ROUTE_IN, "route": "A", "version": version - 1}))
        diffs = [f"Stop added at {best['name']}: route A now takes {a['duration_min']} minutes instead of {sa['duration_min']}, "
                 f"{plural(det, 'minute')} more on foot and {stop_min} minutes of shopping."]
        if len(routes) > 2:
            diffs.append("Route C was recomputed: its bus part now starts after the shopping.")
    else:  # the stop's duration changed
        pa = prev["routes"][0]
        facts += [fact("previous_stop_duration", prev["stop"]["duration_min"], "min", "unknown", [], {"said_by_user": True}),
                  fact("route_duration_before", pa["duration_min"], "min", "computed", [best["id"]], {**ROUTE_IN, "route": "A", "version": version - 1})]
        diffs = [f"The stop at {best['name']} now lasts {stop_min} minutes instead of {prev['stop']['duration_min']}: "
                 f"route A now takes {a['duration_min']} minutes instead of {pa['duration_min']}."]
        pc = next((r for r in prev["routes"] if r["id"] == "C"), None)
        c = next((r for r in routes if r["id"] == "C"), None)
        if pc and c:
            facts.append(fact("route_duration_before", pc["duration_min"], "min", "computed", [best["id"]], {**ROUTE_IN, "route": "C", "version": version - 1}))
            diffs.append(f"Route C now takes {c['duration_min']} minutes instead of {pc['duration_min']}.")
    if new_unknown:
        diffs.append(f"The way to and from the supermarket adds {len(new_unknown)} crossings where the map does not say whether there is a signal.")
    doc = plan_doc(version, C1, f"{NO_VERIFIED} With a stop at the supermarket {best['name']} for {stop_min} minutes: "
                   + " ".join(r["summary"] for r in routes) + " You chose route A.",
                   routes, "A", {"place": best["name"], "osm_id": best["id"], "detour_min": det, "duration_min": stop_min}, [], diffs, facts,
                   ["The map does not say whether the supermarket is open at that time."]
                   + ([] if len(routes) > 2 else ["Transitous returned no bus connection from the supermarket, so route C is not offered."]))
    return doc


plan15 = stop_fixture(3, 15, None)
write("plan.two-foot-routes-and-transit", plan15)
write("plan.stop-5-min", stop_fixture(4, 5, plan15))

# v2 of the same trip with the constraint required: routes known to violate are dropped, nothing is verified compliant
C2 = [{"kind": "unsignalled_crossings", "strength": "require"}]
offered, dropped = [], []
for r in (sa, sh, tr):
    r2 = copy(r)
    for c in r2["constraint_status"]:
        c["kind"] = C2[0]["kind"]
    (dropped if r2["trade_off"]["violating_crossings"] else offered).append(r2)
write("plan.no-compliant-route", plan_doc(
    2, C2, (f"{NO_VERIFIED} So no route there meets the requirement of signals at every crossing. "
            f"The route with the fewest is route A, {plural(sa['duration_min'], 'minute')}, with {xing_phrase(sa)}. "
            "Do you want me to relax the requirement to avoid when possible?"),
    offered, None, None, [],
    ["Signals at every crossing are now required: "
     + ", ".join(f"route {r['id']}" for r in dropped[:-1]) + (" and " if len(dropped) > 1 else "") + f"route {dropped[-1]['id']}"
     + (" is" if len(dropped) == 1 else " are") + " no longer offered, because of crossings known to have no signal."] if dropped else [],
    [f for f in sa["facts"] if f["type"] in ("route_duration", "route_violating_crossings", "route_unknown_crossings")],
    ["For most crossings the map does not say whether the signal has sound."]))
print("tol", tol, "A", sa["duration_min"], sa["trade_off"], "B", sh["duration_min"], sh["trade_off"],
      "C", tr["duration_min"], tr["walk_min"], tr["trade_off"], "candidates", [(c["place"], c["detour_min"]) for c in cand_list],
      "dropped", [r["id"] for r in dropped])
