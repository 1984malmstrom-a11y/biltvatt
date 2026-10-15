# Arena mini polish – complete, customer branding removed

START_HEAD: 7e9ea4fdb18bcc2d1ced7dc256d7f54eb6c8826e
FINAL_HEAD: f091bd4d8e448a17d983771301fb72526c526027
Working tree: clean.
Branch: feat/arena-v1.
Commit message: Arena V1: polish leaderboard station pulse and navigation.

The latest locked decision supersedes the exact-logo requirement: Preem/customer branding is removed from the Arena dashboard. Both desktop sidebar and mobile stats slots, generic brand configuration/component, orphaned CSS and the Arena-only WebP are deleted. No new brand asset or replacement quote was added.
The state card now uses the freed desktop height; mobile stats use three equal columns. Arena remains the visible product brand. Shared station assets outside Arena were not changed.

Retained mini polish: a subtle static champagne leaderboard frame, existing top-three hierarchy, calendar-derived Stationspuls goal pace and remaining points, strongest activity only from full seller breakdowns, real recent activity fallback, empty/completed goal states, a gold A emblem, crisp START and other nav labels with no text shadows and five original touch targets.

Changed files: the 12 scoped entries in changed-files.txt, including the deleted Arena logo. No business/competition logic, schema, migrations, stage orbit, SVG focus arc, Dynamic Fight Context or approved champion composition changed. No new timers, API calls, dependencies or brand images.

Verification: typecheck/build PASS. 26 Arena unit files / 220 tests PASS. 74 unique relevant Playwright cases PASS: 7 mini smoke, 36 identity/hero/Visual V2, 26 layout/leaderboard/touch/overflow, 5 Competition Builder smoke. No failures/skips in these selected browser runs. Known CSV UTF-8 issue remains untouched; see test-report.txt.

Responsive screenshots: 1920×1080, 1536×864, 1024×768, 390×844, 844×390. No document overflow, missing-brand placeholder or restored quote. Ring/stage/left-column/state-panel/nav outer geometry remains unchanged; only state-content and mobile stats distribution use freed logo space.
14 current curated PNGs are linked once each in index.html/artifacts.json. Superseded images containing the customer logo are archived outside this review folder. No duplicate gallery frames.

Performance: the 15,774-byte Arena customer image and its decode/request are gone. Added CSS is small and bounded; no new animation framework, timers, remote requests or heavy blur. See performance-report.json.

Remaining review note: the tight existing Senaste aktiviteter/Live heading at 1024×768 is unchanged and outside this focused pass. Human visual approval is separate from the automated checks.

NO PUSH. NO DEPLOY. NO REMOTE MIGRATION. NO MERGE. NO BRANCH SWITCH.
