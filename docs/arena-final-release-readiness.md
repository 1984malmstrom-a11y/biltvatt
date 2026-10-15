# Arena V1 final release readiness

This is a local candidate, not authorization to deploy. Start checkpoint: `54f6b95e3b314cbf16b4b8db60c0e53fa87e5b06`. The final hardening artifact directory contains exact results and measured limitations.

## DONE

- Frozen report archive and ten shared-template Arena Awards, with deterministic vector A4 PDF generation, print-friendly ivory/green/gold layout, recipient/result/metrics/period/source identification.
- Local PyMuPDF and Poppler parse, text, render, page-size and clipping checks for ten actual generated PDFs.
- Separate station-admin elevation with six-digit salted KDF PIN, atomic throttling, idle/absolute limits, station/display binding, change/reset/revocation and audited boundaries; integrated legacy login preserved.
- Explicit bounded/resumable period finalization with retry-safe frozen awards; no Cron activation.
- Active Fight objective shares the indexed summary lookup. Concurrent identical in-flight stats reads coalesce; mutations abort stale reads. Existing optimistic sale, countdown isolation, hidden-tab handling and 12s/5s cadence retained.
- Local migration 0011 fresh/upgrade tests preserve previous rows and immutable snapshots; no old migration edited.
- Local typecheck/build, Arena unit/browser/responsive/security checks and curated review evidence are reported with exact counts. Full npm test's pre-existing CSV UTF-8 failure remains separately disclosed, not fixed or hidden.

## MANUAL REQUIRED

- Human approval of the curated startscreen, PIN, awards and preserved hero/Fight presentation.
- Physical cashier/touch validation: 19.5-inch 1920×1080, 100% and 125% OS/browser scaling, normal and reduced motion, repeated sales, next sale during celebration, active Fight, 30-minute real idle and memory/responsiveness observation. See `arena-old-cashier-test.md`.
- Real email-provider send/verify/recovery rehearsal with authorized recipients. Local outbox/service tests are not real delivery evidence.
- Production Owner bootstrap and offline recovery-code custody/rehearsal; no shared development secret in production.
- Backup export plus restore rehearsal against a disposable environment, including immutable reports/awards and session/PIN data handling.
- Independently approved remote migration and MASTER-test deployment rehearsal, followed by review. Neither has been performed by this pass.

## PRODUCTION CONFIG REQUIRED

- Verified service binding/provider and sender settings for security email; no real email sent here.
- Individually provisioned Owner/Superadmin accounts, secret management, HTTPS/cookie policy and scoped D1 bindings.
- A reviewed maintenance caller and monitoring, if automatic period close is desired. Recommended cadence is documented; triggers remain disabled.
- Database backups, audit retention/monitoring, access controls and an operational PIN reset procedure.
- Verify production static-asset caching and compression at the real hosting edge. Local static-server timing is not a production-network benchmark.

## NOT REQUIRED FOR V1

- Redis, distributed event bus, new rendering/particle library, WebGL, heavy full-screen effects or a replacement competition engine.
- Large sales aggregate tables or unproven indexes at the measured 0–10 station scale.
- Redesign of approved home rings/background/navigation/Station pulse/Fight context or changes to competition rules.

## Known limitations / V1 follow-up

The existing CSV encoding assertion still fails in the full suite. Synthetic CPU throttle and accelerated virtual-time memory testing do not establish performance on a physical cashier or a real 30-minute soak. D1 rows_read/rows_written and production network/cache behavior are unavailable in local SQLite evidence; they must not be inferred from query counts. Existing report snapshots remain authoritative; awards cannot recreate data that was not frozen. Historic non-standard periods/invalid legacy data may need explicit operator review during backfill.
