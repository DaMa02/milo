"""POST /interpret -> chat: generic questions, usage help and web searches answered by Claude (fake client, no network).

    python tests/test_chat.py
"""
import json
import os
import sys
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.pop("TYPESAFE_API_KEY", None)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import interpret_api  # noqa: E402
from interpret_api import make_router  # noqa: E402
from lotl.session import Session  # noqa: E402

S = Session(origin=(45.44386, 9.20808, "Talent Garden"), destination={"lat": 45.4499, "lon": 9.1893, "name": "Bocconi University"})


def get(sid):
    return S


class Fake:
    """Router calls (JSON schema) pick chat or explore; chat calls answer in words and record what they got."""
    def __init__(self):
        self.chat_calls = []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kw):
        if "format" in kw["output_config"]:
            u = kw["messages"][0]["content"].rsplit("Utterance: ", 1)[1]
            out = {k: "" for k in interpret_api.SCHEMA["required"]} | {"index": -1, "minutes": -1}
            out |= {"action": "explore", "command": "forward"} if "stroll" in u else {"action": "chat"}
            return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps(out))])
        self.chat_calls.append(kw)
        web = bool(kw.get("tools"))
        text = "According to the university's site, the library opens at 8." if web else \
            "From general knowledge, Bocconi is a private university in Milan. Say 'how do I get there' for the way."
        return NS(stop_reason="end_turn", content=([NS(type="server_tool_use")] if web else []) + [NS(type="text", text=text)])


def main():
    fake = Fake()
    app = FastAPI()
    app.include_router(make_router(get, llm=fake))
    c = TestClient(app)
    ask = lambda u: c.post("/interpret", json={"utterance": u, "session_id": S.id, "context": {}}).json()
    errors = []
    r = ask("What is Bocconi University known for?")
    if (r["action"], r["via"], r["params"]["web"]) != ("chat", "claude", False) or "From general knowledge" not in r["params"]["text"]:
        errors.append(f"generic question: {r}")
    first = fake.chat_calls[0]["messages"][-1]["content"]
    if "Bocconi University" not in first or "Talent Garden" not in first:
        errors.append(f"trip facts missing: {first}")
    r = ask("Search online when the Bocconi library opens")
    if (r["action"], r["params"]["web"]) != ("chat", True) or fake.chat_calls[1]["tools"][0]["type"] != "web_search_20260209":
        errors.append(f"web search: {r}")
    if len(fake.chat_calls[1]["messages"]) != 3:  # one earlier turn (user + assistant) + this one
        errors.append(f"history not passed: {len(fake.chat_calls[1]['messages'])} messages")
    if "Never give movement instructions" not in fake.chat_calls[0]["system"] or "let's go" not in fake.chat_calls[0]["system"]:
        errors.append("the chat prompt lacks the no-directions rule or the usage list")
    if ask("Let's take a stroll")["action"] != "explore":
        errors.append("an action still reaches chat")
    for u in ["q%d" % i for i in range(8)]:
        ask(u)
    if len(interpret_api.HISTORY[S.id]) != 6:
        errors.append(f"history not capped: {len(interpret_api.HISTORY[S.id])}")
    bare = FastAPI()
    bare.include_router(make_router(get, llm=None))
    os.environ.pop("ANTHROPIC_API_KEY", None)
    r = TestClient(bare).post("/interpret", json={"utterance": "What is Bocconi?", "context": {}}).json()
    if r["action"] != "none":
        errors.append(f"no key: {r}")
    print("\n".join(errors) or "test_chat: ok")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
