# ARENAN – isolerad VD-pilot, kontrollerad Windows-release

Denna körordning är för **senare uttryckligen godkända** remote-steg. Inget remote-steg har körts i förberedelsepasset. Använd PowerShell 7, Node >=22.13 och projektets låsta npm-installation. Kör blocken ett i taget; ett inmatat GODKÄNN är operatörens godkännande, aldrig något som agenten fyller i automatiskt.

## 1. Identiteter och nuläge

| Resurs | Lokalt belagt namn / UUID | Hantering |
|---|---|---|
| Tvättligan Worker | `tvattligan` | Skyddad; inga ändringar |
| Tvättligan D1 / DB | `tvattligan` / `695033b7-6bb2-47a3-a9c3-08d4ca818088` | Skyddad |
| Integrerad MASTER Worker | `tvattligan-master-test` | Skyddad |
| MASTER D1 / DB | `stationmastertest` / `ca2d4bb8-0c28-47b7-9514-8c893ea47c09` | Skyddad; migrations-master |
| Integrerad Arena / ARENA_DB | `arena-master-test` / `767b5a12-6b40-4516-9f7c-e072c1130480` | Skyddad; får inte återanvändas |
| Ny pilot-Worker | `arenan-pilot-vd-20261019` | Föreslagen, inte skapad av detta pass |
| Ny pilot-D1 | `arenan-pilot-vd-20261019` | Föreslagen, UUID saknas tills ny resurs skapats |
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

## 3. Skapa endast NY pilot-D1

Resursconfigen nedan används bara för D1-skapandet. Den saknar databasbindning och app-entry och kan inte publicera appen. `d1 create` har inget --json-stöd i låst Wrangler; läs dess faktiska UUID i svaret. EU-jurisdiktion är ett explicit val att godkänna, inte en påstådd befintlig placering.

```powershell
@{ name=$Pilot; account_id=$Account; compatibility_date='2026-10-07' } | ConvertTo-Json | Set-Content -Encoding ascii .arena-pilot/resource-only.json
Gate 'SKAPA-NY-PILOT-D1'
W d1 create $Pilot --jurisdiction eu --update-config=false --config .arena-pilot/resource-only.json
$ArenaId = Read-Host 'Kopiera UUID från JUST DEN NYSKAPADE pilot-D1-resursen'
$db = (CF "accounts/$Account/d1/database/$ArenaId").result
if ($db.uuid -ne $ArenaId -or $db.name -ne $Pilot) { throw 'Fel D1-identitet' }
```

**STOPP 1:** granska skapandesvaret och matcha exakt konto/namn/UUID. Denna nya UUID får aldrig ersättas med någon av tabellens tre skyddade UUID:er. Återuppta inte create-blocket vid fel senare; använd den sparade verifierade UUID:n.

## 4. Mailer, secrets och faktisk pilotconfig

**STOPP 2 – separat remote-godkännande för varje mailer-/secret-/senderändring.** Appen har inget provider-specifikt mailerbygge; det får inte antas att ett service-namn i config skapar en fungerande tjänst. Ange en separat granskad service först när följande är klart:

- Service binding ARENA_MAILER ska acceptera intern POST `https://arena-mailer.internal/send`, JSON `{to,purpose,url}`; purpose verify/reset/invite. Returnera 2xx bara vid accepterad leverans. Inga råa token/länkar i loggar. Blockera obehörigt publikt anrop till tjänsten; använd intern tjänst utan publik route/workers.dev eller motsvarande verifierat skydd.
- Godkänd mailprovider, avsändaradress/domän, ev. leverantörsnyckel i **mailertjänstens** secret store, rätt leveransregion och godkända testmottagare. Ingen DNS/SPF/DKIM-ändring ingår; använd redan verifierad avsändare eller invänta separat beslut.
- Varje `wrangler secret put <PROVIDERNS_VERKLIGA_NYCKELNAMN> --config <MAILERNS_GRANSKADE_CONFIG>` och publicering av mailern har eget godkännande. Inga fiktiva nyckelnamn eller overifierad mailerkod ska köras från detta dokument.
- Arena-Worker behöver **inga delade ADMIN_PIN/ARENA_SUPERADMIN_SECRET/VAPID-secrets** i standalone-läge. Owner/stationslösenord, PIN och recovery hanteras hashat i pilot-D1. Cloudflare-token är operatörens, aldrig en Worker-secret. Appen konsumerar ingen direkt SMTP/API-nyckel.

```powershell
$Mailer = Read-Host 'Verifierad separat mailer-Worker/service i samma konto'
if (@(CFList "accounts/$Account/workers/scripts").id -notcontains $Mailer) { throw 'Mailer finns inte' }
node scripts/arena-pilot-config.mjs --account-id $Account --arena-db $ArenaId --mailer $Mailer
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

Verifiera exporten genom återläsning i **lokal disponibel D1** (inget remote-restoremål behövs för första tomma piloten). Läs inte dumpen i produktion. Använd endast egen betrodd export; verktyget exekverar SQL lokalt i minnet. Originalexporten bevaras. D1-exportens tabell-/dataradordning kan annars ge `no such table` vid direkt import; verifieraren kontrollerar FK/integritet och skapar alla tabeller före data samt triggers sist. `--allow-empty` gäller första tomma piloten, inte framtida backup där Arena-tabeller ska finnas. Kör `node scripts/arena-pilot-config.mjs --local` en gång och därefter:

```powershell
$Restore = "$Backup.verified-restore.sql"
node scripts/arena-pilot-backup.mjs $Backup --restore-output $Restore --allow-empty
if ($LASTEXITCODE -ne 0) { throw 'Backup underkänd' }
W d1 execute ARENA_DB --local --config .arena-pilot/local.json --persist-to .arena-pilot/backup-check --file $Restore
W d1 execute ARENA_DB --local --config .arena-pilot/local.json --persist-to .arena-pilot/backup-check --command "PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" --json
```

**STOPP 3:** verifiera lyckad restore, schema/integritet/FK samt att remote är tomt utan oväntad affärsdata. D1:s eventuella interna metadata är inte affärsdata. Om schemat redan har Arena-tabeller eller ledger från en tidigare körning: STOPP och jämför backup, originalmigrationschecksummor och ledger före fortsatt separat beslut. Ingen import från stationsdatabaser. Lokal 0001–0013-installation, omkörning, privat export/restore och syntetiska rader har redan repeterats i detta pass.

```powershell
CheckPilot
W d1 migrations list ARENA_DB --remote --config $Config
Gate 'MIGRERA-ENDAST-NY-PILOT-ARENA-DB'
W d1 migrations apply ARENA_DB --remote --config $Config
W d1 execute ARENA_DB --remote --config $Config --command "SELECT name FROM d1_migrations ORDER BY id; PRAGMA integrity_check; PRAGMA foreign_key_check" --json
```

Kontrollera 0001–0013 exakt en gång, integrity=ok och inga FK-fel. Ingen DB-bindning finns att migrera. Hämta inte eller applicera migrations-master.

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
