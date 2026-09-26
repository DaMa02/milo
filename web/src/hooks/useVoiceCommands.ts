import { useEffect, useRef, useState } from 'react';
import { interpret, type CommandContext, type VoiceCommand } from '../api/interpret';
import { ApiError } from '../api/http';

interface Options {
  context: CommandContext;
  sessionId?: string;
  busy: boolean;
  onAction: (command: VoiceCommand) => void;
  onError: (error: unknown) => void;
  onBusy: () => void;
}

/** One dispatcher for typed and spoken input; superseded interpretations cannot act. */
export function useVoiceCommands(options: Options) {
  const current = useRef(options); current.current = options;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [interpreting, setInterpreting] = useState(false);
  function cancel() {
    generation.current += 1; controller.current?.abort(); controller.current = null;
    inFlight.current = false; setInterpreting(false);
  }
  useEffect(() => { cancel(); return () => { generation.current += 1; controller.current?.abort(); }; }, [options.sessionId]);
  async function send(utterance: string) {
    if (!utterance.trim()) return;
    // Stop is always local and never waits behind network or a plan mutation.
    if (/^(stop|stop speaking|stop reading|quiet)[.!]?$/i.test(utterance.trim())) {
      cancel(); current.current.onAction({ action: 'stop', params: {} }); return;
    }
    if (current.current.busy || inFlight.current) { current.current.onBusy(); return; }
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    inFlight.current = true; setInterpreting(true);
    try {
      const command = await interpret(utterance.trim(), current.current.context, current.current.sessionId, abort.signal);
      if (token === generation.current) {
        if (current.current.busy && command.action !== 'stop') current.current.onBusy();
        else current.current.onAction(command);
      }
    } catch (error) {
      if (token === generation.current && !(error instanceof ApiError && error.kind === 'aborted')) current.current.onError(error);
    } finally {
      if (token === generation.current) { inFlight.current = false; setInterpreting(false); controller.current = null; }
    }
  }
  return { send, cancel, interpreting };
}
