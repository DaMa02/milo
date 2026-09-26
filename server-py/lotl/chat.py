"""The generic answer for an utterance that is not an app action: a question about the destination or a place, a web
search the user asks for, or how to use the app. Claude answers in plain spoken English, never with movement
instructions, distances or routes: those only come from the engine.

answer(llm, utterance, facts, history) -> (text, used_web). History and facts come from the caller.
"""
import re

WEB_WORDS = re.compile(r"\b(search|look (?:it |this |that )?up|google|online|on the web|on the internet|internet|website|"
                       r"cerca|cercami|in rete|su internet|sul web)\b", re.I)

USAGE = """What the user can say to the app (voice only, one Talk button):
- Start: "use my location", "start from <place>". Destination: "I'm going to <place>", "take me to <place>". The app finds the place and asks "Is that right?": "yes", "no", "the second one".
- Area: "what's around me", "where am I", "more", "what don't you know", "where does this come from", "repeat", "stop", "faster", "slower", "start over", "help".
- Virtual walk through the streets: "let's walk", "turn left", "turn right", "take via Brembo", "take the second one", "go back", "back to the start".
- Questions answered from the map: "how far is <place> on foot", "is there anything between me and <place>", "does via Brembo go through", "how big is the park", "how many ways are there to <place>", "is the pharmacy open".
- Route: "how do I get there", "take the shortest", "take the main streets", "take the bus", "avoid crossings without signals", "avoid steps", "stop at a supermarket for 15 minutes", "add a pharmacy", then "the first one".
- Guidance while walking: "let's go" or "guide me" to start, "stop guiding" to end. The app warns at once when the user leaves the route."""

SYSTEM = f"""You are the voice of Lay of the Land, a walking app for blind people in Milan. The user's words reach you only when they are not one of the app's commands: a general question about a place or the destination, a request to search the web, or a question on how to use the app.

{USAGE}

Rules:
- Never give movement instructions, directions, distances, walking times, routes, crossings or anything about how to get somewhere or whether a way is safe. The app's map engine gives those. Instead, say the exact phrase to use, e.g. "Say 'how do I get there'."
- For how to use the app, answer from the list above with the exact phrases.
- For a general question (what a place is, what it is known for, what is there), answer from general knowledge and start with "From general knowledge," unless you searched the web; then say "According to <site name>," and never read out a URL.
- Use the facts given about the user's trip (start, destination, chosen route) only to know what they mean; do not repeat numbers from them.
- If you do not know or are unsure, say so in one sentence.
- Speak plain English for the ear: at most three short sentences, no lists, no markdown, no emoji.
- If the request is really one of the app's actions, say the phrase that does it."""


def wants_web(utterance):
    return bool(WEB_WORDS.search(utterance))


def answer(llm, model, utterance, facts, history, web=None):
    """Claude's spoken answer. web: allow the web search tool (default: only when the user asks for a search)."""
    web = wants_web(utterance) if web is None else web
    msgs = []
    for u, a in history:
        msgs += [{"role": "user", "content": u}, {"role": "assistant", "content": a}]
    msgs.append({"role": "user", "content": f"Facts about the trip: {facts}\n\nThe user said: {utterance}"})
    kw = {"tools": [{"type": "web_search_20260209", "name": "web_search", "max_uses": 2}]} if web else {}
    for _ in range(3):  # a server-side search can pause the turn; continue it
        r = llm.beta.messages.create(model=model, max_tokens=600, system=SYSTEM, messages=msgs,
                                     output_config={"effort": "low"}, betas=["server-side-fallback-2026-07-01"],
                                     fallbacks="default", **kw)
        if r.stop_reason != "pause_turn":
            break
        msgs.append({"role": "assistant", "content": r.content})
    if r.stop_reason == "refusal":
        return "I can't help with that. Say 'help' to hear what I can do.", False
    text = " ".join(b.text.strip() for b in r.content if b.type == "text" and b.text.strip())
    used = any(b.type == "server_tool_use" for b in r.content)
    return re.sub(r"\s+", " ", re.sub(r"[*_#`]|\bhttps?://\S+", "", text)).strip() or \
        "I am not sure. Say 'help' to hear what I can do.", used


if __name__ == "__main__":  # self-check with a fake client: python -m lotl.chat
    from types import SimpleNamespace as NS

    class Fake:
        def __init__(self, texts, stops):
            self.texts, self.stops, self.calls = texts, stops, []
            self.beta = NS(messages=NS(create=self.create))

        def create(self, **kw):
            self.calls.append(kw)
            i = len(self.calls) - 1
            content = [NS(type="server_tool_use")] if kw.get("tools") else []
            return NS(stop_reason=self.stops[i], content=content + [NS(type="text", text=self.texts[i])])

    f = Fake(["**From general knowledge,** Bocconi is a private university. See https://unibocconi.it"], ["end_turn"])
    t, used = answer(f, "m", "What is Bocconi University?", {"destination": "Bocconi University"}, [("hi", "hello")])
    assert t == "From general knowledge, Bocconi is a private university. See", t
    assert not used and "tools" not in f.calls[0] and f.calls[0]["messages"][0] == {"role": "user", "content": "hi"}
    f = Fake(["", "According to the university's site, it opens at 8."], ["pause_turn", "end_turn"])
    t, used = answer(f, "m", "Search online when Bocconi opens", {}, [])
    assert used and len(f.calls) == 2 and f.calls[0]["tools"][0]["type"] == "web_search_20260209", f.calls
    assert wants_web("cerca su internet il museo") and not wants_web("what is the Duomo")
    f = Fake(["x"], ["refusal"])
    assert answer(f, "m", "?", {}, [])[0].startswith("I can't help")
    print("chat: ok")
