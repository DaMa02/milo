"""POST /speak {utterance, lang, session_id?, kind, result} -> 200 {text, via: claude|engine}. See lotl/speak.py.

    app.include_router(make_router(get_session))
"""
import os
from functools import lru_cache
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from interpret_api import trip_facts
from lotl import speak
from lotl.llm import MODEL, client


class SpeakIn(BaseModel):
    utterance: str = ""
    lang: str = "en"
    session_id: Optional[str] = None
    kind: Literal["overview", "explore", "answer", "plan", "places", "navigate", "error"]
    result: dict = {}


@lru_cache(maxsize=1)
def fast_client():
    """One client for the process: the TLS connection is reused, 3 s and no retries so the engine speaks on a slow call."""
    return client().with_options(timeout=3.0, max_retries=0)


def make_router(get_session, llm=None):
    """llm: a client with .beta.messages.create (tests pass a fake); default: lotl.llm.client() when a key is set."""
    router = APIRouter()

    @router.post("/speak")
    def speak_now(body: SpeakIn):
        try:
            s = get_session(body.session_id) if body.session_id else None
        except HTTPException:
            s = None
        c = llm or (fast_client() if os.environ.get("ANTHROPIC_API_KEY") else None)
        text, via = speak.reply(c, MODEL, body.kind, body.utterance[:500], body.result, trip_facts(s))
        return {"text": text, "via": via}

    return router
