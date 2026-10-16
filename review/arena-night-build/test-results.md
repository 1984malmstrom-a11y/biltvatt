# Tester och faktisk täckning

- `npm run typecheck`: PASS.
- `npm run build`: PASS. Befintlig varning för stor lazy award-chunk kvarstår; se bundleunderlag.
- Slutlig fokuserad Vitest-körning: **15 filer, 171 godkända, 8 överhoppade, 0 fel**. Täcker ny engine/API-spärr, auth/tenant-isolering, stationsutmaningar, competition builder, nationella regler/FAIR PLAY, notiser, achievements, Battle/urgency och awards/snapshot/PDF.
- 8 valfria externa PDF-parserkontroller hoppades över av testmiljöns detektion. De räknas inte som godkända. Oberoende direktkontroll med `pdfinfo`, `pdftotext` och PyMuPDF genomfördes för samtliga tre slut-PDF:er, inklusive A4, svensk extraherbar text, syntetisk märkning och långa namn.
- Browsergenrep slutversion: **13/13 PASS**: ordinarie Arena 3, Showtime 7, riktiga isolerade stationsutmaningar 3.
- Discover: **5/5 PASS**, sex kapitel på alla fem prioriterade storlekar, keyboard, award, korrekt återgång och Showtime-handoff.
- Battle V3: **13/13 PASS**, inklusive 1448×1086 utöver de fem prioriterade storlekarna. Oförändrad ringgeometri, neutral/lead, 60/15/5-minuters urgency, kvalificerade kategorier, manuell modepersistens och reduced motion.
- Totalt **31 godkända Playwright-fall** i slutliga relevanta körningar, inte en ny fullständig matris av hela produkten.
- Showcase och ordinarie registrering använder riktiga React-komponenter. Live-genrep använder verklig Worker och två lokala SQLite `:memory:`-databaser med syntetiska fixtures, förmedlade till browsern via testtransport. Ingen fjärrdatabas användes.

## Genrep A–E

A: riktig produktregistrering, topplista/feed, faktisk Ny etta vid övertagande, kvittens/retry och undo; intern/nationell individ/station parallellt.
B: A skickar, B ser/accepterar/avböjer, behörig avbryter; båda Battle-lägen, registrering, manuell växling, historik/frysningsresultat och organisationsspärrar. Samtidighetsbokning och obehöriga parter täcks i integrationstester.
C: hela Showtime offline efter laddning, scen 1–6, paus/resume, manuell Ny etta, Battle, virtuell 10/5/1 minut, vinnare/award, reset/refresh/back/exit. 0 databasändringar under demosessionen, 0 externa mutationer, 0 page errors.
D: alla sex autentiska Discover-kapitel, öppna demoaward, keyboard/close och rätt returvy.
E: tre slutliga PDF:er, deterministic snapshot-export och renderad layout. Långa svenska namn verifieras även i separata interna PDF:er; 0 överlappande faktiska textglypher. Inga signaturer/KPI:er fabriceras i riktiga diplom.

Detaljer finns i verification/, showtime-isolation.json, ordinary-evidence/ och award-validation.json. Inga produktionsflöden, externa notifieringar eller kunddata användes.
