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

/** User-initiated browser speech. Call stop when the surrounding context changes. */
export function useSpeech(): SpeechControls {
  const [supported] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
    && typeof window.speechSynthesis?.speak === 'function'
    && typeof window.speechSynthesis?.cancel === 'function',
  );
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
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const stop = useCallback(() => {
    try {
      cancelCurrent();
    } catch {
      if (mounted.current) setError('failed');
    }
    if (mounted.current) setSpeaking(false);
  }, [cancelCurrent]);

  const speak = useCallback((text: string, language: string) => {
    if (!mounted.current || !text.trim()) return;
    if (!supported) {
      setError('unavailable');
      return;
    }

    try {
      cancelCurrent();
      setError(null);
      const request = { text, language };
      lastRequest.current = request;
      setCanRepeat(true);
      const token = generation.current;
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
  }, [cancelCurrent, supported]);

  const repeat = useCallback(() => {
    const request = lastRequest.current;
    if (request) speak(request.text, request.language);
  }, [speak]);

  const setRate = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    rateRef.current = Math.min(2, Math.max(0.5, next)); updateRate(rateRef.current);
  }, []);
  const prime = useCallback(() => {
    if (!supported || primed.current) return;
    try {
      const utterance = new window.SpeechSynthesisUtterance('');
      utterance.lang = 'en-GB'; utterance.volume = 0;
      window.speechSynthesis.speak(utterance); primed.current = true;
    } catch { /* Explicit speech will report a platform failure if it persists. */ }
  }, [supported]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lastRequest.current = null;
      try {
        cancelCurrent();
      } catch {
        // Cleanup must still finish if the browser speech engine is unavailable.
      }
    };
  }, [cancelCurrent]);

  return { supported, speaking, error, canRepeat, speak, stop, repeat, rate, setRate, prime };
}
