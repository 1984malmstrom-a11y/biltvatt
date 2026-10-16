# Test report

- npm run typecheck: PASS.
- npm run build: PASS (local build only).
- npx vitest run tests/arena*.test.ts: 34 files, 261 passed. Historical non-Arena CSV UTF-8 test excluded, unchanged.
- Final unique Arena Playwright coverage (latest result per case): 244 passed, 2 skipped, 0 failed, 0 flaky.
- Final scope-label / temporary-state follow-up: 66 passed, 0 skipped, 0 failed.
- Coverage: first session/3 seconds, refresh/navigation/replay, blocked storage, delayed/failed bootstrap and statistics, failed application chunk, bounded-wait retry, reduced motion, exact 60/15/5 thresholds, lead/tie/final, points/TB/count/daily series, local second tick, hidden timer/polling pause, sale/undo, heroes, six sizes, temporary quick action.
- Two optional fight-native cases require explicit local-only seeded station/Superadmin credentials and are skipped here. The core native Worker sale/snapshot/undo/admin-image test passed directly on the local Worker. No remote environment was exercised.

The exploratory run found tight temporary/daily card layouts, an obsolete clock selector, an initialization error race and missing API responses in the static test server. Layout/selector/error handling were corrected; unmatched API reads proxy only to the existing local Worker on 127.0.0.1:5192. A native UI upload in the production review proxy was blocked by the correct origin guard; that case passed directly on the native local server, without weakening application security. Final results per case are in test-summary.json; raw main/follow-up/native logs and results are included. Exploratory logs remain outside this curated package.
