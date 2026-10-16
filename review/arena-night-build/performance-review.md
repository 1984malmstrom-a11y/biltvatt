# Prestanda och begränsningar

- Station stats p95: 0.42 ms; Battle stats p95: 1.13 ms, 200 lokala Node-mätningar vardera. Efter 30 virtuella minuter: 1.07 ms. Detta är ren demoberäkning, inte DB-latens eller remote D1.
- Browser kall presentation-ready: 1235 ms. Reset→start→paus p95: 375 ms för 20 cykler, inklusive Playwright-resor. Lokal Vite/dev och headless Chromium; inte representativt produktionstrafik eller fysisk kassahårdvara.
- GC-mätt JS-heap: 13279608 → 13868548 bytes, delta 588940 efter 20 resetcykler. Inga page errors/mutationer. Begränsad smoke, ingen långtidsgaranti mot minnesläcka.
- Ordinarie Arena dashboard JS gzip-delta: 363 bytes; CSS gzip-delta 289 bytes. Root index JS totalt gzip-delta 223 bytes. Ny lazy presentations-JS 10032 gzip-bytes.
- Tre komprimerade äkta produktvyer totalt 191034 bytes. Laddas bara i presentationen, inte ordinarie dashboard.
- Stor befintlig lazy award-chunk kvar: 809404 → 809999 gzip-bytes. Den innehåller befintliga inline award-bakgrunder; byggvarningen redovisas och har inte dolts.
- V3 lägger inga bibliotek, bildassets, WebGL, video, blurfilter eller nya kontinuerliga animationer ovanpå befintlig Battle. En lätt synlighetsstyrd demotick per sekund; max 12 automatiska events per scen och 1-sekunds clamp utan catch-up-burst.
