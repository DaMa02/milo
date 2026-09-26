import { useEffect, useRef } from 'react';
import type { VoiceInputState } from '../hooks/useVoiceInput';

interface Props {
  state: VoiceInputState;
  disabled?: boolean;
  onStart: () => void | Promise<void>;
  onStop: (submit?: boolean) => void;
  onCancel?: () => void;
  onGesture?: () => void;
  onBeforeStart?: () => void;
  labels: { idle: string; listening: string; transcribing: string; hint?: string };
}

export function TalkButton({ state, disabled = false, onStart, onStop, onCancel, onGesture, onBeforeStart, labels }: Props) {
  const pointer = useRef<{ id: number; held: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumeClick = useRef(false);
  const clear = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => { clear(); }, []);
  const blocked = disabled || state === 'transcribing';
  return <button type="button" className="talk-button" aria-pressed={state === 'listening'} aria-disabled={blocked}
    onClick={() => {
      if (consumeClick.current) { consumeClick.current = false; return; }
      if (blocked) return;
      if (state === 'listening') { onStop(); onGesture?.(); }
      else { onBeforeStart?.(); onGesture?.(); void onStart(); }
    }}
    onPointerDown={(event) => {
      if (blocked || state !== 'idle' || event.button !== 0 || pointer.current) return;
      consumeClick.current = false;
      pointer.current = { id: event.pointerId, held: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      onBeforeStart?.();
      timer.current = setTimeout(() => { if (pointer.current) { pointer.current.held = true; void onStart(); } }, 400);
    }}
    onPointerUp={(event) => {
      if (pointer.current?.id !== event.pointerId) return;
      const held = pointer.current.held; pointer.current = null; clear(); consumeClick.current = true;
      if (held) onStop();
      onGesture?.();
      if (!held) void onStart();
    }}
    onPointerCancel={() => {
      if (!pointer.current) return;
      pointer.current = null; clear(); consumeClick.current = false;
      if (onCancel) onCancel(); else onStop(false);
    }}
    onLostPointerCapture={() => {
      if (!pointer.current) return;
      pointer.current = null; clear(); consumeClick.current = false;
      if (onCancel) onCancel(); else onStop(false);
    }}
  >{labels[state]}{labels.hint && <span className="talk-hint">{labels.hint}</span>}</button>;
}
