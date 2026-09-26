import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

interface MapPoint { lat: number; lon: number; label?: string }
export interface LiveMapProps {
  origin: MapPoint | null;
  destination: MapPoint | null;
  position: { lat: number; lon: number; accuracy?: number } | null;
  heading: number | null;
  routeLine: [number, number][] | null;
  labels: { title: string; unavailable: string; attribution?: string };
}

interface MapState {
  map: L.Map;
  origin: L.Marker | null;
  destination: L.Marker | null;
  position: L.Marker | null;
  accuracy: L.Circle | null;
  route: L.Polyline | null;
  routeHalo: L.Polyline | null;
  frame: string | null;
  hasView: boolean;
  refreshView: (() => void) | null;
}

function validPoint<T extends { lat: number; lon: number }>(point: T | null): point is T {
  return Boolean(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180);
}
function validRoute(line: LiveMapProps['routeLine']): [number, number][] | null {
  // Reject the whole geometry rather than joining across a missing/invalid fix.
  return line && line.length > 1 && line.every((point) => Array.isArray(point) && point.length === 2
    && validPoint({ lat: point[0], lon: point[1] })) ? line : null;
}
const coordinate = (point: MapPoint): L.LatLngTuple => [point.lat, point.lon];

function landmark(state: MapState, key: 'origin' | 'destination', point: MapPoint | null) {
  if (!validPoint(point)) { state[key]?.remove(); state[key] = null; return; }
  if (!state[key]) state[key] = L.marker(coordinate(point), {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: `live-map__landmark live-map__${key}`, iconSize: [18, 18], iconAnchor: [9, 9] }),
  }).addTo(state.map);
  else state[key].setLatLng(coordinate(point));
  if (point.label) {
    const label = document.createElement('span'); label.textContent = point.label;
    if (state[key].getTooltip()) state[key].setTooltipContent(label);
    else state[key].bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -12],
      className: 'live-map__point-label', interactive: false });
  } else state[key].unbindTooltip();
}

/** Sighted visual aid only. Spoken guidance and accessible attribution live in App. */
export function LiveMap({ origin, destination, position, heading, routeLine, labels }: LiveMapProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const instance = useRef<MapState | null>(null);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const hasPoint = validPoint(origin) || validPoint(destination) || validPoint(position) || Boolean(validRoute(routeLine));

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let map: L.Map | null = null;
    let tiles: L.TileLayer | null = null;
    let resize: ResizeObserver | null = null;
    let removeResizeFallback: (() => void) | null = null;
    try {
      map = L.map(element, {
        zoomControl: false, attributionControl: false, keyboard: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, touchZoom: false,
        zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
      });
      const state: MapState = { map, origin: null, destination: null, position: null, accuracy: null,
        route: null, routeHalo: null, frame: null, hasView: false, refreshView: null };
      instance.current = state;
      let batchFailed = false;
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, updateWhenIdle: true, keepBuffer: 0,
        // Native browser cache/referrer remain intact; no prefetch or offline cache.
      });
      tiles.on('loading', () => { batchFailed = false; });
      tiles.on('tileerror', () => { batchFailed = true; if (!disposed) setTileFailed(true); });
      tiles.on('load', () => { if (!disposed && !batchFailed) setTileFailed(false); });
      tiles.addTo(map);
      const onResize = () => {
        if (disposed) return;
        state.map.invalidateSize({ animate: false, pan: false });
        state.refreshView?.();
      };
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(onResize); resize.observe(element);
      } else {
        window.addEventListener('resize', onResize);
        removeResizeFallback = () => window.removeEventListener('resize', onResize);
      }
      setFailed(false); setTileFailed(false);
    } catch {
      tiles?.off(); map?.remove(); tiles = null; map = null; instance.current = null; setFailed(true);
    }
    return () => {
      disposed = true; resize?.disconnect(); removeResizeFallback?.();
      tiles?.off(); map?.remove(); instance.current = null;
    };
  }, []);

  useEffect(() => {
    const state = instance.current;
    if (!state) return;
    landmark(state, 'origin', origin);
    landmark(state, 'destination', destination);
    const line = validRoute(routeLine);
    if (line) {
      if (!state.route) {
        state.routeHalo = L.polyline(line, { interactive: false, color: '#fffdf8', weight: 9, opacity: 1 }).addTo(state.map);
        state.route = L.polyline(line, { className: 'live-map__route', interactive: false,
          color: '#172c3c', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(state.map);
      } else {
        state.routeHalo?.setLatLngs(line); state.route.setLatLngs(line);
      }
    } else {
      state.route?.remove(); state.routeHalo?.remove(); state.route = null; state.routeHalo = null;
    }
    if (validPoint(position)) {
      if (!state.position) state.position = L.marker(coordinate(position), {
        interactive: false, keyboard: false, zIndexOffset: 500,
        icon: L.divIcon({ className: 'live-map__position', iconSize: [24, 24], iconAnchor: [12, 12],
          html: '<span class="live-map__heading" hidden></span><span class="live-map__position-dot"></span>' }),
      }).addTo(state.map);
      else state.position.setLatLng(coordinate(position));
      if (typeof position.accuracy === 'number' && Number.isFinite(position.accuracy) && position.accuracy > 0) {
        if (!state.accuracy) state.accuracy = L.circle(coordinate(position), {
          className: 'live-map__accuracy', radius: position.accuracy, interactive: false,
          color: '#235c7c', weight: 1, fillColor: '#235c7c', fillOpacity: 0.12,
        }).addTo(state.map);
        else state.accuracy.setLatLng(coordinate(position)).setRadius(position.accuracy);
        state.accuracy.bringToBack();
      } else { state.accuracy?.remove(); state.accuracy = null; }
    } else { state.position?.remove(); state.accuracy?.remove(); state.position = null; state.accuracy = null; }

    const points: L.LatLngTuple[] = [...(line ?? [])];
    for (const point of [origin, destination, position]) if (validPoint(point)) points.push(coordinate(point));
    const frame = JSON.stringify([line, validPoint(origin) ? coordinate(origin) : null, validPoint(destination) ? coordinate(destination) : null]);
    const fit = () => {
      if (!points.length) return;
      const bounds = L.latLngBounds(points);
      if (bounds.getSouthWest().equals(bounds.getNorthEast())) state.map.setView(points[0], 16, { animate: false });
      else state.map.fitBounds(bounds, { padding: [32, 40], maxZoom: 16, animate: false });
      state.hasView = true;
    };
    state.refreshView = fit;
    if (!points.length) state.hasView = false;
    else if (!state.hasView || state.frame !== frame) fit();
    else if (validPoint(position) && !state.map.getBounds().pad(-0.15).contains(coordinate(position))) {
      state.map.panTo(coordinate(position), { animate: false, noMoveStart: true });
    }
    state.frame = frame;
    // Initial markers mount when setView/fitBounds loads the map above.
    const arrow = state.position?.getElement()?.querySelector<HTMLElement>('.live-map__heading');
    if (arrow) {
      const validHeading = heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360;
      arrow.hidden = !validHeading;
      if (validHeading) arrow.style.transform = `rotate(${heading}deg)`;
    }
  }, [origin, destination, position, heading, routeLine]);

  return <div className="live-map" aria-hidden="true" inert>
    <div ref={canvas} className="live-map__canvas" />
    <span className="live-map__title">{labels.title}</span>
    {(failed || tileFailed || !hasPoint) && <p className="live-map__unavailable">{labels.unavailable}</p>}
  </div>;
}

export default LiveMap;
