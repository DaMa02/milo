import { useCallback, useEffect, useRef } from 'react';

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
type OrientationApi = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
interface Reading { degrees: number; time: number }

/** Phone-facing direction, requested only from a real Talk release/click. */
export function useCompass({ onDenied }: { onDenied: () => void }) {
  const callback = useRef(onDenied); callback.current = onDenied;
  const samples = useRef<Reading[]>([]);
  const mounted = useRef(false);
  const requested = useRef(false);
  const listening = useRef(false);
  const notified = useRef(false);
  const orientation = useCallback((raw: DeviceOrientationEvent) => {
    const event = raw as CompassEvent;
    const accuracy = event.webkitCompassAccuracy;
    if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 45)) { samples.current = []; return; }
    const heading = event.webkitCompassHeading !== undefined ? event.webkitCompassHeading
      : event.absolute && event.alpha !== null ? (360 - event.alpha) % 360 : undefined;
    // Browsers may emit a relative/null event alongside the absolute stream.
    // It does not replace a recent, valid compass reading.
    if (heading === undefined) return;
    if (!Number.isFinite(heading) || heading < 0 || heading > 360) { samples.current = []; return; }
    const time = Date.now();
    samples.current = [...samples.current.filter((sample) => time - sample.time <= 3000), { degrees: heading % 360, time }].slice(-5);
  }, []);
  const getHeading = useCallback((): number | undefined => {
    const readings = samples.current;
    if (!readings.length || Date.now() - readings[readings.length - 1].time > 3000) return undefined;
    const fresh = readings.filter((sample) => Date.now() - sample.time <= 3000);
    const x = fresh.reduce((sum, sample) => sum + Math.cos(sample.degrees * Math.PI / 180), 0);
    const y = fresh.reduce((sum, sample) => sum + Math.sin(sample.degrees * Math.PI / 180), 0);
    if (Math.hypot(x, y) < 0.01) return undefined;
    const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return Math.round(degrees * 10) / 10 % 360;
  }, []);
  const requestPermission = useCallback(async () => {
    if (requested.current || !mounted.current) return;
    requested.current = true;
    const denied = () => { if (mounted.current && !notified.current) { notified.current = true; callback.current(); } };
    const api = window.DeviceOrientationEvent as OrientationApi | undefined;
    if (!api) { denied(); return; }
    try {
      // The call itself must occur before an await, directly inside the gesture.
      const result = api.requestPermission ? await api.requestPermission() : 'granted';
      if (!mounted.current) return;
      if (result !== 'granted') { denied(); return; }
      window.addEventListener('deviceorientation', orientation);
      window.addEventListener('deviceorientationabsolute', orientation);
      listening.current = true;
    } catch { denied(); }
  }, [orientation]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.visibilityState === 'hidden') samples.current = []; };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false; samples.current = [];
      if (listening.current) {
        window.removeEventListener('deviceorientation', orientation);
        window.removeEventListener('deviceorientationabsolute', orientation);
      }
      listening.current = false;
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [orientation]);
  return { getHeading, requestPermission };
}
