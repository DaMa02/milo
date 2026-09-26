"""Fixed phrases -> action, no model, ~0 ms. English plus basic Italian.

parse(utterance, context) returns (action, params) or None when the phrase is not in the grammar (the caller asks Claude).
Indexes (branch, confirm, route) count from 0, like explore's branches.
"""
import re

ORD = {"first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4, "last": -1,
       "one": 0, "two": 1, "three": 2, "four": 3, "five": 4,
       "primo": 0, "prima": 0, "secondo": 1, "seconda": 1, "terzo": 2, "terza": 2, "quarto": 3, "quarta": 3}

FIXED = {
    ("explore", "forward"): "forward|ahead|go ahead|go forward|go on|keep going|let's walk|lets walk|let's go|walk|continue|"
                            "go straight|straight on|avanti|vai avanti|andiamo|continua|prosegui",
    ("explore", "left"): "left|turn left|go left|go to the left|to the left|sinistra|a sinistra|gira a sinistra|vai a sinistra",
    ("explore", "right"): "right|turn right|go right|go to the right|to the right|destra|a destra|gira a destra|vai a destra",
    ("explore", "back"): "back|go back|step back|indietro|torna indietro",
    ("explore", "home"): "home|go home|back to the start|go back to the start|back to start|back to the beginning|"
                         "torna all'inizio|torna all inizio|all'inizio",
    ("explore", "where"): "where am i|where am i now|where are we|dove sono|dove mi trovo|dove siamo",
    ("explore", "start"): "explore|start exploring|let's explore|esplora|inizia",
    ("repeat", None): "repeat|repeat that|say again|say that again|again|pardon|what|ripeti|puoi ripetere|come",
    ("stop", None): "stop|quiet|be quiet|shut up|silence|enough|basta|zitto|silenzio|fermati",
    ("more", None): "more|more detail|more details|tell me more|go on telling|più dettagli|piu dettagli|dimmi di più|dimmi di piu",
    ("unknowns", None): "what don't you know|what do you not know|what don't you know about|what are you unsure about|"
                        "what is unknown|cosa non sai",
    ("sources", None): "sources|source|where does this come from|what are your sources|fonti|le fonti",
    ("help", None): "help|what can i say|what can i do|what can i ask|aiuto|cosa posso dire|cosa posso chiedere",
    ("speed", "faster"): "faster|speak faster|talk faster|speed up|più veloce|piu veloce",
    ("speed", "slower"): "slower|speak slower|talk slower|slow down|più lento|piu lento|più piano|piu piano",
    ("start_over", None): "start over|restart|reset|start again|begin again|ricomincia|ricominciamo|da capo",
    ("overview", None): "overview|give me the overview|describe the area|panoramica",
    ("set_origin_here", None): "use my location|use my current location|use my position|use where i am|i'm here|i am here|"
                               "start here|start from here|usa la mia posizione|sono qui|parto da qui",
    ("route", None): "how do i get there|how do we get there|route|the route|directions|give me directions|get directions|"
                     "plan the route|plan a route|show me the way|lead the way|take me there|get me there|lead me there|"
                     "portami lì|portami li|come ci arrivo|come arrivo|percorso|indicazioni",
}
FIXED = {k: set(v.split("|")) for k, v in FIXED.items()}

YES = {"yes", "yeah", "yep", "yup", "correct", "that's right", "thats right", "right", "exactly", "that one", "ok", "okay",
       "sure", "sì", "si", "esatto", "giusto", "certo", "va bene", "quello", "quella"}
NO = {"no", "nope", "not that", "not that one", "wrong", "no thanks", "neither", "none of them", "non è quello", "sbagliato"}

ORIGIN = r"(?:start(?:ing)? (?:from|at)|i'm at|i am at|i'm in|i am in|i'm near|i am near|parto da|sono a|sono al|sono alla|sono in|sono vicino a)"
DEST = (r"(?:i'm going to|i am going to|i want to go to|i'd like to go to|take me to|go to|get me to|navigate to|"
        r"my destination is|destination|vado a|vado al|vado alla|vado in|portami a|portami al|portami alla|"
        r"voglio andare a|voglio andare al|la mia destinazione è)")
AVOID = r"(?:avoid|no|without|never|don't use|evita|niente|senza)"
KIND = [("signals_without_sound", r"(?:signal|light)s? without (?:sound|audio)|silent (?:signal|light)|semafori? (?:senza suono|muti)"),
        ("unsignalled_crossings", r"crossings? without (?:signal|light)|unsignal|uncontrolled crossing|attraversamenti senza semafor"),
        ("steps", r"steps|stairs|staircase|scale|gradini"),
        ("construction", r"construction|roadworks|road works|cantier"),
        ("main_roads", r"main (?:road|street)|busy (?:road|street)|big (?:road|street)|traffic|strade principali|traffico"),
        ("transfers", r"transfer|chang(?:e|ing) (?:bus|line)|cambi")]
SIDE_ONLY = r"only (?:side|quiet|small|secondary) (?:streets|roads)|side streets only|solo strade secondarie"
TAKE = r"^(?:take|use|choose|pick|go with|i'll take|let's take|prendi|scegli|prendiamo)\s+(.+)$"
# route ids are fixed by lotl/plan.py: B the shortest on foot, A main streets or fewest violations, C public transport
HINTS = [("B", r"\b(?:shortest|quickest|fastest)\b|più (?:corto|breve|veloce)|piu (?:corto|breve|veloce)"),
         ("A", r"\bmain (?:streets?|roads?)\b|strade principali"),
         ("C", r"\b(?:bus|tram|metro|transit|public transport|autobus|mezzi)\b")]
STOP = {"the", "a", "an", "one", "route", "way", "il", "la", "lo", "l'", "quella", "quello", "strada", "via", "percorso"}


def clean(text):
    t = re.sub(r"[.!?,;:¿¡\"]+", " ", text.strip()).replace("’", "'")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^(?:ok(?:ay)?|so|and|please|now|well|hey|allora|ecco|per favore)\s+(?=\S)", "", t, flags=re.I)
    return re.sub(r"\s+(?:please|now|then|per favore|instead|invece)$", "", t, flags=re.I).strip()


def query(s):
    return re.sub(r"^(?:the|il|la|lo|l'|i|le|gli)\s+", "", s.strip(), flags=re.I).strip()


def ordinal(s):
    """'the second one', 'number 2', '2', 'il secondo' -> 1; None if s is not an ordinal."""
    s = re.sub(r"^(?:the|il|la|lo|number|numero|option|opzione|route|percorso)\s+", "", s)
    s = re.sub(r"^(?:the|number)\s+", "", s)
    s = re.sub(r"\s+(?:one|route|option|way)$", "", s)
    if s.isdigit() and 0 < int(s) < 20:
        return int(s) - 1
    return ORD.get(s)


def route_match(phrase, routes, strict=False):
    """strict (no "take"): every word must be in the label, so "is it far" never picks a route."""
    ids = {r["id"].lower(): r["id"] for r in routes}
    bare = re.sub(r"^(?:the |il |la )?(?:route |percorso |option |opzione )?", "", phrase)
    if bare in ids:
        return ids[bare]
    words = set(re.findall(r"[\w']+", phrase)) - STOP
    scored = [(len(words & (set(re.findall(r"[\w']+", r.get("label", "").lower())) - STOP)), r["id"]) for r in routes]
    scored.sort(reverse=True)
    if scored and scored[0][0] and (len(scored) == 1 or scored[1][0] < scored[0][0]) and not (strict and scored[0][0] < len(words)):
        return scored[0][1]
    for rid, rx in HINTS:
        if re.search(rx, phrase) and rid.lower() in ids:
            return ids[rid.lower()]


def parse(utterance, ctx=None):
    ctx = ctx or {}
    raw = clean(utterance)
    t = raw.lower()
    if not t:
        return None
    routes = [r for r in ctx.get("routes") or [] if r.get("id")]
    if ctx.get("pending"):
        m = re.fullmatch(r"(?:yes|yeah|sì|si|no|nope)\b\s*(.+)", t)
        i = ordinal(m.group(1) if m else t)  # "no, the second one" picks the second
        if i is not None:
            n = len(ctx.get("candidates") or [])
            i = i + n if i < 0 else i
            return "confirm", {"answer": "yes", **({"index": i} if i >= 0 else {})}
        if t in YES or re.fullmatch(r"(?:yes|yeah|sì|si)\b.*", t):
            return "confirm", {"answer": "yes"}
        if t in NO or re.fullmatch(r"(?:no|nope)\b.*", t):
            return "confirm", {"answer": "no"}
    if re.search(SIDE_ONLY, t):
        return "route_avoid", {"kind": "main_roads", "strength": "require"}
    m = re.fullmatch(AVOID + r"\s+(.+)", t)
    if m:
        for kind, rx in KIND:
            if re.search(rx, m.group(1)):
                strong = t.startswith("never") or re.search(r"\bat all\b|\bmai\b", t)
                return "route_avoid", {"kind": kind, **({"strength": "require"} if strong else {})}
    for (action, sub), phrases in FIXED.items():
        if t in phrases:
            if action == "explore":
                return action, {"command": sub}
            return action, ({"change": sub} if action == "speed" else {})
    m = re.fullmatch(DEST + r"\s+(.+)", raw, flags=re.I)
    if m and query(m.group(1)) and ordinal(query(m.group(1)).lower()) is None:
        return "set_destination", {"query": query(m.group(1))}
    m = re.fullmatch(ORIGIN + r"\s+(.+)", raw, flags=re.I)
    if m and query(m.group(1)) and query(m.group(1)).lower() not in ("here", "qui"):
        return "set_origin", {"query": query(m.group(1))}
    m = re.fullmatch(TAKE, t)
    phrase = m.group(1) if m else t
    explore = ctx.get("view") == "explore"
    if routes and not explore and (m or len(t.split()) <= 3):
        rid = route_match(phrase, routes, strict=not m)
        i = ordinal(phrase)
        if rid is None and i is not None and -len(routes) <= i < len(routes):
            rid = routes[i]["id"]
        if rid:
            return "route_select", {"route_id": rid}
    if m:
        i = ordinal(phrase)
        if i is not None:
            return "explore", {"command": "take", "branch": i}
        if routes:
            rid = route_match(phrase, routes)
            if rid:
                return "route_select", {"route_id": rid}
        return "explore", {"command": "take", "branch": query(raw[len(raw) - len(phrase):])}
    if explore:
        i = ordinal(t)
        if i is not None:
            return "explore", {"command": "take", "branch": i}
    return None
