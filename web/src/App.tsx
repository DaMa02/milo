import { useEffect, useRef, useState } from 'react';
import { dictionaries } from './i18n';
import { useSpeech } from './hooks/useSpeech';
import { useAnnouncement } from './hooks/useAnnouncement';
import { SpeechControls } from './components/SpeechControls';
import { Evidence, ResultMeta } from './components/Evidence';
import { ExploreView } from './components/ExploreView';
import { createSavedSession } from './api/fixtures';
import { ApiError } from './api/http';
import type { ExploreCommand, ExploreStep, Overview } from './api/contracts';
import { exploreSummary } from './api/narration';
import { AskView } from './components/AskView';
import { createConnectedSession, type AreaSession } from './api/session';
import type { Answer, AskRequest } from './api/contracts';
import { usePlan } from './hooks/usePlan';
import { PlanView } from './components/PlanView';
import { findSelectedRoute, type Plan } from './api/plan-contracts';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useVoiceCommands } from './hooks/useVoiceCommands';
import { TalkButton } from './components/TalkButton';
import { usePlaces } from './hooks/usePlaces';
import { StartFlow } from './components/StartFlow';
import type { Place } from './api/places';
import type { VoiceCommand } from './api/interpret';

const language = 'en';
const localize = (text: string) => text;
const savedDevelopment = new URLSearchParams(window.location.search).get('saved') === '1';
const debugControls = savedDevelopment || new URLSearchParams(window.location.search).get('debug') === '1';

export function App() {
  const { message: announcement, announce } = useAnnouncement();
  const [automatic, setAutomatic] = useState(false);
  const speech = useSpeech();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [step, setStep] = useState<ExploreStep | null>(null);
  const [view, setView] = useState<'overview' | 'explore' | 'plan'>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'saved' | 'connected'>(savedDevelopment ? 'saved' : 'connected');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [lastReading, setLastReading] = useState('');
  const [positionUncertain, setPositionUncertain] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [destination, setDestination] = useState<Place | null>(null);
  const [expandedAnswer, setExpandedAnswer] = useState(false);
  const [readingUnknowns, setReadingUnknowns] = useState<string[]>([]);
  const [voiceFailures, setVoiceFailures] = useState(0);
  const allControls = useRef<HTMLDetailsElement>(null);
  const talkDock = useRef<HTMLDivElement>(null);
  const session = useRef<AreaSession | null>(null);
  const busyRef = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const automaticRef = useRef(automatic);
  automaticRef.current = automatic;
  const mutePendingSpeech = useRef(false);
  const t = dictionaries.en;
  const overviewText = overview ? [localize(overview.text), ...overview.unknown.map(localize)].join(' ') : '';
  const currentText = view === 'explore' && step
    ? exploreSummary(step, localize, t) : overviewText;
  const readingText = lastReading || currentText || `${t.title}. ${t.intro}`;
  const areaOpen = overview !== null;
  useEffect(() => { document.documentElement.lang = language; }, []);
  useEffect(() => { if (!savedDevelopment) talkDock.current?.querySelector('button')?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (areaOpen && savedDevelopment) {
      if (view === 'plan') document.getElementById('plan-heading')?.focus();
      else resultHeading.current?.focus();
    }
  }, [view, areaOpen]);

  const journey = usePlan(session.current, source === 'saved', run, planResult, t);
  const places = usePlaces({ session: session.current, t, onSessionReady: acceptSession,
    onDestinationChanged: (place) => {
      setDestination(place);
      if (session.current) session.current = { ...session.current, destination: place };
      setView('overview'); setAnswer(null);
    }, onMessage: present });
  const commands = useVoiceCommands({ sessionId: session.current?.id, busy: busy || places.busy,
    context: { view, pending: places.pending ?? (!session.current ? 'origin' : null),
      candidates: places.candidates.map((candidate) => candidate.name), has_destination: destination !== null,
      routes: journey.plan?.routes.map((route) => ({ id: route.id, label: route.summary })) ?? [] },
    onAction: dispatchCommand, onError: (cause) => {
      const message = cause instanceof ApiError && typeof cause.detail === 'string' ? cause.detail : t.commandUnavailable;
      setError(message); present(message);
    }, onBusy: () => announce(t.commandStillWorking) });
  const voice = useVoiceInput({ onTranscript: (text) => { mutePendingSpeech.current = false; setVoiceFailures(0); setCommandText(text); void commands.send(text); },
    onError: (kind) => { mutePendingSpeech.current = false; setVoiceFailures((count) => count + 1); const message = t[`voiceError:${kind}`]; setError(message); present(message); } });
  useEffect(() => { if (speech.error) { setError(t.speechFailed); announce(t.speechFailed); } }, [speech.error, announce, t.speechFailed]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); voice.cancel(); commands.cancel(); stopReading(); }
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  });
  useEffect(() => {
    if (journey.error) {
      announce(journey.error);
      if (journey.uncertain || !journey.plan) setLastReading(journey.error);
    }
  }, [journey.error, journey.uncertain, journey.plan, announce]);
  function planResult(plan: Plan, changed = true, kind: 'plan' | 'candidates' = 'plan') {
    if (kind === 'candidates') {
      present([plan.text, ...plan.unknown].join(' '), plan.unknown);
      return;
    }
    const selected = findSelectedRoute(plan);
    const summary = changed && plan.differences.length ? plan.differences.join(' ')
      : selected?.summary ?? plan.text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' ');
    const stop = plan.stop ? `${t.confirmedStop}: ${plan.stop.place}, ${plan.stop.duration_min} ${t.minutes}. ${t.stopHoursUnknown}` : '';
    present([!changed ? t.confirmedPlan : '', summary, stop, ...plan.unknown].filter(Boolean).join(' '), plan.unknown);
  }
  function stopReading() { mutePendingSpeech.current = true; speech.stop(); }
  function acceptSession(next: AreaSession) {
    voice?.cancel(); commands?.cancel(); session.current = next;
    setOverview(next.overview); setStep(null); setAnswer(null); setDestination(next.destination ?? null);
    setPositionUncertain(false); setView('overview'); setError(null);
    present([next.overview.text, ...next.overview.unknown].join(' '), next.overview.unknown);
  }
  function startOver() {
    voice.cancel(); commands.cancel(); places.cancel(); stopReading();
    session.current = null; setOverview(null); setStep(null); setAnswer(null); setDestination(null);
    setLastReading(''); setError(null); setPositionUncertain(false); setView('overview');
    announce(t.placesIntro);
  }
  function dispatchCommand(command: VoiceCommand) {
    switch (command.action) {
      case 'stop': voice.cancel(); stopReading(); return;
      case 'repeat': mutePendingSpeech.current = false; speech.speak(readingText, language); return;
      case 'help': present(t.commandHelp); return;
      case 'speed': speech.setRate(speech.rate + (command.params.change === 'faster' ? 0.15 : -0.15)); present(t.commandSpeedChanged); return;
      case 'start_over': startOver(); return;
      case 'set_origin': void places.setOriginByQuery(command.params.query); return;
      case 'set_origin_here': void places.setOriginHere(); return;
      case 'set_destination': void places.setDestinationByQuery(command.params.query); return;
      case 'confirm': void places.confirm(command.params.answer, command.params.index); return;
      case 'none': present(command.params.reason === 'model_unavailable' ? t.commandUnavailable : t.commandNoFit); return;
      case 'overview': if (overview) showOverview(); else present(t.placesIntro); return;
      case 'explore': {
        if (!overview) { present(t.placesIntro); return; }
        const branch = typeof command.params.branch === 'string'
          ? step?.branches.findIndex((item) => item.name.toLowerCase() === command.params.branch!.toString().toLowerCase())
          : command.params.branch;
        if (command.params.command === 'take' && (branch === undefined || branch < 0 || !step || branch >= step.branches.length)) {
          present(t.commandNoFit); return;
        }
        explore(command.params.command, branch); return;
      }
      case 'ask': if (overview) ask(command.params); else present(t.placesIntro); return;
      case 'more': {
        setExpandedAnswer(true);
        present(answer?.text ?? (view === 'plan' ? journey.plan?.text : view === 'explore' ? step?.text : overview?.details.join(' ')) ?? t.commandHelp);
        return;
      }
      case 'unknowns': present((answer?.unknown ?? (view === 'plan' ? journey.plan?.unknown : overview?.unknown))?.join(' ') || t.commandNoUnknowns); return;
      case 'sources': {
        const facts = answer?.facts ?? (view === 'plan' ? journey.plan?.facts : view === 'explore' ? step?.facts : overview?.facts);
        present(facts?.length ? [...new Set(facts.flatMap((fact) => [fact.source, ...fact.evidence]))].join('. ') : t.commandNoSources); return;
      }
      case 'route': case 'route_select': case 'route_avoid':
        if (!overview) present(t.placesIntro);
        else { if (allControls.current) allControls.current.open = true; showPlan(); present(t.commandPlanControls); }
        return;
    }
  }

  function present(text: string, unknowns: string[] = []) {
    setReadingUnknowns(unknowns);
    setLastReading(text);
    announce(text);
    if (automaticRef.current && !mutePendingSpeech.current && speech.supported) speech.speak(text, language);
  }
  async function run(action: () => Promise<void>, status = t.working, unavailable = t.unavailableOffline) {
    if (busyRef.current) return;
    busyRef.current = true; mutePendingSpeech.current = false; setBusy(true); setError(null); speech.stop(); announce(status);
    try { await action(); }
    catch (cause) {
      const message = cause instanceof ApiError && cause.kind === 'unavailable' ? unavailable
        : cause instanceof ApiError && cause.kind === 'expired' ? t.sessionExpired
        : cause instanceof ApiError && cause.kind === 'network' ? t.connectionFailed : t.invalidResponse;
      setError(message); announce(message);
    } finally { busyRef.current = false; setBusy(false); }
  }
  function openArea() {
    void run(async () => {
      const next = source === 'saved' ? createSavedSession() : await createConnectedSession(); acceptSession(next);
    }, source === 'saved' ? t.loadingExamples : t.loading);
  }
  function explore(command: ExploreCommand, branch?: number) {
    const initiator = document.activeElement;
    const followsBranch = command === 'take' && initiator instanceof HTMLButtonElement && initiator.closest('.branch-actions');
    void run(async () => {
      if (!session.current) throw new ApiError('expired');
      if (positionUncertain && command !== 'where') { announce(t.unknownOutcomeExplore); return; }
      let result: ExploreStep;
      try { result = await session.current.explore(command, branch); }
      catch (cause) {
        if (source === 'connected') setPositionUncertain(true);
        throw cause;
      }
      const focusResult = followsBranch && document.activeElement === initiator;
      setStep(result); setAnswer(null); setPositionUncertain(false); setView('explore');
      present(exploreSummary(result, localize, t));
      if (focusResult) requestAnimationFrame(() => {
        if (document.activeElement === initiator || (!initiator.isConnected && document.activeElement === document.body)) {
          if (savedDevelopment) resultHeading.current?.focus();
          else document.getElementById('latest-answer-heading')?.focus();
        }
      });
    });
  }
  function ask(request: AskRequest) {
    void run(async () => {
      if (!session.current) throw new ApiError('expired');
      const result = await session.current.ask(request);
      setAnswer(result);
      const short = [result.text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' '), ...result.unknown].join(' ');
      setLastReading(short); setReadingUnknowns(result.unknown); announce(savedDevelopment ? t.answerReady : short);
      if (automaticRef.current && !mutePendingSpeech.current && speech.supported) speech.speak(short, language);
    }, t.asking, source === 'saved' ? t.unavailableAnswer : t.connectionFailed);
  }
  function showOverview() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('overview'); setAnswer(null); setError(null); present(overviewText, overview?.unknown);
  }
  function showExplore() {
    if (busyRef.current) return;
    if (!step) { explore('start'); return; }
    mutePendingSpeech.current = false; speech.stop(); setView('explore'); setError(null); present(exploreSummary(step, localize, t));
  }
  function showPlan() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('plan'); setError(null);
    if (journey.uncertain) present(t.planUncertain);
    else if (journey.plan) planResult(journey.plan, false); else announce(t.plan);
  }
  const result = view === 'overview' ? overview : step;
  const displayed = lastReading || (overview ? readingText : t.placesIntro);
  const shortAnswer = displayed.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' ');
  return <>
    <a className="skip-link" href="#main">{t.skipToMain}</a>
    <header className="app-header">
      <span className="wordmark">{t.appName}</span>
    </header>
    <main id="main" tabIndex={-1} className={savedDevelopment ? 'saved-development' : 'single-screen'}>
      <h1>{t.title}</h1>
      {savedDevelopment ? <SpeechControls speech={{ ...speech, stop: stopReading }} text={readingText} language={language} automatic={automatic} pending={busy} onAutomaticChange={setAutomatic} t={t} /> : <>
        <div className="voice-console">
          <div className="talk-dock" ref={talkDock}>
            <TalkButton state={voice.state}
              onGesture={() => { stopReading(); speech.prime(); }}
              onStart={() => { mutePendingSpeech.current = true; automaticRef.current = true; setAutomatic(true); return voice.start(); }}
              onStop={() => voice.stop(true)} onCancel={voice.cancel}
              labels={{ idle: t.talk, listening: t.finishTalking, transcribing: t.voiceThinking, hint: t.talkHint }} />
            <p className="voice-state">{voice.state === 'listening' ? t.voiceListening : voice.state === 'transcribing' || commands.interpreting || busy || places.busy ? t.voiceThinking : speech.speaking ? t.voiceSpeaking : t.voiceIdle}</p>
          </div>
          {(debugControls || voiceFailures >= 2) && <form className="unified-command" onSubmit={(event) => { event.preventDefault(); voice.cancel(); void commands.send(commandText); }}>
            <label htmlFor="unified-command">{t.commandInput}</label>
            <div className="input-row"><input id="unified-command" value={commandText} maxLength={500} autoComplete="off"
              onChange={(event) => setCommandText(event.target.value)} />{debugControls && <button type="submit">{t.commandSend}</button>}</div>
          </form>}
          <section className="latest-answer" aria-labelledby="latest-answer-heading">
            <h2 id="latest-answer-heading" tabIndex={-1}>{t.latestAnswer}</h2>
            {overview && <p className="journey-endpoints">{t.journeyOrigin}: {overview.reference.place}{destination ? ` · ${t.destination}: ${destination.name}` : ''}</p>}
            <p className="latest-answer-text">{!debugControls || expandedAnswer ? displayed : shortAnswer}</p>
            {debugControls && !expandedAnswer && readingUnknowns.some((item) => !shortAnswer.includes(item)) && <ul className="warnings">{readingUnknowns.filter((item) => !shortAnswer.includes(item)).map((item) => <li key={item}>{item}</li>)}</ul>}
            {debugControls && displayed !== shortAnswer && <button type="button" aria-expanded={expandedAnswer} onClick={() => setExpandedAnswer(!expandedAnswer)}>{expandedAnswer ? t.commandLess : t.details}</button>}
            {debugControls && <div className="button-row compact-speech"><button type="button" disabled={!speech.supported} onClick={() => { mutePendingSpeech.current = false; speech.speak(displayed, language); }}>{t.compactListen}</button>
              <button type="button" onClick={() => { voice.cancel(); commands.cancel(); stopReading(); }}>{t.compactStop}</button></div>}
            {debugControls && view === 'explore' && step && <ol className="branch-actions">{step.branches.map((branch, index) => <li key={`${branch.name}-${index}`}>
              <button type="button" aria-disabled={busy} onClick={() => { if (!busy) explore('take', index); }}>{t.followBranch} {branch.relative_direction}: {branch.name}</button>
            </li>)}</ol>}
          </section>
        </div>
        {debugControls && (!overview || places.pending || places.busy) && <StartFlow places={places} t={t} compact />}
      </>}
      {debugControls && <details ref={allControls} className="all-controls" open={savedDevelopment || undefined}>
        <summary>{t.showAllControls}</summary>
      {!overview ? <>
        <p className="intro">{t.intro}</p>
        <section className="start-panel" aria-labelledby="start-heading">
          <h2 id="start-heading" tabIndex={-1}>{t.chooseMode}</h2>
          {savedDevelopment && <><label htmlFor="data-source">{t.dataSource}</label>
          <select id="data-source" value={source} aria-disabled={busy} onChange={(event) => { if (!busyRef.current) setSource(event.target.value as 'saved' | 'connected'); }}>
            <option value="saved">{t.savedMode}</option><option value="connected">{t.liveMode}</option>
          </select></>}
          <p>{source === 'saved' ? t.savedNote : t.sourceHint}</p>
          <button className="primary" type="button" aria-disabled={busy} onClick={openArea}>{t.startSession}</button>
        </section>
      </> : <>
        <div className="session-strip"><p><strong>{localize(overview.zone.name)}</strong> · {source === 'saved' ? t.savedMode : t.liveMode}</p>
          <button type="button" aria-disabled={busy} onClick={() => {
            if (busyRef.current) return;
            speech.stop(); session.current = null; setOverview(null); setStep(null); setAnswer(null); setLastReading(''); setError(null); setPositionUncertain(false); setView('overview');
            announce(t.startOver); requestAnimationFrame(() => document.getElementById('start-heading')?.focus());
          }}>{t.startOver}</button>
        </div>
        <nav className="view-nav" aria-label={t.navLabel}>
          <button type="button" aria-current={view === 'overview' ? 'page' : undefined} aria-disabled={busy} onClick={showOverview}>{t.overview}</button>
          <button type="button" aria-current={view === 'explore' ? 'page' : undefined} aria-disabled={busy} onClick={showExplore}>{t.explore}</button>
          <button type="button" aria-current={view === 'plan' ? 'page' : undefined} aria-disabled={busy} onClick={showPlan}>{t.plan}</button>
        </nav>
        <section hidden={view === 'plan'} className="result-panel" aria-labelledby="result-heading" aria-busy={busy}>
          <h2 id="result-heading" ref={resultHeading} tabIndex={-1}>{view === 'overview' ? t.overview : t.currentPosition}</h2>
          {view === 'overview' ? <>
            <p className="reference"><strong>{t.referenceLabel}:</strong> {localize(overview.reference.text)}</p>
            <p className="result-text">{localize(overview.text)}</p>
            <details className="overview-details"><summary>{t.details}</summary>
              <ul>{overview.details.map((detail) => <li key={detail}>{localize(detail)}</li>)}</ul>
              <div className="button-row view-voice-controls">
                <button type="button" onClick={() => speech.speak(overview.details.map(localize).join(' '), language)} disabled={!speech.supported}>{t.readDetails}</button>
                <button type="button" aria-disabled={!speech.speaking && !busy} onClick={() => { if (speech.speaking || busy) stopReading(); }}>{t.stopReading}</button>
              </div>
            </details>
            {overview.unknown.length > 0 && <div className="warnings"><h3>{t.warnings}</h3><ul>{overview.unknown.map((warning) => <li key={warning}>{localize(warning)}</li>)}</ul></div>}
            <button type="button" className="primary" aria-disabled={busy} onClick={showExplore}>{t.continueExplore}</button>
            <button type="button" aria-disabled={busy} onClick={showPlan}>{t.plan}</button>
          </> : step && <ExploreView step={step} t={t} localize={localize} busy={busy} onCommand={explore} summary={currentText} onReadDetails={() => speech.speak(localize(step.text), language)} onStopReading={stopReading} speaking={speech.speaking} canSpeak={speech.supported} />}
          {result && <><ResultMeta meta={result.meta} t={t} /><Evidence facts={result.facts} t={t} /></>}
        </section>
        <div hidden={view !== 'plan'}>
          <PlanView plan={journey.plan} pending={journey.pending} uncertain={journey.uncertain} busy={busy} onCreate={journey.create} onMutate={journey.mutate} onRefresh={journey.refresh} onRead={(text) => speech.speak(text, language)} onStop={stopReading} speaking={speech.speaking} canSpeak={speech.supported} t={t} overview={overview} />
          {journey.error && <p className="error-message">{journey.error}</p>}
        </div>
        {positionUncertain && <div className="warnings"><p>{t.unknownOutcomeExplore}</p><button type="button" aria-disabled={busy} onClick={() => explore('where')}>{t.whereAmI}</button></div>}
        <AskView answer={answer} busy={busy} onAsk={ask} onRead={(text) => speech.speak(text, language)} onStop={stopReading} speaking={speech.speaking} canSpeak={speech.supported} saved={source === 'saved'} t={t} />
      </>}
      </details>}
      {error && <p className="error-message">{error}</p>}
      {busy && <p>{t.working}</p>}
    </main>
    <footer>{t.preparationNote}</footer>
    <div className="sr-only" role="status" aria-live={automatic && !error && !journey.error ? 'off' : 'polite'} aria-atomic="true">{announcement}</div>
  </>;
}
