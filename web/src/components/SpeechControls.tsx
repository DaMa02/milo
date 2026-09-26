import type { Dictionary } from '../i18n';
import type { useSpeech } from '../hooks/useSpeech';

type Props = {
  speech: ReturnType<typeof useSpeech>;
  text: string;
  language: string;
  automatic: boolean;
  pending?: boolean;
  onAutomaticChange: (enabled: boolean) => void;
  t: Dictionary;
};

export function SpeechControls({ speech, text, language, automatic, pending = false, onAutomaticChange, t }: Props) {
  return <section className="speech-controls" aria-labelledby="speech-heading">
    <h2 id="speech-heading">{t.speechTitle}</h2>
    {speech.supported ? <>
      <div className="button-row">
        <button type="button" disabled={!text} onClick={() => speech.speak(text, language)}>{t.listen}</button>
        <button type="button" aria-disabled={!speech.speaking && !pending} onClick={() => { if (speech.speaking || pending) speech.stop(); }}>{t.stopReading}</button>
        <button type="button" disabled={!speech.canRepeat} onClick={speech.repeat}>{t.repeatReading}</button>
      </div>
      <label className="check-label"><input type="checkbox" checked={automatic} onChange={(event) => {
        speech.stop(); onAutomaticChange(event.target.checked);
      }} />{t.autoRead}</label>
      <p className="hint">{t.speechNote}</p>
    </> : <p>{t.speechUnsupported}</p>}
    {speech.error && <p role="status">{t.speechFailed}</p>}
  </section>;
}
