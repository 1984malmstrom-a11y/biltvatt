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

## Vyer

- **Registrera:** namnval, sex färgkodade touchkort, omedelbar registrering, bekräftelse och ”Ångra senaste”.
- **Statistik:** Idag, Vecka (måndag–söndag), Månad och Valfri period; hela laget eller en säljare, fyra KPI:er, programfördelning, fyra säljartopplistor och dagliga/månatliga lagmål. Automatisk uppdatering var 30:e sekund. Valfri period är begränsad till 367 dagar per anrop.
- **Admin:** Översikt, Personal, Tvättprogram, Mål, Statistik, Exportera och Inställningar. Lägg till/ändra personal och avatarfärg, aktivera/inaktivera personal/program, ändra priser och sortering, spara mål och exportera CSV.

All användartext är svensk. Tider visas i `Europe/Stockholm` och sparas i UTC. Preemium-andel betyder andelen tvättar av programmet **Preemium**, inte alla dyrare program. Snittköp och Preemium-andel kräver minst tre försäljningar i perioden för en plats på topplistan. Lika resultat sorteras deterministiskt på antal och namn. Lagmål räknar alltid aktuellt dygn/månad för hela laget, även vid personliga statistikfilter.

## Arkitektur och databas

| Fil/katalog                        | Ansvar                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `src/App.tsx`                      | Säljflöde, statistik och adminvyer                                       |
| `src/components.tsx`               | Gemensamma paneler, KPI:er, avatarer, illustrationer och StationLogo     |
| `src/styles.css`                   | Ljust blåvitt, navy text, färgkort, touchmål och responsiv layout        |
| `src/api.ts`, `src/types.ts`       | API-klient, svenska format och gemensamma datatyper                      |
| `worker/index.ts`                  | Worker-routing, D1, validering, sessioner och CSV                        |
| `worker/stats.ts`                  | Statistik, topplistor och Stockholms periodgränser                       |
| `migrations/0001_initial.sql`      | Schema, index och initiala data                                          |
| `wrangler.jsonc`, `vite.config.ts` | Cloudflare Worker, asset-bundling, D1-binding och lokal Vite-integration |
| `tests/`, `e2e/`                   | API/SQLite-tester och Chromium-tester                                    |

Schema:

- `staff`: id, name, color, active, created_at. Historik bevaras vid inaktivering.
- `wash_programs`: id, name, price_sek, sort_order, active, created_at, updated_at.
- `sales`: id, staff_id, wash_program_id, price_sek, sold_at, voided_at, created_at, request_id (UNIQUE), undo_token_hash. Priset kopieras server-side vid registrering; inga uppdateringar ändrar gamla priser. Ångring behåller raden.
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

## Visuella tillgångar

Den bifogade designen styr färger, kort, paneler och hierarki. Bilbilderna är egna SVG-illustrationer och inte fotografier från referensen. `StationLogo` är en avsiktlig återanvändbar platshållare som kan ersättas när godkänt logotypmaterial finns. Ingen företagslogotyp har laddats ned eller återskapats. Statistik kommer från databasen; inga exempelresultat visas som verklig försäljning.

## Cloudflare-deployment – förberett, inte utfört

Inga produktionsresurser har skapats. `database_id` i `wrangler.jsonc` är en **lokal platshållare**. Gör följande först när deployment har godkänts:

1. Logga in på rätt Cloudflare-konto med `npx wrangler login`.
2. Skapa en ny D1-databas med `npx wrangler d1 create tvattligan`. Använd ett annat namn om namnet redan tillhör en orelaterad resurs. Byt `database_id` (och vid behov `database_name` samt scriptens databasnamn) i `wrangler.jsonc` till den skapade databasens riktiga värden.
3. Applicera migrationerna med `npm run db:migrate:remote`.
4. Ange en egen 6–12-siffrig produktions-PIN säkert med `npx wrangler secret put ADMIN_PIN`. Återanvänd inte utvecklings-PIN. PIN är inte en VITE-variabel och ska aldrig byggas in i klienten.
5. Kör `npm run deploy` (bygger klient/Worker och deployar via Wrangler). Namnet på Workern är `tvattligan`; ändra det om det skulle kollidera med en befintlig orelaterad Worker.
6. Verifiera HTTPS, de seedade posterna, en registrering, ångring, statistik, Admin-cookie och CSV i den nya miljön.

`deploy` och `db:migrate:remote` finns för nästa fas men har inte körts. Build-utdata är `dist/client` och `dist/tvattligan`. Lokal `.dev.vars` är ignorerad av Git och används enbart för utveckling; produktionshemligheten sätts med Wrangler, aldrig i versionshanterad konfiguration.
