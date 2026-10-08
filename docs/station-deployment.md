# Driftsättningsplan för stationsdashboard V1

Detta är en körplan för **separat godkänd** produktion. Inget steg nedan ska köras mot produktion under kodgranskningen. Filen med verkliga försäljningsvärden och SQL-filerna från `docs/station-import.md` ska ligga i en privat katalog utanför repositoryt. Klistra inte in dem i chatt, PR, CI-loggar eller byggartefakter.

## Förutsättningar och stoppunkter

1. Granska originalarbetsboken och jämför den med den privata CSV-exporten dag för dag. Bekräfta uttryckligen att serien avser enbart Preem Tingsryds **butiksförsäljning exklusive moms**, utan drivmedel. Avvikelse stoppar importen.
2. Granska och godkänn kodrevisionen på `feat/station-dashboard-v1`. Välj en exakt commit för drift. Säkerställ att inga verkliga försäljningsfiler finns i committen, PR:en eller `dist`.
3. Kontrollera att Wrangler är inloggad på rätt Cloudflare-konto med `npx wrangler whoami --config wrangler.jsonc`. Projektets befintliga D1 är `tvattligan` med binding `DB`; skapa ingen ny databas. Miljön som användes för utveckling hade ingen autentiserad Wrangler-session.
4. Kör `npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc` och `npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name, applied_at FROM d1_migrations ORDER BY id"`. Den första visar väntande och den andra registrerade migrationer. Granska båda mot databas-ID:t i `wrangler.jsonc`. Om `0002` eller `0003` också väntar ska hela ordningen och effekten godkännas innan `apply`, som applicerar alla väntande migrationer. Spara utgångsläget.

## Backup, schema och import

5. Ta en privat backup utanför Git: kör `umask 077`, skapa en privat katalog med `mkdir -m 700 -p /ABSOLUT/PRIVAT/SOKVAG` och kör `npx wrangler d1 export tvattligan --remote --config wrangler.jsonc --output /ABSOLUT/PRIVAT/SOKVAG/tvattligan-before-station.sql`. Kontrollera `test -s /ABSOLUT/PRIVAT/SOKVAG/tvattligan-before-station.sql` och notera `sha256sum /ABSOLUT/PRIVAT/SOKVAG/tvattligan-before-station.sql`. Backupen innehåller även Tvättligans data och pushuppgifter; behandla den som känslig.
6. Efter separat godkännande: `npx wrangler d1 migrations apply tvattligan --remote --config wrangler.jsonc`. Bekräfta därefter i migrationslistan att `0004_station_dashboard.sql` är applicerad. Kontrollera `PRAGMA foreign_key_check` och att de nya tabellerna finns. Migrationen är additiv och skriver inte om befintliga tvätt- eller pushrader.
7. Kör den privata **läsande** `station-preflight.sql` mot rätt D1: `npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --file /ABSOLUT/PRIVAT/SOKVAG/station-preflight.sql`. För en första import ska `existing_rows`, `matching_rows` och `differing_rows` vara noll. Vid återkörning ska varje avvikande befintligt värde granskas; importen ändrar det inte.
8. Efter separat godkännande: kör den privata `station-import.sql` med samma `d1 execute --remote --config ... --file ...`. Den består av ett atomiskt `INSERT` med `ON CONFLICT DO NOTHING`, så en omkörning skapar inga dubbletter och bevarar rättningar. Kontrollera att Wrangler rapporterar lyckad körning.
9. Kör en privat verifiering direkt i D1. Frågan nedan innehåller inga belopp från källfilen. Jämför resultatet med den granskade originalkällan; vid avvikelse stoppa driftsättningen och undersök befintliga rättningar och importlogg:

```sql
SELECT COUNT(*) AS days,
       COALESCE(SUM(net_sales_ore),0) AS total_ore,
       MIN(business_date) AS first_day,
       MAX(business_date) AS last_day,
       MAX(CASE WHEN business_date='2025-10-08' THEN net_sales_ore END) AS sample_ore
FROM station_store_daily_sales
WHERE station_id='tingsryd' AND business_date BETWEEN '2025-01-01' AND '2025-12-31';
```

Kontrollera även antal auditposter med `actor='IMPORT'` för första importen. Håll terminalutdata och backup privata.
Kör kontrollfrågan ovan med `npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT COUNT(*) AS days, COALESCE(SUM(net_sales_ore),0) AS total_ore, MIN(business_date) AS first_day, MAX(business_date) AS last_day, MAX(CASE WHEN business_date='2025-10-08' THEN net_sales_ore END) AS sample_ore FROM station_store_daily_sales WHERE station_id='tingsryd' AND business_date BETWEEN '2025-01-01' AND '2025-12-31'"`. Kör `npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT COUNT(*) AS imported_audit_rows FROM station_store_sales_audit WHERE station_id='tingsryd' AND actor='IMPORT' AND action='CREATE'"` för auditkontrollen.

## Applikation och behörigheter

10. Bygg den godkända kodrevisionen (`npm ci`, `npm run build`) och driftsätt med projektets befintliga `npm run deploy` först efter driftgodkännande. Bekräfta att befintlig `ADMIN_PIN` och eventuella VAPID-hemligheter behålls.
11. Öppna `/station/admin` via HTTPS och kontrollera befintlig admin-PIN på en administratörsenhet. Granska ett tidigare dagsvärde och dess audit. Skapa en tidsbegränsad aktiveringskod för en särskild TV/personaldator. Öppna `/station/login` på den enheten och kontrollera att den får en separat lässession. Återkalla en testvisning och kontrollera att åtkomsten upphör. Admin-PIN ska inte lämnas kvar på TV:n.
12. Kontrollera `/station` med giltig visningssession: gårdagens datum enligt Stockholmstid, jämförelsedatum 364 dagar bakåt, belopp, procent, krondifferens, saknade värden och länken till `/`. Kontrollera att oinloggad `GET /api/station/dashboard` ger 401, att visningssession inte kan anropa admin-API och att svar med belopp har `Cache-Control: no-store`.
13. Kontrollera därefter befintliga Tvättligan: registrering/ångring, statistik, admininloggning och pushinställningar, prenumeration och en godkänd enhetstestnotis. Skicka inte breda meddelanden som smoke test. Kontrollera desktop/TV och mobil.

## Om något går fel

Stoppa import eller deployment vid avvikande preflight, kontrollvärden, migrationsstatus eller behörighetstest. Vid applikationsfel kan den tidigare godkända Worker-revisionen driftsättas igen; den additiva `0004` kan ligga kvar medan felet utreds. Återställ inte hela D1-backupen direkt ovanpå en databas som hunnit få nya tvättregistreringar eller pushhändelser. Använd backupen för jämförelse och besluta om riktad återställning av stationsrader i en separat, granskad åtgärd. Dokumentera utfallet och verifiera Tvättligans data efteråt.
