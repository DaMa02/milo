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
import { useLiveGuidance } from './hooks/useLiveGuidance';
import { useCompass } from './hooks/useCompass';
import { useVoiceStops } from './hooks/useVoiceStops';
import { useSpokenResult } from './hooks/useSpokenResult';
import type { SpeakKind } from './api/speak';
import miloMark from './assets/milo-mark.svg';

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
  const [spokenAnswer, setSpokenAnswer] = useState('');
  const lastSpoken = useRef('');
  const lastUtterance = useRef('');
  const introduced = useRef(false);
  const audioOwner = useRef<'answer' | 'navigation' | null>(null);
  const lastGuidance = useRef('');
  const pendingGuidance = useRef<{ text: string; options?: { interrupt?: boolean } } | null>(null);
  const [positionUncertain, setPositionUncertain] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [destination, setDestination] = useState<Place | null>(null);
  const [expandedAnswer, setExpandedAnswer] = useState(false);
  const [, setReadingUnknowns] = useState<string[]>([]);
  const [voiceFailures, setVoiceFailures] = useState(0);
  const [replanDestination, setReplanDestination] = useState<Place | null>(null);
  const deferredOriginCommand = useRef<VoiceCommand | null>(null);
  const [readyOriginCommand, setReadyOriginCommand] = useState<VoiceCommand | null>(null);
  const guideAfterPlan = useRef(false);
  const [readyForGuidance, setReadyForGuidance] = useState(false);
  const allControls = useRef<HTMLDetailsElement>(null);
  const talkDock = useRef<HTMLDivElement>(null);
  const session = useRef<AreaSession | null>(null);
  const busyRef = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const automaticRef = useRef(automatic);
  automaticRef.current = automatic;
  const mutePendingSpeech = useRef(false);
  const compassNotice = useRef<string | null>(null);
  const t = dictionaries.en;
  const spoken = useSpokenResult({ onText: (response) => {
    const notice = !mutePendingSpeech.current ? compassNotice.current : null;
    const text = notice ? `${notice} ${response}` : response;
    if (notice) compassNotice.current = null;
    setSpokenAnswer(text); lastSpoken.current = text; announce(text);
    if (automaticRef.current && !mutePendingSpeech.current && speech.supported) { audioOwner.current = 'answer'; speech.speak(text, language); }
  }, onWaiting: () => announce(t.commandStillWorking) });
  const compass = useCompass({ onHeadingChange: () => guidance.refreshHeading(), onDenied: () => {
    compassNotice.current = t.compassDenied;
    setError(t.compassDenied); announce(t.compassDenied);
  } });
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
  const stops = useVoiceStops({ sessionId: session.current?.id ?? null, plan: journey.plan,
    busy, uncertain: journey.uncertain, error: journey.error, t, onMutate: journey.mutate,
    onMessage: (text, plan) => present(text, plan?.unknown ?? [], plan ? { kind: 'plan', result: plan } : undefined) });
  const planMatchesDestination = !destination || !journey.plan || sameDestination(journey.plan, destination);
  const places = usePlaces({ session: session.current, t, getHeading: compass.getHeading, onSessionReady: acceptSession,
    onDestinationChanged: (place) => {
      stops.cancel();
      setReadyForGuidance(false);
      guidance.stop();
      setDestination(place);
      if (session.current) session.current.destination = place;
      setReplanDestination(place);
      setView('overview'); setAnswer(null);
    }, onMessage: (text, details) => {
      if (details?.pending) { announce(text); return; }
      present(text, [], { kind: details?.kind ?? 'places', result: details?.result ?? { text } });
    } });
  const commands = useVoiceCommands({ sessionId: session.current?.id, busy: busy || places.busy,
    context: { view, pending: places.pending ?? stops.pending ?? (!session.current ? 'origin' : null),
      stop_candidates: stops.candidates.map((candidate) => candidate.place), last_action: stops.lastAction,
      candidates: places.candidates.map((candidate) => candidate.name), has_destination: destination !== null,
      routes: planMatchesDestination ? journey.plan?.routes.map((route) => ({ id: route.id, label: route.summary })) ?? [] : [] },
    onAction: dispatchCommand, onStatus: presentDirect, t, onError: (cause) => {
      const message = cause instanceof ApiError && typeof cause.detail === 'string' ? cause.detail : t.commandUnavailable;
      setError(message); present(message);
    }, onBusy: () => announce(t.commandStillWorking) });
  const voice = useVoiceInput({ onTranscript: (text) => { mutePendingSpeech.current = false; setVoiceFailures(0); setCommandText(text); sendCommand(text); },
    onError: (kind) => { mutePendingSpeech.current = false; setVoiceFailures((count) => count + 1); const message = t[`voiceError:${kind}`]; setError(message); present(message); } });
  const guidance = useLiveGuidance({ sessionId: session.current?.id ?? null, origin: session.current?.origin, getHeading: compass.getHeading,
    t, onMessage: receiveGuidance, onError: (text) => { setError(text); present(text); } });
  function receiveGuidance(text: string, options?: { interrupt?: boolean }) {
    lastGuidance.current = text;
    if (voice.state === 'listening' && !options?.interrupt) { pendingGuidance.current = { text, options }; return; }
    pendingGuidance.current = null;
    voice.cancel(); spoken.cancel(); setLastReading(text); setSpokenAnswer(text); lastSpoken.current = text;
    setReadingUnknowns([]); setExpandedAnswer(false); announce(text);
    const interrupt = options?.interrupt || audioOwner.current !== 'navigation';
    audioOwner.current = 'navigation'; speech.enqueue(text, language, { interrupt });
  }
  useEffect(() => {
    if (voice.state !== 'listening' && pendingGuidance.current) {
      const pending = pendingGuidance.current; pendingGuidance.current = null;
      receiveGuidance(pending.text, pending.options);
    }
  }, [voice.state]);
  useEffect(() => { if (journey.pending) guidance.stop(); }, [journey.pending]);
  useEffect(() => {
    if (readyForGuidance && !busy && !journey.pending && !journey.uncertain && journey.plan && planMatchesDestination) {
      setReadyForGuidance(false);
      void guidance.start();
    }
  }, [readyForGuidance, busy, journey.pending, journey.uncertain, journey.plan, planMatchesDestination]);
  useEffect(() => { if (speech.error) { setError(t.speechFailed); announce(t.speechFailed); } }, [speech.error, announce, t.speechFailed]);
  useEffect(() => {
    if (readyOriginCommand && overview && !busy && !places.busy) {
      const command = readyOriginCommand;
      setReadyOriginCommand(null);
      dispatchCommand(command);
    }
  }, [readyOriginCommand, overview, busy, places.busy]);
  useEffect(() => {
    if (replanDestination && !places.busy && !busy) {
      setReplanDestination(null);
      createVoicePlan(replanDestination);
    }
  }, [replanDestination, places.busy, busy]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); guideAfterPlan.current = false; setReadyForGuidance(false); voice.cancel(); commands.cancel(); guidance.stop(); stopReading(); }
    };
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  });
  useEffect(() => {
    if (journey.error) {
      guideAfterPlan.current = false;
      setReadyForGuidance(false);
      if (!planMatchesDestination) present(t.routePreviousDestination.replace('{place}', journey.plan!.destination.name));
      else if (journey.plan && !journey.uncertain) {
        // A successful recovery must keep the confirmed stop and unknowns in
        // the repeatable answer, without replaying an older mutation's changes.
        present(`${journey.error} ${planReading(journey.plan, false)}`, journey.plan.unknown,
          { kind: 'error', result: { text: journey.error, plan: journey.plan } });
      } else present(journey.error);
    }
  }, [journey.error, journey.uncertain, journey.plan, announce]);
  function planResult(plan: Plan, changed = true, kind: 'plan' | 'candidates' = 'plan') {
    if (destination && !sameDestination(plan, destination)) {
      present(t.routePreviousDestination.replace('{place}', plan.destination.name));
      return;
    }
    if (stops.acceptResult(plan, kind)) return;
    if (guideAfterPlan.current && kind === 'plan' && plan.routes.length) {
      guideAfterPlan.current = false;
      setReadyForGuidance(true); return;
    }
    if (kind === 'candidates') {
      present([plan.text, ...plan.unknown].join(' '), plan.unknown, { kind: 'plan', result: plan });
      return;
    }
    present(savedDevelopment ? planReading(plan, changed) : [plan.text, ...plan.differences, ...plan.unknown].join(' '),
      plan.unknown, { kind: 'plan', result: plan });
  }
  function planReading(plan: Plan, changed: boolean) {
    const selected = findSelectedRoute(plan);
    const summary = changed && plan.differences.length ? plan.differences.join(' ')
      : selected?.summary ?? [(plan.routes.find((route) => route.id === 'A') ?? plan.routes[0])?.summary ?? plan.text,
        plan.routes.length ? t.routeStartPrompt : ''].join(' ');
    const stop = plan.stop ? `${t.confirmedStop}: ${plan.stop.place}, ${plan.stop.duration_min} ${t.minutes}. ${t.stopHoursUnknown}` : '';
    return [!changed ? t.confirmedPlan : '', summary, stop, ...plan.unknown].filter(Boolean).join(' ');
  }
  function stopReading() { mutePendingSpeech.current = true; pendingGuidance.current = null; audioOwner.current = null; spoken.cancel(); speech.stop(); }
  function acceptSession(next: AreaSession) {
    stops.cancel();
    guideAfterPlan.current = false;
    setReadyForGuidance(false);
    guidance?.stop();
    setReplanDestination(null);
    voice?.cancel(); commands?.cancel(); session.current = next;
    setOverview(next.overview); setStep(null); setAnswer(null); setDestination(next.destination ?? null);
    setPositionUncertain(false); setView('overview'); setError(null);
    const deferred = deferredOriginCommand.current;
    deferredOriginCommand.current = null;
    if (deferred) setReadyOriginCommand(deferred);
    else present([next.overview.text, ...next.overview.unknown].join(' '), next.overview.unknown, { kind: 'overview', result: next.overview });
  }
  function startOver() {
    stops.cancel();
    guideAfterPlan.current = false;
    setReadyForGuidance(false);
    deferredOriginCommand.current = null; setReadyOriginCommand(null);
    guidance.stop();
    setReplanDestination(null);
    voice.cancel(); commands.cancel(); places.cancel(); stopReading();
    session.current = null; setOverview(null); setStep(null); setAnswer(null); setDestination(null);
    setLastReading(''); setSpokenAnswer(''); lastSpoken.current = ''; setError(null); setPositionUncertain(false); setView('overview');
    announce(t.placesIntro);
  }
  function dispatchCommand(command: VoiceCommand, utterance = '') {
    if (utterance) lastUtterance.current = utterance;
    // Interpretation has already consumed this one-turn hint. Keep any pending
    // candidate conversation while discarding the hint for the following turn.
    stops.clearLastAction();
    if (guidance.active && (/^(where am i|how far is it|how far to go)[.!?]?$/i.test(utterance.trim())
      || (command.action === 'explore' && command.params.command === 'where'))) {
      const physical = guidance.getLatestResult();
      if (!physical) { present(t.navigationPositionPending); return; }
      const fallback = [physical.next ? `${physical.next.instruction} in ${physical.next.distance_m} m.` : '',
        physical.remaining_m !== null && physical.remaining_min !== null
          ? `${physical.remaining_m} m, about ${physical.remaining_min} minutes to ${destination?.name ?? t.destination}.` : '']
        .filter(Boolean).join(' ') || t.navigationPositionPending;
      present(fallback, [], { kind: 'navigate', result: physical });
      return;
    }
    if (destination && /^(let['’]?s go|take me there|guide me|start navigation)[.!?]?$/i.test(utterance.trim())) {
      command = { action: 'navigate', params: { state: 'start' } };
    }
    const needsOrigin = ['overview', 'explore', 'ask', 'route', 'set_destination', 'more'].includes(command.action)
      || (command.action === 'navigate' && command.params.state === 'start');
    if (!session.current && needsOrigin) {
      deferredOriginCommand.current = command;
      if (places.pending === 'origin' && places.phase === 'confirming' && places.candidates.length) void places.confirm('yes');
      else void places.setOriginHere({ autoConfirm: true });
      return;
    }
    switch (command.action) {
      case 'stop': guideAfterPlan.current = false; setReadyForGuidance(false); voice.cancel(); guidance.stop(); stopReading(); return;
      case 'navigate':
        if (command.params.state === 'stop') { guideAfterPlan.current = false; setReadyForGuidance(false); guidance.stop(); stopReading(); present(t.navigationStopped); return; }
        if (!journey.plan || !planMatchesDestination) {
          guideAfterPlan.current = true;
          if (destination) createVoicePlan(destination);
          else { void places.setDestinationByQuery(''); present(t.routeDestinationRequired); }
          return;
        }
        if (journey.uncertain) { journey.refresh(); return; }
        void guidance.start(); return;
      case 'repeat':
        mutePendingSpeech.current = false;
        audioOwner.current = guidance.active && lastGuidance.current ? 'navigation' : 'answer';
        speech.speak((guidance.active && lastGuidance.current) || lastSpoken.current || readingText.split(/(?<=[.!?])\s/)[0], language); return;
      case 'help': presentDirect(t.voiceWelcome); return;
      case 'chat': presentDirect(command.params.text); return;
      case 'speed': speech.setRate(speech.rate + (command.params.change === 'faster' ? 0.15 : -0.15)); present(t.commandSpeedChanged); return;
      case 'start_over': startOver(); return;
      case 'set_origin': stops.cancel(); guidance.stop(); void places.setOriginByQuery(command.params.query); return;
      case 'set_origin_here': stops.cancel(); guidance.stop(); void places.setOriginHere(); return;
      case 'set_destination': stops.cancel(); guidance.stop(); void places.setDestinationByQuery(command.params.query); return;
      case 'confirm':
        if (stops.pending === 'stop' && !places.pending) stops.confirm(command.params.answer, command.params.index);
        else void places.confirm(command.params.answer, command.params.index);
        return;
      case 'none': presentDirect(t.voiceWelcome); return;
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
        presentDirect(answer?.text ?? (view === 'plan' ? journey.plan?.text : view === 'explore' ? step?.text : overview?.details.join(' ')) ?? t.voiceWelcome);
        return;
      }
      case 'unknowns': presentDirect((answer?.unknown ?? (view === 'plan' ? journey.plan?.unknown : overview?.unknown))?.join(' ') || t.commandNoUnknowns); return;
      case 'sources': {
        const facts = answer?.facts ?? (view === 'plan' ? journey.plan?.facts : view === 'explore' ? step?.facts : overview?.facts);
        presentDirect(facts?.length ? [...new Set(facts.flatMap((fact) => [fact.source, ...fact.evidence]))].join('. ') : t.commandNoSources); return;
      }
      case 'route':
        if (!overview) { present(t.placesIntro); return; }
        if (!destination) { void places.setDestinationByQuery(''); present(t.routeDestinationRequired); return; }
        if (journey.uncertain) { journey.refresh(); return; }
        if (/^other routes[.!?]?$/i.test(utterance.trim()) && journey.plan && planMatchesDestination) {
          setView('plan'); setAnswer(null);
          present([journey.plan.routes.map((route) => route.summary).join(' '), t.routeChooseOffered, ...journey.plan.unknown].join(' '), journey.plan.unknown,
            { kind: 'plan', result: journey.plan });
          return;
        }
        if (journey.plan && planMatchesDestination) { setView('plan'); setAnswer(null); planResult(journey.plan, false); return; }
        createVoicePlan(destination);
        return;
      case 'route_select':
        if (!planMatchesDestination) { present(t.routePreviousDestination.replace('{place}', journey.plan!.destination.name)); return; }
        if (!journey.plan?.routes.some((route) => route.id === command.params.route_id)) { present(t.commandNoFit); return; }
        setView('plan'); setAnswer(null);
        if (journey.uncertain) { journey.refresh(); return; }
        stops.cancel();
        journey.mutate('select', { route_id: command.params.route_id });
        return;
      case 'route_stop':
      case 'stop_duration':
        if (!planMatchesDestination) { present(t.routePreviousDestination.replace('{place}', journey.plan!.destination.name)); return; }
        setView('plan'); setAnswer(null); guidance.stop();
        if (command.action === 'route_stop') stops.requestStop(command.params.kind, command.params.duration_min);
        else stops.setDuration(command.params.minutes);
        return;
      case 'route_avoid':
        if (!journey.plan) { present(t.routeFirst); return; }
        if (!planMatchesDestination) { present(t.routePreviousDestination.replace('{place}', journey.plan.destination.name)); return; }
        if (journey.uncertain) { journey.refresh(); return; }
        if (command.params.kind === 'walking_over_min') { present(t.commandNoFit); return; }
        setView('plan'); setAnswer(null);
        stops.cancel();
        journey.mutate('constraints', { constraints: [
          ...journey.plan.constraints.filter((item) => item.kind !== command.params.kind),
          { kind: command.params.kind, strength: command.params.strength ?? 'avoid_when_possible' },
        ], detour_tolerance: journey.plan.detour_tolerance });
        return;
    }
  }

  function createVoicePlan(place: Place) {
    if (!session.current) { present(t.placesIntro); return; }
    setView('plan'); setAnswer(null);
    if (journey.uncertain) { journey.refresh(); return; }
    stops.cancel();
    journey.create({ destination: place, ...(session.current.origin ? { origin: session.current.origin } : {}),
      depart_at: new Date().toISOString(), constraints: journey.plan?.constraints ?? [],
      detour_tolerance: journey.plan?.detour_tolerance ?? { min: 5, pct: 25 } });
  }

  function sameDestination(plan: Plan, place: Place) {
    return Math.abs(plan.destination.lat - place.lat) < 0.00001 && Math.abs(plan.destination.lon - place.lon) < 0.00001;
  }

  function presentDirect(text: string) {
    spoken.cancel(); setExpandedAnswer(false); setLastReading(text); setSpokenAnswer(text); lastSpoken.current = text;
    setReadingUnknowns([]); announce(text);
    if (automaticRef.current && !mutePendingSpeech.current && speech.supported) { audioOwner.current = 'answer'; speech.speak(text, language); }
  }
  function sendCommand(text: string) { lastUtterance.current = text; spoken.cancel(); void commands.send(text); }
  function present(text: string, unknowns: string[] = [], narration?: { kind: SpeakKind; result: unknown }) {
    setReadingUnknowns(unknowns);
    setLastReading(text); setSpokenAnswer(''); setExpandedAnswer(false);
    if (savedDevelopment) {
      announce(text);
      if (automaticRef.current && !mutePendingSpeech.current && speech.supported) speech.speak(text, language);
      return;
    }
    void spoken.prepare({ utterance: lastUtterance.current, lang: language, ...(session.current ? { session_id: session.current.id } : {}),
      kind: narration?.kind ?? 'error', result: narration?.result ?? { text }, fallbackText: text });
  }
  async function run(action: () => Promise<void>, status = t.working, unavailable = t.unavailableOffline) {
    if (busyRef.current) return;
    busyRef.current = true; mutePendingSpeech.current = false; setBusy(true); setError(null); spoken.cancel(); speech.stop(); announce(status);
    try { await action(); }
    catch (cause) {
      const message = cause instanceof ApiError && cause.kind === 'unavailable' ? unavailable
        : cause instanceof ApiError && cause.kind === 'expired' ? t.sessionExpired
        : cause instanceof ApiError && cause.kind === 'network' ? t.connectionFailed : t.invalidResponse;
      setError(message); present(message);
    } finally { busyRef.current = false; setBusy(false); }
  }
  function openArea() {
    void run(async () => {
      const next = source === 'saved' ? createSavedSession() : await createConnectedSession(undefined, { getHeading: compass.getHeading }); acceptSession(next);
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
      present(savedDevelopment ? exploreSummary(result, localize, t) : result.text, [], { kind: 'explore', result });
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
      present([result.text, ...result.unknown].join(' '), result.unknown, { kind: 'answer', result });
      if (savedDevelopment) announce(t.answerReady);
    }, t.asking, source === 'saved' ? t.unavailableAnswer : t.connectionFailed);
  }
  function showOverview() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('overview'); setAnswer(null); setError(null); present(overviewText, overview?.unknown, { kind: 'overview', result: overview });
  }
  function showExplore() {
    if (busyRef.current) return;
    if (!step) { explore('start'); return; }
    mutePendingSpeech.current = false; speech.stop(); setView('explore'); setError(null); present(savedDevelopment ? exploreSummary(step, localize, t) : step.text, [], { kind: 'explore', result: step });
  }
  function showPlan() {
    if (busyRef.current) return;
    mutePendingSpeech.current = false; speech.stop(); setView('plan'); setError(null);
    if (journey.uncertain) present(t.planUncertain);
    else if (journey.plan) planResult(journey.plan, false); else announce(t.plan);
  }
  const result = view === 'overview' ? overview : step;
  const displayed = lastReading || (overview ? readingText : t.placesIntro);
  const shortAnswer = spokenAnswer || displayed.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 2).join(' ');
  return <>
    <a className="skip-link" href="#main">{t.skipToMain}</a>
    <header className="app-header">
      <span className="wordmark"><img className="brand-mark" src={miloMark} width="44" height="44" alt="" aria-hidden="true" /><span>{t.appName}</span></span>
    </header>
    <main id="main" tabIndex={-1} className={savedDevelopment ? 'saved-development' : 'single-screen'}>
      <h1>{t.title}</h1>
      {savedDevelopment ? <SpeechControls speech={{ ...speech, stop: stopReading }} text={readingText} language={language} automatic={automatic} pending={busy} onAutomaticChange={setAutomatic} t={t} /> : <>
        <div className="voice-console">
          <div className="talk-dock" ref={talkDock}>
            <TalkButton state={voice.state}
              firstGesturePending={!introduced.current}
              onFirstGesture={() => {
                if (introduced.current) return false;
                introduced.current = true; automaticRef.current = true; setAutomatic(true); mutePendingSpeech.current = false;
                presentDirect(t.voiceWelcome); return true;
              }}
              onBeforeStart={stopReading}
              onGesture={() => { stopReading(); speech.prime(); void compass.requestPermission(); }}
              onStart={() => { commands.cancel(); mutePendingSpeech.current = true; automaticRef.current = true; setAutomatic(true); return voice.start(); }}
              onStop={() => voice.stop(true)} onCancel={voice.cancel}
              labels={{ idle: t.talk, listening: t.finishTalking, transcribing: t.voiceThinking, hint: t.talkHint }} />
            <p className="voice-state">{voice.state === 'listening' ? t.voiceListening : voice.state === 'transcribing' || commands.interpreting || busy || places.busy ? t.voiceThinking : spoken.pending ? t.commandStillWorking : speech.speaking ? t.voiceSpeaking : t.voiceIdle}</p>
            <p className="compass-hint">{t.compassHint}</p>
          </div>
          {(debugControls || voiceFailures >= 2) && <form className="unified-command" onSubmit={(event) => { event.preventDefault(); voice.cancel(); sendCommand(commandText); }}>
            <label htmlFor="unified-command">{t.commandInput}</label>
            <div className="input-row"><input id="unified-command" value={commandText} maxLength={500} autoComplete="off"
              onChange={(event) => setCommandText(event.target.value)} />{debugControls && <button type="submit">{t.commandSend}</button>}</div>
          </form>}
          <section className="latest-answer" aria-labelledby="latest-answer-heading">
            <h2 id="latest-answer-heading" tabIndex={-1}>{t.latestAnswer}</h2>
            {overview && <p className="journey-endpoints">{t.journeyOrigin}: {overview.reference.place}{destination ? ` · ${t.destination}: ${destination.name}` : ''}</p>}
            <p className="latest-answer-text">{expandedAnswer ? displayed : shortAnswer}</p>
            {displayed !== shortAnswer && <button type="button" aria-expanded={expandedAnswer} onClick={() => setExpandedAnswer(!expandedAnswer)}>{expandedAnswer ? t.commandLess : t.details}</button>}
            {debugControls && <div className="button-row compact-speech"><button type="button" disabled={!speech.supported} onClick={() => { mutePendingSpeech.current = false; speech.speak(expandedAnswer ? displayed : lastSpoken.current || shortAnswer, language); }}>{t.compactListen}</button>
              <button type="button" onClick={() => { voice.cancel(); commands.cancel(); guidance.stop(); stopReading(); }}>{t.compactStop}</button></div>}
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
            startOver();
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
