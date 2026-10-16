# Migration review

New file: `migrations-arena/0011_arena_admin_elevation.sql`. No existing migration is edited.

The migration adds station-scoped PIN credentials, hashed admin elevations, atomic attempt buckets, durable period cursors, award completion markers and fair maintenance retry order. It does not alter sales, scoring, Fight rules or existing immutable report rows. Foreign keys and uniqueness constraints bind new state to stations/display sessions/reports. No default PIN or plaintext secret is inserted.

Fresh and 0010-upgrade tests apply the full migration, compare all previous table rows, run `PRAGMA foreign_key_check` and `PRAGMA integrity_check`, and verify old report immutability. All local checks must pass in the final test log.

Local Miniflare D1 migration was applied to disposable local databases only. While developing the still-uncommitted 0011 draft, the final retry-order table was additionally created locally; the fresh/upgrade test always applies the complete final file. No production/shared remote database was contacted and no remote migration was run.

Deployment order for a future separately authorized release: backup and restore rehearsal, approve additive 0011 on MASTER-test, then approved application deployment, then human verification. Old code can ignore the new tables; new code requires 0011 before enabling the station-admin flow. Automatic period finalization still requires a separately reviewed caller/trigger.
