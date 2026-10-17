> **Fortsättning 2026-10-17:** Alla 13 pilotmigrationer och faktisk Windows-restore är klara, och Resend är Verified enligt operatören. Använd [nästa-steg-runbooken](arena-pilot-next-steps.md). Befintliga privata configs/kvitton bevaras. Äldre start-/inventeringsblock nedan är referens, inte en order att skapa resurser eller göra om genomförda steg.

> **Uppdatering 2026-10-17:** För den redan skapade pilotdatabasen `8044ee1b-9185-4644-954f-d5455330a7a7`, använd [det nya stegvisa Windows-flödet](arena-pilot-finalization.md). Kör inte databascreation eller den äldre kompletta körordningen igen. `PRAGMA integrity_check` stöds inte via D1:s SQL-gränssnitt; full kontroll görs på faktiskt återställd lokal SQLite.

# ARENAN – isolerad VD-pilot, kontrollerad Windows-release

Denna körordning är för **senare uttryckligen godkända** remote-steg. Inget remote-steg har körts i förberedelsepasset. Använd PowerShell 7, Node >=22.13 och projektets låsta npm-installation. Kör blocken ett i taget; ett inmatat GODKÄNN är operatörens godkännande, aldrig något som agenten fyller i automatiskt.

Uppdatering från Resend-passet: separat mailerkod/config och egen körordning finns i `docs/arena-resend-mailer.md`. Operatören anger nu pilot-D1 `8044ee1b-9185-4644-954f-d5455330a7a7` i konto `aff95af21a7f160722dd524471fc25b0`. Dessa uppgifter är inte remote-verifierade här. Kontrollera dem med GET och återanvänd just den separata pilotresursen efter verifiering; kör **inte** skapa-D1-blocket igen om den redan finns. De tre skyddade äldre UUID:erna förblir spärrade.

## 1. Identiteter och nuläge

| Resurs | Lokalt belagt namn / UUID | Hantering |
|---|---|---|
| Tvättligan Worker | `tvattligan` | Skyddad; inga ändringar |
| Tvättligan D1 / DB | `tvattligan` / `695033b7-6bb2-47a3-a9c3-08d4ca818088` | Skyddad |
| Integrerad MASTER Worker | `tvattligan-master-test` | Skyddad |
| MASTER D1 / DB | `stationmastertest` / `ca2d4bb8-0c28-47b7-9514-8c893ea47c09` | Skyddad; migrations-master |
| Integrerad Arena / ARENA_DB | `arena-master-test` / `767b5a12-6b40-4516-9f7c-e072c1130480` | Skyddad; får inte återanvändas |
| Ny pilot-Worker | `arenan-pilot-vd-20261019` | Föreslagen, inte skapad av detta pass |
| Pilot-D1 | `arenan-pilot-vd-20261019` / `8044ee1b-9185-4644-954f-d5455330a7a7` | Finns och migrerad enligt operatören; aldrig skapa igen |
| ARENA_MAILER-service | Operatören anger en separat, verifierad mailer | Krävs; ingen finns konfigurerad här |

Worker- och D1-namn ligger i olika namnrymder. Kontot, remote-bindningar och namnens tillgänglighet är **inte verifierade**: miljöns konfigurerade Cloudflare-token gav GET /accounts **403, kod 9109, Invalid access token**. Inga resurser har skapats/ändrats. Namn ovan är hämtade ur tillgängliga Git-konfigurationer, inte en påstådd fullständig kontoinventering.

Standaloneläget använder **enbart ARENA_DB och ARENA_ONLY=1**. DB och STATION_DB_* behövs inte och får inte finnas. Detta är provat med riktig lokal workerd/D1, inte bara mocks. Ingen Tvättligan-/MASTER-migration ska köras. De 13 oförändrade migrations-arena-filerna är enda tillåtna migrationskedjan.

## 2. Lokal förberedelse och säkra hjälpfunktioner

Stå i befintlig checkout på feat/arena-v1. Ingen branchväxling eller app-push ingår. Bekräfta den nya lokala checkpointen som rapporterats efter detta pass, inte den gamla start-HEAD:en.

```powershell
$ErrorActionPreference = 'Stop'
$ExpectedHead = Read-Host 'Godkänd lokal checkpoint SHA'
if ((git branch --show-current) -ne 'feat/arena-v1') { throw 'Fel branch' }
if ((git rev-parse HEAD) -ne $ExpectedHead -or (git status --porcelain)) { throw 'Fel HEAD eller dirty tree' }
$Pilot = 'arenan-pilot-vd-20261019'
$Config = '.arena-pilot/pilot.json'
New-Item -ItemType Directory -Force .arena-pilot | Out-Null
function W { & node .\node_modules\wrangler\bin\wrangler.js @args; if ($LASTEXITCODE -ne 0) { throw 'Wrangler misslyckades: STOPP' } }
function Gate([string]$Step) { if ((Read-Host "Skriv GODKÄNN $Step för remote-ändringen") -cne "GODKÄNN $Step") { throw 'Inte godkänt' } }
```

Använd en giltig, begränsad Cloudflare-token från godkänd operatör, inte den token som avvisades här. För inventering: Account Settings Read, Workers Scripts Read och D1 Read. Remote skapande/migration kräver separat D1 Edit; publicering Workers Scripts Edit samt erforderlig kontobehörighet för assets/service bindings. Verifiera faktiska rättigheter i kontot, utöka inte globalt per automatik. Ingen token skrivs i config/Git/rapporter.

```powershell
$Token = Read-Host 'Cloudflare-token (visas inte)' -AsSecureString
$env:CLOUDFLARE_API_TOKEN = [Net.NetworkCredential]::new('', $Token).Password
Remove-Variable Token
function CF([string]$Path) {
  $r = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/$Path" -Headers @{Authorization="Bearer $env:CLOUDFLARE_API_TOKEN"}
  if (-not $r.success) { throw 'Cloudflare GET nekad' }; return $r
}
function CFList([string]$Path) {
  $items = @(); $page = 1
  do {
    $r = CF "$($Path)?page=$page&per_page=50"
    $batch = @($r.result); $items += $batch
    if ($r.result_info.total_pages) { $more = $page -lt $r.result_info.total_pages }
    elseif ($r.result_info.total_count) { $more = $items.Count -lt $r.result_info.total_count }
    elseif ($batch.Count -lt 50) { $more = $false }
    else { throw 'Paginering okänd: verifiera hela inventeringen manuellt innan skapande' }
    $page++
    if ($page -gt 1000) { throw 'Paginering stoppad' }
  } while ($more)
  return $items
}
(CFList 'accounts') | Select-Object id,name
$Account = Read-Host 'Verifierat konto-ID (32 hex)'
if ($Account -notmatch '^[a-fA-F0-9]{32}$') { throw 'Fel konto-ID' }
$env:CLOUDFLARE_ACCOUNT_ID = $Account
$WorkersBefore = @(CFList "accounts/$Account/workers/scripts")
$D1Before = @(CFList "accounts/$Account/d1/database")
if ($WorkersBefore.id -contains $Pilot -or $D1Before.name -contains $Pilot) { throw 'Pilotnamn upptaget: STOPP, skriv inte över' }
$ProtectedBefore = @{}
foreach ($worker in $WorkersBefore) {
  $settings = (CF "accounts/$Account/workers/scripts/$($worker.id)/settings").result
  # Spara privat: settings kan innehålla andra verksamheters konfigurationsdata.
  $ProtectedBefore[$worker.id] = $settings
  [pscustomobject]@{Worker=$worker.id; D1Bindings=($settings.bindings | Where-Object type -eq 'd1' | ConvertTo-Json -Compress)}
}
$ProtectedBefore | ConvertTo-Json -Depth 30 | Set-Content .arena-pilot/workers-before-private.json
$D1Before | ConvertTo-Json -Depth 10 | Set-Content .arena-pilot/d1-before-private.json
```

**STOPP 0:** rätt konto/ägare, fullständig inventering, de skyddade resursernas URL:er/versions-ID:n, plan/CPU/D1-budget och begränsad pilotgrupp ska godkännas. Om GET misslyckas, saknar sidor eller visar oväntade resurser: ingen mutation. Spara skyddade Worker-versioner och välj oföränderliga befintliga försäljnings-/historikreferenser privat som före/efter-underlag. En aktiv Tvättligan kan få legitima nya försäljningar; totalrader kan därför inte ensamma bevisa påverkan.

## 3. Pilot-D1 finns redan – skapa inte igen

Operatören har verifierat D1 `8044ee1b-9185-4644-954f-d5455330a7a7` och installerat alla 13 migrationer. Fortsätt med read-only `Inspect` via [nästa-steg-runbooken](arena-pilot-next-steps.md). Ett fel senare i kedjan får aldrig leda till ny D1 eller automatisk migrationsomkörning. De tre skyddade äldre UUID:erna är fortsatt förbjudna. Codex har inte på nytt remote-verifierat operatörsuppgifterna.

## 4. Mailer, secrets och faktisk pilotconfig

**STOPP 2 – separat remote-godkännande för varje mailer-/secret-/senderändring.** Den separata Resend-implementationen för `arenan-mailer-pilot` är lokalt testad, men inte publicerad. Följ först `docs/arena-resend-mailer.md`. Ett service-namn skapar aldrig tjänsten. Ange en separat granskad service först när följande är klart:

- Service binding ARENA_MAILER ska acceptera intern POST `https://arena-mailer.internal/send`, JSON `{to,purpose,url}`; purpose verify/reset/invite. Returnera 2xx bara vid accepterad leverans. Inga råa token/länkar i loggar. Blockera obehörigt publikt anrop till tjänsten; använd intern tjänst utan publik route/workers.dev eller motsvarande verifierat skydd.
- Godkänd mailprovider, avsändaradress/domän, ev. leverantörsnyckel i **mailertjänstens** secret store, rätt leveransregion och godkända testmottagare. Ingen DNS/SPF/DKIM-ändring ingår; använd redan verifierad avsändare eller invänta separat beslut.
- Varje `wrangler secret put <PROVIDERNS_VERKLIGA_NYCKELNAMN> --config <MAILERNS_GRANSKADE_CONFIG>` och publicering av mailern har eget godkännande. Inga fiktiva nyckelnamn eller overifierad mailerkod ska köras från detta dokument.
- Arena-Worker behöver **inga delade ADMIN_PIN/ARENA_SUPERADMIN_SECRET/VAPID-secrets** i standalone-läge. Owner/stationslösenord, PIN och recovery hanteras hashat i pilot-D1. Cloudflare-token är operatörens, aldrig en Worker-secret. Appen konsumerar ingen direkt SMTP/API-nyckel.

```powershell
$Mailer = Read-Host 'Verifierad separat mailer-Worker/service i samma konto'
if (@(CFList "accounts/$Account/workers/scripts").id -notcontains $Mailer) { throw 'Mailer finns inte' }
$MailerArgs = @()
if ($Mailer -eq 'arenan-mailer-pilot') { $MailerArgs = @('--mailer-entrypoint', 'ArenaMailer') }
node scripts/arena-pilot-config.mjs --account-id $Account --arena-db $ArenaId --mailer $Mailer @MailerArgs
if ($LASTEXITCODE -ne 0) { throw 'Config nekad' }
function CheckPilot {
  node scripts/arena-release-preflight.mjs $Config --expected-worker $Pilot --expected-arena-db $ArenaId
  if ($LASTEXITCODE -ne 0) { throw 'Preflight nekad' }
  $c = Get-Content $Config -Raw | ConvertFrom-Json
  if ($c.account_id -ne $Account -or $env:CLOUDFLARE_ACCOUNT_ID -ne $Account -or $c.d1_databases[0].database_name -ne $Pilot) { throw 'Kontot/målet ändrat' }
  $d = (CF "accounts/$Account/d1/database/$ArenaId").result
  if ($d.uuid -ne $ArenaId -or $d.name -ne $Pilot) { throw 'Remote D1 matchar inte' }
}
CheckPilot
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build' }
W deploy --dry-run --config $Config --outdir .arena-pilot/dry-run
```

Generatorn skriver med `wx`: en befintlig config skrivs inte över. Granska och arkivera privat innan eventuell avsiktlig regenerering. **Configens absoluta lokala paths gäller aktuell checkout**; generera om lokalt på Windows, kopiera inte Linux-genererad config. Dry-run måste visa bara ARENA_DB, ARENA_MAILER, ASSETS och pilotens vars. `--config` är obligatorisk i VARJE Wrangler-kommando; explicit config kringgår .wrangler/deploy/config.json. Använd aldrig `npm run deploy`, `db:migrate:remote`, dist/*/wrangler.json eller standardconfigen här.

## 5. Privat backup FÖRE migration, och migrationsstopp

Den nyss skapade pilot-D1 ska vara tom. Spara privata backups utanför review/Git, begränsa Windows-ACL och kryptera. Även en read-only export kan skapa en D1-exportfil i Cloudflare och kräver därför eget godkännande här. Första backupen visar utgångsläget; före varje senare migration ska också en färsk backup tas.

```powershell
CheckPilot
$Backup = Read-Host 'Ny privat, krypterat lagrad backupfil, full sökväg .sql'
if (Test-Path $Backup) { throw 'Skriv inte över backup' }
Gate 'EXPORTERA-PILOT-BACKUP'
W d1 export ARENA_DB --remote --config $Config --output $Backup
Get-FileHash $Backup -Algorithm SHA256
W d1 execute ARENA_DB --remote --config $Config --command "SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name" --json
```

Verifiera exporten genom en **verklig import till ny lokal disponibel D1**. Endast betrodd operatörsägd export får läsas; SQL exekveras lokalt. Originalfilen bevaras. Ange backupens separat kontrollerade SHA-256:

```powershell
$BackupHash = Read-Host 'Tidigare verifierad SHA-256 för exakt denna backup'
node scripts/arena-pilot-restore-check.mjs --backup $Backup --expected-sha256 $BackupHash --allow-empty
if ($LASTEXITCODE -ne 0) { throw 'Restore INTE verifierad. STOPP.' }
```

Verktyget gör importen själv och godkänner inte en automatiskt skapad tom D1 som bevis. Det kontrollerar `quick_check` och `foreign_key_check` separat via D1, öppnar sedan **den faktiskt återställda** SQLite-filen read-only för full `integrity_check`, FK, schema- och radjämförelse. Ett grönt kvitto skrivs först när allt matchar. `--allow-empty` gäller första tomma piloten; utelämna det för framtida Arena-backups. Tillfällig återställnings-SQL raderas, privat lokal D1-state kvarstår under ignorerad `.arena-pilot/`.

**Varför föregående kontroll gav SQLITE_AUTH:** workerd tillåter inte `PRAGMA integrity_check`. Flera SQL-satser är inte orsaken. Felet bevisar varken att import kördes eller att backupen är korrupt. Ersätt inte full integritet med enbart `quick_check`.

**STOPP 3:** För den aktuella fasta piloten, använd följande steg i [nya körguiden](arena-pilot-finalization.md):

```powershell
.\scripts\arena-pilot-release.ps1 -Step Restore
.\scripts\arena-pilot-release.ps1 -Step Inspect
.\scripts\arena-pilot-release.ps1 -Step Migrate
```

`Migrate` kräver matchande backup/restore-kvitto, rätt konto, D1-UUID, tomt schema och uttryckligt godkännande. En partiell ledger eller ett tidigare misslyckat försök ger STOPP, inte automatisk omkörning. Alla 13 originalfiler verifieras före skrivning och exakt ledger samt separata D1 quick/FK-kontroller efteråt. Full fysisk integritetskontroll kan inte göras på remote D1 via SQL; full kontroll görs lokalt efter exporterad backup/restore. Export efter migration är en separat godkänd remote-operation enligt backupavsnittet ovan.

## 6. Owner före publicering

Besluta verklig Owner, individuell recovery-mejl, lösenord 12–256 tecken, offlineförvaring av recoverykoder och separat behörig infraoperatör. Ingen påhittad test-Owner i riktig pilot. Stäng terminaltranskription/skärmdelning före credentialinmatning. SQL-filen innehåller lösenordshash och är privat; verktyget sätter aldrig verifierad e-post automatiskt.

```powershell
$Email = Read-Host 'Owners verkliga godkända recovery-mejl'
$DisplayName = Read-Host 'Owners visningsnamn'
$Password = Read-Host 'Individuellt Owner-lösenord' -AsSecureString
$OwnerSql = Join-Path (Resolve-Path .arena-pilot) 'owner-bootstrap-private.sql'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  @{email=$Email; display_name=$DisplayName; password=[Net.NetworkCredential]::new('', $Password).Password} |
    ConvertTo-Json -Compress |
    node scripts/arena-owner-maintenance.mjs --mode bootstrap --environment $Pilot --confirm "ARENA $Pilot BOOTSTRAP" --output $OwnerSql --emit-only
  if ($LASTEXITCODE -ne 0) { throw 'Owner-SQL nekad' }
} finally { Remove-Variable Password }
```

Granska SQL privat med andra operatören och kontrollera single-Owner-guarden, målet och att email_verified_at=NULL. Vid haveri finns samma verktygs recover-läge; ingen publik bootstrap eller auth-bypass får läggas till.

```powershell
CheckPilot
Gate 'SKRIV-OWNER-I-PILOT-D1'
W d1 execute ARENA_DB --remote --config $Config --file $OwnerSql
Remove-Item $OwnerSql
```

## 7. Första Worker-publiceringen

Första `deploy` **skapar** pilot-Workern; det behövs inget separat Worker-create-kommando. Kontrollera precis före att namnet fortfarande är ledigt. Spara dry-run, confighash och den godkända checkpointen privat. Godkänn även kontots faktiska plan/CPU-budget för PBKDF2 600k och kort pilot, inga automatiska planändringar.

```powershell
CheckPilot
if (@(CFList "accounts/$Account/workers/scripts").id -contains $Pilot) { throw 'Worker finns redan: STOPP, separat uppdateringsbeslut krävs' }
Get-FileHash $Config -Algorithm SHA256
Gate 'PUBLICERA-NY-PILOT-WORKER'
W deploy --config $Config
W deployments list --name $Pilot --config $Config --json
```

Använd bara den verkliga workers.dev-URL som Wrangler returnerar. Inga antagna kontosubdomäner, custom domains, routes eller DNS-ändringar. Spara deployment-/version-ID. ARENA_MAILER måste redan finnas och fungera. Om den inte gör det: STOPP, deploya inte med lokal outbox eller ARENA_AUTH_DEV.

## 8. Owner, demo och skyddad Tvättligan

**STOPP 4:** godkänn vilka mottagare och syntetiska stationer som får skapas i den isolerade piloten. Varje mail/reset/invite/recovery-/testskrivning kräver uttryckligt tillstånd; nedanstående är acceptansordning, inte automatiska remote-skrivningar.

1. HTTPS root → /arena, deep-link refresh och statiska assets. Owner-login på `/arena/superadmin`; begär verkligt verifieringsmejl, konsumera länken och kontrollera engångsanvändning. Recovery-mejl måste vara verifierat före skyddade funktioner. Inga råa länkar får hämtas ur prod-DB för att kringgå mailern.
2. Generera och förvara recoverykoder offline efter nylig återautentisering. Verifiera reset/invite bara till godkänd mottagare; inga verkliga kundutskick.
3. Showtime: gå in via behörig presentation, alla scener, tillbaka till vanligt läge. Oförändrade ordinarie poäng/feed före/efter, inga demoskrivningar. Utloggad refresh ska neka presentationstillträde.
4. Två godkända syntetiska pilotstationer: signup → Owner approval → separat PIN → utmaning → accept → Battle båda → registrering/retry/undo → korrekt scoring/historik. Testa cross-tenant denial. Ändra inga riktiga stationer. Befintliga lokala regressionstester har verifierat dessa flöden.
5. Mät faktiska edgefel/CPU/D1 read/write och nätfördröjning. Liten pilot först; ingen 40-stationslansering utan nytt budgetbeslut. Fysisk kassaskärm/touch och verklig utskrift återstår manuellt.
6. Läs varje skyddad Workers settings/version igen och jämför privat med inventeringen. Bekräfta att dessa fortfarande binder exakt sina tidigare D1-UUID:er, ingen ny deployment har skapats av oss, befintliga URL:er/login fungerar och valda frysta historikreferenser är identiska. Avgränsa legitima parallella försäljningar. Läs bara, migrera/rätta inget i Tvättligan/stationsdashboard.
7. Kontrollera appbranch/HEAD/clean igen. Ta bort API-token ur sessionen: `Remove-Item Env:CLOUDFLARE_API_TOKEN`. Lägg inga SQL-/D1-/cookie-/token-/kunddata i reviewmaterial.

## 9. Rollback – eget beslut vid VARJE remote-ändring

Ny isolerad pilot har **ingen tidigare Worker-version** att rulla tillbaka till vid första deploy. Stoppa åtkomst/nya registreringar; bevara privata diagnoser och backup. Separat godkännande före avpublicering/radering av endast pilot-Workern:

```powershell
CheckPilot
Gate 'AVPUBLICERA-ENDAST-PILOT-WORKER'
W delete $Pilot --config $Config
```

Detta tar inte bort pilot-D1. Behåll den för analys; ingen automatisk DB-radering. Mailern och Tvättligan får inte följa med i delete-steget. Vid senare deployment finns sparad tidigare kompatibel version; granska bindings/secrets innan eget rollbackgodkännande:

```powershell
CheckPilot
$PreviousVersion = Read-Host 'Verifierat kompatibelt tidigare pilot-version-ID'
Gate 'ROLLBACK-ENDAST-PILOT-KOD'
W rollback $PreviousVersion --name $Pilot --config $Config
```

Kodrollback återställer inte data. Vid DB-problem: inga DROP/downmigrationer. Godkänn separat skapande av **ännu en ny** pilot-restore-D1 (eget namn/UUID), återläs privat backup dit med separat importgodkännande, validera lokalt först och därefter remote schema/FK/frysta resultat. Hantera försäljningar efter backuptiden och återkalla sessioner/länkar vid säkerhetshändelse. Nytt bindnings-/deploygodkännande innan pilot-Workern pekas om; Tvättligan-bindningar får aldrig beröras. EU Time Travel-retention/bokmärke ska läsas i faktiska kontot och sparas före senare migreringar, inte antas. Ingen DNS-rollback behövs: detta flöde gör inga DNS-ändringar.

## 10. Klart respektive faktiskt kvar

Lokalt klart: separat fail-closed mall/generator, alla tre kända D1 skyddade, endast ARENA_DB, lokalt repeterad oförändrad migrationskedja, typkontroll/build/tester, CSV-rubrikfix och Unicode/escaping-regression, kontrollerad dry-run samt denna körordning.

Innan publicering kvar: fungerande Cloudflare-autentisering + konto/inventering/plan, godkänt ledigt Worker-namn, faktiskt ny pilot-D1/UUID, verifierad mailer med provider/sender/secret och riktig leverans, privat målbackup/restore, godkända migration-/Owner-/deploysteg och edge/Owner/demo/Tvättligan-smoke. Dessa är konkreta remote-/operatörssteg, inte ytterligare en planerad apputvecklingsrunda. Resursernas nuvarande existens kan inte intygas med den avvisade token; inga nya resurser har skapats av detta pass.
