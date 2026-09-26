"""Voice endpoints: POST /stt (Parakeet on Apple Silicon, local model only) and GET /voice/health.

    app.include_router(make_router())

The model loads and warms up in a background thread when the router is made; /stt waits for it. Audio and text are
never logged.
"""
import os
import pathlib
import tempfile
import threading
import time

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

MODEL = "mlx-community/parakeet-tdt-0.6b-v3"
MAX_BYTES = 10 * 1024 * 1024
SUFFIX = {"audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav",
          "audio/wave": ".wav"}
UNAVAILABLE = "Voice input is not available on this machine: type instead."
READY = threading.Event()
LOCK = threading.Lock()  # ponytail: one transcription at a time, a queue or a second model if it ever matters
STATE = {"model": None}


def _load():
    try:
        from huggingface_hub import snapshot_download
        from parakeet_mlx import from_pretrained
        model = from_pretrained(snapshot_download(MODEL, local_files_only=True))  # never downloads
        warm = pathlib.Path(os.environ.get("TOOLS", "/nonexistent")) / "smoke-test" / "en.wav"
        if warm.exists():
            model.transcribe(str(warm))
        STATE["model"] = model
    except Exception:
        STATE["model"] = None
    finally:
        READY.set()


def transcribe(path):
    """(text, audio_ms) from an audio file ffmpeg can read."""
    from parakeet_mlx.audio import get_logmel, load_audio
    model = STATE["model"]
    cfg = model.preprocessor_config
    audio = load_audio(pathlib.Path(path), cfg.sample_rate)
    if len(audio) < cfg.hop_length:
        return "", 0
    return model.generate(get_logmel(audio, cfg))[0].text.strip(), round(len(audio) * 1000 / cfg.sample_rate)


def make_router():
    threading.Thread(target=_load, daemon=True).start()
    router = APIRouter()

    @router.post("/stt")
    async def stt(request: Request, lang: str = "en"):
        lang = "it" if lang.lower().startswith("it") else "en"  # "it-IT" or junk never becomes a list-shaped 422
        body = await request.body()
        if len(body) > MAX_BYTES:
            raise HTTPException(413, "That recording is too long: say it in a shorter sentence.")
        if not body:
            raise HTTPException(422, "No speech detected.")
        suffix = SUFFIX.get(request.headers.get("content-type", "").split(";")[0].strip().lower(), ".audio")
        return await run_in_threadpool(_stt, body, suffix, lang)

    @router.get("/voice/health")
    def health():
        down = READY.is_set() and STATE["model"] is None
        return {"stt": "none" if down else "parakeet", "tts": "none",
                "router": "claude" if os.environ.get("ANTHROPIC_API_KEY") else "grammar"}

    return router


def _stt(body, suffix, lang):
    READY.wait(120)
    if STATE["model"] is None:
        raise HTTPException(503, UNAVAILABLE)
    f = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        f.write(body)
        f.close()
        with LOCK:
            t = time.perf_counter()  # stt_ms leaves out the wait for the lock
            try:
                text, audio_ms = transcribe(f.name)
            except RuntimeError:  # ffmpeg could not read it; its stderr is not logged
                raise HTTPException(422, "I could not read that recording: try again.")
        stt_ms = round((time.perf_counter() - t) * 1000)
    finally:
        os.unlink(f.name)
    if not text:
        raise HTTPException(422, "No speech detected.")
    return {"text": text, "lang": lang, "audio_ms": audio_ms, "stt_ms": stt_ms}
