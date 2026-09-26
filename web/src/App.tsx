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

const language = 'en';
const localize = (text: string) => text;

export function App() {
  const { message: announcement, announce } = useAnnouncement();
  const [automatic, setAutomatic] = useState(false);
  const speech = useSpeech();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [step, setStep] = useState<ExploreStep | null>(null);
  const [view, setView] = useState<'overview' | 'explore'>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof createSavedSession> | null>(null);
  const busyRef = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const t = dictionaries.en;
  const overviewText = overview ? [localize(overview.text), ...overview.unknown.map(localize)].join(' ') : '';
  const currentText = view === 'explore' && step
    ? exploreSummary(step, localize, t) : overviewText;
  const readingText = currentText || `${t.title}. ${t.intro}`;
  const areaOpen = overview !== null;
  useEffect(() => { document.documentElement.lang = language; }, []);
  useEffect(() => { if (areaOpen) resultHeading.current?.focus(); }, [view, areaOpen]);

  function present(text: string) {
    announce(text);
    if (automatic && speech.supported) speech.speak(text, language);
  }
  async function run(action: () => Promise<void>, status = t.working) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); speech.stop(); announce(status);
    try { await action(); }
    catch (cause) {
      const message = cause instanceof ApiError && cause.kind === 'unavailable' ? t.unavailableOffline
        : cause instanceof ApiError && cause.kind === 'expired' ? t.sessionExpired
        : cause instanceof ApiError && cause.kind === 'network' ? t.connectionFailed : t.invalidResponse;
      setError(message); announce(message);
    } finally { busyRef.current = false; setBusy(false); }
  }
  function openArea() {
    void run(async () => {
      const next = createSavedSession(); session.current = next;
      setOverview(next.overview); setStep(null); setView('overview');
      present([localize(next.overview.text), ...next.overview.unknown.map(localize)].join(' '));
    }, t.loadingExamples);
  }
  function explore(command: ExploreCommand, branch?: number) {
    void run(async () => {
      if (!session.current) throw new ApiError('expired');
      const result = await session.current.explore(command, branch);
      setStep(result); setView('explore');
      present(`${command === 'where' ? `${t.savedPosition}. ` : ''}${exploreSummary(result, localize, t)}`);
      if (command === 'take') requestAnimationFrame(() => resultHeading.current?.focus());
    });
  }
  function showOverview() {
    if (busyRef.current) return;
    speech.stop(); setView('overview'); setError(null); present(overviewText);
  }
  function showExplore() {
    if (busyRef.current) return;
    if (!step) { explore('start'); return; }
    speech.stop(); setView('explore'); setError(null); present(exploreSummary(step, localize, t));
  }
  const result = view === 'overview' ? overview : step;
  return <>
    <a className="skip-link" href="#main">{t.skipToMain}</a>
    <header className="app-header">
      <span className="wordmark">{t.appName}</span>
    </header>
    <main id="main" tabIndex={-1}>
      <h1>{t.title}</h1>
      <SpeechControls speech={speech} text={readingText} language={language} automatic={automatic} onAutomaticChange={setAutomatic} t={t} />
      {!overview ? <>
        <p className="intro">{t.intro}</p>
        <section className="start-panel" aria-labelledby="start-heading">
          <h2 id="start-heading" tabIndex={-1}>{t.savedMode}</h2>
          <p>{t.savedNote}</p>
          <button className="primary" type="button" aria-disabled={busy} onClick={openArea}>{t.startSession}</button>
          <p className="hint">{t.serverPending}</p>
        </section>
      </> : <>
        <div className="session-strip"><p><strong>{localize(overview.zone.name)}</strong> · {t.savedMode}</p>
          <button type="button" aria-disabled={busy} onClick={() => {
            if (busyRef.current) return;
            speech.stop(); session.current = null; setOverview(null); setStep(null); setError(null); setView('overview');
            announce(t.startOver); requestAnimationFrame(() => document.getElementById('start-heading')?.focus());
          }}>{t.startOver}</button>
        </div>
        <nav className="view-nav" aria-label={t.navLabel}>
          <button type="button" aria-current={view === 'overview' ? 'page' : undefined} aria-disabled={busy} onClick={showOverview}>{t.overview}</button>
          <button type="button" aria-current={view === 'explore' ? 'page' : undefined} aria-disabled={busy} onClick={showExplore}>{t.explore}</button>
        </nav>
        <section className="result-panel" aria-labelledby="result-heading" aria-busy={busy}>
          <h2 id="result-heading" ref={resultHeading} tabIndex={-1}>{view === 'overview' ? t.overview : t.currentPosition}</h2>
          {view === 'overview' ? <>
            <p className="reference"><strong>{t.referenceLabel}:</strong> {localize(overview.reference.text)}</p>
            <p className="result-text">{localize(overview.text)}</p>
            <details className="overview-details"><summary>{t.details}</summary>
              <ul>{overview.details.map((detail) => <li key={detail}>{localize(detail)}</li>)}</ul>
              <div className="button-row">
                <button type="button" onClick={() => speech.speak(overview.details.map(localize).join(' '), language)} disabled={!speech.supported}>{t.readDetails}</button>
                <button type="button" aria-disabled={!speech.speaking} onClick={() => { if (speech.speaking) speech.stop(); }}>{t.stopReading}</button>
              </div>
            </details>
            {overview.unknown.length > 0 && <div className="warnings"><h3>{t.warnings}</h3><ul>{overview.unknown.map((warning) => <li key={warning}>{localize(warning)}</li>)}</ul></div>}
            <button type="button" className="primary" aria-disabled={busy} onClick={showExplore}>{t.continueExplore}</button>
          </> : step && <ExploreView step={step} t={t} localize={localize} busy={busy} onCommand={explore} summary={currentText} onReadDetails={() => speech.speak(localize(step.text), language)} onStopReading={speech.stop} speaking={speech.speaking} canSpeak={speech.supported} />}
          {result && <><ResultMeta meta={result.meta} t={t} /><Evidence facts={result.facts} t={t} /></>}
        </section>
      </>}
      {error && <p className="error-message">{error}</p>}
      {busy && <p>{t.working}</p>}
    </main>
    <footer>{t.preparationNote}</footer>
    <div className="sr-only" role="status" aria-live={automatic && !error ? 'off' : 'polite'} aria-atomic="true">{announcement}</div>
  </>;
}
