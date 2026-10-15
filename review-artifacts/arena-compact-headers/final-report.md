# Arena V1 – compact desktop leaderboard headers

Start HEAD: `f091bd4d8e448a17d983771301fb72526c526027`.

Endast vänsterkolumnens headers vid 951–1200 px ändrade. Mindre sidpadding/gap, separat flexutrymme för länken och LIVE, inga radbrytningar samt försiktigt anpassade rubrikstorlekar (15 px respektive 14,5 px vid 1024). Inre knapp-padding i aktivitetsrubriken tas bort. LIVE-dot 6 px och LIVE-text 10 px i detta breakpoint.

Vänsterkolumnens bredd ändras inte. Ingen ändring av ringar, centerlayout, Stationspuls, navigation, bakgrund eller affärslogik. 1920-rendering och skyddad geometri verifierade oförändrade.

Ändrade filer: `src/arena-mini-polish.css`, `e2e/arena-compact-headers.spec.ts`.

QA: typecheck, build, 220 Arena unit tests samt 33 Playwright-tests gröna. Alla sex obligatoriska viewportformat samt tre extra kompaktbredder kontrollerade. Sex kuraterade screenshots i `index.html`.

En lokal commit skapas med meddelandet `Arena V1: fix compact desktop leaderboard headers`. Ingen push, deploy, migration, merge eller branchväxling.

Final HEAD: `3b880c25904c67f4b307c62840bc4a53873267ee`. Branch `feat/arena-v1`, clean working tree. Parent är startcheckpointen. Origin tracking-ref oförändrad; ingen push utförd.
