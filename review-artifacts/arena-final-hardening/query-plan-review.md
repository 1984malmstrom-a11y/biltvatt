# Query plans and D1 budget

The reproducible local fixture contains 10 stations and 5,000 sale receipts. Normal stats executes 10 statements before and after. Scoped active Fight executes 20 before and 19 after, both on first and warm reads. The frozen objective ID list is projected through an indexed correlated lookup in the existing Fight-summary query instead of issuing a separate statement. It is not cached across changing Fight versions or temporary activity mappings. Frozen/inactive fights do not fetch objective IDs.

EXPLAIN QUERY PLAN verifies station/time-indexed receipt access for the hot stats/goals/Fight projection queries; no unindexed receipt scan is accepted. B-trees for bounded aggregation/sorting are expected. Existing sales indexes suffice; no speculative receipt/aggregate index is added. The new admin station-revocation index is used by its actual access path; token/credential/attempt lookups use primary indexes (admin-query-plans.json).

The fixture records SQL, plans and local execution timings in query-budget-*.json and query-*.json. They are SQLite results, not a remote D1 latency/row billing benchmark. D1 rows_read / rows_written are unavailable and remain null. Ordinary active Fight refresh retains its pre-existing live-state UPDATE; it was not removed or weakened to improve a benchmark. No new per-sale aggregate table or remote cache is introduced.
