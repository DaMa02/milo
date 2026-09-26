import { useEffect, useRef, useState } from 'react';
import type { Dictionary } from '../i18n';
import { ApiError } from '../api/http';
import { placeLabel, reversePlace, searchPlaces, type Place, type PlaceCandidate } from '../api/places';
import { createConnectedSession, type AreaSession } from '../api/session';

interface Options {
  session: AreaSession | null; t: Dictionary;
  onSessionReady: (session: AreaSession) => void;
  onDestinationChanged: (place: Place) => void;
  onMessage: (text: string) => void;
}
type Pending = 'origin' | 'destination' | null;
interface State { pending: Pending; phase: 'idle' | 'searching' | 'confirming' | 'loading'; candidates: PlaceCandidate[]; selectedIndex: number; message: string }
const initial: State = { pending: null, phase: 'idle', candidates: [], selectedIndex: 0, message: '' };
export function usePlaces(options: Options) {
  const [state, setState] = useState<State>({ ...initial, pending: options.session ? null : 'origin' });
  const current = useRef(state);
  const callbacks = useRef(options); callbacks.current = options;
  const session = useRef(options.session);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function update(next: Partial<State>) { current.current = { ...current.current, ...next }; setState(current.current); }
  function invalidate() {
    generation.current += 1; controller.current?.abort(); controller.current = null;
    if (loadingTimer.current) clearTimeout(loadingTimer.current); loadingTimer.current = null;
  }
  function say(message: string) { update({ message }); callbacks.current.onMessage(message); }
  function cancel() { invalidate(); update({ ...initial }); }
  useEffect(() => {
    if (session.current !== options.session) { session.current = options.session; cancel(); }
  }, [options.session]);
  useEffect(() => () => invalidate(), []);
  function begin(pending: Exclude<Pending, null>) {
    invalidate(); controller.current = new AbortController();
    update({ pending, phase: 'searching', candidates: [], selectedIndex: 0 });
    return { token: generation.current, signal: controller.current.signal };
  }
  function valid(token: number) { return generation.current === token; }
  function failure(cause: unknown, token: number) {
    if (!valid(token)) return;
    update({ phase: current.current.candidates.length ? 'confirming' : 'idle' });
    say(cause instanceof ApiError && cause.status === 422 && cause.detail ? cause.detail : callbacks.current.t.placesFailed);
  }
  function propose(candidates: PlaceCandidate[], token: number, message?: string) {
    if (!valid(token)) return;
    update({ candidates, selectedIndex: 0, phase: candidates.length ? 'confirming' : 'idle' });
    say(message ?? (candidates.length ? callbacks.current.t.placesConfirmPrompt.replace('{place}', placeLabel(candidates[0])) : callbacks.current.t.placesNoResults));
  }
  async function query(query: string, target: 'origin' | 'destination') {
    const { token, signal } = begin(target);
    if (!query.trim()) { update({ phase: 'idle' }); say(callbacks.current.t.placesQueryRequired); return; }
    if (target === 'destination' && !session.current?.setDestination) { update({ phase: 'idle' }); say(callbacks.current.t.placesNeedOrigin); return; }
    say(callbacks.current.t.placesSearching);
    const reference = session.current?.overview.reference;
    try { propose(await searchPlaces(query.trim(), signal, reference ? { lat: reference.lat, lon: reference.lon } : undefined), token); }
    catch (cause) { failure(cause, token); }
  }
  function setOriginByQuery(queryText: string) { return query(queryText, 'origin'); }
  function setDestinationByQuery(queryText: string) { return query(queryText, 'destination'); }
  async function setOriginHere({ autoConfirm = false }: { autoConfirm?: boolean } = {}) {
    const { token, signal } = begin('origin');
    if (!navigator.geolocation) { update({ phase: 'idle' }); say(autoConfirm ? callbacks.current.t.placesNeedStartingPoint : callbacks.current.t.placesLocationUnavailable); return; }
    say(callbacks.current.t.placesLocating);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }));
      if (!valid(token)) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
        || !Number.isFinite(accuracy) || accuracy < 0) throw new Error('Invalid location');
      const place = await reversePlace(latitude, longitude, signal);
      if (!valid(token)) return;
      const useDirectly = autoConfirm && accuracy <= 100;
      propose([{ name: place.label, lat: place.lat, lon: place.lon, kind: null, street: place.street, housenumber: place.housenumber, city: place.city, distance_m: 0 }], token,
        useDirectly ? callbacks.current.t.placesUsingLocation.replace('{place}', place.label)
          : callbacks.current.t.placesLocationConfirm.replace('{place}', place.label).replace('{accuracy}', String(Math.round(accuracy))));
      if (useDirectly) await confirm('yes', undefined, true);
    } catch (cause) {
      if (!valid(token)) return;
      if (autoConfirm) {
        update({ phase: 'idle' }); say(callbacks.current.t.placesNeedStartingPoint);
      } else if (cause && typeof cause === 'object' && 'code' in cause) {
        update({ phase: 'idle' });
        say(cause.code === 1 ? callbacks.current.t.placesLocationDenied : callbacks.current.t.placesLocationUnavailable);
      } else failure(cause, token);
    }
  }
  function setSelectedIndex(index: number) {
    if (current.current.phase !== 'confirming' || !Number.isInteger(index) || !current.current.candidates[index]) return;
    update({ selectedIndex: index });
  }
  async function confirm(answer: 'yes' | 'no', index?: number, keepOriginMessage = false) {
    const flow = current.current;
    if (flow.phase !== 'confirming' || !flow.pending) return;
    const selectedIndex = index ?? flow.selectedIndex;
    if (!Number.isInteger(selectedIndex) || !flow.candidates[selectedIndex]) { say(callbacks.current.t.placesChooseCandidate); return; }
    if (answer === 'no') {
      const next = selectedIndex + 1;
      if (next < flow.candidates.length) {
        update({ selectedIndex: next }); say(callbacks.current.t.placesConfirmPrompt.replace('{place}', placeLabel(flow.candidates[next])));
      } else { update({ candidates: [], phase: 'idle', selectedIndex: 0 }); say(callbacks.current.t.placesTryAnother); }
      return;
    }
    const chosen = flow.candidates[selectedIndex];
    const place: Place = { name: chosen.name, lat: chosen.lat, lon: chosen.lon };
    const token = generation.current;
    const signal = controller.current?.signal;
    update({ phase: 'loading', selectedIndex });
    try {
      if (flow.pending === 'origin') {
        if (!keepOriginMessage) say(callbacks.current.t.placesLoading.replace('{place}', place.name));
        loadingTimer.current = setTimeout(() => { if (valid(token)) say(callbacks.current.t.placesFirstLoad); }, 10_000);
        const next = await createConnectedSession(place, { signal, timeoutMs: 120_000 });
        if (!valid(token)) return;
        session.current = next;
        update({ pending: null, candidates: [], phase: 'idle' });
        callbacks.current.onSessionReady(next);
      } else {
        const active = session.current;
        if (!active?.setDestination) throw new Error('No connected session');
        say(callbacks.current.t.placesSavingDestination);
        const destination = await active.setDestination(place, signal);
        if (!valid(token) || active !== session.current) return;
        update({ pending: null, candidates: [], phase: 'idle' });
        callbacks.current.onDestinationChanged(destination);
        say(callbacks.current.t.placesDestinationReady.replace('{place}', destination.name));
      }
    } catch (cause) { failure(cause, token); }
    finally { if (valid(token) && loadingTimer.current) { clearTimeout(loadingTimer.current); loadingTimer.current = null; } }
  }
  return { ...state, busy: state.phase === 'searching' || state.phase === 'loading', setSelectedIndex, setOriginByQuery, setOriginHere, setDestinationByQuery, confirm, cancel };
}
