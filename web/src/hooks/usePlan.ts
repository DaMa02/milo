import { useEffect, useMemo, useRef, useState } from 'react';
import type { AreaSession } from '../api/session';
import type { Plan, PlanMutation, PlanRequest } from '../api/plan-contracts';
import { createPlanClient, isNoPlanError } from '../api/plan-client';
import { ApiError } from '../api/http';
import type { Dictionary } from '../i18n';

type Run = (action: () => Promise<void>, status?: string) => Promise<void>;
type ResultKind = 'plan' | 'candidates';

/** Keep confirmed data separate from drafts and reconcile ambiguous writes. */
export function usePlan(session: AreaSession | null, saved: boolean, run: Run, onResult: (plan: Plan, changed: boolean, kind: ResultKind) => void, t: Dictionary) {
  const client = useMemo(() => session ? createPlanClient(session, saved) : null, [session, saved]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<Plan | null>(null);
  const revision = useRef(0);
  const resetPending = useRef(false);
  useEffect(() => {
    revision.current += 1;
    resetPending.current = false;
    confirmed.current = null; setPlan(null); setError(null); setPending(null); setUncertain(false);
    return () => { revision.current += 1; };
  }, [client]);

  function perform(operation: () => Promise<Plan>, description: string, reading = false, creating = false, kind: ResultKind = 'plan') {
    if (!client || (uncertain && !reading)) return;
    const token = revision.current;
    void run(async () => {
      setPending(description); setError(null);
      const old = confirmed.current;
      function accept(next: Plan, allowReset = false, reportChanges = true) {
        if (token !== revision.current) return;
        if (!allowReset && old && next.plan_version < old.plan_version) throw new ApiError('invalid');
        resetPending.current = false;
        confirmed.current = next; setPlan(next); setUncertain(false);
        onResult(next, reportChanges && (creating || !old || next.plan_version > old.plan_version), reportChanges ? kind : 'plan');
      }
      function acceptMissing(cause: unknown) {
        if (token !== revision.current || !isNoPlanError(cause)) return false;
        // Only an authoritative GET may establish that no plan was created.
        // Keep form drafts while allowing the user to retry the first request.
        resetPending.current = false;
        confirmed.current = null; setPlan(null); setUncertain(false); setError(t.planNoResult);
        return true;
      }
      try {
        accept(await operation(), creating || (reading && resetPending.current), !reading);
      } catch (cause) {
        if (token !== revision.current) return;
        if (reading && acceptMissing(cause)) return;
        if (cause instanceof ApiError && cause.kind === 'expired') {
          setUncertain(true); setError(t.sessionExpired); return;
        }
        const status = cause instanceof ApiError ? cause.status : undefined;
        const rejected = status !== undefined && status >= 400 && status < 500 && status !== 409;
        if (saved || rejected) {
          setError(old ? (saved ? t.planUnavailable : t.planRejected) : t.planNoResult);
        } else if (!reading) {
          if (creating) resetPending.current = true;
          // A lost response does not cancel a server mutation. Read authoritative
          // state before enabling another write, including after a stale version.
          try {
            // GET confirms state, but its differences may describe an older write.
            accept(await client.get(), creating, false);
            if (token === revision.current) setError(t.planRecovered);
          } catch (recoveryError) {
            if (acceptMissing(recoveryError)) return;
            if (token === revision.current) {
              setUncertain(true);
              setError(recoveryError instanceof ApiError && recoveryError.kind === 'expired' ? t.sessionExpired : t.planUncertain);
            }
          }
        } else { setUncertain(true); setError(t.planUncertain); }
      } finally {
        if (token === revision.current) setPending(null);
      }
    }, description);
  }

  function create(request: PlanRequest) {
    if (client) perform(() => client.create(request), t.planCalculating, false, true);
  }
  function mutate<K extends keyof PlanMutation>(endpoint: K, body: PlanMutation[K]) {
    if (!client || !confirmed.current) return;
    const request = { ...body, if_version: confirmed.current.plan_version };
    const candidates = endpoint === 'stop/candidates';
    perform(() => client.mutate(endpoint, request), candidates ? t.planSearching : t.planUpdating, false, false, candidates ? 'candidates' : 'plan');
  }
  function refresh() { if (client) perform(() => client.get(), t.planRefreshing, true); }
  return { plan, pending, uncertain, error, create, mutate, refresh };
}
