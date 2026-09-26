"""POST /stt and GET /voice/health with FastAPI's TestClient on the local Parakeet model (no network, no paid API).
Skips cleanly when parakeet-mlx, the cached model, `say` or ffmpeg are missing.

    python tests/test_voice.py      (from server-py, with HF_HOME pointing at the model cache: tools/env.sh)
"""
import importlib.util
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

if not (importlib.util.find_spec("parakeet_mlx") and shutil.which("say") and shutil.which("ffmpeg")):
    print("test_voice: skipped (parakeet-mlx, say or ffmpeg missing)")
    sys.exit(0)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import voice_api  # noqa: E402

app = FastAPI()
app.include_router(voice_api.make_router())
client = TestClient(app)
voice_api.READY.wait(120)
if voice_api.STATE["model"] is None:
    print("test_voice: skipped (Parakeet model not loadable offline)")
    sys.exit(0)


def words(text):
    return re.sub(r"[^a-z ]", "", text.lower()).split()


tmp = pathlib.Path(tempfile.mkdtemp())
subprocess.run(["say", "-o", str(tmp / "x.aiff"), "Is the party close to here?"], check=True)
ff = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y"]
subprocess.run(ff + ["-i", str(tmp / "x.aiff"), "-ar", "16000", "-ac", "1", str(tmp / "x.wav")], check=True)
subprocess.run(ff + ["-i", str(tmp / "x.aiff"), "-c:a", "libopus", str(tmp / "x.webm")], check=True)
subprocess.run(ff + ["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "2", str(tmp / "blank.wav")], check=True)

for name, ctype in [("x.wav", "audio/wav"), ("x.webm", "audio/webm;codecs=opus"), ("x.wav", "audio/wav")]:
    r = client.post("/stt?lang=en", content=(tmp / name).read_bytes(), headers={"content-type": ctype})
    assert r.status_code == 200, r.status_code
    body = r.json()
    assert set(body) == {"text", "lang", "audio_ms", "stt_ms"}, body.keys()
    assert words(body["text"]) == words("Is the party close to here?"), name  # text not printed on purpose
    assert body["lang"] == "en" and body["audio_ms"] > 500, body["audio_ms"]
assert body["stt_ms"] <= 300, body["stt_ms"]  # warm
for q, want in [("it-IT", "it"), ("de", "en")]:
    r = client.post(f"/stt?lang={q}", content=(tmp / "x.wav").read_bytes(), headers={"content-type": "audio/wav"})
    assert r.status_code == 200 and r.json()["lang"] == want, (q, r.status_code)

r = client.post("/stt", content=(tmp / "blank.wav").read_bytes(), headers={"content-type": "audio/wav"})
assert r.status_code == 422 and r.json() == {"detail": "No speech detected."}, r.status_code
r = client.post("/stt", content=b"", headers={"content-type": "audio/wav"})
assert r.status_code == 422, r.status_code
r = client.post("/stt", content=b"not audio at all", headers={"content-type": "audio/ogg"})
assert r.status_code == 422, r.status_code

h = client.get("/voice/health").json()
assert h["stt"] == "parakeet" and h["tts"] in ("say", "none") and h["router"] in ("claude", "grammar"), h
shutil.rmtree(tmp)
print("test_voice: ok")
