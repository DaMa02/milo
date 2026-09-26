import type { Fact, Meta } from '../api/contracts';
import type { Dictionary } from '../i18n';

function evidenceUrl(value: string) {
  if (/^(node|way|relation)\/\d+$/.test(value)) return `https://www.openstreetmap.org/${value}`;
  if (/^https?:\/\//.test(value)) return value;
  return undefined;
}

export function ResultMeta({ meta, t }: { meta: Meta; t: Dictionary }) {
  return <p className="result-meta">
    <strong>{meta.mode === 'offline' ? t.offlineMode : t.liveMode}</strong>
    {' · '}{t.computedAt} <time dateTime={meta.computed_at}>{new Date(meta.computed_at).toLocaleString('en-GB', { timeZoneName: 'short' })}</time>
  </p>;
}

export function Evidence({ facts, t }: { facts: Fact[]; t: Dictionary }) {
  const labels: Record<string, string> = t;
  function subject(fact: Fact) {
    const named = ['feature', 'place', 'road', 'railway'].map((key) => fact.inputs[key])
      .find((value) => typeof value === 'string');
    if (named) return ` — ${named}`;
    if (typeof fact.inputs.to_node === 'number') return ` — ${t.mappedPoint} node/${fact.inputs.to_node}`;
    return '';
  }
  return <details className="evidence">
    <summary>{t.evidence}</summary>
    <ul className="fact-list">{facts.map((fact, index) => <li key={`${fact.type}-${index}`}>
      <details>
        <summary>{labels[`fact:${fact.type}`] ?? fact.type.replaceAll('_', ' ')}{subject(fact)}: {fact.value === null ? t.unknown : String(fact.value)} {fact.unit === 'count' ? '' : fact.unit} — {t[fact.source]}</summary>
        <p>{t.completeness}: {t[fact.completeness === 'complete' ? 'complete' : 'unknown']}. {t.dataDate}: <time dateTime={fact.data_date}>{fact.data_date}</time>.</p>
        <ul>{fact.evidence.map((source) => <li key={source}>{evidenceUrl(source) ? <a href={evidenceUrl(source)} target="_blank" rel="noopener noreferrer">{source}</a> : source}</li>)}</ul>
        <details><summary>{t.inputs}</summary><pre>{JSON.stringify(fact.inputs, null, 2)}</pre></details>
      </details>
    </li>)}</ul>
  </details>;
}
