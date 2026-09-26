"""A question in the user's own words -> one of the five deterministic tools and its params, via Claude.

The model only picks a tool and copies names from the question; every number and sentence the user
hears comes from lotl.tools. Server-side only: ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, ANTHROPIC_MODEL.
"""
import json
import os

import anthropic

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5-5")
TOOLS = ("walking_vs_straight_line", "barrier_between", "street_continuity", "independent_connections", "extent", "place_info")

SYSTEM = """You route a question from a blind person exploring a neighbourhood in Milan to exactly one of five deterministic map tools. You never answer the question yourself.

Tools:
- walking_vs_straight_line (from_place optional, to_place): how far, how close, how long on foot, is it near.
- barrier_between (from_place optional, to_place): is there anything between two places, what separates them, can I cross.
- independent_connections (from_place optional, to_place): how many different ways connect two places, what if one street is closed.
- street_continuity (street): does a street go through or end, is it a dead end.
- extent (place): how big a park, square, construction site or street is, how far it extends.
- place_info (place): is a shop, pharmacy, café or other place open, its hours, its wheelchair access, what it is.

Rules:
- Copy place and street names exactly as the user wrote them. Never translate, correct, invent or add places, numbers or coordinates.
- Leave from_place empty when the user means where they are now.
- The trip's destination (the party, my destination, there) is to_place "destination".
- Fill only the fields the chosen tool uses; leave the others as empty strings.
- If no tool fits, set tool to "none"."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["tool", "from_place", "to_place", "street", "place"],
    "properties": {
        "tool": {"type": "string", "enum": [*TOOLS, "none"]},
        "from_place": {"type": "string"},
        "to_place": {"type": "string"},
        "street": {"type": "string"},
        "place": {"type": "string"},
    },
}


CLARIFY = ("I can answer five kinds of question about this area: how far a place is on foot, what lies between two places, "
           "how many independent ways connect them, whether a street goes through or ends, and how big a place is. Which one would you like?")


class Unavailable(Exception):
    """The model could not be reached or declined; the caller falls back to offering the tools."""


def client():
    ws = os.environ.get("ANTHROPIC_WORKSPACE_ID")
    return anthropic.Anthropic(max_retries=1, timeout=20.0,
                               default_headers={"anthropic-workspace-id": ws} if ws else None)


def interpret(question, llm=None):
    """Return (tool, params); ("none", {}) when no tool fits (the caller answers with CLARIFY)."""
    if llm is None and not os.environ.get("ANTHROPIC_API_KEY"):
        raise Unavailable("no ANTHROPIC_API_KEY on the server")
    try:
        llm = llm or client()
        r = llm.beta.messages.create(
            model=MODEL, max_tokens=1024, system=SYSTEM,
            messages=[{"role": "user", "content": question}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        )
    except anthropic.AnthropicError as e:  # no key, network, rate limit, server error: all mean "not now"
        raise Unavailable(str(e)) from e
    if r.stop_reason == "refusal":
        raise Unavailable("the model declined")
    out = json.loads(next(b.text for b in r.content if b.type == "text"))
    tool = out["tool"]
    if tool == "none":
        return "none", {}
    place = lambda s: {"name": s} if s else None
    params = {"walking_vs_straight_line": {"from": place(out["from_place"]), "to": place(out["to_place"])},
              "barrier_between": {"from": place(out["from_place"]), "to": place(out["to_place"])},
              "independent_connections": {"from": place(out["from_place"]), "to": place(out["to_place"])},
              "street_continuity": {"street": out["street"]},
              "extent": {"place": out["place"]},
              "place_info": {"place": place(out["place"])}}[tool]
    return tool, {k: v for k, v in params.items() if v is not None}


if __name__ == "__main__":
    # live smoke test, costs a few cents: python -m lotl.llm
    for q in ("Is the party close to here?", "Is there anything between me and viale Isonzo?",
              "Does via Brembo go through?", "C'è qualcosa tra me e la festa?", "What colour is the sky?"):
        print(q, "->", interpret(q))
