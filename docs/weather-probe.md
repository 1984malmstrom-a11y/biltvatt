# Isolerat SMHI-prov från Cloudflare

`scripts/weather-probe/wrangler.jsonc` definierar en **separat** Worker på `workers.dev`. Den har ingen D1-bindning, inga produktionshemligheter, inga statiska resurser och ingen koppling till produktions-Workern. Den använder samma SMHI-fetch och prognostolkning som V2. Den ändrar inte produktionen.

Kör följande i PowerShell från projektroten, på `feat/station-dashboard-v2`, efter att grenen hämtats och `npm ci` har körts. Kontrollera först att `wrangler.jsonc` i provkatalogen fortfarande saknar `d1_databases` och `vars`. Det första kommandot använder en tillfällig Cloudflare-preview för att prova verklig SMHI-hämtning. Öppna den lokala adress Wrangler visar med `/probe` och stoppa sedan processen med Ctrl+C. Preview kan inte bevisa att cache fungerar.

```powershell
npx wrangler dev --remote --config .\scripts\weather-probe\wrangler.jsonc
```

Kör i ett **andra** PowerShell-fönster med den lokala adress Wrangler visar (vanligen port 8787). `curl.exe` visar även felkod och JSON när HTTP-status är 503:

```powershell
curl.exe --silent --show-error --include http://127.0.0.1:8787/probe
```

Svaret innehåller `stage` och `attempts` utan API-kropp, cookies, tokenvärden eller råa felmeddelanden. `app-fetch` använder exakt V2:s SMHI-inställningar. Om det misslyckas provar Workern ett anrop utan cache med manuell redirect och ett anrop där alla inkommande headers, inklusive Cloudflares preview-token, tagits bort. `httpStatus` är status från SMHI/Cloudflares subanrop; `errorType` skiljer timeout och nätverksfel från parserfel. `redirectHost` innehåller bara målvärdens namn. `shape` visar endast fälttyper och antal tidssteg.

- `app-fetch` misslyckas och `preview-header-stripped` ger 200: fjärrförhandsvisningens header är en stark felkandidat. Cloudflare dokumenterar [denna preview-begränsning](https://developers.cloudflare.com/workers/platform/known-issues/). Bekräfta sedan på separat driftsatt prov-Worker.
- `manual-no-cache` ger 3xx: `redirect: "error"` stoppar en verklig omdirigering; kontrollera värdnamnet och ändra enbart enligt en godkänd redirect-policy.
- Båda anrop utan cache ger 200 men `app-fetch` misslyckas: granska `cf`-cacheinställningarna i en separat driftsatt Worker.
- `stage: "json"`, `"schema"` eller `"selection"`: hämtningen lyckades men svarstexten, datamodellen eller urvalet av prognostider behöver granskas. Skicka bara den lilla diagnostiska JSON:en, inte hela SMHI-svaret.
- `TimeoutError` eller cirka 8 000 ms: undersök fördröjning innan timeout ändras. Ett HTTP-fel syns som `httpStatus`.

För cacheprovet, kontrollera i rätt Cloudflare-konto att namnet `tvattligan-smhi-probe-20261008` är ledigt. Stoppa om en Worker redan har det namnet. Driftsätt sedan **bara** denna fristående prov-Worker:

```powershell
npx wrangler deploy --config .\scripts\weather-probe\wrangler.jsonc
```

Wrangler visar prov-Workerns egen URL. Använd den URL:en med `/probe`, exempelvis:

```powershell
$probe = 'https://tvattligan-smhi-probe-20261008.<ditt-subdomännamn>.workers.dev/probe'
1..3 | ForEach-Object { curl.exe --silent --show-error $probe; Start-Sleep -Seconds 2 }
```

`ok` ska vara `true`, `kind` ska vara `forecast`, och `now` samt `tomorrow` ska ha UTC-tider, temperaturer och symbolkoder. I en separat driftsatt Worker ska `attempts[0].cacheStatus` visa ett cacheförsök och sedan `HIT` på upprepade anrop från samma plats. En preview eller ett lokalt anrop direkt mot SMHI bevisar inte att cachen fungerar på `workers.dev`. Om fälten saknas, `ok` är `false` eller ingen träff kan påvisas ska produktionsdriftsättningen stoppas och cachemetoden granskas.

Provsvaret har `Cache-Control: no-store` och innehåller bara offentlig prognos och cachediagnostik. Radera prov-Workern efter granskningen med `npx wrangler delete --name tvattligan-smhi-probe-20261008` från kontot där den skapades. Kommandot får inte köras mot `tvattligan`.
