# Arena pilot – release gate

This is preparation only, not deployment authorization. Keep `feat/arena-v1` local until separately approved.

## Current resource boundary

`wrangler.jsonc` targets the integrated `tvattligan-master-test` Worker, with station `DB` (`stationmastertest`, `ca2d4bb8-0c28-47b7-9514-8c893ea47c09`) and `ARENA_DB` (`arena-master-test`, `767b5a12-6b40-4516-9f7c-e072c1130480`). These are local configuration values, not verified remote ownership or migration status. Do not deploy this configuration as the standalone Arena pilot. Preserve the existing station/Tvättligan Worker and database, including protected station D1 `695033b7-6bb2-47a3-a9c3-08d4ca818088`.

A separately approved pilot config must have a distinct Worker name and explicit Arena D1 UUID, `ARENA_ONLY=1`, no station DB bindings, no `ARENA_AUTH_DEV`, no plaintext credentials, SPA fallback with Worker-first `/` and `/api/*`, and a verified `ARENA_MAILER` service. Do not guess the account's workers.dev hostname or DNS records. No cron, custom domain, queue or R2 resource is required for the initial local rehearsal.

## Read-only preflight

```text
node scripts/arena-release-preflight.mjs <approved-strict-json-config> --expected-worker <approved-worker-name> --expected-arena-db <approved-arena-d1-uuid>
```

This script only reads a local strict JSON config and returns a decision. It never runs Wrangler, networking, migrations or deploy. An OK does not verify that remote resources exist, belong to the right account or contain the correct data. Current integrated config intentionally fails this standalone pilot gate. Check nested environment bindings separately; supply the standalone effective config, not a guessed inherited environment.

## Required manual approvals before release

1. Approve exact code HEAD, human review and the known pre-existing CSV export encoding failure disposition.
2. Verify account, unique pilot Worker and D1 UUID/ownership/migration ledger, current pricing/CPU/D1 limits and mailer-provider credentials. Use a fresh disposable pilot D1 unless reuse is independently verified and approved.
3. Export the target D1 privately, verify restore/integrity and frozen report/sales preservation in a disposable environment, and capture previous Worker/config/DNS state. Station backup verifier is not an Arena verifier.
4. Apply only outstanding `migrations-arena/0001`–`0013` in order to that explicitly approved Arena D1. Never apply Arena SQL to `DB`, station migrations to `ARENA_DB`, or replay already applied non-idempotent SQL. No old migrations were edited here.
5. Provision Owner with the offline maintenance tool (`--emit-only`), using stdin for private credentials. Review database identity and SQL privately. Verify recovery mail and store recovery codes offline. No public bootstrap endpoint or shared developer secret.
6. Only after separate authorization: deploy the approved effective pilot config, verify HTTPS, auth/session/PIN, tenant denial, sale/retry/undo, fights/scoring/frozen PDFs and the full Showtime/Discover rehearsal on the real pilot URL. Validate actual cashier/touch hardware.
7. Only after pilot approval: connect arenanplay.se through an active Cloudflare zone/custom domain. Preserve all Loopia mail records; use the account-assigned nameservers, never guessed values. Keep domain rollback documented.

Use the current run-specific `/workspace/work/artifacts/arena-release-readiness/` reports for exact test outcomes, resource inventory, local migration/backup evidence and remaining blockers. Local SQLite/workerd success is not remote D1, edge-cache, email-delivery or physical hardware certification. Existing `npm run deploy`/`db:migrate:remote` wrappers are integrated MASTER commands, not a reviewed standalone Arena release workflow.
