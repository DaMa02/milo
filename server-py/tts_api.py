"""POST /tts: the Mac speaks the text with `say` and returns AAC audio (audio/mp4), which iOS Safari plays reliably
through an <audio> element, headphones included; its speechSynthesis often stays silent after the mic was used.

    app.include_router(make_router())

Text is never logged.
"""
import os
import re
import shutil
import subprocess
import tempfile
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

VOICE = {"en": "Daniel", "it": "Alice"}
CACHE = OrderedDict()  # (lang, text) -> audio bytes; ponytail: in memory, 64 entries


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    lang: Literal["en", "it"] = "en"


def speakable(text, lang="en"):
    """'1,080 m' -> '1,080 metres' for English; the rest is left to the voice."""
    return re.sub(r"(\d[\d,.]*)\s*m\b", r"\1 metres", text) if lang == "en" else text


def synth(text, lang="en"):
    key = (lang, text)
    if key in CACHE:
        CACHE.move_to_end(key)
        return CACHE[key]
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.close(fd)
    try:
        subprocess.run(["say", "-v", VOICE[lang], "-o", path, "--file-format=m4af", "--data-format=aac",
                        speakable(text, lang)], check=True, timeout=30, capture_output=True)
        audio = open(path, "rb").read()
    finally:
        os.unlink(path)
    CACHE[key] = audio
    if len(CACHE) > 64:
        CACHE.popitem(last=False)
    return audio


def make_router():
    router = APIRouter()

    @router.post("/tts")
    async def tts(body: TtsIn):
        if not shutil.which("say"):
            raise HTTPException(503, "Spoken answers are not available on this machine.")
        try:
            audio = await run_in_threadpool(synth, body.text.strip(), body.lang)
        except (subprocess.SubprocessError, OSError):
            raise HTTPException(503, "Spoken answers are not available right now.")
        return Response(audio, media_type="audio/mp4", headers={"X-TTS-Backend": "say", "Cache-Control": "no-store"})

    return router


if __name__ == "__main__":  # self-check: python tts_api.py
    assert speakable("1,080 m on foot, 350 m away") == "1,080 metres on foot, 350 metres away"
    assert speakable("12 min, 3 more") == "12 min, 3 more"
    if shutil.which("say"):
        a = synth("Route A, on foot, 29 minutes.")
        assert a[4:8] == b"ftyp" and len(a) > 1000, "not an MP4/AAC file"
        assert synth("Route A, on foot, 29 minutes.") is a  # cached
    print("tts_api: ok")
