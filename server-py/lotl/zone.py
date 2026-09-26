"""The demo zone: cached OSM walk graph, crossings, names, snapping and routing. Load once per process.

All distances are metres in a projected CRS; lat/lon only at the edges (input points, output positions).
"""
import math
import os
import pathlib
from collections import Counter
from datetime import datetime, timezone

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import LineString, Point

TOOLS = pathlib.Path(os.environ.get("TOOLS", pathlib.Path.home() / "Desktop/hackaton BAINSA/tools"))
ox.settings.cache_folder = str(TOOLS / "py/osmnx-cache")
ox.settings.log_console = False
for tag in ("crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving", "noexit"):
    if tag not in ox.settings.useful_tags_node:
        ox.settings.useful_tags_node.append(tag)
for tag in ("footway", "layer", "crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving"):
    if tag not in ox.settings.useful_tags_way:
        ox.settings.useful_tags_way.append(tag)

TALENT_GARDEN = (45.44386, 9.20808)
DEMO_DESTINATION = (45.44658, 9.20584)  # viale Isonzo
SNAPSHOT = os.environ.get("LOTL_SNAPSHOT", "2026-09-26")
SPEED = 80  # metres per walking minute (speaking rule 1)
WINDOW = 800  # metres the overview describes around the session origin in a large zone
CENTRE_NAMES = {TALENT_GARDEN: "Talent Garden", (45.4642, 9.19): "the Duomo"}
FOOT = ("footway", "path", "pedestrian", "steps", "cycleway")
# same tag set as the cached Overpass query: changing it triggers a new download
FEATURE_TAGS = {"railway": ["rail", "light_rail"], "waterway": True, "landuse": ["railway", "construction"],
                "leisure": ["park", "garden"], "shop": "supermarket"}


# ---------- speaking helpers ----------
def r10(m):
    return int(round(m / 10.0) * 10)


def mins(m):
    return max(1, int(round(m / SPEED)))


def fmt(m):
    return f"{m:,} m"


def plural(n, word):
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def join_and(items):
    items = list(items)
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def bearing(p, q):
    """Degrees from north, projected points."""
    return math.degrees(math.atan2(q.x - p.x, q.y - p.y)) % 360


def rel_angle(absolute, heading):
    """Signed angle in (-180, 180]: negative is left of the heading."""
    return (absolute - heading + 180) % 360 - 180


def clock(rel):
    h = int(round((rel % 360) / 30.0)) % 12
    return {0: "ahead", 3: "right", 6: "behind", 9: "left"}.get(h, f"at {h} o'clock")


def lc(name):
    """'Via Brembo' -> 'via Brembo', as spoken mid-sentence."""
    if name and name.split()[0] in ("Via", "Viale", "Corso", "Piazza", "Piazzale", "Largo", "Vicolo", "Ripa", "Alzaia"):
        return name[0].lower() + name[1:]
    return name


def ids(kind, vals):
    out = []
    for v in vals:
        for i in (v if isinstance(v, list) else [v]):
            if f"{kind}/{i}" not in out:
                out.append(f"{kind}/{i}")
    return out


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def meta(mode="offline", cache="hit"):
    return {"mode": mode, "cache": cache, "computed_at": now_iso()}


def centre_name(zone):
    return CENTRE_NAMES.get(tuple(zone.center), zone.name)


def window(zone, session):
    """(point, radius, name) the overview counts within: a small zone's whole answer area, else 800 m around the origin."""
    if zone.answer_radius <= WINDOW or session is None or not session.origin:
        return zone.xy(*zone.center), zone.answer_radius, centre_name(zone)
    lat, lon, name = session.origin
    return zone.xy(lat, lon), WINDOW, name


class Zone:
    def __init__(self, center=TALENT_GARDEN, dist=1500, answer_radius=800, name="Porta Romana, Milan"):
        self.center, self.dist, self.answer_radius, self.name = center, dist, answer_radius, name
        G0 = ox.graph_from_point(center, dist=dist, network_type="walk", simplify=False)
        self.LL = {n: (round(d["y"], 6), round(d["x"], 6)) for n, d in G0.nodes(data=True)}
        self.G = ox.convert.to_undirected(ox.project_graph(G0))
        self.crs = self.G.graph["crs"]
        self._to_xy = Transformer.from_crs(4326, self.crs, always_xy=True).transform
        self._to_ll = Transformer.from_crs(self.crs, 4326, always_xy=True).transform
        self.E = ox.convert.graph_to_gdfs(self.G, nodes=False)
        self.ROADS = self.E[self.E["name"].notna() & ~self.E["highway"].astype(str).str.contains("|".join(FOOT))]
        # osmnx counts streets per node before truncating: fewer neighbours now = the node sits on the cut
        self.BOUNDARY = {n for n, d in self.G.nodes(data=True) if len(set(self.G[n])) < d.get("street_count", 0)}
        self.CROSSINGS = {n: self._classify(n) for n in self.G.nodes if self._is_crossing(n)}
        self.features = ox.features_from_point(center, FEATURE_TAGS, dist=dist).to_crs(self.crs)
        self.graph_inputs = {"center": list(center), "dist_m": dist, "network_type": "walk", "simplify": False,
                             "snap": "nearest_edge", "snapshot": SNAPSHOT,
                             "source": "OpenStreetMap via Overpass, osmnx " + ox.__version__}
        self.feature_inputs = {"center": list(center), "dist_m": dist, "tags": FEATURE_TAGS, "snapshot": SNAPSHOT}
        self._labels = {}

    # ---------- geometry ----------
    def xy(self, lat, lon):
        return Point(*self._to_xy(lon, lat))

    def ll(self, p):
        lon, lat = self._to_ll(p.x, p.y)
        return round(lat, 6), round(lon, 6)

    def nxy(self, n):
        return Point(self.G.nodes[n]["x"], self.G.nodes[n]["y"])

    def edata(self, u, v):
        return min(self.G[u][v].values(), key=lambda d: d["length"])

    def degree(self, n):
        return len(set(self.G[n]))

    def in_answer_area(self, lat, lon):
        return ox.distance.great_circle(*self.center, lat, lon) <= self.answer_radius

    def fact(self, type_, value, unit, source, evidence, inputs, completeness="complete"):
        return {"type": type_, "value": value, "unit": unit, "source": source, "evidence": evidence,
                "inputs": inputs, "data_date": SNAPSHOT, "completeness": completeness}

    # ---------- names ----------
    def road_name(self, geom, within=30):
        g = geom.interpolate(0.5, normalized=True) if geom.geom_type == "LineString" else geom
        d = self.ROADS.distance(g)
        if d.min() > within:
            return None
        n = self.ROADS.loc[d.idxmin()]["name"]
        return n[0] if isinstance(n, list) else n

    def crossed_road(self, geom, within=20):
        """Name of the road a crossing segment crosses: within 20 m, at least 45 degrees to it, touching it first."""
        d = self.ROADS.distance(geom.interpolate(0.5, normalized=True))
        best = None
        for i in d[d <= within].index:
            r = self.ROADS.geometry.loc[i]
            a = (bearing(Point(geom.coords[0]), Point(geom.coords[-1]))
                 - bearing(Point(r.coords[0]), Point(r.coords[-1]))) % 180
            if 45 <= a <= 135:
                key = (r.distance(geom), d[i])
                if best is None or key < best[0]:
                    best = (key, self.ROADS["name"].loc[i])
        return None if best is None else best[1][0] if isinstance(best[1], list) else best[1]

    def edge_label(self, u, v):
        """How a blind pedestrian would call this piece of way: street name, 'the pavement of X', 'the crossing of X'."""
        key = (u, v) if u < v else (v, u)
        if key in self._labels:
            return self._labels[key]
        d = self.edata(u, v)
        geom = LineString([self.nxy(u), self.nxy(v)])
        name = d.get("name")
        if d.get("footway") == "crossing":
            n = self.crossed_road(geom)
            label = f"the crossing of {lc(n)}" if n else "a crossing"
        elif d.get("footway") == "sidewalk":  # before the name: sidewalks carry stop names like "Lodi M3"
            n = self.road_name(geom)
            label = f"the pavement of {lc(n)}" if n else "a pavement"
        elif isinstance(name, (str, list)):
            label = lc(name[0] if isinstance(name, list) else name)
        elif d.get("highway") == "steps":
            label = "steps"
        else:
            label = "a footpath"
        self._labels[key] = label
        return label

    # ---------- crossings ----------
    def _crossing_tags(self, n):
        t = dict(self.G.nodes[n])
        for m in self.G[n]:
            w = self.edata(n, m)
            if w.get("footway") == "crossing":
                for k in ("crossing", "crossing:signals", "traffic_signals:sound", "tactile_paving"):
                    if isinstance(w.get(k), str):
                        t.setdefault(k, w[k])
        return t

    def _is_crossing(self, n):
        h = self.G.nodes[n].get("highway")
        return h == "crossing" or (h == "traffic_signals" and any(self.edata(n, m).get("footway") == "crossing" for m in self.G[n]))

    def _classify(self, n):
        t = self._crossing_tags(n)
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

    def path_crossings(self, path):
        return [self.CROSSINGS[n] for n in path if n in self.CROSSINGS]

    def path_ways(self, path):
        return ids("way", [self.edata(u, v)["osmid"] for u, v in zip(path, path[1:]) if self.G.has_edge(u, v)])

    # ---------- routing ----------
    def snap(self, lat, lon):
        """Nearest point on the walk network: the edge (u, v), distances along it, and the offset from the input point."""
        p = self.xy(lat, lon)
        d = self.E.distance(p)
        (u, v, _k) = d.idxmin()
        g = LineString([self.nxy(u), self.nxy(v)])
        s = g.project(p)
        return {"u": u, "v": v, "su": s, "sv": g.length - s, "off": float(d.min()),
                "node": u if s <= g.length / 2 else v, "lat": lat, "lon": lon}

    def route(self, H, a, b):
        """Shortest walk between two snapped points on graph H: (metres incl. access, node path) or (None, None)."""
        H = nx.Graph(H)
        for name, s in (("A", a), ("B", b)):
            for n, w in ((s["u"], s["su"]), (s["v"], s["sv"])):
                if n in H:
                    H.add_edge(name, n, length=w)
        self._same_edge(H, a, b)
        try:
            path = nx.shortest_path(H, "A", "B", weight=lambda u, v, d: d.get("w", d["length"]))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None, None
        return nx.path_weight(H, path, "length") + a["off"] + b["off"], path[1:-1]

    def with_points(self, a, b):
        """Undirected graph with the two snapped points added as nodes 'A' and 'B'."""
        H = nx.Graph(self.G)
        for name, s in (("A", a), ("B", b)):
            H.add_edge(name, s["u"], length=s["su"])
            H.add_edge(name, s["v"], length=s["sv"])
        self._same_edge(H, a, b)
        return H

    @staticmethod
    def _same_edge(H, a, b):
        """Two points snapped to the same edge are joined directly, not through its end nodes."""
        if {a["u"], a["v"]} == {b["u"], b["v"]}:
            H.add_edge("A", "B", length=abs(a["su"] - (b["su"] if b["u"] == a["u"] else b["sv"])))

    def without(self, pred):
        return self.G.subgraph([n for n in self.G.nodes if not (n in self.CROSSINGS and pred(self.CROSSINGS[n]))])

    def penalised(self, pred, cost=10_000):
        """Avoid when possible: each crossing matching pred costs 10 km, so the route has the fewest of them, then is shortest."""
        H = nx.Graph()
        for u, v, d in self.G.edges(data=True):
            w = d["length"] + sum(cost / 2 for n in (u, v) if n in self.CROSSINGS and pred(self.CROSSINGS[n]))
            if not H.has_edge(u, v) or H[u][v]["w"] > w:
                H.add_edge(u, v, length=d["length"], w=w)
        return H

    # ---------- walking the network junction to junction ----------
    def branch(self, n, m):
        """From node n through neighbour m to the next junction, dead end or boundary node: (path, label, metres)."""
        path, prev, cur = [n, m], n, m
        while self.degree(cur) == 2 and cur not in self.BOUNDARY:
            nxt = next(x for x in self.G[cur] if x != prev)
            if nxt in path:  # only path[0] is possible: a loop back to the junction
                path.append(nxt)
                break
            path.append(nxt)
            prev, cur = cur, nxt
        labels = Counter()
        for u, v in zip(path, path[1:]):
            labels[self.edge_label(u, v)] += self.edata(u, v)["length"]
        return path, labels.most_common(1)[0][0], sum(self.edata(u, v)["length"] for u, v in zip(path, path[1:]))

    def branches(self, node, exclude=None, min_len=8):
        """Every way out of node except `exclude` (a neighbour), folding hops shorter than min_len into what lies beyond."""
        todo = [self.branch(node, m) for m in self.G[node] if m != exclude]
        out = []
        while todo:
            path, name, length = todo.pop()
            end = path[-1]
            if length < min_len and self.degree(end) > 2 and end not in self.BOUNDARY:
                for m2 in self.G[end]:
                    if m2 != path[-2] and m2 not in path:
                        p2, n2, l2 = self.branch(end, m2)
                        if p2[-1] != path[0]:  # that loop is also reached the other way round
                            todo.append((path + p2[1:], n2, length + l2))
                continue
            out.append((path, name, length))
        return out

    def leads_to(self, path, name):
        end = path[-1]
        if end == path[0]:
            return "a loop back to this junction"
        if end in self.BOUNDARY:
            return "the edge of the mapped area"
        if self.degree(end) == 1:
            return "a dead end"
        others = sorted({self.edge_label(end, x) for x in self.G[end] if x != path[-2]} - {name})
        return "a junction with " + join_and(others) if others else "a junction"

    def first_dir(self, path):
        """Bearing of the first ~8 m of a path, so a kink at the junction does not decide the direction."""
        p, i = self.nxy(path[0]), 1
        while i < len(path) - 1 and p.distance(self.nxy(path[i])) < 8:
            i += 1
        return bearing(p, self.nxy(path[i]))

    def arrival_dir(self, path):
        return bearing(self.nxy(path[-2]), self.nxy(path[-1]))

    # ---------- barriers ----------
    def railway(self):
        rail = self.features[self.features["railway"].isin(["rail", "light_rail"])] if "railway" in self.features else None
        return rail

    def railway_places(self, cluster_m=40, radius=None):
        """Places inside the answer area (or `radius` m) where a walkable edge crosses the railway, grouped 40 m apart."""
        rail = self.railway()
        if rail is None or rail.empty:
            return []
        rail_u = rail.union_all()
        c = self.xy(*self.center)
        xing = self.E[self.E.intersects(rail_u)]
        places = []
        for _idx, row in xing.iterrows():
            p = row.geometry.intersection(rail_u).centroid
            if p.distance(c) > (self.answer_radius if radius is None else radius):
                continue
            for pl in places:
                if any(p.distance(q) < cluster_m for q in pl["pts"]):
                    pl["pts"].append(p)
                    pl["rows"].append(row)
                    break
            else:
                places.append({"pts": [p], "rows": [row]})
        for pl in places:
            names = [r["name"] for r in pl["rows"] if isinstance(r["name"], str) and r["highway"] not in FOOT]
            pl["name"] = f"the {lc(names[0])} bridge" if names else "an unnamed bridge"
            pl["underpass"] = any(r.get("tunnel") == "yes" for r in pl["rows"])
            pl["phrase"] = pl["name"] + (", with an underpass beside it" if pl["underpass"] else "")
            pl["point"] = pl["pts"][0]
            pl["evidence"] = ids("way", [r["osmid"] for r in pl["rows"]])
        return places
