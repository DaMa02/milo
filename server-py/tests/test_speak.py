"""POST /speak: Claude's short reply is kept only when every number is in the result (fake client, no network).

    python tests/test_speak.py
"""
import os
import sys
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.pop("ANTHROPIC_API_KEY", None)

import anthropic  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from lotl import speak  # noqa: E402
from speak_api import make_router  # noqa: E402


class Fake:
    def __init__(self, text=None, error=None, stop="end_turn"):
        self.text, self.error, self.stop, self.calls = text, error, stop, []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kw):
        self.calls.append(kw)
        if self.error:
            raise self.error
        return NS(stop_reason=self.stop, content=[NS(type="text", text=self.text)])


PLAN = {"text": "Route A takes 14 minutes with 2 crossings without signals. Route B takes 16 minutes. Route C takes the bus.",
        "routes": [{"id": "A", "duration_min": 14}], "selected_route_id": None}


def post(llm, kind="plan", result=PLAN):
    app = FastAPI()
    app.include_router(make_router(lambda sid: None, llm=llm))
    r = TestClient(app).post("/speak", json={"utterance": "how do I get there", "kind": kind, "result": result})
    assert r.status_code == 200, r.text
    return r.json()


def main():
    good = "Take route A: 14 minutes, with two crossings without signals."
    f = Fake(good)
    assert post(f) == {"text": good + " " + speak.HINTS["plan"], "via": "claude"}  # the app adds the fixed hint
    assert f.calls[0]["output_config"] == {"effort": "low"} and f.calls[0]["fallbacks"] == "default"
    engine = "Route A takes 14 minutes with 2 crossings without signals. " + speak.HINTS["plan"]  # plan fallback: route A only
    assert post(Fake("Route A takes 12 minutes. Say 'let's go'.")) == {"text": engine, "via": "engine"}  # invented number
    assert post(Fake("Route A has five crossings. Say 'let's go'.")) == {"text": engine, "via": "engine"}  # number word
    assert post(Fake("It is at 7 o'clock. Say 'more'."), "overview", {"text": "A park at 3 o'clock."})["via"] == "engine"
    assert post(Fake("A park at 3 o'clock. Say 'more'."), "overview", {"text": "A park at 3 o'clock."})["via"] == "claude"
    assert post(Fake(good, stop="max_tokens")) == {"text": engine, "via": "engine"}  # cut mid-sentence
    timeout = anthropic.APITimeoutError(request=None)
    assert post(Fake(error=timeout)) == {"text": engine, "via": "engine"}
    for kind, hint in speak.HINTS.items():  # no key: the engine speaks, and always ends with the kind's hint
        got = post(None, kind, {})
        assert got == {"text": hint, "via": "engine"} and "'" in hint, (kind, got)
    assert post(Fake(error=timeout), "error", {"text": "No route. Try again. Really."})["text"] == \
        "No route. Try again. " + speak.HINTS["error"]
    print("speak: ok")


if __name__ == "__main__":
    main()
