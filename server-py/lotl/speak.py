"""What the app says now: Claude turns an engine result into at most 2 short sentences + one next-step hint.

reply(llm, model, kind, utterance, result, trip) -> (text + the kind's fixed hint, via). Every number Claude writes must appear in the result
(or the trip facts); otherwise, on a timeout or any error, the engine's own text (first 2 sentences) + the hint.
"""
import json
import re

HINTS = {
    "overview": "Say 'how do I get there' to plan the route, or 'more' for detail.",
    "explore": "Say 'turn left', 'turn right' or 'take' and a street name.",
    "answer": "Say 'how do I get there' to plan the route, or 'more' for detail.",
    "plan": "Say 'let's go' to start, or 'other routes' to compare.",
    "places": "Is that right? Say 'yes' or 'no'.",
    "navigate": "Say 'repeat' to hear it again, or 'stop guiding' to end.",
    "error": "Say 'help' to hear what I can do.",
}

SYSTEM = """You are the voice of Lay of the Land, a walking app for blind people in Milan. You get the user's words, what the app's map engine found (result JSON) and facts about the trip. Write what the app says now, to be read aloud.

Rules:
- At most 2 short sentences that directly answer the user's words, using ONLY the result and the trip facts. Do not add a next-step hint or tell the user what to say: the app adds that itself.
- Copy every number exactly as the result gives it, in metres and minutes; keep clock positions as given ("at 3 o'clock"). Never compute, round or invent a number.
- No lists, no repetition, no alternatives unless asked, and nothing the map does not know unless the user asks what the app does not know.
- kind plan: recommend the selected route, or route A, in one sentence (its time, and its crossings without signals if more than 0); do not mention the other routes.
- kind explore: where the user is and how many ways out, naming at most 3 of them from left to right by street and clock position only, without their distances.
- kind overview: only the 2 most useful things (for example the railway ahead and how to cross it), not everything.
- kind places: confirm the place in one sentence; the app then asks "Is that right?".
- Plain English for the ear: no markdown, no emoji, no URLs."""

NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
WORDS = {w: str(i) for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split())}
DROP = ("osm_ids", "evidence", "inputs", "meta", "geometry", "polyline", "coords", "lat", "lon", "sources",
        "source", "data_date", "completeness")  # fact metadata: noise for the ear, and every token costs latency
SENTENCES = {"plan": 1, "overview": 3, "explore": 4}  # engine fallback: plan = route A only; overview/explore reach the crossing / the ways out


def norm(tok):
    tok = tok.replace(",", "")
    return str(int(float(tok))) if float(tok).is_integer() else str(float(tok))


def numbers(doc):
    """Every number in a JSON tree, as strings (numeric values and numbers inside strings)."""
    if isinstance(doc, dict):
        return set().union(*(numbers(v) for v in doc.values())) if doc else set()
    if isinstance(doc, list):
        return set().union(*(numbers(v) for v in doc)) if doc else set()
    if isinstance(doc, bool) or doc is None:
        return set()
    if isinstance(doc, (int, float)):
        return {norm(str(doc))}
    return {norm(t) for t in NUM.findall(str(doc))}


def backed(text, allowed):
    """True when every digit number and every number word (two..twelve; 'one' is too often a pronoun) is in allowed."""
    said = {norm(t) for t in NUM.findall(text)}
    said |= {WORDS[w] for w in re.findall(r"[a-z]+", text.lower()) if w in WORDS and w not in ("one", "zero")}
    return said <= allowed


def trim(doc, drop=DROP):
    if isinstance(doc, dict):
        return {k: trim(v, drop) for k, v in doc.items() if k not in drop}
    if isinstance(doc, list):
        return [trim(v, drop) for v in doc]
    return doc


def engine(kind, result):
    text = str((result or {}).get("text") or "")
    first = " ".join(re.split(r"(?<=[.!?])\s+", text.strip())[:SENTENCES.get(kind, 2)]).strip()
    return f"{first} {HINTS.get(kind, HINTS['error'])}".strip()


def reply(llm, model, kind, utterance, result, trip):
    if llm is None:
        return engine(kind, result), "engine"
    try:
        r = llm.beta.messages.create(
            model=model, max_tokens=400, system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(
                {"kind": kind, "user_said": utterance, "trip": trip, "result": trim(result, DROP + (("crossings",) if kind == "plan" else ()))}, ensure_ascii=False)}],
            output_config={"effort": "low"}, betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        text = " ".join(b.text.strip() for b in r.content if b.type == "text" and b.text.strip())
        text = re.sub(r"\s+", " ", re.sub(r"[*_#`]|\bhttps?://\S+", "", text)).strip()
    except Exception:  # noqa: BLE001 timeout, network, bad shape: the engine speaks
        return engine(kind, result), "engine"
    if r.stop_reason in ("refusal", "max_tokens") or not text or not backed(text, numbers(result) | numbers(trip)):
        return engine(kind, result), "engine"
    return f"{text} {HINTS.get(kind, HINTS['error'])}", "claude"
