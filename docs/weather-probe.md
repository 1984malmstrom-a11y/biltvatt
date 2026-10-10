# Isolerat SMHI-prov från Cloudflare

`scripts/weather-probe/wrangler.jsonc` definierar en **separat** Worker på `workers.dev`. Den har ingen D1-bindning, inga produktionshemligheter, inga statiska resurser och ingen koppling till produktions-Workern. Den använder samma SMHI-fetch och prognostolkning som V2. Den ändrar inte produktionen.

Den här versionen är avsedd för den redan driftsatta `tvattligan-smhi-probe-20261008`: alla fyra tidigare anrop kastade `TypeError` även utan preview-token. Alla fyra skapade en `AbortSignal.timeout(8000)`, så deras resultat avgör ännu inte om orsaken ligger i signalen, SMHI-nätvägen eller andra anropsinställningar. `elapsedMs: 0` är inte bevis för att inget nätverksförsök skedde; Cloudflare kan frysa `Date.now()` mellan I/O-operationer.

Ett senare test från den driftsatta prov-Workern gav HTTP 200 för `example-basic`, `smhi-basic`, `smhi-redirect-manual`, `smhi-with-signal`, `smhi-headers-only` och `smhi-cache-only`. Endast försöken med `redirect: "error"` kastade `TypeError`; de lyckade SMHI-svaren rapporterade ingen omdirigering. V2:s SMHI-anrop använder därför nu `redirect: "manual"` och avvisar svar med icke lyckad HTTP-status. Testet har ännu inte verifierat JSON-modellen eller den sammanlagda V2-fetchens cacheträff efter ändringen. Prov-Workern behåller `smhi-redirect-error` och `smhi-combined-no-cache` som jämförelse med det gamla felet.

Kör följande i PowerShell från projektroten, på `feat/station-dashboard-v2`, efter att grenen hämtats och `npm ci` har körts. Kontrollera först att `wrangler.jsonc` i provkatalogen fortfarande saknar `d1_databases` och `vars`. Det första kommandot använder en tillfällig Cloudflare-preview för att prova verklig SMHI-hämtning. Öppna den lokala adress Wrangler visar med `/probe` och stoppa sedan processen med Ctrl+C. Preview kan inte bevisa att cache fungerar.

```powershell
npx wrangler dev --remote --config .\scripts\weather-probe\wrangler.jsonc
```

Kör i ett **andra** PowerShell-fönster med den lokala adress Wrangler visar (vanligen port 8787). `curl.exe` visar även felkod och JSON när HTTP-status är 503:

```powershell
curl.exe --silent --show-error --include http://127.0.0.1:8787/probe
```

Svaret innehåller `stage`, `attempts` och `signalCheck` utan API-kropp, cookies, tokenvärden eller råa felmeddelanden. Anropsordningen är `example-basic` (enbart URL), `smhi-basic` (enbart URL), `smhi-redirect-manual`, `smhi-redirect-error`, `smhi-with-signal`, `smhi-headers-only`, `smhi-cache-only`, `smhi-combined-no-cache` och `app-fetch` (exakt V2-anrop). `signalCheck` testar separat om `AbortSignal.timeout(8000)` kan skapas. `httpStatus` är status från externa anrop; `errorCategory` och den fasta `errorDescription` är bara ledtrådar utifrån feltextens kända ord, inte säkra diagnoser. `redirectHost` och `finalHost` innehåller endast värdnamn; `redirected` visar om en lyckad fetch följde en omdirigering. `shape` visar endast fälttyper och antal tidssteg. Ignorera `elapsedMs` vid orsaksbedömning på Cloudflare.

- `example-basic` och `smhi-basic` misslyckas: kontrollera om felkategorierna pekar mot en bred nätverksbegränsning; jämför även HTTP-status.
- `example-basic` lyckas men `smhi-basic` misslyckas: SMHI-nätvägen behöver undersökas, oberoende av V2:s cache och signal.
- `smhi-basic` lyckas men `smhi-with-signal` misslyckas: signaltillägget är en konkret felkandidat. `signalCheck.supported: false` visar att redan skapandet misslyckas.
- `smhi-basic` och `smhi-with-signal` lyckas men `smhi-cache-only` misslyckas: cacheinställningen är en konkret felkandidat.
- `smhi-redirect-manual` ger 3xx: kontrollera `redirectHost`; V2 avvisar statusen utan att följa omdirigeringen.
- `smhi-redirect-error` misslyckas medan `smhi-basic` och `smhi-redirect-manual` lyckas: redirectinställningen är felkandidat. Om de lyckade svaren har `redirected: false` och status 200 finns inget belägg för en faktisk HTTP-omdirigering.
- `smhi-headers-only` och `smhi-combined-no-cache` skiljer headers/redirect/signal från cachekonfigurationen. Jämför dem innan V2-anropet ändras.
- Endast `app-fetch` misslyckas: granska den kvarvarande kombinationen av headers, redirect, signal och cache. Ändra inte V2 utifrån enbart en felkategori.
- `stage: "json"`, `"schema"` eller `"selection"`: V2-hämtningen lyckades men svarstexten, datamodellen eller prognostiderna behöver granskas.

För denna felsökning: uppdatera den **redan befintliga fristående** prov-Workern i samma Cloudflare-konto. Kontrollera först att `wrangler.jsonc` fortfarande heter `tvattligan-smhi-probe-20261008` och saknar D1-bindning, andra bindings och produktionshemligheter. Kör från projektroten på V2-grenen:

```powershell
git switch feat/station-dashboard-v2
git pull --ff-only origin feat/station-dashboard-v2
npm ci
npx wrangler deploy --config .\scripts\weather-probe\wrangler.jsonc
```

Wrangler visar prov-Workerns egen URL. Använd den URL:en med `/probe`, exempelvis:

```powershell
$probe = 'https://tvattligan-smhi-probe-20261008.<ditt-subdomännamn>.workers.dev/probe'
curl.exe --silent --show-error --include $probe
```

Kör först **ett** `/probe`-anrop och spara den korta JSON-responsen. Om `app-fetch` lyckas ska `kind` vara `forecast`, och `now` samt `tomorrow` ska ha UTC-tider, temperaturer och symbolkoder. För cachekontroll kan sedan upprepade anrop från samma plats visa `app-fetch.cacheStatus` som `HIT`; en preview eller ett lokalt anrop direkt mot SMHI bevisar inte att cachen fungerar på `workers.dev`. Om `ok` är `false` eller ingen cacheträff kan påvisas ska V2:s produktionsdriftsättning fortfarande avvakta.

Provsvaret har `Cache-Control: no-store` och innehåller bara offentlig prognos och cachediagnostik. Radera prov-Workern efter granskningen med `npx wrangler delete --name tvattligan-smhi-probe-20261008` från kontot där den skapades. Kommandot får inte köras mot `tvattligan`.
