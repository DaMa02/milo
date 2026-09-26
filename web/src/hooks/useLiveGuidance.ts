import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { demoFixes, navigate, stopNavigation, type NavigationFix, type RouteCoordinate } from '../api/navigation';
import { dictionaries, type Dictionary } from '../i18n';

interface Options {
  sessionId: string | null;
  origin?: { lat: number; lon: number };
  getHeading?: () => number | undefined;
  onMessage: (text: string) => void;
  onError: (text: string) => void;
  t?: Dictionary;
  demo?: boolean;
}
type Status = 'idle' | 'locating' | 'on_route' | 'off_route' | 'arrived' | 'error';
interface State { active: boolean; status: Status; routeLine: RouteCoordinate[] | null }
interface ScreenLock { released?: boolean; release: () => Promise<void> }
type WakeNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<ScreenLock> } };

/** Guidance owns its GPS lifetime; speech and all Plan mutations stay with App. */
export function useLiveGuidance(options: Options) {
  const [state, setState] = useState<State>({ active: false, status: 'idle', routeLine: null });
  const latest = useRef(options); latest.current = options;
  const mounted = useRef(false);
  const active = useRef(false);
  const generation = useRef(0);
  const session = useRef<string | null>(null);
  const watcher = useRef<number | null>(null);
  const wake = useRef<ScreenLock | null>(null);
  const waking = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<NavigationFix | null>(null);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const lastSent = useRef(-Infinity);
  const stopping = useRef<Promise<unknown> | null>(null);
  const demo = useRef(false);
  const replay = useRef<NavigationFix[] | null>(null);
  const cursor = useRef(0);
  const words = () => latest.current.t ?? dictionaries.en;
  const valid = (token: number) => mounted.current && active.current && generation.current === token;
  function update(next: Partial<State>) { if (mounted.current) setState((old) => ({ ...old, ...next })); }
  function releaseWake() {
    const lock = wake.current; wake.current = null;
    if (lock) void lock.release().catch(() => {});
  }
  async function acquireWake(token: number) {
    if (!valid(token) || document.visibilityState !== 'visible' || waking.current || (wake.current && !wake.current.released)) return;
    const api = (navigator as WakeNavigator).wakeLock;
    if (!api) return;
    waking.current = true;
    try {
      const lock = await api.request('screen');
      if (!valid(token)) { await lock.release(); return; }
      wake.current = lock;
    } catch {
      if (valid(token)) latest.current.onError(words().navigationKeepScreenOn);
    } finally {
      waking.current = false;
      if (active.current && token !== generation.current) void acquireWake(generation.current);
    }
  }
  function halt(status: Status = 'idle') {
    const previousSession = session.current, wasActive = active.current;
    active.current = false; generation.current += 1;
    if (watcher.current !== null) navigator.geolocation?.clearWatch(watcher.current);
    watcher.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; queued.current = null; replay.current = null;
    request.current?.abort(); request.current = null; inFlight.current = false;
    releaseWake(); update({ active: false, status });
    if (wasActive && previousSession) {
      // A subsequent start waits for this reset, so a late stop cannot erase it.
      stopping.current = stopNavigation(previousSession).catch(() => {});
    }
  }
  function fail(text: string, token: number) {
    if (!valid(token)) return;
    halt('error'); latest.current.onError(text);
  }
  function schedule(token: number) {
    if (!valid(token) || inFlight.current || timer.current) return;
    if (!queued.current && demo.current && replay.current) {
      queued.current = replay.current[cursor.current++] ?? null;
      if (!queued.current) { fail(words().navigationDemoFinished, token); return; }
    }
    if (!queued.current) return;
    const delay = Math.max(0, 1000 - (Date.now() - lastSent.current));
    timer.current = setTimeout(() => { timer.current = null; void send(token); }, delay);
  }
  async function send(token: number) {
    if (!valid(token) || inFlight.current || !queued.current || !session.current) return;
    const fix = queued.current; queued.current = null;
    inFlight.current = true; lastSent.current = Date.now();
    const controller = new AbortController(); request.current = controller;
    try {
      const heading = latest.current.getHeading?.() ?? fix.heading_deg;
      const result = await navigate(session.current, { ...fix, ...(heading === undefined ? {} : { heading_deg: heading }) }, controller.signal);
      if (!valid(token)) return;
      if (result.route_line) {
        update({ routeLine: result.route_line });
        if (demo.current) { replay.current = demoFixes(result.route_line); cursor.current = 0; }
      }
      if (result.text) latest.current.onMessage(result.text);
      if (!valid(token)) return;
      if (result.status === 'arrived') { halt('arrived'); return; }
      if (result.status === 'no_route') {
        halt('error'); if (!result.text) latest.current.onError(words().navigationNoRoute); return;
      }
      update({ status: result.status });
      if (demo.current && !replay.current) { fail(words().navigationDemoNoLine, token); return; }
    } catch (cause) {
      if (!valid(token)) return;
      fail(cause instanceof ApiError && cause.kind === 'expired' ? words().navigationSessionExpired : words().navigationUnavailable, token);
    } finally {
      if (valid(token)) { inFlight.current = false; request.current = null; schedule(token); }
    }
  }
  function receive(fix: NavigationFix, token: number) {
    if (!valid(token)) return;
    if (!Number.isFinite(fix.lat) || Math.abs(fix.lat) > 90 || !Number.isFinite(fix.lon) || Math.abs(fix.lon) > 180) {
      fail(words().navigationLocationUnavailable, token); return;
    }
    queued.current = fix; schedule(token);
  }
  async function start() {
    if (active.current || !mounted.current) return;
    if (!latest.current.sessionId) { latest.current.onError(words().navigationNeedSession); return; }
    const pendingStop = stopping.current;
    active.current = true; session.current = latest.current.sessionId;
    generation.current += 1; const token = generation.current;
    demo.current = latest.current.demo ?? new URLSearchParams(window.location.search).get('demo_walk') === '1';
    replay.current = null; cursor.current = 0; lastSent.current = -Infinity;
    update({ active: true, status: 'locating', routeLine: null });
    // Request synchronously from the Start gesture; acquiring the lock is optional.
    void acquireWake(token);
    if (pendingStop) await pendingStop;
    if (!valid(token)) return;
    if (demo.current) {
      const origin = latest.current.origin;
      if (!origin) { fail(words().navigationDemoNeedsOrigin, token); return; }
      latest.current.onMessage(words().navigationDemoStart);
      receive({ ...origin, accuracy_m: 5 }, token); return;
    }
    if (!navigator.geolocation) { fail(words().navigationLocationUnavailable, token); return; }
    try {
      const watchId = navigator.geolocation.watchPosition((position) => {
        const { latitude: lat, longitude: lon, accuracy, heading } = position.coords;
        receive({ lat, lon,
          ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy_m: accuracy } : {}),
          ...(heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading_deg: heading } : {}),
        }, token);
      }, (error) => fail(error.code === 1 ? words().navigationLocationDenied : words().navigationLocationUnavailable, token),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
      if (valid(token)) watcher.current = watchId;
      else navigator.geolocation.clearWatch(watchId);
    } catch { fail(words().navigationLocationUnavailable, token); }
  }
  function stop() { halt(); }
  useEffect(() => {
    mounted.current = true;
    const visibility = () => { if (active.current) void acquireWake(generation.current); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && active.current) halt(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', escape);
    return () => {
      mounted.current = false; halt();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => { if (session.current && session.current !== options.sessionId) halt(); }, [options.sessionId]);
  return { ...state, start, stop };
}
