# Isolerat SMHI-prov från Cloudflare

`scripts/weather-probe/wrangler.jsonc` definierar en **separat** Worker på `workers.dev`. Den har ingen D1-bindning, inga produktionshemligheter, inga statiska resurser och ingen koppling till produktions-Workern. Den använder samma SMHI-fetch och prognostolkning som V2. Den ändrar inte produktionen.

Kör följande i PowerShell från projektroten, på `feat/station-dashboard-v2`, efter att grenen hämtats och `npm ci` har körts. Kontrollera först att `wrangler.jsonc` i provkatalogen fortfarande saknar `d1_databases` och `vars`. Det första kommandot använder en tillfällig Cloudflare-preview för att prova verklig SMHI-hämtning. Öppna den lokala adress Wrangler visar med `/probe` och stoppa sedan processen med Ctrl+C. Preview kan inte bevisa att cache fungerar.

```powershell
npx wrangler dev --remote --config .\scripts\weather-probe\wrangler.jsonc
```

För cacheprovet, kontrollera i rätt Cloudflare-konto att namnet `tvattligan-smhi-probe-20261008` är ledigt. Stoppa om en Worker redan har det namnet. Driftsätt sedan **bara** denna fristående prov-Worker:

```powershell
npx wrangler deploy --config .\scripts\weather-probe\wrangler.jsonc
```

Wrangler visar prov-Workerns egen URL. Använd den URL:en med `/probe`, exempelvis:

```powershell
$probe = 'https://tvattligan-smhi-probe-20261008.<ditt-subdomännamn>.workers.dev/probe'
1..3 | ForEach-Object { Invoke-RestMethod $probe | ConvertTo-Json -Depth 5; Start-Sleep -Seconds 2 }
```

`ok` ska vara `true`, `kind` ska vara `forecast`, och `now` samt `tomorrow` ska ha UTC-tider, temperaturer och symbolkoder. `upstreamCacheStatus` ska visa ett cacheförsök och sedan `HIT` på upprepade anrop från samma plats. `upstreamAgeSeconds` kan öka på träffar. Ett lokalt anrop direkt mot SMHI bevisar inte att Cloudflares nät når tjänsten eller cachar svaret. Om fälten saknas, `ok` är `false` eller ingen träff kan påvisas ska produktionsdriftsättningen stoppas och cachemetoden granskas.

Provsvaret har `Cache-Control: no-store` och innehåller bara offentlig prognos och cachediagnostik. Radera prov-Workern efter granskningen med `npx wrangler delete --name tvattligan-smhi-probe-20261008` från kontot där den skapades. Kommandot får inte köras mot `tvattligan`.
