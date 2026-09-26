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
  const mounted = useRef(false);
  const generation = useRef(0);
  const lastRequest = useRef<SpeechRequest | null>(null);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  // Invalidate handlers before cancel(): browsers can dispatch cancellation
  // synchronously, or deliver a delayed event after the next utterance starts.
  const cancelCurrent = useCallback(() => {
    generation.current += 1;
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
      const utterance = new window.SpeechSynthesisUtterance(request.text);
      utterance.lang = request.language;
      const token = generation.current;
      const isCurrent = () => mounted.current
        && token === generation.current
        && currentUtterance.current === utterance;

      utterance.onstart = () => {
        if (isCurrent()) setSpeaking(true);
      };
      utterance.onend = () => {
        if (!isCurrent()) return;
        currentUtterance.current = null;
        setSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (!isCurrent()) return;
        currentUtterance.current = null;
        setSpeaking(false);
        setError(event.error);
      };
      // Keep a reference until completion: some browsers otherwise collect it
      // before dispatching its completion events.
      currentUtterance.current = utterance;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
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

  return { supported, speaking, error, canRepeat, speak, stop, repeat };
}
