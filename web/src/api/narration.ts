import type { ExploreStep } from './contracts';
import type { Dictionary } from '../i18n';

/** The full source text remains on demand; this excerpt never creates map facts. */
export function exploreSummary(step: ExploreStep, localize: (text: string) => string, t: Dictionary) {
  const text = localize(step.text);
  // Keep the complete orientation preamble, including any offset from the
  // session origin. Only the engine's branch list is deferred to the details.
  // Unknown wording stays intact rather than silently losing the reference.
  const branchList = /\b\d+ ways, from left to right:/.exec(text);
  const opening = branchList ? text.slice(0, branchList.index).trim() : text;
  const branches = t.branchesSummary.replace('{count}', String(step.branches.length));
  return `${opening} ${branches}${step.at_boundary ? ` ${t.boundaryWarning}` : ''}`;
}
