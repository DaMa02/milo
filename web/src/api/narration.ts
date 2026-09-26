import type { ExploreStep } from './contracts';
import type { Dictionary } from '../i18n';

/** The full source text remains on demand; this excerpt never creates map facts. */
export function exploreSummary(step: ExploreStep, localize: (text: string) => string, t: Dictionary) {
  const text = localize(step.text);
  // The recorded descriptions start with a complete orientation sentence.
  // Segmenter can attach a following numeric branch list to that sentence.
  const opening = /^[\s\S]*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  const branches = t.branchesSummary.replace('{count}', String(step.branches.length));
  return `${opening} ${branches}${step.at_boundary ? ` ${t.boundaryWarning}` : ''}`;
}
