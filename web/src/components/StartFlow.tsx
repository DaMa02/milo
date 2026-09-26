import { useId, useState } from 'react';
import type { Dictionary } from '../i18n';
import type { usePlaces } from '../hooks/usePlaces';
import { placeLabel } from '../api/places';

export function StartFlow({ places, t, compact = false }: { places: ReturnType<typeof usePlaces>; t: Dictionary; compact?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<'origin' | 'destination'>('origin');
  return <section className="start-panel" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{t.placesHeading}</h2>
    <p>{t.placesIntro}</p>
    {!compact && <form onSubmit={(event) => {
      event.preventDefault();
      void (target === 'origin' ? places.setOriginByQuery(query) : places.setDestinationByQuery(query));
    }}>
      <div><label htmlFor={`${id}-target`}>{t.placesTarget}</label>
      <select id={`${id}-target`} value={target} onChange={(event) => setTarget(event.target.value as 'origin' | 'destination')}>
        <option value="origin">{t.placesOrigin}</option><option value="destination">{t.placesDestination}</option>
      </select></div>
      <p><label htmlFor={`${id}-query`}>{t.placesQuery}</label></p>
      <div className="input-row"><input id={`${id}-query`} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        <button type="submit">{t.placesSearch}</button></div>
    </form>}
    <p><button type="button" onClick={() => void places.setOriginHere()}>{t.placesUseLocation}</button></p>
    <p role="status" aria-live="polite">{places.message}</p>
    {places.candidates.length > 0 && <fieldset aria-busy={places.busy}>
      <legend>{t.placesCandidates}</legend>
      {places.candidates.map((candidate, index) => <label className="check-label" key={`${candidate.lat}-${candidate.lon}-${index}`}>
        <input type="radio" name={`${id}-candidate`} checked={places.selectedIndex === index} disabled={places.busy}
          onChange={() => places.setSelectedIndex(index)} />{placeLabel(candidate)}
      </label>)}
      <div className="button-row">
        <button type="button" aria-disabled={places.busy} onClick={() => void places.confirm('yes')}>{t.placesConfirm}</button>
        <button type="button" aria-disabled={places.busy} onClick={() => void places.confirm('no')}>{t.placesNext}</button>
      </div>
    </fieldset>}
    {(places.pending || places.busy) && <p><button type="button" onClick={places.cancel}>{t.placesCancel}</button></p>}
  </section>;
}
