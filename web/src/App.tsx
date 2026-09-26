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

const language = 'en';
const localize = (text: string) => text;

export function App() {
  const { message: announcement, announce } = useAnnouncement();
  const [automatic, setAutomatic] = useState(false);
  const speech = useSpeech();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [step, setStep] = useState<ExploreStep | null>(null);
  const [view, setView] = useState<'overview' | 'explore' | 'plan'>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'saved' | 'connected'>('saved');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [lastReading, setLastReading] = useState('');
  const [positionUncertain, setPositionUncertain] = useState(false);
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
  useEffect(() => {
    if (areaOpen) {
      if (view === 'plan') document.getElementById('plan-heading')?.focus();
      else resultHeading.current?.focus();
    }
  }, [view, areaOpen]);

  const journey = usePlan(session.current, source === 'saved', run, planResult, t);
  useEffect(() => { if (journey.error) announce(journey.error); }, [journey.error, announce]);
  function planResult(plan: Plan, changed = true) {
    const selected = findSelectedRoute(plan);
    const summary = changed && plan.differences.length ? plan.differences.join(' ')
      : selected?.summary ?? plan.text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' ');
    const stop = plan.stop ? `${t.confirmedStop}: ${plan.stop.place}, ${plan.stop.duration_min} ${t.minutes}. ${t.stopHoursUnknown}` : '';
    present([!changed ? t.confirmedPlan : '', summary, stop, ...plan.unknown].filter(Boolean).join(' '));
  }
  function stopReading() { mutePendingSpeech.current = true; speech.stop(); }

  function present(text: string) {
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
      const next = source === 'saved' ? createSavedSession() : await createConnectedSession(); session.current = next;
      setOverview(next.overview); setStep(null); setAnswer(null); setPositionUncertain(false); setView('overview');
      present([localize(next.overview.text), ...next.overview.unknown.map(localize)].join(' '));
    }, source === 'saved' ? t.loadingExamples : t.loading);
  }
  function explore(command: ExploreCommand, branch?: number) {
    void run(async () => {
      if (!session.current) throw new ApiError('expired');
      if (positionUncertain && command !== 'where') { announce(t.unknownOutcomeExplore); return; }
      let result: ExploreStep;
      try { result = await session.current.explore(command, branch); }
      catch (cause) {
        if (source === 'connected') setPositionUncertain(true);
        throw cause;
      }
      setStep(result); setPositionUncertain(false); setView('explore');
      present(exploreSummary(result, localize, t));
      if (command === 'take') requestAnimationFrame(() => resultHeading.current?.focus());
    });
  }
  function ask(request: AskRequest) {
    void run(async () => {
      if (!session.current) throw new ApiError('expired');
      const result = await session.current.ask(request);
      setAnswer(result);
      const short = [result.text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' '), ...result.unknown].join(' ');
      setLastReading(short); announce(t.answerReady);
      if (automaticRef.current && !mutePendingSpeech.current && speech.supported) speech.speak(short, language);
    }, t.asking, source === 'saved' ? t.unavailableAnswer : t.connectionFailed);
  }
  function showOverview() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('overview'); setError(null); present(overviewText);
  }
  function showExplore() {
    if (busyRef.current) return;
    if (!step) { explore('start'); return; }
    mutePendingSpeech.current = false; speech.stop(); setView('explore'); setError(null); present(exploreSummary(step, localize, t));
  }
  function showPlan() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('plan'); setError(null);
    if (journey.plan) planResult(journey.plan, false); else announce(t.plan);
  }
  const result = view === 'overview' ? overview : step;
  return <>
    <a className="skip-link" href="#main">{t.skipToMain}</a>
    <header className="app-header">
      <span className="wordmark">{t.appName}</span>
    </header>
    <main id="main" tabIndex={-1}>
      <h1>{t.title}</h1>
      <SpeechControls speech={{ ...speech, stop: stopReading }} text={readingText} language={language} automatic={automatic} pending={busy} onAutomaticChange={setAutomatic} t={t} />
      {!overview ? <>
        <p className="intro">{t.intro}</p>
        <section className="start-panel" aria-labelledby="start-heading">
          <h2 id="start-heading" tabIndex={-1}>{t.chooseMode}</h2>
          <label htmlFor="data-source">{t.dataSource}</label>
          <select id="data-source" value={source} aria-disabled={busy} onChange={(event) => { if (!busyRef.current) setSource(event.target.value as 'saved' | 'connected'); }}>
            <option value="saved">{t.savedMode}</option><option value="connected">{t.liveMode}</option>
          </select>
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
              <div className="button-row">
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
      {error && <p className="error-message">{error}</p>}
      {busy && <p>{t.working}</p>}
    </main>
    <footer>{t.preparationNote}</footer>
    <div className="sr-only" role="status" aria-live={automatic && !error && !journey.error ? 'off' : 'polite'} aria-atomic="true">{announcement}</div>
  </>;
}
