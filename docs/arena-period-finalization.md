# Arena period finalization

`processEndedArenaPeriods(db, now, budget)` in `worker/arena-period-finalization.ts` is an explicit library entry point. No scheduled handler, Cron trigger, remote deployment or outbound mail has been configured.

The old authenticated report read still lazily archives the previous week/month and bounded recent goals/campaigns/fight results. That compatibility path is unchanged. The new maintenance path can close periods without opening the UI.

## Bounds and resume

- Accepts a real or historical `now`, never a future time; budget is 1–10 week/month units (default 4).
- Initializes at most ten previously uninitialized stations per invocation, beginning with their first registration. Subsequent calls discover additional stations.
- Durable week/month cursors use Stockholm calendar boundaries, advance only after both reports and eligible awards persist, and catch up old periods incrementally. Empty periods advance without invented winners.
- Independent lanes process at most one ended goal, one campaign, one fight, one competition and `budget` outstanding award sources per invocation. Existing competition progression retains its own catch-up limits. Output reports work units, not an exact count of SQL statements.
- Fair persistent attempt order prevents an unresolved sudden death from starving other competitions/fights. Existing match rules decide whether a result can actually close; maintenance never invents a winner.
- Source keys, report insert-or-ignore and immutable snapshot triggers make retries/concurrent invocations safe. Award completion is marked only after all eligible child snapshots are written; partial child generation is retryable. Week/month cursor advancement uses compare-and-swap.
- Failed period/report writes leave the cursor unchanged. The caller must log failure and retry; malformed historical periods exceeding the existing 367-day report limit require operator review, not silent truncation.

## Future operation

After manual release approval, a future independently reviewed scheduled integration could invoke this function every 15 minutes, initially with budget 4. Continue calls while catching up and monitor work counts, exceptions and cursor lag. Use the normal shared Arena D1 binding. This document does not authorize activating a trigger.

At 0–10 stations the state is small; no new sales aggregate tables, per-sale archive jobs or hot-path maintenance are introduced. Maintenance is deliberately outside dashboard polling and registration.

## Snapshot authority

Generic station-winner awards require a frozen winning station result, not an arbitrary station summary. Awards copy only persisted report JSON and its ownership links. Their deterministic ID derives from source report ID, award variant and recipient ID. Rendering never queries live sellers, station names, TB, activities or standings. New goal snapshots record goal kind and seller ID; ambiguous older goal snapshots remain readable but do not invent goal awards. Winner IDs are recorded for new fight/competition snapshots; legacy reports conservatively require a first-ranked named winner. Re-exporting an award produces the same PDF bytes.

The historical source snapshot's frozen time remains visible; creating an award later does not pretend that the period closed later. Audit records identify interactive creation and PDF exports separately.
