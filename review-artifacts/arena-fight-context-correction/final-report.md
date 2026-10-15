# Arena Fight-context correction

START_HEAD: `6cee8c96910bbe1c7ea437134700bfb0380445c5`.
Branch: `feat/arena-v1`; started clean.
Commit message: `Arena V1: strengthen fight objectives and multistation context`.

## Qualifying presentation

Single-category activity: champagne perimeter 4 px instead of 2 px, brighter inner edge, concentrated green aura, separate thin outer energy outline and a gold FIGHT badge with dark-green text. Monthly focus uses 5 px perimeter and stronger local aura. Crown, curved focus title, product, reward and their positions remain intact. Non-qualifying ring shadows, opacity and filter are unchanged (browser-tested). Scope membership remains frozen and unchanged; no scoring/Competition Builder changes.

## Portrait objective

At 390×844 the temporary ring is 144 px instead of 64 px, centered above the Fight panel, with readable product/name/reward. A vertical section replaces the tiny side-by-side card. The seven-ring grid stays the same size/position. This state allows 224 px bounded internal vertical scroll, sticky bottom navigation, no horizontal scroll; receipt expands the range to 276 px. Desktop and landscape placement/size are unchanged. See responsive-report.md for the two portrait capture positions and mobile QA.

## Station context

The production Fight ranking/recent/event-feed/lead-popup/network renderers already used correct station context. The old review fixture lacked station_name. New shared test fixture includes two stations and distinct remote IDs. The only production person-context correction is Min Fight/seller contribution: station is now directly below the person name instead of in the dialog eyebrow. Local leaderboard/recent, selector and Min Arena remain without station labels.

See station-context-audit.md for each audited path. No migration is needed.

## Verification

Typecheck/build green. 230 Arena unit tests, 85 distinct Playwright tests passed. Six required viewports, all/focus/single scope, cross-station leaderboard/feed/detail, event feed, lead popup, local no-label contexts, temp sale/undo/end, daily points/TB/count, reduced motion and overflow verified. A targeted final capture reran the event-feed/lead-popup case. Normal geometry and header coordinates exactly match baseline in all six viewports.

Exactly 12 curated PNG screenshots in index.html. Real local React/CSS render with synthetic test data, not mockups. No internal debug/baseline screenshots included. Changed files in changed-files.txt.

## HUMAN REVIEW

Visual sign-off remains for stronger single/focus glow and the portrait objective. Portrait intentionally uses a short internal scroll rather than shrinking the approved activity grid. No unresolved automated test failure. No hardware checkout benchmark was performed.

NO PUSH · NO DEPLOY · NO REMOTE MIGRATION · NO MERGE · NO BRANCH SWITCH.

FINAL_HEAD: `54f6b95e3b314cbf16b4b8db60c0e53fa87e5b06`. En lokal commit med parent exakt START_HEAD. Clean working tree på `feat/arena-v1`. Origin tracking-ref oförändrad.
