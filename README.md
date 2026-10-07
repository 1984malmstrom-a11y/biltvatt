# Tvättligan

Intern webbapp för Preem Tingsryds biltvättsförsäljning. Välj säljare, tryck på ett tvättprogram och fortsätt sälja. React/TypeScript körs med Vite; ett Cloudflare Worker-API lagrar data i D1. Inga betalda API:er eller externa applikationstjänster behövs. Drift är kompatibel med Workers/D1:s gratisnivå, inom Cloudflares gällande användningskvoter.

## Kör lokalt

Node.js 22.13 eller senare krävs (verifierat med Node 24). Använd den befintliga checkouten; molnuppgifter är redan isolerade och behöver inget extra Git-worktree.

```sh
npm ci
npm run setup
npm run dev
```

`setup` skapar en slumpmässig lokal PIN i den Git-ignorerade `.dev.vars` om filen inte finns, och applicerar D1-migrationerna **lokalt**. Befintlig PIN och lokal databas bevaras vid upprepade körningar. Öppna `.dev.vars` i din lokala editor för att läsa eller ändra din lokala PIN (6–12 siffror). Dela eller committa aldrig denna fil. Klienten får aldrig PIN-värdet. Utvecklingsservern använder normalt port 5173. Den lokala databasen ligger under `.wrangler/state`; den är separat från produktion.

I Codex molnmiljö är hemmakatalogen skrivskyddad. Kör först:

```sh
export npm_config_cache=/workspace/.npm-cache
export XDG_CONFIG_HOME=/workspace/.config
cd /workspace/biltvatt
```

Ingen Cloudflare-inloggning, API-nyckel eller produktionsdatabas behövs lokalt. Vite-pluginen kör den riktiga Worker-koden och D1 lokalt. `GET /api/staff` ska returnera de fem aktiva säljarna; `GET /api/wash-programs` ska returnera de sex programmen.

## Verifiering

```sh
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Enhet-/integrationstesterna kör faktisk migrations-SQL och Worker-anrop mot SQLite (`node:sqlite`). Webbläsartesterna startar Vite och kör Chromium mot lokal Worker/D1. `npm run setup` måste ha körts först. Chromium förväntas finnas på `/usr/bin/chromium`; sätt `CHROMIUM_PATH` till en annan installerad Chromium-binär vid behov. Testerna använder aldrig en fjärrdatabas. Webbläsartesterna registrerar och sedan makulerar testförsäljningar, och lämnar alltså makulerad testhistorik i den lokala databasen. De återställer priser och befintliga mål; kör inte dessa tester mot en produktionsinstans.

Tester täcker serverns prisuppslag, begärande-ID/dubbletter, kvittoskyddad makulering, omsättning, snittköp, Preemium-andel, personalbaserade topplistor och tre-tvättarsgränsen, historiska priser, aktiva poster, sessioner, CSRF, PIN-begränsning, export samt Stockholmstid och DST. Webbläsartester täcker dessutom dubbelklick, förlorat nätverkssvar och säker återförsökning, samtliga adminvyer samt mobil och surfplatta. Skärmbilder sparas i ignorerade `test-results/`.

`e2e/visual.spec.ts` granskar även namnval, försäljning, statistik och Admin/Personal vid 1440×900 samt försäljning och statistik vid 390×844. Testet kontrollerar programordning/priser, 3×2-layouten, synlig registreringsrad på desktop, minst 44-pixels tryckytor, mobilens omflöde och att visade KPI-värden stämmer med API:ets verkliga data. Det sparar skärmbilder som `test-results/visual-*.png` och injicerar inga påhittade statistikvärden.

## Vyer

- **Registrera:** namnval, sex färgkodade touchkort, omedelbar registrering, bekräftelse och ”Ångra senaste”.
- **Statistik:** Idag, Vecka (måndag–söndag), Månad och Valfri period; hela laget eller en säljare, fyra KPI:er, programfördelning, fyra säljartopplistor och dagliga/månatliga lagmål. Automatisk uppdatering var 30:e sekund. Valfri period är begränsad till 367 dagar per anrop.
- **Admin:** Översikt, Personal, Försäljningar, Tvättprogram, Mål, Statistik, Exportera och Inställningar. Lägg till/redigera personal och avatarfärg, aktivera/inaktivera personal/program, arkivera historisk personal, korrigera och makulera/återställa registreringar, ändra priser och sortering, spara mål och exportera CSV. Separata, granskade nollställningar finns under Statistik.

All användartext är svensk. Tider visas i `Europe/Stockholm` och sparas i UTC. Preemium-andel betyder andelen tvättar av programmet **Preemium**, inte alla dyrare program. Snittköp och Preemium-andel kräver minst tre försäljningar i perioden för en plats på topplistan. Lika resultat sorteras deterministiskt på antal och namn. Lagmål räknar alltid aktuellt dygn/månad för hela laget, även vid personliga statistikfilter.

## Arkitektur och databas

| Fil/katalog                               | Ansvar                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `src/App.tsx`                             | Säljflöde, statistik och adminvyer                                       |
| `src/components.tsx`                      | Gemensamma paneler, KPI:er, avatarer, illustrationer och StationLogo     |
| `src/styles.css`                          | Ljust blåvitt, navy text, färgkort, touchmål och responsiv layout        |
| `src/api.ts`, `src/types.ts`              | API-klient, svenska format och gemensamma datatyper                      |
| `worker/index.ts`                         | Worker-routing, D1, validering, sessioner och CSV                        |
| `worker/stats.ts`                         | Statistik, topplistor och Stockholms periodgränser                       |
| `src/AdminMaintenance.tsx`                | Försäljningshistorik, säkerhetsdialoger och nollställningar              |
| `worker/maintenance.ts`, `worker/http.ts` | Admin-underhåll, transaktionsskydd och gemensam validering               |
| `migrations/0001_initial.sql`             | Schema, index och initiala data                                          |
| `migrations/0002_admin_maintenance.sql`   | Additiv migration för arkivering, audit och återställbart underhåll      |
| `wrangler.jsonc`, `vite.config.ts`        | Cloudflare Worker, asset-bundling, D1-binding och lokal Vite-integration |
| `tests/`, `e2e/`                          | API/SQLite-tester och Chromium-tester                                    |

Schema:

- `staff`: id, name, color, active, created_at, deleted_at. Historik bevaras vid inaktivering och arkivering.
- `wash_programs`: id, name, price_sek, sort_order, active, created_at, updated_at.
- `sales`: ursprungliga kolumner samt updated_at, updated_by, void_reason, voided_by, revision och reset_id. Priset kopieras server-side vid registrering. Prisändringar i programkatalogen ändrar inte gamla försäljningar; endast ett uttryckligt programbyte i Admin använder det nya programmets aktuella pris. Ångring behåller raden.
- `sales_audit`: försäljnings-ID, åtgärd, aktör, tidsstämpel samt före-/eftervärden. En SQLite-trigger skriver audit i samma transaktion som ändringen.
- `staff_audit`: motsvarande före-/eftervärden vid ändring, arkivering och fysisk radering av historiklös personal. Raderad identitet har ingen FK här, så audit bevaras.
- `maintenance_previews`, `maintenance_preview_sales`: serverlagrade förhandsgranskningar med exakta registrerings-ID:n och versioner, totalsumma, omfattning, låsta datumgränser och tio minuters giltighet.
- `reset_batches`: ursprungligt antal/belopp, omfattning, period och tid för nollställningar. Återställningar spåras i sales_audit.
- `settings`: key, value, updated_at. `daily_goal` och `monthly_goal` seedas med 25 och 500.
- `admin_sessions`: token_hash, expires_at. Sessionshemligheten lagras endast som SHA-256-hash; sessionslängd 8 timmar.
- `login_attempts`: ip_hash, attempts, window_start. Högst fem PIN-försök per IP under 15 minuter, räknat atomiskt i D1.

Försäljningar indexeras på tidsperiod, säljare och program. Främmande nycklar och CHECK-villkor skyddar dataintegritet. Sessionsutgång har ett eget index. All användardata binds till förberedda SQL-satser.

Seed: Peter, Emma, Johan, Lisa, Kalle, med egna färger. Programordning: Preemium 389 kr, Finast Plus 329 kr, Hösttvätt 259 kr, Finast 219 kr, Fin 179 kr, Borstlös 199 kr.

## API och skydd

Publika API:er enligt det snabba personalflödet:

```text
GET  /api/staff
GET  /api/wash-programs
POST /api/sales                     { staff_id, wash_program_id, request_id }
POST /api/sales/:id/void            { request_id }
GET  /api/stats                     ?period=today|week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
GET  /api/stats/staff/:staffId       samma periodfilter
```

Enbart aktiva poster visas och kan säljas. `request_id` är ett klientgenererat UUID v4: samma ID och data ger tillbaka samma försäljning, ändrade data ger HTTP 409. SQL läser det aktiva D1-priset atomiskt; klientpris avvisas. Samma ID fungerar som privat kvitto för ångring, kontrollerat med hash; kvittot visas inte i statistik eller CSV. Vid obekräftat nätverkssvar återförsöker UI med **samma** ID och låser andra registreringar tills resultatet är bekräftat. UI har även en kort dubbelklicksspärr.

```text
POST  /api/admin/login              { pin }
POST  /api/admin/logout
POST  /api/admin/staff              { name, color }
PATCH /api/admin/staff/:id          { name?, color?, active? }
PATCH /api/admin/wash-programs/:id  { price_sek?, sort_order?, active? }
GET   /api/admin/settings
PUT   /api/admin/settings           { daily_goal?, monthly_goal? }
GET   /api/admin/export             samma periodfilter
```

Admin skyddas av Worker-hemligheten `ADMIN_PIN`. Serverlagrad session använder `HttpOnly`, `SameSite=Lax`, `Path=/api` och `Secure` på HTTPS. Logout ogiltigförklarar sessionen. Muterande anrop avvisar främmande Origin/cross-site-anrop; JSON, fältnamn, storlek, färger, heltal och aktiva data valideras. `?all=1` på personal/program kräver Admin. Personal väljer namn utan egen inloggning, enligt specifikationen; PIN skyddar administration, inte det vanliga sälj- och statistikflödet.

Exporten har UTF-8 BOM, semikolon, CRLF, korrekt citering och skydd mot Excel-formler i personnamn. Makulerade försäljningar inkluderas och märks ”Makulerad”; de räknas aldrig i den vanliga statistiken.

## Säkert Admin-underhåll

Personal visar **Redigera**, **Inaktivera/Aktivera** och **Radera**. Inaktivering bevarar statistik. Radera hämtar alltid en servergranskning och kräver en separat bekräftelse:

- Noll försäljningsrader, även när makulerade poster räknas: fysisk DELETE av just personalraden. Detta är inte återställbart i appen; audit bevaras.
- Någon historik: `deleted_at` sätts och personen inaktiveras. Alla ännu registrerade försäljningar makuleras med `STAFF_DELETED`. Redan makulerade rader behåller sin tidigare orsak. Alla försäljningsrader och FK-relationer bevaras. Personen döljs i normalt namnval, topplistor och statistik och får inte sälja igen.
- Arkiverad personal är identifierbar i Admin. **Återställ säljare** kräver bekräftelse och återställer identiteten som inaktiv, aldrig försäljningar automatiskt. Därefter kan säljaren aktiveras och enskilda registreringar återställas uttryckligen under Försäljningar.

Försäljningar har datum/period, säljare, program och statusfilter, 25 rader per sida och knappen Uppdatera. Makulerade poster finns kvar. Redigera ändrar säljare/program, inte godtyckligt pris. Ett säljarbyte behåller historiskt pris. Programbyte visar det nya programmets aktuella pris; servern kontrollerar priset igen och avvisar med HTTP 409 om det ändrats. Versionskontroll hindrar att samtidiga ändringar skrivs över. Återställ en makulerad registrering innan den korrigeras. Historik visar tid, åtgärd, aktör och före-/eftervärden.

**Radera registrering** innebär makulering med `ADMIN_VOID`, aldrig fysisk DELETE. **Återställ** nollställer makuleringsfälten och återför posten till statistik med sparat pris; arkiverade säljare måste återställas först.

**Admin → Statistik → Nollställ statistik** är separat från ordinarie statistikfilter. Välj laget/en säljare och all historik, idag, denna vecka, denna månad eller valfri period (högst 367 dagar). Förhandsgranskningen visar omfattning, period, antal och belopp från verklig D1-data. För laget + all historik måste `NOLLSTÄLL` skrivas innan knappen aktiveras; även servern kräver denna bekräftelse. Inga affärsdata ändras av förhandsgranskning eller Avbryt.

Bekräftad nollställning makulerar endast granskade, ännu registrerade poster med `ADMIN_RESET`. Servern låser de exakta datumgränserna och registreringsversionerna. Förhandsgranskningen kan användas en gång under tio minuter. Nya, korrigerade, makulerade eller återställda försäljningar i omfattningen gör den inaktuell: HTTP 409 och ingen delvis nollställning. Kontroll och skrivningar körs i samma atomiska D1-batch. Ingen försäljningshistorik raderas fysiskt.

De 50 senaste nollställningarna visas med en separat **Granska återställning**. Bara fortfarande makulerade poster från just den nollställningen, vars säljare inte är arkiverad, kan återställas. En ny förhandsgranskning och bekräftelse krävs. Andra ångrade/makulerade poster påverkas inte. Individuell återställning och audit kan användas även för äldre nollställningar.

Samtliga underhållsendpoints kräver befintlig Admin-session och samma CSRF-/JSON-skydd. Aktör anges som `ADMIN` eller `SELLER`; den delade PIN-inloggningen identifierar inte en viss fysisk administratör. Kvittotoken och sessionshemligheter ingår aldrig i historik eller audit.

```text
GET    /api/admin/sales             ?period=today|week|month|custom|all&start=...&end=...&staff_id=...&wash_program_id=...&status=all|registered|voided&page=1&page_size=25
PATCH  /api/admin/sales/:id         { staff_id?, wash_program_id?, expected_revision, expected_program_price? }
POST   /api/admin/sales/:id/void    { expected_revision, confirmation: "RADERA" }
POST   /api/admin/sales/:id/restore { expected_revision, confirmation: "ÅTERSTÄLL" }
GET    /api/admin/sales/:id/audit
GET    /api/admin/staff/:id/deletion-preview
DELETE /api/admin/staff/:id         { preview_id, confirmation: "RADERA" }
POST   /api/admin/staff/:id/restore { confirmation: "ÅTERSTÄLL" }
POST   /api/admin/stats/reset/preview   { scope: "team"|"staff", staff_id?, period, start?, end? }
POST   /api/admin/stats/reset           { preview_id, confirmation: "NOLLSTÄLL" }
GET    /api/admin/stats/resets
POST   /api/admin/stats/restore/preview { reset_id }
POST   /api/admin/stats/restore         { preview_id, confirmation: "ÅTERSTÄLL" }
```

`0002_admin_maintenance.sql` är framåtgående och bevarar befintliga personal-/försäljningsvärden, FK och historiska priser. Den fyller endast nya metadatafält för äldre försäljningar; ingen försäljning makuleras av migrationen. `0001_initial.sql` är oförändrad. Tester migrerar även en databas med redan befintlig historik och kontrollerar bevarade värden och FK. Underhållstester kör hela UI-flödet och lämnar arkiverad lokal QA-personal, makulerad försäljningshistorik och audit. De får aldrig köras mot produktion.

## Visuella tillgångar

Den bifogade designen styr färger, kort, paneler och hierarki. Bilbilderna är egna SVG-illustrationer och inte fotografier från referensen. `StationLogo` är en avsiktlig återanvändbar platshållare som kan ersättas när godkänt logotypmaterial finns. Ingen företagslogotyp har laddats ned eller återskapats. Statistik kommer från databasen; inga exempelresultat visas som verklig försäljning.

## Befintlig Cloudflare-produktion – nästa godkända steg

Den befintliga D1-databasen är `tvattligan`, ID `695033b7-6bb2-47a3-a9c3-08d4ca818088`, binding `DB`. Skapa inte en ny databas och ändra inte redan applicerade migrationer. Detta underhåll har endast migrerats/testats lokalt; varken fjärrmigration eller deployment har körts.

Från projektroten på din dator, först efter ditt godkännande och kontroll av rätt Cloudflare-konto:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
```

Kontrollera att `0001_initial.sql` redan är applicerad och att endast den nya `0002_admin_maintenance.sql` väntar. Ta en export/backup av den befintliga databasen före schemaändringen:

```sh
npx wrangler d1 export tvattligan --remote --config wrangler.jsonc --output tvattligan-before-admin-maintenance.sql
npx wrangler d1 migrations apply tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; PRAGMA table_info(staff); PRAGMA table_info(sales); PRAGMA foreign_key_check;"
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
```

Håll backupfilen privat och utanför Git. Migrera före deployment: äldre Worker-kod fungerar med de additiva kolumnerna, men ny kod kräver den nya migrationen. När migrationen är verifierad:

```sh
npm run deploy
```

Detta bygger klient/Worker och deployar med Wrangler. Befintlig produktionshemlighet `ADMIN_PIN` ska bevaras, inte ersättas med utvecklings-PIN. Därefter verifierar du HTTPS, registrering/ångring, statistik, Admin-cookie, underhåll och CSV. Prova inte full nollställning eller personalradering på riktiga data som ett smoke test.

Build-utdata är `dist/client` och `dist/tvattligan`. Lokal `.dev.vars` är ignorerad och används enbart för utveckling. Ingen produktionshemlighet ingår i klienten eller Git. Använd `--local --config wrangler.jsonc` för lokala migreringar; ett explicit konfigurationsval undviker omdirigering till äldre byggutdata.
