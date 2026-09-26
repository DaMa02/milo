import { useEffect, useMemo, useRef, useState } from 'react';
import type { AreaSession } from '../api/session';
import type { Plan, PlanMutation, PlanRequest } from '../api/plan-contracts';
import { createPlanClient } from '../api/plan-client';
import { ApiError } from '../api/http';
import type { Dictionary } from '../i18n';

type Run = (action: () => Promise<void>, status?: string) => Promise<void>;

/** Keep confirmed data separate from drafts and reconcile ambiguous writes. */
export function usePlan(session: AreaSession | null, saved: boolean, run: Run, onResult: (plan: Plan, changed: boolean) => void, t: Dictionary) {
  const client = useMemo(() => session ? createPlanClient(session, saved) : null, [session, saved]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<Plan | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current += 1;
    confirmed.current = null; setPlan(null); setError(null); setPending(null); setUncertain(false);
    return () => { revision.current += 1; };
  }, [client]);

  function perform(operation: () => Promise<Plan>, description: string, reading = false, creating = false) {
    if (!client || (uncertain && !reading)) return;
    const token = revision.current;
    void run(async () => {
      setPending(description); setError(null);
      const old = confirmed.current;
      function accept(next: Plan, allowReset = false) {
        if (token !== revision.current) return;
        if (!allowReset && old && next.plan_version < old.plan_version) throw new ApiError('invalid');
        confirmed.current = next; setPlan(next); setUncertain(false);
        onResult(next, allowReset || !old || next.plan_version > old.plan_version);
      }
      try {
        accept(await operation(), creating);
      } catch (cause) {
        if (token !== revision.current) return;
        const status = cause instanceof ApiError ? cause.status : undefined;
        const rejected = status !== undefined && status >= 400 && status < 500 && status !== 409;
        if (saved || rejected) {
          setError(old ? (saved ? t.planUnavailable : t.planRejected) : t.planNoResult);
        } else if (!reading) {
          // A lost response does not cancel a server mutation. Read authoritative
          // state before enabling another write, including after a stale version.
          try {
            accept(await client.get(), creating);
            if (token === revision.current) setError(t.planRecovered);
          } catch {
            if (token === revision.current) { setUncertain(true); setError(t.planUncertain); }
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
    perform(() => client.mutate(endpoint, request), endpoint === 'stop/candidates' ? t.planSearching : t.planUpdating);
  }
  function refresh() { if (client) perform(() => client.get(), t.planRefreshing, true); }
  return { plan, pending, uncertain, error, create, mutate, refresh };
}
