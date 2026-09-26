import { useEffect, useState } from 'react';
import { dictionaries, type Language } from './i18n';

export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [announcement, setAnnouncement] = useState('');
  const t = dictionaries[language];
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <>
    <a className="skip-link" href="#main">{t.skipToMain}</a>
    <header className="app-header">
      <span className="wordmark">{t.appName}</span>
      <label>{t.language}<select value={language} onChange={(event) => {
        const next = event.target.value as Language;
        setLanguage(next); setAnnouncement(dictionaries[next].languageChanged);
      }}><option value="en" lang="en">English</option><option value="it" lang="it">Italiano</option></select></label>
    </header>
    <main id="main" tabIndex={-1}>
      <h1>{t.title}</h1>
      <p className="intro">{t.intro}</p>
      <p className="notice">{t.scaffoldStatus}</p>
    </main>
    <footer>{t.preparationNote}</footer>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  </>;
}
