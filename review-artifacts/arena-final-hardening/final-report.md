# Arena V1 · Final product hardening

1. **START_HEAD** — 54f6b95e3b314cbf16b4b8db60c0e53fa87e5b06

2. **FINAL_HEAD** — 52a6d87d8024e7b5bd995db0253536130717e50e

3. **Commit** — Arena V1: add gaming awards station admin pin and final performance hardening

4. **Working tree** — clean

5. **Changed files** — 45; full list in changed-files.txt

6. **New migrations** — 0011_arena_admin_elevation.sql only; additive local fresh/upgrade verification; no old migration edited

7. **Awards** — Veckans etta; Månadens etta; Individuell vinnare; Stationsvinnare; Butiksfight-mästare; Ligamästare; Slutspelsmästare; Cupmästare; Personligt mål uppnått; Stationsmål uppnått

8. **PDF validity** — 10 actual one-page A4 PDFs; PyMuPDF + Poppler parse/text/render/margin checks, zero final warnings; vector Arena A, crown, gold frame/seal and ivory print surface

9. **Snapshots** — Immutable child award inherits frozen recipient/results/ownership/time from parent report; deterministic PDF regeneration; explicit winner IDs and goal ownership; no live values read during rendering

10. **Period finalization** — Bounded explicit library function, durable week/month backfill, retry-safe awards and fair goal/campaign/Fight/competition lanes; no Cron activated

11. **Station admin PIN** — 6 digits; keyboard/numpad/touch prompt; initial setup/reset by authorized Owner/Superadmin; integrated legacy login preserved

12. **PIN security** — 600k PBKDF2-SHA256, random salt, atomic 5 attempts/5min station limit, hashed session tokens, station/display/PIN-version binding, audited/no plaintext/default

13. **Session policy** — 20min server idle, 8h absolute; explicit interaction keepalive ≤1/min; return/pagehide revoke and no station logout

14. **Superadmin reset** — Old code cannot be read; current authorization + recent password confirmation; all old elevations revoked; change requires current/new/confirmation

15. **Performance baseline** — 5 alternating-order trials, 4× CPU, five viewports, ten sellers; pooled viewport/state medians: selector 242.0ms, confirmation 303.0ms, next sale 228.5ms

16. **Performance after** — Same protocol/design: selector 230.0ms, confirmation 317.0ms, next sale 222.0ms. Full initial/interactive/center/idle/admin/long-task results in JSON and performance-diff.md

17. **Measured improvements** — Scoped Fight stats: 20→19 SQL statements; normal stays 10. Identical in-flight reads coalesce and abort on mutation/unmount. Reports/awards lazy inside admin routes. Admin reuses verified identity. No presentation feature removed

18. **Regressions** — No visual/functional regression found in completed QA. Latency samples are mixed: slower individual load/confirmation points are disclosed. Uniform latency improvement/zero timing regression is not proven; physical validation remains required

19. **Requests/min** — Normal default ≤6; active Fight home ≤13; Fight detail ≤12; hidden 0 new polls; immediate visible refresh. Same 12s/5s cadence, no slower realtime

20. **D1 changes** — One fewer active-Fight statement; no new ledger aggregate. PIN/maintenance tables are off the ordinary home hot path. Remote rows_read/rows_written unavailable, not invented

21. **Query plans** — 10 stations/5000 receipts: indexed station/time hot access, no unindexed receipt scans. Existing sales indexes retained. New elevation revocation index and primary lookups verified

22. **Bundles** — All lazy-route JS raw/gzip 898543/280023→910394/284438 bytes; CSS 394690→399376 bytes. See route-specific inventory; initial ≈+0.5kB raw, same resources

23. **Assets** — No product/hero/avatar/background/brand asset changed; existing WebP/contain/avatar policy retained. Separate CDP transfer audit; private portraits retain tenant-safe no-store

24. **Memory** — 20 virtual minutes/60 real UI sales per phase; stable documents/listeners after warm-up, fluctuating heap plateau. Accelerated ~30s per phase, not physical 20/30min proof

25. **Tests** — Unit 464 pass / 1 known CSV fail / 0 skip; Arena 258 pass; full browser 319 passed / 0 failed / 2 skipped / 0 flaky; targeted follow-up 13 passed / 0 failed / 0 skipped (includes the two previously skipped seeded native checks); exact commands and skip reasons in test-report.md

26. **Screenshots** — 35 curated PNG: 25 browser screenshots + 10 actual PDF renders; 10 PDF examples; no internal screenshot dump

27. **Artifact path** — /workspace/work/artifacts/arena-final-hardening; index.html gallery and artifacts.json manifest

28. **Manual production blockers** — Human final review; physical 19.5-inch 1920×1080 touch at 100%/125%; real 30min idle/Fight/registration test; real email provider; production Owner/recovery custody; backup restore; separately approved remote migration + MASTER-test deploy

29. **Remaining V1 TODOs** — Known CSV encoding failure; physical/production checks above; optional future monitored maintenance trigger; ambiguous legacy goal snapshots remain readable without invented goal awards

Protected origin/feat/arena-v1 reference: `4529926d6f8edc8e80fc08b2239f8eadcd8036d1`.

**NO PUSH · NO DEPLOY · NO REMOTE MIGRATION · NO MERGE · NO BRANCH SWITCH.**
