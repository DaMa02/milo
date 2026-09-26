import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechError = SpeechSynthesisErrorCode | 'unavailable' | 'failed';

export interface SpeechControls {
  supported: boolean;
  speaking: boolean;
  error: SpeechError | null;
  canRepeat: boolean;
  speak: (text: string, language: string) => void;
  stop: () => void;
  repeat: () => void;
  rate: number;
  setRate: (rate: number) => void;
  prime: () => void;
}

interface SpeechRequest {
  text: string;
  language: string;
}

// A short, valid PCM WAV unlocks this same element from the Talk gesture on iOS.
const silence = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

/** Backend AAC through one gesture-unlocked player; browser speech is a fallback. */
export function useSpeech(): SpeechControls {
  const [browserSpeech] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
    && typeof window.speechSynthesis?.speak === 'function'
    && typeof window.speechSynthesis?.cancel === 'function',
  );
  const [player] = useState(() => typeof window.Audio === 'function' ? new window.Audio() : null);
  const supported = Boolean(player) || browserSpeech;
  const download = useRef<AbortController | null>(null);
  const cached = useRef<{ text: string; language: string; url: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const [canRepeat, setCanRepeat] = useState(false);
  const [rate, updateRate] = useState(1);
  const rateRef = useRef(1);
  const primed = useRef(false);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const lastRequest = useRef<SpeechRequest | null>(null);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  // Invalidate handlers before cancel(): browsers can dispatch cancellation
  // synchronously, or deliver a delayed event after the next utterance starts.
  const cancelCurrent = useCallback(() => {
    generation.current += 1;
    if (gapTimer.current !== null) clearTimeout(gapTimer.current);
    gapTimer.current = null;
    const utterance = currentUtterance.current;
    if (utterance) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    }
    currentUtterance.current = null;
    download.current?.abort(); download.current = null;
    if (player) { player.onended = null; player.onerror = null; player.pause(); }
    if (browserSpeech) window.speechSynthesis.cancel();
  }, [browserSpeech, player]);

  const stop = useCallback(() => {
    try {
      cancelCurrent();
    } catch {
      if (mounted.current) setError('failed');
    }
    if (mounted.current) setSpeaking(false);
  }, [cancelCurrent]);

  const speakFallback = useCallback((text: string, language: string, token: number) => {
    if (!mounted.current || !text.trim()) return;
    if (!browserSpeech) {
      setSpeaking(false);
      setError('unavailable');
      return;
    }

    try {
      const request = { text, language };
      const spoken = /^en\b/i.test(language) ? text.replace(/(\d[\d,.]*)\s+m\b/g, '$1 metres') : text;
      const sentences = spoken.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
      const banned = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Eddy|Flo|Fred|Grandma|Grandpa|Jester|Junior|Kathy|Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Zarvox)\b/i;
      const readSentence = (index: number) => {
        if (!mounted.current || token !== generation.current) return;
        try {
          const utterance = new window.SpeechSynthesisUtterance(sentences[index]);
          utterance.lang = /^en\b/i.test(request.language) ? 'en-GB' : request.language;
          utterance.rate = rateRef.current;
          const voices = window.speechSynthesis.getVoices?.() ?? [];
          const safe = voices.filter((voice) => !banned.test(voice.name) && voice.lang.toLowerCase().startsWith(request.language.slice(0, 2).toLowerCase()));
          const voice = safe.find((item) => /^Daniel(?:\s|$)/i.test(item.name) && /^en[-_]GB$/i.test(item.lang))
            ?? safe.find((item) => /Google UK English (Female|Male)/i.test(item.name))
            ?? safe.find((item) => item.lang.toLowerCase() === utterance.lang.toLowerCase()) ?? safe[0];
          if (voice) utterance.voice = voice;
          else if (voices.length) { setSpeaking(false); setError('unavailable'); return; }
          const isCurrent = () => mounted.current && token === generation.current && currentUtterance.current === utterance;
          utterance.onstart = () => { if (isCurrent()) setSpeaking(true); };
          utterance.onend = () => {
            if (!isCurrent()) return;
            currentUtterance.current = null;
            if (index + 1 < sentences.length) gapTimer.current = setTimeout(() => { gapTimer.current = null; readSentence(index + 1); }, 300);
            else setSpeaking(false);
          };
          utterance.onerror = (event) => {
            if (!isCurrent()) return;
            currentUtterance.current = null; setSpeaking(false); setError(event.error);
          };
          currentUtterance.current = utterance;
          window.speechSynthesis.speak(utterance);
        } catch { if (token === generation.current) { currentUtterance.current = null; setSpeaking(false); setError('failed'); } }
      };
      setSpeaking(true);
      readSentence(0);
    } catch {
      // Also invalidate any events queued before speak() threw.
      generation.current += 1;
      currentUtterance.current = null;
      setSpeaking(false);
      setError('failed');
    }
  }, [browserSpeech]);

  const speak = useCallback((text: string, language: string) => {
    if (!mounted.current || !text.trim()) return;
    cancelCurrent(); setError(null); setSpeaking(true); setCanRepeat(true);
    lastRequest.current = { text, language };
    const token = generation.current;
    const current = () => mounted.current && token === generation.current;
    let fallingBack = false;
    const fallback = () => {
      if (!current() || fallingBack) return;
      fallingBack = true;
      if (player) { player.onended = null; player.onerror = null; player.pause(); }
      speakFallback(text, language, token);
    };
    if (!player) { fallback(); return; }
    void (async () => {
      const abort = new AbortController(); download.current = abort;
      const timeout = setTimeout(() => abort.abort(), 20_000);
      try {
        let url = cached.current?.text === text && cached.current.language === language ? cached.current.url : null;
        if (!url) {
          const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang: language }), signal: abort.signal });
          if (!current()) return;
          if (!response.ok) throw new Error('Speech unavailable');
          const blob = await response.blob();
          if (!current()) return;
          if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('Invalid speech audio');
          url = URL.createObjectURL(blob);
          if (cached.current) URL.revokeObjectURL(cached.current.url);
          cached.current = { text, language, url };
        }
        if (!current()) return;
        player.src = url; player.playbackRate = rateRef.current;
        player.onended = () => { if (current()) setSpeaking(false); };
        player.onerror = () => { if (current()) { player.onended = null; player.onerror = null; fallback(); } };
        await player.play();
      } catch { fallback(); }
      finally { clearTimeout(timeout); if (current()) download.current = null; }
    })();
  }, [cancelCurrent, player, speakFallback]);

  const repeat = useCallback(() => {
    const request = lastRequest.current;
    if (request) speak(request.text, request.language);
  }, [speak]);

  const setRate = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    rateRef.current = Math.min(2, Math.max(0.5, next)); updateRate(rateRef.current);
    if (player) player.playbackRate = rateRef.current;
  }, [player]);
  const prime = useCallback(() => {
    if (!player || primed.current) return;
    try {
      player.src = silence; player.preload = 'auto';
      void player.play().then(() => { primed.current = true; }).catch(() => {});
    } catch { /* A later gesture can retry unlocking. */ }
  }, [player]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lastRequest.current = null;
      try {
        cancelCurrent();
        if (player) { player.removeAttribute('src'); player.load(); }
        if (cached.current) URL.revokeObjectURL(cached.current.url);
        cached.current = null;
      } catch {
        // Cleanup must still finish if the browser speech engine is unavailable.
      }
    };
  }, [cancelCurrent, player]);

  return { supported, speaking, error, canRepeat, speak, stop, repeat, rate, setRate, prime };
}
