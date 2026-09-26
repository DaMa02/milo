import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { isRecord } from '../api/contracts';
import { speak, type SpeakRequest } from '../api/speak';

export type PrepareSpokenRequest = SpeakRequest & { fallbackText?: string };
interface Options {
  onText: (spoken: string) => void;
  onWaiting?: () => void;
  onFailure?: (error: unknown) => void;
}

function firstSentence(request: PrepareSpokenRequest): string {
  const engineText = isRecord(request.result) && typeof request.result.text === 'string'
    ? request.result.text : request.fallbackText ?? '';
  const text = engineText.trim();
  if (!text) return '';
  try {
    const sentences = new Intl.Segmenter(request.lang, { granularity: 'sentence' }).segment(text);
    return sentences[Symbol.iterator]().next().value?.segment.trim() ?? text;
  } catch {
    // Unsupported locale/browser still gets one sentence, preserving decimals.
    return text.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0].trim() ?? text.split(/\r?\n/)[0].trim();
  }
}

function fallback(request: PrepareSpokenRequest): string {
  const sentence = firstSentence(request);
  // Exact recovery prompts agreed in issue #1, comment 5846803188.
  const hints: Partial<Record<SpeakRequest['kind'], string>> = {
    plan: "Say 'let's go' to start, or 'other routes'.",
    overview: "Say 'take me to…' or 'what's around me'.",
    answer: "Say 'how do I get there' to plan the route.",
  };
  const result = request.result;
  const confirmation = request.kind === 'places' && isRecord(result)
    && Array.isArray(result.candidates) && result.candidates.length > 0 && !('destination' in result);
  const hint = confirmation ? 'Is that right?' : hints[request.kind];
  if (!hint) return sentence;
  const normalise = (value: string) => value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (normalise(sentence).includes(normalise(hint))) return sentence;
  return [sentence, hint].filter(Boolean).join(' ');
}

/** Prepares speech only; the caller retains the full result and owns playback. */
export function useSpokenResult(options: Options) {
  const current = useRef(options); current.current = options;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort(); controller.current = null;
    setPending(false);
  }, []);

  useLayoutEffect(() => () => {
    generation.current += 1;
    controller.current?.abort(); controller.current = null;
  }, []);

  const prepare = useCallback(async (request: PrepareSpokenRequest): Promise<string | null> => {
    const token = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setPending(true);
    const active = () => token === generation.current && !abort.signal.aborted;
    let text: string;
    try {
      current.current.onWaiting?.();
      if (!active()) return null;
      text = (await speak(request, abort.signal)).text;
    } catch (error) {
      if (!active()) return null;
      current.current.onFailure?.(error);
      text = fallback(request);
    } finally {
      if (token === generation.current) { controller.current = null; setPending(false); }
    }
    if (!active() || !text) return null;
    setLastText(text);
    current.current.onText(text);
    return text;
  }, []);

  return { prepare, cancel, pending, lastText };
}
