# Test report

Final local candidate. No deploy, push, remote migration, merge or branch switch.

## Commands

- `npm run typecheck`
- `XDG_CONFIG_HOME=/workspace/work/arena-config WRANGLER_SEND_METRICS=false npm run build`
- `npm test -- --reporter=json --outputFile=/workspace/work/artifacts/arena-final-hardening/unit-results.json`
- `STATION_V2_E2E_PORT=5192 ARENA_FINAL_OWNER_CREDENTIALS=<local fixture path> ARENA_FINAL_D1_STATE=/workspace/work/arena-e2e-state PLAYWRIGHT_JSON_OUTPUT_FILE=<artifact path> node node_modules/playwright/cli.js test 'e2e/arena.*spec.ts' --reporter=line,json`

Typecheck: PASS. Production build: PASS. Build logs may include the environment proxy notice; no compilation error is accepted.

Full npm test: **464 passed, 1 failed, 0 skipped**, across 52 files. Exit code 1 is solely the pre-existing CSV UTF-8 assertion in tests/api.test.ts (“Datum;Tid;Säljare;Tvättprogram;Pris;Status”). That implementation/test remains unchanged.
Arena unit subset within the full run: **258 passed / 0 failed**, 33 files. Includes auth/PIN/Owner/isolation, frozen reports/PDFs, all competition formats, polling/request boundaries, migration upgrades and query plans.

Final full Arena Playwright: **319 passed / 0 failed / 2 skipped / 0 flaky; targeted follow-up 13 passed / 0 failed / 0 skipped (includes the two previously skipped seeded native checks)**. See playwright-results.json and arena-playwright.log for exact test names and outcomes.

The first broad browser run found two native fixture paths still assuming direct station-admin access and an old product-preview grid bug. Native fixtures now explicitly set/unlock PIN; the preview fix is scoped to Admin. Targeted rerun passed all four native paths. The final full run is reported above independently, not hidden behind the earlier rerun.

Additional evidence: all ten generated award PDFs independently pass PyMuPDF/Poppler parse/text/render/A4/margin checks; responsive-report.json covers all six requested QA viewports; performance and memory methodology/limitations are explicit in their separate reports.

Both seeded checks below were subsequently executed successfully with the existing explicit local-only station fixture. The follow-up also reran all eleven new hardening UI checks, including the final A4 print link. Combined coverage is all 321 unique browser tests, no untested skip remains. The main-run and follow-up totals remain separate in their JSON files.

## Main-run skips (resolved in follow-up)

- Butiksfight: native local Worker scores a sale and freezes result before later undo: [{'type': 'skip', 'description': 'Requires explicit local-only seeded station and Superadmin credentials.', 'location': {'file': '/workspace/biltvatt/e2e/arena-fights.spec.ts', 'line': 39, 'column': 8}}]
- Premium: native local Worker supports daily undo and private series without changing total fights: [{'type': 'skip', 'description': 'Requires explicit local-only seeded credentials.', 'location': {'file': '/workspace/biltvatt/e2e/arena-premium-series.spec.ts', 'line': 58, 'column': 69}}]
