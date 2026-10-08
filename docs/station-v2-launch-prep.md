# Stationsdashboard V2: kontrollerad driftförberedelse

Denna plan är för en senare, separat godkänd produktionskörning. Inga kommandon här har körts mot produktions-D1 eller produktions-Workern under förberedelsen. Kör inte migration eller deployment innan SMHI-provet från Cloudflares nät, bildbeslutet och backupen är godkända.

## 1. Kontrollera väder och bildbeslut

1. Kör den fristående prov-Workern enligt `docs/weather-probe.md`. Kontrollera verkligt SNOW1gv1-svar och upprepad cacheträff på `workers.dev`.
2. Bekräfta att V2 använder den neutrala symbolen i logotyputsmyckningen. En officiell Preem-logotyp får återinföras först med styrkt godkännande och fil. Stationsbilden är en märkt, AI-genererad illustration och ska inte presenteras som ett foto från Tingsryd.

## 2. Privata kontroller före D1-migration

Kör från projektroten i PowerShell på rätt Cloudflare-konto. Kontrollera `wrangler.jsonc`: D1-bindningen `DB` ska peka på befintliga databasen `tvattligan` med ID `695033b7-6bb2-47a3-a9c3-08d4ca818088`. Skydda terminalutdata och backup eftersom databasen innehåller försäljning, sessioner och pushuppgifter.

```powershell
npx wrangler whoami --config wrangler.jsonc
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name, applied_at FROM d1_migrations ORDER BY id"
```

Stoppa om andra migrationer än `0005_station_dashboard_v2.sql` och `0006_station_monthly_figures.sql` väntar, eller om tidigare migrationer saknas. Wrangler `migrations apply` kör alla väntande filer; använd därför inte kommandot förrän listan är granskad.

Ta **före migration** en fullständig privat export utanför repositoryt, kontrollera att filen inte är tom och notera dess hash. Läs in exporten i en separat lokal SQLite-databas och kontrollera att den går att läsa. Dokumentera antal V1-rader i `sales`, `wash_programs`, `staff`, push-tabellerna och stationens befintliga tabeller.

```powershell
$private = Join-Path $env:USERPROFILE 'Documents\StationV2Private'
New-Item -ItemType Directory -Force -Path $private | Out-Null
npx wrangler d1 export tvattligan --remote --config wrangler.jsonc --output (Join-Path $private 'tvattligan-before-v2.sql')
Get-Item (Join-Path $private 'tvattligan-before-v2.sql') | Select-Object Length
Get-FileHash (Join-Path $private 'tvattligan-before-v2.sql') -Algorithm SHA256
```

## 3. Migration och verifiering efter separat driftbeslut

`0005` skapar nya schema-, uppgifts- och informationstabeller. `0006` skapar månadsresultat och lägger till `station_notices.expires_time`; den måste alltså följa `0005`. Båda är additiva. De ändrar inte Tvättligans befintliga försäljnings-, personal-, tvätt- eller pushrader. Efter godkänd backup:

```powershell
npx wrangler d1 migrations apply tvattligan --remote --config wrangler.jsonc
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "PRAGMA foreign_key_check"
```

Kontrollera att båda migrationerna registrerats, att de sex nya tabellerna och `expires_time` finns, att V1-radantal stämmer och att V1:s försäljning, ångring, statistik, admin och push fortfarande fungerar. Migrera **före** V2-Worker. Vid Workerfel: rulla tillbaka Worker-versionen, men återställ inte hela D1-backupen över nytillkomna försäljningar.

## 4. Oktober 2026 via skyddad administration

Spara verklig CSV endast privat utanför Git, chatt, skärmbilder, CI och byggartefakter. Filen ska vara UTF-8 med exakt rubrik `datum,förnamn,start,slut,status`. Datum är `YYYY-MM-DD`, tid `HH:MM` i 24-timmarsformat. Tillåtna statusvärden är `active`, `cancelled`, `leave`, `sick`; tom status blir `active`. Ett pass med sluttid före start löper över midnatt. Importen accepterar 1–500 rader.

1. Granska originalet mot bemanningskällan dag för dag: tider, nattpass, frånvaro och inställda pass. Verifiera att alla datum är i oktober 2026 och att ingen person/dag har överlappande aktiva pass eller dubbletter.
2. Logga in som admin och läs befintliga perioder/pass i `/station/admin` innan import. Vid osäkerhet, läs `station_shifts` för `2026-10-01`–`2026-10-31` via en **privat, läsande** D1-fråga och jämför mot CSV. UI-förhandsgranskningen gör inte denna jämförelse automatiskt.
3. Välj den privata CSV-filen i admin, ange exempelvis `Oktober 2026` och kontrollera periodgränserna. Läs igenom hela förhandsgranskningen. Tryck `Importera` endast när den manuella jämförelsen är godkänd.
4. Import-API:t använder `INSERT` i en D1-batch och gör inga `UPDATE` eller `DELETE` på befintliga pass. En identisk redan registrerad rad ger `409` och importen stoppas. Olika tider för samma person/dag kan annars skapa överlapp, därför krävs steg 1–2.
5. Efter import, läs tillbaka oktoberpassen i admin och jämför antal, datumintervall, status och stickprov med den granskade källan. Kontrollera att tidigare pass fortfarande finns.

## 5. Worker och slutlig kontroll

Efter lyckat Cloudflare-väderprov, godkända bilder, privat backup, migrationer och schemaimport kan V2-Workern driftsättas med separat beslut. Bekräfta att `ADMIN_PIN` och VAPID-hemligheter redan är korrekt satta; kopiera dem inte till test-Workern. Kontrollera oinloggad 401 för stationens belopp och väder, giltig visningssession, `Cache-Control: no-store` på skyddade svar samt V1:s försäljning/ångring, statistik, push och administration. Offentlig försäljningsregistrering är avsiktligt kvar utan admininloggning; följ audit och överväg riktad hastighetsbegränsning mot missbruk utan att ändra säljarflödet.
