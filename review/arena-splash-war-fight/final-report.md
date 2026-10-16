# Arena cinematic splash & premium War Fight

1. Start HEAD: `52a6d87d8024e7b5bd995db0253536130717e50e`.
2. Final HEAD: `97da10c7c95a0c5b5fce6aab8e81e52e8be80559`.
3. Local commit: `Arena V1: introduce cinematic splash and premium war fight panel`.
4. Branch `feat/arena-v1`; working tree clean.
5. 24 changed files: changed-files.txt. No schema, migrations, scoring/TB, PIN, awards/PDF, snapshots, station-pulse or dashboard-layout changes. Preem branding was not reintroduced.
6. Splash: full-screen green/champagne stadium with one locally compressed 71KiB WebP. All emblem, wordmark, slogan, banners, loading bar and recovery UI remain HTML/SVG/CSS.
7. Locked A: existing src/ArenaBrand.tsx → ArenaEmblem, unchanged two-path SVG, viewBox 0 0 44 44. The base symbol and masked sweep both reuse it. No new A interpretation or fictional station logo.
8. Entry: app starts loading underneath immediately. 3000ms intro then 240ms fade when ready. The progress bar does not claim completion before readiness; after 3s unresolved loading says ANSLUTER TILL ARENAN. Startup errors offer retry; a 15s stalled connection offers bounded-wait recovery.
9. Session: sessionStorage arena:intro-seen:v1, marked at first presentation. Refresh/internal navigation skip it. Explicit replay: ?showcase=1&intro=1 (or intro=1 in development). Blocked storage falls back to document memory; a full reload may replay because persistent session storage is unavailable. Reduced motion exits immediately when ready and is static while waiting.
10. Performance: app readiness measured separately from intro presentation; see performance-review.md and raw JSON. No per-frame JS, no heavy animation system. Local isolated second tick; unchanged 12s/5s polling. Dedicated test observes zero timer-driven stage mutations.
11. Fight: crossed swords, gold battle header, correct LIVE/SNART/FINAL, neutral typographic station emblems, names, scoreboard, VS, metric, balance, lead/difference, countdown and authoritative qualifying scope. Host geometry is unchanged; Fight Center retains the legacy widget.
12. Normal/lead/tie: gold/green energy and lead surface, neutral tie. Existing version/dedupe feedback retained. Scope labels include only the current objective and active temporary activities, never hardcoded mock categories.
13. <=60m: red edge/halo and low-intensity 4s opacity pulse, including exactly 60 minutes.
14. <=15m: SLUTSPURT and warm countdown; <=5m: SISTA MINUTERNA, stronger red/champagne frame and 2.8s pulse. No flash/strobe; reduced motion removes animation.
15. HH:MM:SS, with total hours for multi-day intervals; never negative. At zero urgency stops, final result awaits the server. Frozen winner IDs decide winner/tie; no client-invented winner or false active timer/LIVE after final confirmation.
16. Touch/responsive: 1920x1080, 1536x864, 1448x1086, 1024x768, 390x844, 844x390. Six-size overflow and ring-geometry checks pass. Existing touch targets, next-sale/undo and heroes are covered.
17. Tests: 261 unit passed; main browser 244 passed/2 skipped/0 failed; final scope follow-up 66 passed/0 failed. Typecheck/build pass.
18. Artifacts: /workspace/work/artifacts/arena-splash-war-fight/ — exactly 21 selected PNGs, index.html gallery, reports and relevant verification logs. Before/after are real same-size panel crops.
19. Human review remains: cinematic atmosphere/intensity on the actual 19.5-inch FHD touch display and responsiveness on physical older till hardware. Chromium 4x CPU measurements are evidence, not hardware certification. Use explicit replay for repeated internal demos.

NO PUSH. NO DEPLOY. NO REMOTE MIGRATION. NO MERGE. NO BRANCH SWITCH.
