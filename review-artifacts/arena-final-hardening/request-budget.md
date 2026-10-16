# Request budget

Default home, steady-state upper bounds excluding initial requests, retries, sales, visibility events and period boundaries:

| State | Stats cadence | Bootstrap | Approx requests/min |
|---|---|---|---:|
| Normal visible | 12 seconds | once/minute | 6 |
| Active Fight visible | 5 seconds | once/minute | 13 |
| Hidden | no new poll | none | 0 |
| Fight detail visible | 5 seconds | none | 12 |

Scheduling is serialized after the previous request; real counts can be slightly lower with response latency. Returning visible refreshes immediately. A selected non-today filter can require its own stats query in addition to today; this is necessary for correct local goals/context. Identical concurrent reads now share one in-flight promise, while sale/undo/unmount abort and invalidate pre-mutation work. Version checks still reject stale responses. No persistent stale cache is introduced.

A controlled pending-initial-request + visibility-refresh experiment is in request-overlap.json. Development StrictMode includes an intentionally aborted mount request and is reported separately. API mutations retain one idempotent sale POST and one small debounced stats reconciliation, not a full bootstrap/leaderboard/feed reload. Admin's explicit human-activity keepalive is at most once/minute while used; background reads do not extend elevation.
