# Arena green/gold brand V1 — slutrapport

1. **Start HEAD:** `e6dc4a466775abdab808cf5ae57914b23b442707`. Branch `feat/arena-v1`, clean vid start.
2. **Final HEAD:** `f0eb11c39c56d3912c3647a1d2621f6f060bf11a`. Lokal checkpoint med meddelandet `Arena V1: establish independent green gold brand and fight mode` när HEAD skiljer sig från start. Ingen push.
3. **Ändrade filer:** 18 filer. Exakt lista i `changed-files.txt` och nedan. Endast Arena-presentation, produktmotiv och relaterade tester. Inga server-, schema- eller migrationsändringar.
4. **Theme architecture:** `arena-theme.css` är central tokenkälla. Befintliga Arena-stilar använder dessa tokens i stället för hårdkodade blå färger. `arena-brand.css` styr ny komposition/material och separata 16:9-, 4:3- och mobilregler. Legacy-namnet `--arena-blue` är en kompatibilitetsalias till grön energi, inte blå färg. Admin, Superadmin och heroes använder samma familj.
5. **Exakt palette:** bg `#06110D`, bg-soft `#07150F`, surface `#0D2117`, raised `#143426`, gold `#E4C76A`, gold-soft `#D8B95C`, gold-deep `#CFAE52`, energy `#4FC88A`, text `#F4F1E8`, muted `#AAB7AE`, success `#5FD39A`, warning `#E1A34A`, danger `#D46555`. Border/glow härleds från energifärgen med opacity.
6. **Center vs referens:** sju låsta slots; Biltvätt centralt, korv/25 uppe, kaffe/spolarvätska mitt, sallad/30 nere. Green/gold dubbelring, större fokus, krona och fokusmarkering ovanför ringen enligt nya mastern, UI-renderat namn och dynamisk integrerad belöning. Ingen Finast Plus. Satellit/fokus cirka 0,62. Fem nya separata WebP-motiv: tvättmiljö/bil, cola+orange, vit kopp/bulle, svart salladsskål och chokladpar. Korv och dunk behålls. Extra dryck behåller energiburkar under separat fil 08.
7. **Stationspuls:** dagens faktiska poäng, registreringar, aktiva säljare, station och kvarvarande poäng till tillgängligt lagmål. Ingen påhittad mot-igår-procent eller veckotrend. Högerspalten är även fylld utan fight.
8. **Fight mode:** lag, metric, exakta belopp/differens inklusive ett öre TB, leader/tie, balans och matchstatus. Lead change ger kort frame surge; befintliga egna säljkvitton behåller porträtt/bidrag. Faktisk crossing från annan terminal får deduplicerad feedback. Poängberäkning, TB och frysning använder oförändrad engine.
9. **Countdown:** befintlig isolerad sekundtimer från end_at/start_at; 0 negativa tider; befintlig boundary-refresh/finalize. Aktivitetsklustrets markup ändras inte varje sekund. Normal synk 12 s, aktiv fight 5 s, dold flik 0, synlig igen direkt; egen sale optimistisk + serverbekräftelse.
10. **Animerad ram:** en maskad CSS/conic-gradient-perimeter med transform/opacity. Ingen canvas, video, WebGL eller animationsmotor. Deterministiska tvåpositionersbilder och `motion-verification.json`. Reduced-motion stänger av ram, surge och puls.
11. **Slutspurt:** <60 min tydligare guld; <15 min SLUTSPURT; <5 min amber/champagne och något snabbare energi. Text + timer, inte enbart färg. Slutresultat visas fryst; winner/tie följer serverdata.
12. **Normal/fight transition:** 350 ms opacity/transform. Wrapper för klustret flyttas marginellt vänster och skalas till 0,975 i fight. Relativa positioner bevaras. Finalkortet får en kort 4,2-sekunders presentation och återgår sedan till Stationspuls. Popup har befintlig kort livstid.
13. **Responsive:** kontrollerat i 1920×1080, 1536×864, 1448×1086, 1024×768, 390×844, 844×390. Separat 4:3-geometri; mobil får fokus + kompakt aktivitetsgrid och puls/fight-kort samt paneler för topplista/feed. Inget dokumentöverflöde. Extra desktopmellanformat täcks av orbit-tester.
14. **Performance:** parade lokala React/Vite-servrar, orörd kopia av startcommit, Chromium 4× CPU, median av 3 försök/variant/format, identisk femsäljarfixture. Ingen branchväxling. Säljarväljare före→efter: 1920 321→232 ms; 1536 270→233; 1024 245→231; 1448 264→223; 390 217→217; 844 276→206. Nästa val under hero: 573→564; 539→550; 509→573; 592→550; 421→426; 425→455 ms i samma ordning. Största ökning +64 ms i 1024; alla nästa-val-medianer <600 ms. Det är devmätningar, inte garanti på fysisk hårdvara. Rådata, långtasks och första mätning före optimering finns kvar. Stabil callback och ett kompositerat aktivitetslager minskar onödigt render-/paintarbete. Inga nya bibliotek.
15. **1920 touch-QA:** samtliga sju knappar öppnas/stängs, minst 44×44 CSS-pixlar, porträtt avkodade och synliga, text/badge fri från produktcutouts. Visuell granskning av idle, fight, val och heroes. Faktisk 19,5-tums VA/touch/nits kan inte mätas här.
16. **125 %-QA:** 1536×864 kontrolleras som riktig viewport, inklusive normal/fight, säljare, celebration, porträtt och overflow. Det approximerar Windows 125 %; fysisk Windows-rendering återstår.
17. **Test totals:** typecheck PASS; build PASS; Arena unit 143/143 (18 filer); Arena Playwright 153/153. Slutliga capture-sviten dessutom 14/14 och separat backoffice-capture 1/1. Hela npm test 349 PASS, 1 känt CSV UTF-8-fel i tests/api.test.ts:402 av totalt 350. CSV lämnas exakt orörd. Native lokal Worker verifierar sale/undo/idempotency, frysning, uppladdat porträtt, tenantisolering, Owner/Superadmin, audit och PDF-export. Unit omfattar även recovery/security, achievements, TB, mål och PDF-validator/regression. PDF-generatorn är byte-oförändrad mot start.
18. **Artifacts:** `/workspace/work/artifacts/arena-green-brand-v1/`. Galleri `index.html`, manifest `artifacts.json`, filista, referensjämförelse, responsiv rapport, prestanda/rådata, kontrast och motion/protected-files-verifieringar samt screenshots.
19. **Kvarvarande visuella skillnader:** befintliga fyra navigationsingångar behålls jämfört med referensens åtta. Fokusmarkeringen är tydligt roterad, inte exakt krökt. Citatets berg är CSS i stället för foto. Championfotots befintliga kalla kantljus behålls, medan UI är green/gold. Dynamisk data och mobilanpassningar skiljer sig avsiktligt från referensens exempel. Ingen objektiv 85–90 %-pixelpoäng påstås; kategoribedömning finns i reference-comparison.md.

**NO PUSH · NO DEPLOY · NO REMOTE MIGRATION · NO MERGE · NO BRANCH SWITCH.**

## Ändrade filer

- `e2e/arena-green-brand.spec.ts`
- `e2e/arena.spec.ts`
- `public/arena-products/01_arena-biltvatt.webp`
- `public/arena-products/03_arena-tva-for-25.webp`
- `public/arena-products/04_arena-kaffe-bulle.webp`
- `public/arena-products/06_arena-raksallad.webp`
- `public/arena-products/07_arena-tva-for-30.webp`
- `public/arena-products/08_arena-extra-dryck.webp`
- `src/ArenaApp.tsx`
- `src/ArenaFightClock.tsx`
- `src/ArenaFightPresentation.tsx`
- `src/ArenaStatePanel.tsx`
- `src/arena-brand.css`
- `src/arena-product-images.ts`
- `src/arena-showroom.css`
- `src/arena-theme.css`
- `src/arena.css`
- `tests/arena-product-images.test.ts`
