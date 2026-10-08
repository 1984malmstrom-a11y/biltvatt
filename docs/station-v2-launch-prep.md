# Stationsdashboard V2: kontrollerad lanseringsordning

Den här sidan dokumenterar den tidigare manuella körplanen. Den aktuella lanseringen körs via `scripts/launch-station-v2.ps1`, som automatiskt gör en privat, läsande D1-export och kontrollerar dess SQLite-integritet innan ett separat publiceringsgodkännande. Kör inte de äldre manuella stegen nedan parallellt med skriptet.

Det här är en körplan för **senare, separat godkänd** produktionsdrift. Inga kommandon i avsnitten för migration, deployment, schemaimport eller radering av prov-Worker har körts under förberedelsen. Vädervisning och automatiska väderanrop är pausade i V2. SMHI-testet är därför inte ett lanseringsvillkor. Den neutrala logotypsymbolen används tills godkänt varumärkesmaterial finns; stationsbilden är en märkt AI-illustration och får inte kallas ett stationsfoto.

Migrationerna är ordnade: `0005_station_dashboard_v2.sql` skapar enbart nya tabeller och index för schema, uppgifter och information. `0006_station_monthly_figures.sql` skapar tabellen för månadsresultat och lägger till `station_notices.expires_time`, alltså **efter 0005**. Ingen av dem uppdaterar eller raderar V1:s försäljnings-, personal-, tvätt-, sessions- eller pushrader. Lokal migrationstestning kontrollerar detta mot en V1-databas med syntetiska rader. Verklig produktionsstatus måste ändå kontrolleras före körning.

## 1. Hämta exakt V2-revision på Windows

Kör i PowerShell från projektroten. Spara commit-ID:t i driftanteckningarna. Fortsätt bara med ren arbetskatalog och rätt gren.

```powershell
git switch feat/station-dashboard-v2
git pull --ff-only origin feat/station-dashboard-v2
git status --short --branch
git rev-parse HEAD
npm ci
npm run setup
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## 2. Kontrollera produktions-D1 utan skrivning

Kontrollera att `wrangler.jsonc` har produktions-Worker `tvattligan` och befintlig D1-bindning `DB` till databasen `tvattligan` med ID `695033b7-6bb2-47a3-a9c3-08d4ca818088`. `migrations list` visar väntande filer; `d1_migrations` visar redan körda. `0001`–`0004` ska vara körda och **endast 0005 och 0006** ska vänta, i den ordningen. Stoppa vid avvikelse.

```powershell
npx wrangler whoami --config wrangler.jsonc
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name, applied_at FROM d1_migrations ORDER BY id"
```

## 3. Ta ny privat backup före migration

Behåll filen utanför Git, CI och chatt. Den innehåller privata försäljnings-, sessions- och pushuppgifter.

```powershell
$private = Join-Path $env:USERPROFILE 'Documents\StationV2Private'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$backup = Join-Path $private ("tvattligan-before-v2-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
npx wrangler d1 export tvattligan --remote --config wrangler.jsonc --output $backup
node .\scripts\verify-d1-backup.mjs $backup
```

Verifieraren läser in hela SQL-exporten i en tillfällig SQLite-databas, kör integritets- och främmande-nyckelkontroll och skriver filstorlek, SHA-256 och radantal för V1-tabeller. Ett fel stoppar lanseringen. Den skriver inte ut privata rader.

## 4. Jämför backupen med befintliga produktionsrader

Kör samma radantal mot produktion och jämför **varje** tabell med verifierarens `counts`. Spara utdata privat. Kör även en läsande integritetskontroll. Skillnad stoppar migrationen.

```powershell
$countsSql = "SELECT 'sales' AS table_name, COUNT(*) AS row_count FROM sales UNION ALL SELECT 'sales_audit', COUNT(*) FROM sales_audit UNION ALL SELECT 'staff', COUNT(*) FROM staff UNION ALL SELECT 'wash_programs', COUNT(*) FROM wash_programs UNION ALL SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions UNION ALL SELECT 'notification_events', COUNT(*) FROM notification_events UNION ALL SELECT 'station_store_daily_sales', COUNT(*) FROM station_store_daily_sales UNION ALL SELECT 'station_view_sessions', COUNT(*) FROM station_view_sessions"
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command $countsSql
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "PRAGMA foreign_key_check"
```

## 5. Kör 0005 och 0006 **efter separat godkännande**

Granska återigen väntande migrationer precis före körningen. `migrations apply` kör alla väntande filer; fortsätt endast om listan innehåller exakt 0005 och 0006. Kontrollera sedan att båda registrerats, att de sex nya tabellerna finns, att `expires_time` finns och att V1-radantalen inte minskat.

```powershell
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
npx wrangler d1 migrations apply tvattligan --remote --config wrangler.jsonc
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name, applied_at FROM d1_migrations ORDER BY id"
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "PRAGMA foreign_key_check"
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command $countsSql
```

## 6. Bygg och driftsätt V2 **efter separat godkännande**

Verifiera att commit-ID:t från steg 1 fortfarande är valt och att testerna passerat. Bekräfta befintliga produktionshemligheter (`ADMIN_PIN`, VAPID) i rätt konto utan att kopiera dem till prov-Workern. Kör sedan:

```powershell
npm run build
npx wrangler deploy --config wrangler.jsonc
```

Detta är första kommandot som uppdaterar produktions-Workern `tvattligan`. Kör aldrig `wrangler deploy` med produktionskonfigurationen som ett test av SMHI.

## 7. Verifiera V1 och V2 direkt efter deployment

På en avsedd testenhet: kontrollera Tvättligans registrering, ångring, statistik, metallkort, tvättbilder och en riktad pushnotis. Kontrollera admininloggning och att stationens belopp nekas utan giltig visnings- eller adminbehörighet. Kontrollera därefter dashboardens försäljning, 364-dagarsjämförelse, to-do, Viktig info, månadsresultat och att inget väder visas eller hämtas automatiskt. Skyddade API-svar ska fortsatt ha `Cache-Control: no-store`. Tvättligans försäljningsregistrering är avsiktligt öppen utan administratörsinloggning enligt nuvarande arbetssätt; övervaka audit och missbruk separat.

## 8. Granska och importera godkänd oktober-CSV privat

Den verkliga filen ska ligga utanför repositoryt, byggartefakter, skärmbilder och chatt. Formatet är UTF-8 med exakt rubrik `datum,förnamn,start,slut,status`. Datum är `YYYY-MM-DD`, tider är lokal `HH:MM`, och status är `active`, `cancelled`, `leave` eller `sick` (tomt blir `active`). Stationschefen har godkänt underlaget för **2026-10-01–2026-10-31**, förväntat **111 rader**. Jämför den privata filen med godkänd källa: samtliga datum, namn, tider, nattpass, frånvaro och antal. Var särskilt noga med tvetydiga tider vid höstens klockomställning.

Innan import: läs registrerade perioder och oktoberpass i skyddad admin. Följande privata, läsande kontroll visar befintligt antal utan namn eller tider:

```powershell
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT COUNT(*) AS october_rows FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31'"
```

I `/station/admin`: välj CSV-filen, ange `Oktober 2026`, kontrollera gränserna `2026-10-01` och `2026-10-31`, **111 förhandsgranskade rader**, status och varje datum. Adminvyn stoppar import vid dubblett eller överlapp mot redan lästa pass; servern gör en ny, auktoritativ kontroll mot befintliga pass före en atomisk `INSERT`-batch. Ingen befintlig rad skrivs över. Stoppa vid varning, ändrat antal eller manuell avvikelse. Välj **Importera** först när förhandsgranskningen är godkänd.

## 9. Kontrollera arbetspassen efter import

Läs tillbaka perioden i skyddad admin och jämför alla 111 rader med den privata godkända källan. Läs därefter antal per status i D1. Skillnaden i `october_rows` mot steg 8 ska vara 111, och tidigare rader ska finnas kvar. Kontrollera `Idag jobbar` på visningsenheten samt automatisk uppdatering vid nytt dygn enligt Europe/Stockholm.

```powershell
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT s.status, COUNT(*) AS rows FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY s.status ORDER BY s.status"
```

## 10. Radera endast den separata SMHI-proben när den inte längre behövs

Kontrollera namnet innan radering. Kommandot nedan avser **endast** `tvattligan-smhi-probe-20261008`, aldrig produktions-Workern `tvattligan`:

```powershell
npx wrangler delete tvattligan-smhi-probe-20261008 --config .\scripts\weather-probe\wrangler.jsonc
```

Vid Workerfel kan den tidigare godkända Worker-revisionen återställas. Återställ inte hela D1-backupen över en databas som hunnit få nya tvättförsäljningar eller pushhändelser; använd den först för jämförelse och planera en separat, riktad rättning.
