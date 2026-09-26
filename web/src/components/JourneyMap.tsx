import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { NavigationFix, NavigationResult, RouteCoordinate } from '../api/navigation';
import type { Dictionary } from '../i18n';

const LiveMap = lazy(() => import('./LiveMap'));

class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface Props {
  origin: { lat: number; lon: number; label?: string };
  destination: { lat: number; lon: number; label?: string } | null;
  position: NavigationFix | null;
  active: boolean;
  status: 'idle' | 'locating' | 'on_route' | 'off_route' | 'arrived' | 'error';
  routeLine: RouteCoordinate[] | null;
  result: NavigationResult | null;
  demo: boolean;
  t: Dictionary;
}

/** The visual map is optional; journey details remain readable if its tiles fail. */
export function JourneyMap({ origin, destination, position, active, status, routeLine, result, demo, t }: Props) {
  const current = routeLine ? result : null;
  const label = status === 'arrived' && current ? t.mapArrived
    : active ? status === 'off_route' ? t.mapOffRoute : status === 'locating' ? t.mapLocating : t.mapLive
      : position ? t.mapPaused : t.mapPreview;
  const fallback = <p className="map-fallback">{t.mapUnavailable}</p>;
  return <section className="journey-map" aria-labelledby="journey-map-heading">
    <div className="map-heading"><h2 id="journey-map-heading">{t.mapTitle}</h2><span className="map-status">{demo ? t.mapDemo : label}</span></div>
    <MapBoundary fallback={fallback}>
      <Suspense fallback={<p className="map-fallback">{t.mapLoading}</p>}>
        <LiveMap origin={origin} destination={destination}
          position={position ? { lat: position.lat, lon: position.lon, accuracy: position.accuracy_m } : null}
          heading={position?.heading_deg ?? null} routeLine={routeLine}
          labels={{ title: t.mapTitle, unavailable: t.mapUnavailable }} />
      </Suspense>
    </MapBoundary>
    <p className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t.mapAttribution}</a></p>
    <div className="map-legend" aria-hidden="true"><span><i className="map-key-origin" />{t.journeyOrigin}</span>{destination && <span><i className="map-key-destination" />{t.destination}</span>}{position && <span><i className="map-key-position" />{t.mapYou}</span>}</div>
    <p className="map-endpoints"><span>{t.journeyOrigin}: {origin.label}</span>{destination && <span>{t.destination}: {destination.label}</span>}</p>
    {current?.next && <p className="map-next"><strong>{current.next.instruction}</strong><span>{t.mapNextDistance.replace('{distance}', String(Math.round(current.next.distance_m)))}</span></p>}
    {current && <dl className="map-progress">
      {current.remaining_m !== null && <div><dt>{t.mapDistanceLeft}</dt><dd>{Math.round(current.remaining_m)} {t.mapMetres}</dd></div>}
      {current.remaining_min !== null && <div><dt>{t.mapTimeLeft}</dt><dd>{t.mapMinutes.replace('{minutes}', String(Math.ceil(current.remaining_min)))}</dd></div>}
    </dl>}
    {!routeLine && <p className="map-route-note">{t.mapRoutePending}</p>}
    {position && <p className="map-position-note">{demo ? t.mapDemoNote : active ? t.mapPositionLive : t.mapPositionPaused}</p>}
  </section>;
}
