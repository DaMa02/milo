"""Overview: the shape of the zone from the session's reference point and facing (Overview schema)."""
from functools import lru_cache

from shapely.affinity import rotate
from shapely.geometry import Point
from shapely.ops import nearest_points

from .zone import clock, window, bearing, fmt, ids, lc, meta, plural, r10, rel_angle

SPOKEN_NAMES = {"Cintura sud di Milano": "the southern belt railway"}
COMPASS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
CONSTRUCTION_M = 400  # construction sites said in the overview
MAIN_ROAD_M = 500     # main roads said in the overview
MAIN = "primary|secondary|trunk"


@lru_cache(maxsize=4)
def _static(zone):
    """Everything that does not depend on the reference point, computed once per zone."""
    rail = zone.railway()
    s = {"rail": None, "places": zone.railway_places()}
    if rail is not None and not rail.empty:
        u = rail.union_all()
        s["rail"] = {"gdf": rail, "geom": u, "buf": u.buffer(10)}
    f = zone.features
    s["construction"] = f[f["landuse"] == "construction"] if "landuse" in f else f.iloc[:0]
    main = zone.E[zone.E["highway"].astype(str).str.contains(MAIN) & zone.E["name"].notna()]
    names = main["name"].map(lambda n: n[0] if isinstance(n, list) else n)
    s["roads"] = [(lc(n), g.union_all(), ids("way", g["osmid"].tolist())[:10]) for n, g in main.groupby(names)]
    return s


@lru_cache(maxsize=64)
def _rail(zone, x, y, R):
    """The railway inside the window of radius R around (x, y): None when no railway is there."""
    r = _static(zone)["rail"]
    disc = Point(x, y).buffer(R)
    if r is None or not r["geom"].intersects(disc):
        return None
    rows = r["gdf"][r["gdf"].intersects(disc)]
    parts = [p for p in getattr(disc.difference(r["buf"]), "geoms", [disc]) if p.area > disc.area * 0.05]
    return {"geom": r["geom"], "in_area": r["geom"].intersection(disc), "ids": ids("way", [i[1] for i in rows.index]),
            "name": rows["name"].dropna().mode()[0] if rows["name"].notna().any() else "railway", "parts": parts}


def ref_heading(session):
    """The facing every direction refers to: where exploration started, else the session's facing."""
    return (session.start[1] if session.start else session.heading or 0) % 360


def overview(zone, session):
    """Overview schema from session.origin (lat, lon, name) and the reference facing (0 = north)."""
    lat, lon, name = session.origin
    heading = ref_heading(session)
    st, o = _static(zone), zone.xy(lat, lon)
    wc, R, center = window(zone, session)
    at_center = o.distance(wc) < 20

    def near(geom):
        g = geom.boundary if geom.geom_type in ("Polygon", "MultiPolygon") else geom
        q = nearest_points(g, o)[0]
        return r10(q.distance(o)), clock(rel_angle(bearing(o, q), heading)), q

    dist_in = {"graph": zone.graph_inputs, "from": [lat, lon], "heading_deg": round(heading),
               "method": "straight line to nearest point"}
    facts, details, barriers, unknown = [], [], [], []
    facing = COMPASS[int(round(heading / 45)) % 8]
    s = zone.snap(lat, lon)
    street = zone.edge_label(s["u"], s["v"]).removeprefix("the pavement of ").removeprefix("the crossing of ")
    street = None if street.startswith("a ") or street == "steps" or street.lower() in name.lower() else street
    text = [f"Facing {facing} from {name}."]

    # railway: distance, how it runs across the facing, how it splits the area, crossing places
    rail, places = _rail(zone, round(wc.x), round(wc.y), R), []
    for p in (p for p in st["places"] if p["point"].distance(wc) <= R):  # copies: the cached places are shared by every session
        d, c, _q = near(p["point"])
        places.append({**p, "dist": d, "clock": c})
    places.sort(key=lambda p: p["dist"])
    if rail:
        rd, rc, rq = near(rail["geom"])
        spoken = SPOKEN_NAMES.get(rail["name"], f"the railway {rail['name']}")
        spoken = spoken[0].upper() + spoken[1:]
        seen = rotate(rail["in_area"] if not rail["in_area"].is_empty else rail["geom"], heading, origin=o)
        x0, y0, x1, y1 = seen.bounds
        across = "from your left to your right" if x1 - x0 > y1 - y0 else "from ahead of you to behind you"
        n = len(rail["parts"])
        side = COMPASS[int(round(bearing(rq, o) / 45)) % 8]
        split = (f"splits the area in two; you are on the {side} side" if n == 2 else
                 f"splits the area in {n} parts; you are on the {side} side" if n > 2 else "does not split the area")
        text.append(f"{spoken} runs {across}, {fmt(rd)} {rc}, and {split}.")
        facts.append(zone.fact("barrier_distance", rd, "m", "computed", rail["ids"], {**dist_in, "feature": rail["name"]}))
        if n > 2:
            facts.append(zone.fact("area_parts", n, "count", "computed", rail["ids"][:10],
                                   {"graph": zone.graph_inputs, "railway": rail["name"], "radius_m": R}))
        barriers.append({"name": rail["name"], "kind": "railway", "relative_direction": rc, "distance_m": rd,
                         "osm_ids": rail["ids"][:5], "crossings_on_foot": len(places)})
        within = fmt(R) + ("" if at_center else f" of {center}")
        if places:
            p0 = places[0]
            text.append(f"Within {within} you can cross it on foot in {plural(len(places), 'place')}, "
                        f"the nearest is {p0['name']}, {fmt(p0['dist'])} {p0['clock']}.")
        else:
            text.append(f"Within {within} the map shows no place to cross it on foot.")
        facts.append(zone.fact("railway_crossing_places", len(places), "count", "computed",
                               [e for p in places for e in p["evidence"]] or rail["ids"][:10],
                               {"graph": zone.graph_inputs, "railway": rail["name"], "cluster_m": 40, "radius_m": R},
                               "unknown"))
        facts += [zone.fact("railway_crossing_distance", p["dist"], "m", "computed", p["evidence"],
                            {**dist_in, "place": p["name"]}) for p in places]
        facts.append(zone.fact("barrier", rail["name"], None, "map_tag", rail["ids"], zone.feature_inputs))
        unknown.append(f"Railway crossings are counted only within {fmt(R)} of {center}; there may be more farther away.")

    # construction sites within 400 m, nearest first
    sites = []
    cons = st["construction"]
    for idx, row in cons[cons.distance(o) <= CONSTRUCTION_M].iterrows():
        d, c, q = near(row.geometry)
        if d <= CONSTRUCTION_M:
            nm = row["name"] if isinstance(row.get("name"), str) else "a construction site"
            sites.append({"name": nm, "dist": d, "clock": c, "q": q, "id": f"{idx[0]}/{idx[1]}"})
    sites.sort(key=lambda x: x["dist"])
    if sites:
        c0 = sites[0]
        between = rail and c0["dist"] < rd and abs(rel_angle(bearing(o, c0["q"]), bearing(o, rq))) < 60
        sent = ("Between you and the railway there is" if between else "There is") + " a construction site" \
            + ("" if c0["name"] == "a construction site" else f", {c0['name']},") + f" {fmt(c0['dist'])} {c0['clock']}"
        if len(sites) > 1:
            sent += (f"; {plural(len(sites) - 1, 'other construction site')} within {fmt(CONSTRUCTION_M)}, "
                     f"the nearest {fmt(sites[1]['dist'])} {sites[1]['clock']}")
            facts += [zone.fact("construction_sites", len(sites) - 1, "count", "computed", [x["id"] for x in sites[1:]],
                                {**zone.feature_inputs, "from": [lat, lon], "within_m": CONSTRUCTION_M, "excluding": c0["id"]}),
                      zone.fact("search_radius", CONSTRUCTION_M, "m", "unknown", [], {"feature": "construction sites"})]
        details.append(sent + ".")
        for x in sites:
            facts += [zone.fact("barrier_distance", x["dist"], "m", "computed", [x["id"]], {**dist_in, "feature": x["name"]}),
                      zone.fact("barrier", x["name"], None, "map_tag", [x["id"]], zone.feature_inputs)]
            barriers.append({"name": x["name"], "kind": "construction", "relative_direction": x["clock"],
                             "distance_m": x["dist"], "osm_ids": [x["id"]], "crossings_on_foot": None})

    # main roads within 500 m, grouped by name, nearest first
    roads = []
    for nm, geom, ev in st["roads"]:
        d, c, _q = near(geom)
        if d <= MAIN_ROAD_M:
            roads.append({"name": nm, "dist": d, "clock": c, "evidence": ev})
    roads.sort(key=lambda r: r["dist"])
    if roads:
        details.append("Main roads you will hear: " + "; ".join(f"{r['name']}, {fmt(r['dist'])} {r['clock']}" for r in roads) + ".")
    facts += [zone.fact("main_road_distance", r["dist"], "m", "computed", r["evidence"], {**dist_in, "road": r["name"]})
              for r in roads]
    if places:
        details.append("Railway crossings on foot: " + "; ".join(f"{p['phrase']}, {fmt(p['dist'])} {p['clock']}" for p in places) + ".")
    facts.append(zone.fact("radius", R, "m", "unknown", [], {"graph": zone.graph_inputs}))
    if any(ch.isdigit() for ch in name):  # a house number in the origin name is spoken: said by the user
        facts.append(zone.fact("origin_name", name, None, "unknown", [], {"origin": [lat, lon]}))
    landmarks = [{"name": p["phrase"], "kind": "bridge", "relative_direction": p["clock"], "distance_m": p["dist"],
                  "osm_ids": p["evidence"][:5]} for p in places] + \
                [{"name": r["name"], "kind": "main_road", "relative_direction": r["clock"], "distance_m": r["dist"],
                  "osm_ids": r["evidence"][:5]} for r in roads]
    if not rail and not sites:
        text.append("The map shows no railway or construction site near you.")
    ref_text = f"Standing at {name}" + (f" on {street}" if street else "") + f", facing {facing}."
    return {
        "zone": {"name": zone.name, "center": {"lat": zone.center[0], "lon": zone.center[1]}, "radius_m": zone.answer_radius},
        "lang": "en",
        "reference": {"place": f"{name}, {street}" if street else name, "lat": lat, "lon": lon,
                      "heading_deg": round(heading) % 360, "text": ref_text},
        "text": " ".join(text),
        "details": details or ["Nothing more on the map near you."],
        "landmarks": landmarks,
        "barriers": barriers,
        "facts": facts,
        "unknown": unknown,
        "meta": meta(),
    }
