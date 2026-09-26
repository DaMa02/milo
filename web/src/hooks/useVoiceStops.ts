import { useEffect, useRef, useState } from 'react';
import { stopKinds, type Plan, type PlanMutation, type StopCandidate, type StopKind } from '../api/plan-contracts';
import type { Dictionary } from '../i18n';

interface Options {
  sessionId: string | null;
  plan: Plan | null;
  busy: boolean;
  uncertain: boolean;
  error: string | null;
  t: Dictionary;
  onMutate: <K extends keyof PlanMutation>(endpoint: K, body: PlanMutation[K]) => void;
  onMessage: (text: string, result?: Plan) => void;
}
type Phase = 'idle' | 'searching' | 'choosing' | 'duration' | 'saving';
interface State {
  phase: Phase;
  pending: 'stop' | null;
  candidates: StopCandidate[];
  selectedIndex: number;
  lastAction: 'route_stop' | undefined;
  duration: number | undefined;
  key: string | null;
}
interface Operation {
  token: number;
  sessionId: string;
  key: string;
  kind: 'candidates' | 'stop';
  sawBusy: boolean;
  osmId?: string;
  duration?: number;
}
const empty = (): State => ({ phase: 'idle', pending: null, candidates: [], selectedIndex: 0,
  lastAction: undefined, duration: undefined, key: null });
const validMinutes = (value: number) => Number.isInteger(value) && value >= 1 && value <= 180;
const planKey = (plan: Plan | null) => plan ? JSON.stringify([plan.origin.lat, plan.origin.lon,
  plan.destination.lat, plan.destination.lon, plan.depart_at, plan.plan_version, plan.selected_route_id]) : '';

/** Conversation state only: all writes and recovery still belong to usePlan. */
export function useVoiceStops(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [state, setState] = useState<State>(empty);
  const current = useRef(state);
  const generation = useRef(0);
  const operation = useRef<Operation | null>(null);
  const mounted = useRef(false);
  const previousSession = useRef(options.sessionId);
  function update(value: Partial<State>) {
    current.current = { ...current.current, ...value };
    if (mounted.current) setState(current.current);
  }
  const say = (text: string, result?: Plan) => latest.current.onMessage(text, result);
  function clearLastAction() { update({ lastAction: undefined }); }
  function cancel() {
    generation.current += 1;
    update(empty());
    // Keep the request latch until its result or busy cycle ends. Cancellation
    // cannot abort a usePlan write, and must not allow a second concurrent write.
  }
  function available() {
    const { busy, uncertain, sessionId, plan, t } = latest.current;
    if (busy || operation.current) { say(t.voiceStopWorking); return false; }
    if (uncertain) { say(t.planUncertain); return false; }
    if (!sessionId || !plan?.selected_route_id) { say(t.voiceStopChooseRoute); return false; }
    return true;
  }
  function send<K extends keyof PlanMutation>(endpoint: K, body: PlanMutation[K], kind: Operation['kind'], osmId?: string, duration?: number) {
    const { sessionId, plan } = latest.current;
    if (!sessionId || !plan) return;
    operation.current = { token: generation.current, sessionId, key: planKey(plan), kind, sawBusy: false, osmId, duration };
    try { latest.current.onMutate(endpoint, body); }
    catch { operation.current = null; cancel(); say(latest.current.t.voiceStopFailed); }
  }
  function requestStop(kind: StopKind, durationMin?: number) {
    if (!stopKinds.includes(kind)) { say(latest.current.t.voiceStopInvalidKind); return; }
    if (durationMin !== undefined && !validMinutes(durationMin)) { say(latest.current.t.voiceStopDurationRange); return; }
    if (!available()) return;
    generation.current += 1;
    update({ ...empty(), phase: 'searching', lastAction: 'route_stop', duration: durationMin, key: planKey(latest.current.plan) });
    send('stop/candidates', { kind }, 'candidates');
  }
  function prompt(candidate: StopCandidate) { return latest.current.t.voiceStopConfirm.replace('{place}', candidate.place); }
  function save(candidate: StopCandidate, minutes: number) {
    if (!/^((node|way|relation)\/[0-9]+)$/.test(candidate.osm_id)) { cancel(); say(latest.current.t.voiceStopStale); return; }
    update({ phase: 'saving', pending: null, duration: minutes, lastAction: 'route_stop' });
    send('stop', { osm_id: candidate.osm_id, duration_min: minutes }, 'stop', candidate.osm_id, minutes);
  }
  function currentChoice() {
    if (current.current.key !== planKey(latest.current.plan)) { cancel(); say(latest.current.t.voiceStopStale); return false; }
    return true;
  }
  function confirm(answer: 'yes' | 'no', index?: number) {
    const flow = current.current;
    if ((flow.phase !== 'choosing' && flow.phase !== 'duration') || !available() || !currentChoice()) return;
    const chosen = index ?? flow.selectedIndex;
    if (!Number.isInteger(chosen) || !flow.candidates[chosen]) { say(latest.current.t.voiceStopChooseCandidate); return; }
    if (answer === 'no') {
      if (chosen + 1 >= flow.candidates.length) { cancel(); say(latest.current.t.voiceStopNoneChosen); return; }
      update({ phase: 'choosing', selectedIndex: chosen + 1 }); say(prompt(flow.candidates[chosen + 1])); return;
    }
    if (answer !== 'yes') return;
    update({ selectedIndex: chosen });
    if (flow.duration === undefined) {
      update({ phase: 'duration' }); say(latest.current.t.voiceStopAskDuration.replace('{place}', flow.candidates[chosen].place)); return;
    }
    save(flow.candidates[chosen], flow.duration);
  }
  function setDuration(minutes: number) {
    if (!validMinutes(minutes)) { say(latest.current.t.voiceStopDurationRange); return; }
    if (!available()) return;
    const flow = current.current;
    if (flow.phase === 'choosing' || flow.phase === 'duration') {
      if (!currentChoice()) return;
      update({ duration: minutes });
      if (flow.phase === 'duration') save(flow.candidates[flow.selectedIndex], minutes);
      else say(prompt(flow.candidates[flow.selectedIndex]));
      return;
    }
    const stop = latest.current.plan?.stop;
    if (!stop) { say(latest.current.t.voiceStopChooseCandidate); return; }
    update({ ...empty(), phase: 'saving', lastAction: 'route_stop', duration: minutes, key: planKey(latest.current.plan) });
    send('stop', { osm_id: stop.osm_id, duration_min: minutes }, 'stop', stop.osm_id, minutes);
  }
  /** Call first from usePlan's onResult. True means candidate speech is handled. */
  function acceptResult(plan: Plan, kind: 'plan' | 'candidates'): boolean {
    const sent = operation.current;
    operation.current = null;
    if (!sent) return false;
    if (sent.token !== generation.current || sent.sessionId !== latest.current.sessionId) return kind === 'candidates';
    if (kind === 'candidates' && sent.kind === 'candidates') {
      if (sent.key !== planKey(plan) || sent.key !== planKey(latest.current.plan)) { cancel(); return true; }
      const candidates = plan.stop_candidates.slice(0, 3).map((candidate) => ({ ...candidate }));
      if (!candidates.length) {
        cancel(); say([plan.text, ...plan.unknown, latest.current.t.voiceStopNoCandidates].filter(Boolean).join(' '), plan); return true;
      }
      update({ phase: 'choosing', pending: 'stop', candidates, selectedIndex: 0, key: planKey(plan) });
      // Opening hours and evidence remain the server's text and facts. No extra
      // candidate fields or local opening-hour claims are inferred here.
      say([plan.text, ...plan.unknown, prompt(candidates[0])].filter(Boolean).join(' '), plan);
      return true;
    }
    const applied = sent.kind === 'stop' && plan.stop !== null && plan.stop.osm_id === sent.osmId && plan.stop.duration_min === sent.duration;
    update({ ...empty(), lastAction: applied ? 'route_stop' : undefined });
    return false;
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; operation.current = null; };
  }, []);
  useEffect(() => {
    if (previousSession.current !== options.sessionId) {
      previousSession.current = options.sessionId; operation.current = null; cancel(); return;
    }
    const sent = operation.current;
    if (sent && options.busy) sent.sawBusy = true;
    if (sent && !options.busy && (options.error || sent.sawBusy)) {
      operation.current = null; cancel();
    }
    if (current.current.key && current.current.key !== planKey(options.plan)) cancel();
    if (options.uncertain && current.current.phase !== 'idle') cancel();
  }, [options.sessionId, options.plan, options.busy, options.uncertain, options.error]);
  return { pending: state.pending, phase: state.phase, candidates: state.candidates, selectedIndex: state.selectedIndex,
    lastAction: state.lastAction, requestStop, confirm, setDuration, acceptResult, clearLastAction, cancel };
}
