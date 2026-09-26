import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { ExploreCommand, ExploreStep } from '../api/contracts';
import type { Dictionary } from '../i18n';

interface Props {
  step: ExploreStep;
  t: Dictionary;
  localize: (text: string) => string;
  busy: boolean;
  onCommand: (command: ExploreCommand, branch?: number) => void;
  summary: string;
  onReadDetails: () => void;
  onStopReading: () => void;
  speaking: boolean;
  canSpeak: boolean;
}

const commandAliases = new Map<string, ExploreCommand>([
  ['start', 'start'],
  ['forward', 'forward'],
  ['left', 'left'],
  ['right', 'right'],
  ['back', 'back'],
  ['home', 'home'],
  ['where', 'where'],
  ['avanti', 'forward'],
  ['sinistra', 'left'],
  ['destra', 'right'],
  ['indietro', 'back'],
  ['inizio', 'home'],
  ['dove', 'where'],
]);

function directionLabel(direction: ExploreStep['branches'][number]['relative_direction'], t: Dictionary) {
  switch (direction) {
    case 'ahead': return t.directionAhead;
    case 'behind': return t.directionBehind;
    case 'left': return t.directionLeft;
    case 'right': return t.directionRight;
    default: {
      const hour = /^at ([1-9]|1[0-2]) o'clock$/.exec(direction)?.[1];
      return hour ? t.directionClock.replace('{hour}', hour) : t.unknown;
    }
  }
}

export function ExploreView({ step, t, localize, busy, onCommand, summary, onReadDetails, onStopReading, speaking, canSpeak }: Props) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const commands: { command: ExploreCommand; label: string }[] = [
    { command: 'forward', label: t.forward },
    { command: 'left', label: t.left },
    { command: 'right', label: t.right },
    { command: 'back', label: t.back },
    { command: 'home', label: t.restart },
    { command: 'where', label: t.whereAmI },
  ];
  const isUnavailable = (command: ExploreCommand) =>
    busy || (command === 'back' && step.junction_stack_depth === 0);

  function send(command: ExploreCommand) {
    if (isUnavailable(command)) return;
    setInvalid(false);
    onCommand(command);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const command = commandAliases.get(input.trim().toLowerCase());
    if (!command) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    send(command);
  }

  return <>
    <p className="result-text">{summary}</p>

    <div className="button-row" role="group" aria-label={t.sessionControls}>
      {commands.map(({ command, label }) => <button
        key={command}
        type="button"
        aria-disabled={isUnavailable(command)}
        onClick={() => send(command)}
      >{label}</button>)}
    </div>

    <form onSubmit={submit}>
      <label htmlFor={inputId}>{t.command}</label>
      <p className="hint" id={hintId}>{t.commandsAvailable}</p>
      <div className="command-row">
        <input
          id={inputId}
          type="text"
          value={input}
          placeholder={t.commandPlaceholder}
          aria-describedby={`${hintId}${invalid ? ` ${errorId}` : ''}`}
          aria-invalid={invalid}
          aria-disabled={busy}
          readOnly={busy}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setInput(event.target.value);
            setInvalid(false);
          }}
        />
        <button type="submit" aria-disabled={busy}>{t.sendCommand}</button>
      </div>
      <p id={errorId} role="status">{invalid ? t.commandInvalid : ''}</p>
    </form>

    <details>
      <summary>{t.nextBranches}</summary>
      <p>{localize(step.text)}</p>
      <div className="button-row">
        <button type="button" onClick={onReadDetails} disabled={!canSpeak}>{t.readDetails}</button>
        <button type="button" aria-disabled={!speaking} onClick={() => { if (speaking) onStopReading(); }}>{t.stopReading}</button>
      </div>
      {step.branches.length === 0 ? <p>{t.emptyBranches}</p> : <ol className="branch-list">
        {step.branches.map((branch, index) => <li key={`${branch.name}-${branch.relative_direction}-${index}`}>
          <button type="button" aria-disabled={busy} onClick={() => { if (!busy) { setInvalid(false); onCommand('take', index); } }}>
            {t.followBranch} {directionLabel(branch.relative_direction, t)}: {localize(branch.name)}
          </button>
          <p><strong>{directionLabel(branch.relative_direction, t)}: {localize(branch.name)}</strong>
            {' — '}{branch.distance_m} {t.meters}</p>
          <p>{t.towards} {localize(branch.leads_to)}</p>
          {branch.crossing ? <dl>
            <dt>{t.crossingSignals}</dt><dd>{t[branch.crossing.signals]}</dd>
            <dt>{t.crossingSound}</dt><dd>{t[branch.crossing.sound]}</dd>
            <dt>{t.crossingTactile}</dt><dd>{t[branch.crossing.tactile_paving]}</dd>
          </dl> : <p>{t.noCrossingMapped}</p>}
        </li>)}
      </ol>}
    </details>
  </>;
}
