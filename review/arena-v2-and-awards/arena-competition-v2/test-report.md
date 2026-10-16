# Testresultat

- `npm run typecheck`: PASS.
- `npm run build`: PASS. Befintlig varning om stort lazy-laddat Award-preview-chunk kvarstår; inga nya grafikbibliotek eller bildassets.
- `npx vitest run tests/arena*.test.ts`: **297 PASS**, 37 filer.
- `npx playwright test e2e/arena-competition-v2.spec.ts`: **22 PASS** (lokal anpassad readiness-konfiguration riktad mot `/arena`; inga kund-API:er).

Täckt: samtliga nivåer för individ/station, scoped behörigheter, 40-stationsliga med 780 tvåstationsmatcher, gemensam ledger/ångring, frysta resultat och regler, FAIR PLAY-kapning/HALF UP/saknade kunddata, vanlig statistik oförändrad, sena regelstarter, paginering och eget säljarval, avbrott/delad seger utan diplom samt återexport av befintliga vinnardiplom.

Browser: sju/tre kategorier, Station/Battle och refresh, matchslut, vanlig registrering, reduced-motion, timer/slutspurt, topplistor och byggarens FAIR PLAY av/på. Sex huvudviewports testas. UI-data är syntetiska route-fixtures; backend och behörigheter verifieras med verklig SQL i isolerade SQLite-fixtures.

De tre äldre testerna för N-vägsfights behåller historisk lästäckning med explicit grandfathered-data. Nya matcher testas separat som exakt två stationer. Orelaterade historiska tester och CSV-kod har inte ändrats.
