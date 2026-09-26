import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceInputState = 'idle' | 'listening' | 'transcribing';
export type VoiceInputError = 'unavailable' | 'permission' | 'recording' | 'noSpeech' | 'transcription';
interface Options { onTranscript: (text: string) => void; onError: (key: VoiceInputError) => void }
const audioContext = () => window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/** Ephemeral microphone capture. No recording survives cancellation or upload. */
export function useVoiceInput(options: Options) {
  const callbacks = useRef(options); callbacks.current = options;
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined' && Boolean(audioContext()));
  const [state, setState] = useState<VoiceInputState>('idle');
  const phase = useRef<VoiceInputState>('idle');
  const mounted = useRef(false);
  const revision = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const abort = useRef<AbortController | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<(submit?: boolean) => void>(() => undefined);
  const transition = useCallback((next: VoiceInputState) => {
    phase.current = next; if (mounted.current) setState(next);
  }, []);
  const releaseMicrophone = useCallback(() => {
    if (interval.current !== null) clearInterval(interval.current);
    if (deadline.current !== null) clearTimeout(deadline.current);
    interval.current = null; deadline.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    const current = context.current; context.current = null;
    if (current && current.state !== 'closed') void current.close().catch(() => undefined);
  }, []);
  const cancel = useCallback(() => {
    revision.current += 1;
    abort.current?.abort(); abort.current = null;
    const current = recorder.current; recorder.current = null;
    releaseMicrophone();
    if (current && current.state !== 'inactive') { try { current.stop(); } catch { /* Already ended by the platform. */ } }
    transition('idle');
  }, [releaseMicrophone, transition]);
  const stop = useCallback((submit = true) => {
    if (!submit || !recorder.current) { cancel(); return; }
    const current = recorder.current;
    if (phase.current !== 'listening' || current.state === 'inactive') return;
    transition('transcribing');
    // Stop the tracks before uploading, so iOS exits its low-volume recording session.
    try { current.stop(); }
    catch { cancel(); callbacks.current.onError('recording'); }
    finally { releaseMicrophone(); }
  }, [cancel, releaseMicrophone, transition]);
  stopRef.current = stop;

  const start = useCallback(async () => {
    if (phase.current !== 'idle') return;
    if (!supported) { callbacks.current.onError('unavailable'); return; }
    const token = ++revision.current;
    const current = () => mounted.current && token === revision.current;
    transition('listening');
    try {
      // Both construction and resume happen synchronously inside the Talk gesture.
      const Audio = audioContext()!;
      const audio = new Audio(); context.current = audio;
      void audio.resume().catch(() => undefined);
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!current()) { captured.getTracks().forEach((track) => track.stop()); return; }
      stream.current = captured;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
        .find((mime) => MediaRecorder.isTypeSupported(mime));
      const recording = mimeType ? new MediaRecorder(captured, { mimeType }) : new MediaRecorder(captured);
      recorder.current = recording;
      const chunks: Blob[] = [];
      let heardSpeech = false;
      let lastSpeech = performance.now();
      const analyser = audio.createAnalyser(); analyser.fftSize = 1024;
      audio.createMediaStreamSource(captured).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      recording.ondataavailable = (event) => { if (current() && event.data.size) chunks.push(event.data); };
      recording.onerror = () => { if (current()) { cancel(); callbacks.current.onError('recording'); } };
      recording.onstop = async () => {
        if (!current()) { chunks.length = 0; return; }
        releaseMicrophone(); recorder.current = null;
        const blob = new Blob(chunks, { type: recording.mimeType || mimeType || 'audio/mp4' }); chunks.length = 0;
        if (!heardSpeech || !blob.size) { transition('idle'); callbacks.current.onError('noSpeech'); return; }
        transition('transcribing');
        const controller = new AbortController(); abort.current = controller;
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: controller.signal });
          if (!current()) return;
          if (!response.ok) { callbacks.current.onError(response.status === 422 ? 'noSpeech' : response.status === 503 ? 'unavailable' : 'transcription'); return; }
          const result: unknown = await response.json();
          if (!current()) return;
          if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string') {
            callbacks.current.onError('transcription'); return;
          }
          const text = result.text.trim();
          if (text) callbacks.current.onTranscript(text); else callbacks.current.onError('noSpeech');
        } catch { if (current()) callbacks.current.onError('transcription'); }
        finally { clearTimeout(timeout); if (current()) { abort.current = null; transition('idle'); } }
      };
      recording.start();
      interval.current = setInterval(() => {
        if (!current()) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        if (rms > 0.015) { heardSpeech = true; lastSpeech = performance.now(); }
        else if (heardSpeech && performance.now() - lastSpeech >= 1000) stopRef.current();
      }, 50);
      deadline.current = setTimeout(() => stopRef.current(), 15000);
    } catch (cause) {
      if (!current()) return;
      cancel();
      callbacks.current.onError(cause instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(cause.name) ? 'permission' : 'recording');
    }
  }, [cancel, releaseMicrophone, supported, transition]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', hidden); cancel(); };
  }, [cancel]);
  return { supported, state, start, stop, cancel };
}
