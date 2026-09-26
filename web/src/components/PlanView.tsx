import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import initial from '../../../contracts/fixtures/plan.initial-comparison.json';
import type { Overview } from '../api/contracts';
import { findSelectedRoute } from '../api/plan-contracts';
import type { Constraint, ConstraintKind, ConstraintStrength, Plan, PlanMutation, PlanRequest, Route } from '../api/plan-contracts';
import type { Dictionary } from '../i18n';
import { Evidence, ResultMeta } from './Evidence';

interface Props {
  plan: Plan | null;
  busy: boolean;
  pending: string | null;
  uncertain: boolean;
  onCreate: (request: PlanRequest) => void;
  onMutate: <K extends keyof PlanMutation>(endpoint: K, body: PlanMutation[K]) => void;
  onRefresh: () => void;
  onRead: (text: string) => void;
  onStop: () => void;
  speaking: boolean;
  canSpeak: boolean;
  t: Dictionary;
  overview: Overview;
}

const kinds: ConstraintKind[] = ['unsignalled_crossings', 'signals_without_sound', 'steps', 'construction', 'main_roads', 'transfers', 'walking_over_min'];
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const displayClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });
type PlanField = 'origin' | 'destination' | 'departure' | 'walk' | 'duration';

function wallTime(instant: number) {
  const parts = Object.fromEntries(clock.formatToParts(instant).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}
function localTime(iso: string) { return new Date(wallTime(Date.parse(iso))).toISOString().slice(0, 16); }
/** Reject missing/repeated clock times at DST changes instead of silently shifting them. */
function departureISO(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const target = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== local) return null;
  const offsets = new Set([-86400000, 0, 86400000].map((delta) => wallTime(target + delta) - (target + delta)));
  const candidates = [...offsets].map((offset) => target - offset).filter((instant) => wallTime(instant) === target);
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}

export function PlanView({ plan, busy, pending, uncertain, onCreate, onMutate, onRefresh, onRead, onStop, speaking, canSpeak, t, overview }: Props) {
  const id = useId();
  const [origin, setOrigin] = useState(plan?.origin.name ?? initial.origin.name);
  const [destination, setDestination] = useState(plan?.destination.name ?? initial.destination.name);
  const [departure, setDeparture] = useState(localTime(plan?.depart_at ?? initial.depart_at));
  const [duration, setDuration] = useState(String(plan?.stop?.duration_min ?? 15));
  const [walkLimit, setWalkLimit] = useState(String(plan?.constraints.find((item) => item.kind === 'walking_over_min')?.value ?? 20));
  const [strengths, setStrengths] = useState<Record<ConstraintKind, ConstraintStrength | 'off'>>(() => Object.fromEntries(
    kinds.map((kind) => [kind, (plan?.constraints ?? initial.constraints).find((item) => item.kind === kind)?.strength ?? 'off']),
  ) as Record<ConstraintKind, ConstraintStrength | 'off'>);
  const [attempted, setAttempted] = useState<Partial<Record<PlanField, boolean>>>({});
  const blocked = busy || uncertain;
  const selected = plan ? findSelectedRoute(plan) : null;
  const labels: Record<string, string> = t;
  const kindLabel = (kind: ConstraintKind) => labels[`constraint:${kind}`];
  const time = (iso: string) => `${displayClock.format(Date.parse(iso))} ${t.milanTime}`;
  const status = (value: string) => labels[`compliance:${value}`] ?? t.unknown;
  const walkingRequired = strengths.walking_over_min !== 'off';
  const errors: Record<PlanField, string> = {
    origin: !origin.trim() ? t.planMissingPlaces : '',
    destination: !destination.trim() ? t.planMissingPlaces : '',
    departure: !departureISO(departure) ? t.planInvalidTime : '',
    walk: walkingRequired && (!walkLimit.trim() || !Number.isFinite(Number(walkLimit)) || Number(walkLimit) < 0) ? t.planInvalidNumber : '',
    duration: !duration.trim() || !Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 180 ? t.planInvalidStopDuration : '',
  };
  const fieldError = (field: PlanField) => attempted[field] ? errors[field] : '';
  const errorId = (field: PlanField) => `${id}-${field}-error`;
  function validate(fields: PlanField[]) {
    setAttempted((previous) => ({ ...previous, ...Object.fromEntries(fields.filter((field) => errors[field]).map((field) => [field, true])) }));
    return fields.every((field) => !errors[field]);
  }

  function constraints(): Constraint[] {
    return kinds.flatMap((kind): Constraint[] => {
      const strength = strengths[kind];
      if (strength === 'off') return [];
      return kind === 'walking_over_min' ? [{ kind, strength, value: Number(walkLimit) }] : [{ kind, strength }];
    });
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (blocked) return;
    if (!validate(['origin', 'destination', 'departure', 'walk'])) return;
    const depart_at = departureISO(departure);
    const preferences = constraints();
    if (!depart_at) return;
    onCreate({ origin: origin.trim() === initial.origin.name ? { ...initial.origin } : { name: origin.trim() },
      destination: destination.trim() === initial.destination.name ? { ...initial.destination } : { name: destination.trim() },
      depart_at, constraints: preferences, detour_tolerance: plan?.detour_tolerance ?? initial.detour_tolerance });
  }
  function changeDeparture() {
    if (blocked || !validate(['departure'])) return;
    const depart_at = departureISO(departure);
    if (depart_at) onMutate('depart', { depart_at });
  }
  function applyConstraints() {
    if (blocked || !validate(['walk'])) return;
    onMutate('constraints', { constraints: constraints() });
  }
  function setStop(osm_id: string) {
    if (blocked || !validate(['duration'])) return;
    onMutate('stop', { osm_id, duration_min: Number(duration) });
  }
  const stopReading = () => { if (speaking || busy) onStop(); };
  const voice = (text: string) => <div className="button-row">
    <button type="button" disabled={!canSpeak} onClick={() => onRead([uncertain ? t.planUncertain : pending ? t.planPending : '', text].filter(Boolean).join(' '))}>{t.listen}</button>
    <button type="button" aria-disabled={!speaking && !busy} onClick={stopReading}>{t.stopReading}</button>
  </div>;
  const constraintsList = (route: Route) => <ul className="constraint-status">{route.constraint_status.map((item) => <li key={item.kind}>
    {kindLabel(item.kind)}: <strong>{status(item.status)}</strong>
  </li>)}</ul>;
  const timing = (route: Route) => <dl>
    <dt>{t.totalDuration}</dt><dd>{route.duration_min} {t.minutes}</dd>
    <dt>{t.totalWalking}</dt><dd>{route.walk_min} {t.minutes}</dd>
    <dt>{t.routeTransfers}</dt><dd>{route.transfers}</dd>
    <dt>{t.leaveAt}</dt><dd><time dateTime={route.leave_at}>{time(route.leave_at)}</time></dd>
    <dt>{t.arriveAt}</dt><dd><time dateTime={route.arrive_at}>{time(route.arrive_at)}</time></dd>
  </dl>;
  const confirmedConstraints = plan ? plan.constraints.map((item) => `${kindLabel(item.kind)}: ${item.strength === 'require' ? t.require : t.avoidWhenPossible}${item.kind === 'walking_over_min' ? `, ${item.value} ${t.minutes}` : ''}`).join('. ') : '';
  const summary = plan && selected ? [
    `${t.journeyOrigin}: ${plan.origin.name}. ${t.destination}: ${plan.destination.name}.`,
    `${t.confirmedDeparture}: ${time(plan.depart_at)}.`, selected.summary,
    `${t.totalDuration}: ${selected.duration_min} ${t.minutes}. ${t.totalWalking}: ${selected.walk_min} ${t.minutes}.`,
    `${t.leaveAt}: ${time(selected.leave_at)}. ${t.arriveAt}: ${time(selected.arrive_at)}.`,
    plan.stop ? `${t.confirmedStop}: ${plan.stop.place}, ${plan.stop.duration_min} ${t.minutes}. ${t.extraWalking}: ${plan.stop.detour_min} ${t.minutes}. ${t.stopHoursUnknown}` : t.noStopChosen,
    confirmedConstraints,
    ...selected.constraint_status.map((item) => `${kindLabel(item.kind)}: ${status(item.status)}.`),
    ...selected.warnings, ...plan.unknown,
    ...(selected.facts.some((fact) => fact.completeness === 'unknown') ? [t.unknownCoverage] : []),
    overview.reference.text, overview.text,
  ].join(' ') : '';

  return <section className="plan-panel" aria-labelledby="plan-heading">
    <h2 id="plan-heading" tabIndex={-1}>{t.plan}</h2>
    <p className="reference">{t.journeyReference} {overview.reference.text}</p>
    <p className="hint">{t.planDraftHint}</p>
    <form onSubmit={create} noValidate>
      <label htmlFor={`${id}-origin`}>{t.journeyOrigin}</label>
      <input id={`${id}-origin`} value={origin} onChange={(event) => setOrigin(event.target.value)} autoComplete="off" maxLength={120}
        aria-required="true" aria-invalid={Boolean(fieldError('origin'))} aria-describedby={fieldError('origin') ? errorId('origin') : undefined} />
      <label htmlFor={`${id}-destination`}>{t.destination}</label>
      <input id={`${id}-destination`} value={destination} onChange={(event) => setDestination(event.target.value)} autoComplete="off" maxLength={120}
        aria-required="true" aria-invalid={Boolean(fieldError('destination'))} aria-describedby={fieldError('destination') ? errorId('destination') : undefined} />
      <label htmlFor={`${id}-depart`}>{t.departureMilan}</label>
      <input id={`${id}-depart`} type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)}
        aria-required="true" aria-invalid={Boolean(fieldError('departure'))} aria-describedby={`${id}-departure-hint${fieldError('departure') ? ` ${errorId('departure')}` : ''}`} />
      <p id={`${id}-departure-hint`} className="hint">{t.departureHint}</p>
      <p>{t.planDefaultPreference}</p>
      <details><summary>{t.journeyPreferences}</summary>
        <fieldset><legend>{t.draftConstraints}</legend>
          {kinds.map((kind) => <div key={kind}>
            <label htmlFor={`${id}-${kind}`}>{kindLabel(kind)}</label>
            <select id={`${id}-${kind}`} value={strengths[kind]} onChange={(event) => setStrengths((previous) => ({ ...previous, [kind]: event.target.value as ConstraintStrength | 'off' }))}>
              <option value="off">{t.noPreference}</option><option value="avoid_when_possible">{t.avoidWhenPossible}</option><option value="require">{t.require}</option>
            </select>
          </div>)}
          <label htmlFor={`${id}-walk`}>{t.maximumWalking}</label>
          <input id={`${id}-walk`} type="number" min="0" step="any" value={walkLimit} onChange={(event) => setWalkLimit(event.target.value)}
            aria-required={walkingRequired} aria-invalid={Boolean(fieldError('walk'))} aria-describedby={fieldError('walk') ? errorId('walk') : undefined} />
          <p className="hint">{t.requireHint}</p>
          {plan && <button type="button" aria-disabled={blocked} onClick={applyConstraints}>{t.applyConstraints}</button>}
        </fieldset>
      </details>
      <div className="button-row"><button type="submit" aria-disabled={blocked}>{t.compareRoutes}</button>
        {plan && <button type="button" aria-disabled={blocked} onClick={changeDeparture}>{t.updateDeparture}</button>}
      </div>
      <div role="status">{(['origin', 'destination', 'departure', 'walk'] as PlanField[]).map((field) => fieldError(field)
        ? <p id={errorId(field)} key={field}>{fieldError(field)}</p> : null)}</div>
    </form>
    {pending && <p className="notice">{t.planPending}</p>}
    {uncertain && <p className="notice">{t.planUncertain}</p>}
    {(plan || uncertain) && <button type="button" aria-disabled={busy} onClick={() => { if (!busy) onRefresh(); }}>{t.refreshPlan}</button>}

    {plan && <>
      <h3>{t.confirmedPlan}</h3>
      <p>{t.journeyOrigin}: {plan.origin.name}. {t.destination}: {plan.destination.name}.</p>
      <p>{t.confirmedDeparture}: <time dateTime={plan.depart_at}>{time(plan.depart_at)}</time></p>
      <p>{t.confirmedConstraints}: {confirmedConstraints || t.noPreference}</p>
      <p className="plan-text">{plan.text}</p>
      {voice([plan.text, ...plan.unknown].join(' '))}
      {plan.compliant_route_available !== 'yes' && <p className="notice">{plan.compliant_route_available === 'no' ? t.noVerifiedRoute : t.routeComplianceUnknown}</p>}
      {plan.unknown.length > 0 && <div className="warnings"><h4>{t.warnings}</h4><ul>{plan.unknown.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
      {plan.differences.length > 0 && <section aria-labelledby={`${id}-changes`}>
        <h3 id={`${id}-changes`}>{t.planChanges}</h3><ul className="plan-differences">{plan.differences.map((text, index) => <li key={index}>{text}</li>)}</ul>
        {voice(plan.differences.join(' '))}
      </section>}
      {plan.routes.length === 0 && <p>{t.noRoutesAvailable}</p>}
      <div className="route-list">{plan.routes.map((route) => <article key={route.id} className="route-card" aria-labelledby={`${id}-route-${route.id}`}>
        <h3 id={`${id}-route-${route.id}`}>{t.route} {route.id}</h3>
        <p>{route.summary}</p>{timing(route)}{constraintsList(route)}
        {route.facts.some((fact) => fact.completeness === 'unknown') && <p className="notice">{t.unknownCoverage}</p>}
        {selected?.id === route.id && <p><strong>{t.selectedRoute}</strong></p>}
        <button type="button" aria-disabled={blocked || selected?.id === route.id} onClick={() => { if (!blocked && selected?.id !== route.id) onMutate('select', { route_id: route.id }); }}>{t.chooseRoute} {route.id}</button>
        <details><summary>{t.route} {route.id} {t.routeDetails}</summary>
          <p>{t.totalIncludesStop}</p>
          <p>{t.extraComparedShortest}: {route.trade_off.extra_min} {t.minutes}. {t.violatingCrossings}: {route.trade_off.violating_crossings}. {t.unknownCrossings}: {route.trade_off.unknown_crossings}.</p>
          <p className="hint">{t.crossingCountsHint}</p>
          <ol>{route.legs.map((leg, index) => <li key={index}>
            {labels[`leg:${leg.mode}`]}{leg.line ? ` ${leg.line}` : ''}: {leg.from.name} → {leg.to.name}; {leg.duration_min} {t.minutes}{leg.distance_m !== null ? `, ${leg.distance_m} ${t.meters}` : ''}.
            {leg.departure && <p>{t.leaveAt}: <time dateTime={leg.departure}>{time(leg.departure)}</time></p>}
            {leg.arrival && <p>{t.arriveAt}: <time dateTime={leg.arrival}>{time(leg.arrival)}</time></p>}
          </li>)}</ol>
          <ul>{route.warnings.map((text, index) => <li key={index}>{text}</li>)}</ul>
          <details><summary>{t.mappedCrossings}</summary><ul>{route.crossings.map((crossing, index) => <li key={`${crossing.osm_id}-${index}`}>
            {crossing.osm_id}: {t.crossingSignals}: {t[crossing.signals]}; {t.crossingSound}: {t[crossing.sound]}; {t.crossingTactile}: {t[crossing.tactile_paving]}.
          </li>)}</ul></details>
          {voice([route.summary, ...route.warnings, ...plan.unknown].join(' '))}<Evidence facts={route.facts} t={t} />
        </details>
      </article>)}</div>

      <section aria-labelledby={`${id}-stop`}><h3 id={`${id}-stop`}>{t.journeyStop}</h3>
        {!selected && <p>{t.chooseBeforeStop}</p>}
        <button type="button" aria-disabled={blocked || !selected} onClick={() => { if (!blocked && selected) onMutate('stop/candidates', { kind: 'supermarket' }); }}>{t.findSupermarkets}</button>
        <label htmlFor={`${id}-duration`}>{t.stopDuration}</label>
        <input id={`${id}-duration`} type="number" min="1" max="180" step="1" value={duration} onChange={(event) => setDuration(event.target.value)}
          aria-required="true" aria-invalid={Boolean(fieldError('duration'))} aria-describedby={fieldError('duration') ? errorId('duration') : undefined} />
        <p id={errorId('duration')} role="status">{fieldError('duration')}</p>
        {plan.stop ? <>
          <p>{t.confirmedStop}: {plan.stop.place}; {plan.stop.duration_min} {t.minutes}. {t.extraWalking}: {plan.stop.detour_min} {t.minutes}.</p>
          <div className="button-row"><button type="button" aria-disabled={blocked} onClick={() => setStop(plan.stop!.osm_id)}>{t.updateStopDuration}</button>
            <button type="button" aria-disabled={blocked} onClick={() => { if (!blocked) onMutate('stop', { osm_id: null }); }}>{t.removeStop}</button></div>
          <p>{t.stopHoursUnknown}</p>
        </> : <p>{t.noStopChosen}</p>}
        {plan.stop_candidates.length === 0 ? <p>{t.noStopCandidates}</p> : <ul className="stop-candidates">{plan.stop_candidates.map((candidate) => <li key={candidate.osm_id}>
          <p>{candidate.place}: {candidate.detour_min} {t.extraWalkingMinutes}</p>
          <button type="button" aria-disabled={blocked || !selected} onClick={() => { if (selected) setStop(candidate.osm_id); }}>{t.addStop} {candidate.place}</button>
        </li>)}</ul>}
      </section>

      {selected ? <details className="journey-summary"><summary>{t.showJourneySummary}</summary>
        <section aria-labelledby={`${id}-summary`}><h3 id={`${id}-summary`}>{t.chosenJourney}</h3>
          <p className="journey-summary-text">{summary}</p>{voice(summary)}
          <p>{t.summaryEditHint}</p>
        </section>
      </details> : <p>{t.selectForSummary}</p>}
      <ResultMeta meta={plan.meta} t={t} /><Evidence facts={plan.facts} t={t} />
    </>}
  </section>;
}
