# MASTER – Tvättligan + stationsdashboard (ny Preem-station)

Status: **arbetskopia, INTE driftsatt**. Den här filen hör endast till
`feat/master-station-template`. Ursprunglig Tingsryd-app och D1 ska lämnas orörda.

## Princip

Behåll all UI och funktionalitet: Tvättligan, statistik, admin, stationsdashboard,
schema, checklistor, Personalpärmen, månadstal, svinnlista och push.
Kopiera **endast kod och databasstruktur** – aldrig en dump av Tingsryds D1,
försäljning, anställda, scheman, dokument, pushprenumerationer eller adminsessioner.

`scripts/prepare-master-migrations.mjs` skapar `migrations-master/` från
`migrations/` men tar bort den initiala personal-listan från migration 0001.
Originalmigrationerna ändras inte. Preems sex tvättprogram finns kvar som
redigerbara standardprogram. Kontrollera programmets lokala priser med den
nya stationschefen innan lansering.

## Konfiguration för en ny station

- I MASTER-kopians `wrangler.jsonc` sätt **unikt** Worker-namn och
  `database_name` samt den **nya** D1-databasens `database_id`.
  Använd aldrig produktionsdatabasen `tvattligan` eller Tingsryds databas-ID.
- Sätt `vars.STATION_ID` till en kort, unik identifierare, exempelvis
  `preem-kollegansort`, inte `tingsryd`.
- Sätt `vars.STATION_LATITUDE` och `vars.STATION_LONGITUDE` (strängar med
  decimalpunkt, WGS84) till den nya stationens koordinater. Utan dessa visar
  en annan station **inte** Tingsryds väderprognos.
- Skapa lokalt en **privat och git-ignorerad** `.env.production`:
  `VITE_STATION_NAME=Preem Exempelort` och
  `VITE_STATION_CITY=Exempelort`. Dessa värden styr visningsnamnet utan att
  layouten ändras.
- Valfritt: `VITE_STATION_BENCHMARK_SEK=275` och
  `VITE_STATION_BENCHMARK_LABEL=egen referensperiod`. Om referens saknas
  visas ingen Tingsryd-specifik jämförelse. För närvarande görs den inställningen
  vid byggning; redigering direkt via Admin återstår.
- Sätt en **egen**, hemlig ADMIN_PIN samt **nya** VAPID-nycklar för stationen.
  Återanvänd inte Tingsryds pushnycklar eller sessionsdata.

## Säkra lokala kontroller

```powershell
git switch feat/master-station-template
npm ci
npm run master:prepare
npm run typecheck
npm test
npm run build
```

`npm run master:check` kontrollerar separationen från Tingsryds D1.
Kontrollen **ska misslyckas** tills nytt Worker-namn och riktigt nytt D1-ID
har fyllts i. `npm run db:migrate:remote` och `npm run deploy` passerar
samma spärr. Kör aldrig dessa mot Tingsryds konto/databas av misstag.
Kontrollera också manuellt Cloudflare-konto och databas-ID innan driftsättning.

`migrations-master/` är genererade filer, byggda på nytt varje gång.
Kör bara migrationerna mot den **tomma nya** databasen. Inga produktionsdumpningar
eller produktionsdata behövs för att bygga den nya stationen.

## Godkännandetester före leverans

1. Tom Personal, schema, Personalpärm, försäljningshistorik, månadstal,
   notiser, svinnregister och pushprenumerationer efter migrering.
2. Välj Admin → Personal → Lägg till: nytt namn skapar säljar-knappen.
3. Nya dokument och checklistor ska kunna läggas in i en tom Personalpärm.
4. Spara och visa en testförsäljning, ångra, testa statistik och nya målsiffror.
5. Ny visningskod för TV, separat admin-PIN och egna webpushnycklar.
6. Testa väder för rätt ort, jämförelse mot egen referens och mobil/TV-layout.
7. Kontrollera att gamla Tingsryds adress, data och push är opåverkade.
8. Granska om kampanjbild, färdiga försäljningsmål och eventuella statiska
   Preem-material får återanvändas på andra stationer.

**OBS:** De två sista kontrollerna och fullständig testkörning är inte
bekräftade ännu. Ingen ny Worker har publicerats från mastergrenen.
