import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { messages } from './copy';
import type { Language } from './copy';
import miloMark from './assets/milo-mark.svg';

type ResponseState = {
  kind: 'initial' | 'invalid' | 'unavailable';
  version: number;
};

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [request, setRequest] = useState('');
  const [hasError, setHasError] = useState(false);
  const [response, setResponse] = useState<ResponseState>({ kind: 'initial', version: 0 });
  const requestField = useRef<HTMLTextAreaElement>(null);
  const text = messages[language];
  const responseText = response.kind === 'invalid'
    ? text.emptyRequest
    : response.kind === 'unavailable'
      ? text.unavailableResponse
      : text.initialResponse;

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = text.documentTitle;
  }, [language, text.documentTitle]);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!request.trim()) {
      // Attach the error description before focus returns from the send button.
      flushSync(() => {
        setHasError(true);
        setResponse((previous) => ({ kind: 'invalid', version: previous.version + 1 }));
      });
      requestField.current?.focus();
      return;
    }

    setHasError(false);
    // A new child lets repeated responses create a fresh live-region mutation.
    // The region itself stays mounted, and the user's text and focus stay put.
    setResponse((previous) => ({ kind: 'unavailable', version: previous.version + 1 }));
  }

  function handleRequestKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      (!event.ctrlKey && !event.metaKey) ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <>
      <a className="skip-link" href="#main-content" tabIndex={0}>
        {text.skipLink}
      </a>

      <header className="app-header">
        <div className="wordmark">
          <img className="brand-mark" src={miloMark} alt="" width="48" height="48" />
          <span>Milo</span>
        </div>
        <div className="language-control">
          <label htmlFor="language">{text.language}</label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.currentTarget.value as Language)}
          >
            <option value="en" lang="en">English</option>
            <option value="it" lang="it">Italiano</option>
          </select>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <h1>{text.heading}</h1>
        <p className="introduction">{text.introduction}</p>

        <section className="preview-notice" aria-labelledby="preview-heading">
          <h2 id="preview-heading">{text.previewLabel}</h2>
          <p>{text.previewDescription}</p>
        </section>

        <form className="request-form" onSubmit={submitRequest} noValidate>
          <label className="request-label" htmlFor="request">{text.requestLabel}</label>
          <p className="request-hint" id="request-hint">{text.requestHint}</p>
          <textarea
            ref={requestField}
            id="request"
            name="request"
            required
            rows={4}
            value={request}
            aria-describedby={hasError ? 'request-hint request-error' : 'request-hint'}
            aria-invalid={hasError || undefined}
            onChange={(event) => {
              const nextRequest = event.currentTarget.value;
              setRequest(nextRequest);
              if (nextRequest.trim()) {
                setHasError(false);
                setResponse((previous) => previous.kind === 'invalid'
                  ? { kind: 'initial', version: previous.version + 1 }
                  : previous);
              }
            }}
            onKeyDown={handleRequestKeyDown}
          />
          {hasError && <p className="request-error" id="request-error">{text.emptyRequest}</p>}
          <button className="send-request" type="submit">{text.sendRequest}</button>
        </form>

        <section className="response-section" aria-labelledby="response-heading">
          <h2 id="response-heading">{text.responseHeading}</h2>
          {response.kind === 'initial' && <p>{text.initialResponse}</p>}
          <div id="response" role="status" aria-live="polite" aria-atomic="true">
            {response.kind !== 'initial' && <p key={response.version}>{responseText}</p>}
          </div>
        </section>

        <details className="keyboard-help">
          <summary>{text.keyboardHelp}</summary>
          <ul>
            <li>{text.keyboardMove}</li>
            <li>{text.keyboardSend}</li>
            <li>{text.keyboardReader}</li>
          </ul>
        </details>
      </main>

      <footer className="app-footer">
        <p>{text.privacy}</p>
        <p>{text.mobility}</p>
      </footer>
    </>
  );
}
