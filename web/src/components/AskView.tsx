import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Answer, AskRequest, AskTool } from '../api/contracts';
import { savedQuestions } from '../api/fixtures';
import type { Dictionary } from '../i18n';
import { Evidence, ResultMeta } from './Evidence';

interface Props {
  answer: Answer | null;
  busy: boolean;
  onAsk: (request: AskRequest) => void;
  onRead: (text: string) => void;
  onStop: () => void;
  speaking: boolean;
  canSpeak: boolean;
  saved: boolean;
  t: Dictionary;
}

/** Keep every source sentence intact, with further sentences on request. */
function answerParts(text: string) {
  const sentenceEnds = [...text.matchAll(/[.!?](?=\s|$)/g)];
  const end = sentenceEnds.length > 2 ? sentenceEnds[1].index + 1 : text.length;
  return { short: text.slice(0, end).trim(), detail: text.slice(end).trim() };
}

export function AskView({ answer, busy, onAsk, onRead, onStop, speaking, canSpeak, saved, t }: Props) {
  const headingId = useId();
  const typeId = useId();
  const targetId = useId();
  const questionId = useId();
  const hintId = useId();
  const originId = useId();
  const errorId = useId();
  const answerId = useId();
  const typeSelect = useRef<HTMLSelectElement>(null);
  const [tool, setTool] = useState<AskTool | 'automatic'>(saved ? 'walking_vs_straight_line' : 'automatic');
  const [target, setTarget] = useState('');
  const [question, setQuestion] = useState('');
  const [attempted, setAttempted] = useState(false);
  const automatic = tool === 'automatic';
  const missingTarget = attempted && !automatic && !target.trim();
  const missingQuestion = attempted && !question.trim();
  const longQuestion = attempted && question.trim().length > 500;
  const invalid = missingTarget || missingQuestion || longQuestion;
  const options: { value: AskTool; label: string }[] = [
    { value: 'walking_vs_straight_line', label: t.askDistance },
    { value: 'barrier_between', label: t.askBarriers },
    { value: 'independent_connections', label: t.askConnections },
    { value: 'street_continuity', label: t.askContinuity },
    { value: 'extent', label: t.askExtent },
  ];
  const exampleLabels = [t.askExampleDistance, t.askExampleBarrier, t.askExampleStreet];
  const parts = answer ? answerParts(answer.text) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if ((!automatic && !target.trim()) || !question.trim() || question.trim().length > 500) {
      setAttempted(true);
      return;
    }
    if (automatic) {
      setAttempted(false);
      onAsk({ question: question.trim() });
      return;
    }
    const name = target.trim();
    const params = tool === 'street_continuity' ? { street: name }
      : tool === 'extent' ? { place: { name } } : { to: { name } };
    setAttempted(false);
    onAsk({ question: question.trim(), tool, params });
  }

  function stop() {
    if (speaking || busy) onStop();
  }

  function chooseType() {
    setTool('walking_vs_straight_line');
    setAttempted(false);
    typeSelect.current?.focus();
  }

  return <section className="ask-panel" aria-labelledby={headingId}>
    <h2 id={headingId}>{t.ask}</h2>
    <p id={originId} className="reference">{t.askOrigin}</p>
    <p id={hintId} className="hint">{saved ? t.askHint : t.askNaturalHint}</p>

    {saved && <fieldset>
      <legend>{t.askSavedQuestions}</legend>
      <p>{t.askSavedHint}</p>
      <div className="button-row">{savedQuestions.map((request, index) => <button
        key={request.tool}
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          setAttempted(false);
          onAsk(structuredClone(request));
        }}
      >{exampleLabels[index]}</button>)}</div>
    </fieldset>}

    <form onSubmit={submit} aria-describedby={`${hintId} ${originId}`} noValidate>
      <label htmlFor={typeId}>{t.askType}</label>
      <select id={typeId} ref={typeSelect} value={tool} onChange={(event) => setTool(event.target.value as AskTool | 'automatic')}>
        {!saved && <option value="automatic">{t.askAutomatic}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {!automatic && <><label htmlFor={targetId}>{tool === 'street_continuity' ? t.askStreetName : t.askPlaceName}</label>
      <input
        id={targetId}
        type="text"
        value={target}
        aria-required="true"
        aria-invalid={missingTarget}
        aria-describedby={missingTarget ? errorId : undefined}
        autoComplete="off"
        onChange={(event) => setTarget(event.target.value)}
      /></>}
      <label htmlFor={questionId}>{t.askQuestion}</label>
      <input
        id={questionId}
        type="text"
        value={question}
        aria-required="true"
        aria-invalid={missingQuestion || longQuestion}
        aria-describedby={`${questionId}-hint${missingQuestion || longQuestion ? ` ${errorId}` : ''}`}
        autoComplete="off"
        maxLength={500}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <p id={`${questionId}-hint`} className="hint">{t.askQuestionLimit}</p>
      <button type="submit" aria-disabled={busy}>{t.askSubmit}</button>
      <p id={errorId} role="status">{invalid ? longQuestion ? t.askQuestionTooLong : automatic ? t.askQuestionRequired : t.askFormRequired : ''}</p>
    </form>

    {answer && parts && <section className="answer-panel" aria-labelledby={answerId}>
      <h3 id={answerId}>{t.answerTitle}</h3>
      <p><strong>{t.answerQuestion}:</strong> {answer.question}</p>
      <p className="answer-text">{parts.short}</p>
      {answer.tool === 'none' && <div className="notice">
        <p>{t.askRecoveryHint}</p>
        <button type="button" onClick={chooseType}>{t.askChooseType}</button>
      </div>}
      <div className="button-row">
        <button type="button" disabled={!canSpeak} onClick={() => onRead([parts.short, ...answer.unknown].join(' '))}>{t.listenAnswer}</button>
        <button type="button" aria-disabled={!speaking && !busy} onClick={stop}>{t.stopReading}</button>
      </div>
      {parts.detail && <details>
        <summary>{t.details}</summary>
        <p>{parts.detail}</p>
        <div className="button-row">
          <button type="button" disabled={!canSpeak} onClick={() => onRead([answer.text, ...answer.unknown].join(' '))}>{t.readDetails}</button>
          <button type="button" aria-disabled={!speaking && !busy} onClick={stop}>{t.stopReading}</button>
        </div>
      </details>}
      {answer.unknown.length > 0 && <div className="warnings">
        <h4>{t.warnings}</h4>
        <ul>{answer.unknown.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
      </div>}
      <ResultMeta meta={answer.meta} t={t} />
      <Evidence facts={answer.facts} t={t} />
    </section>}
  </section>;
}
