#Requires -Version 5.1
param(
  [string]$BackupPath = '',
  [string]$SchedulePath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$branch = 'feat/station-dashboard-v2'
$baseCommit = '43e8700'
$databaseId = '695033b7-6bb2-47a3-a9c3-08d4ca818088'
$baseUrl = 'https://tvattligan.peter-malmstrom.workers.dev'
$approvedCsvHash = '3F07FA2779C8AFB41BDAABC14A276AD58FF1235882758116FC798B3D5C1501DF'
$approvedCsvName = 'preem_tingsryd_oktober_2026_IMPORT_KLAR.csv'
$deployStarted = $false
$oldTables = [ordered]@{
  sales = 'id'
  sales_audit = 'CAST(id AS TEXT)'
  staff = 'id'
  wash_programs = 'id'
  push_subscriptions = 'id'
  notification_events = 'id'
  station_store_daily_sales = "station_id || '|' || business_date"
  station_view_sessions = 'token_hash'
}

function Stop-Launch([string]$Message) { throw $Message }
function Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Run([string]$Program, [string[]]$Arguments, [string]$Label) {
  $errorFile = [IO.Path]::GetTempFileName()
  try {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = @(& $Program @Arguments 2> $errorFile) }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) {
      Stop-Launch "$Label misslyckades (avslutskod $LASTEXITCODE). Kontrollera behörighet, nätverk och lokal konfiguration. Inga hemliga CLI-utdata visas."
    }
    return ($output -join "`n")
  } finally { Remove-Item -LiteralPath $errorFile -ErrorAction SilentlyContinue }
}
function Command-Path([string]$Name) {
  $found = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $found) { Stop-Launch "Verktyget $Name saknas. Installera det innan lanseringen." }
  return $found.Source
}
function Query([string]$Sql) {
  $raw = Run $script:npx @('wrangler','d1','execute','tvattligan','--remote','--config','wrangler.jsonc','--command',$Sql,'--json') 'Läsning av produktions-D1'
  try { $data = ConvertFrom-Json -InputObject $raw }
  catch { Stop-Launch 'Wrangler returnerade inte giltig D1-JSON. Stoppa lanseringen.' }
  $entry = if ($data -is [array]) { $data[0] } else { $data }
  if (-not $entry -or $entry.success -ne $true -or $null -eq $entry.results) {
    Stop-Launch 'D1-frågan lyckades inte eller saknar resultat. Stoppa lanseringen.'
  }
  return @($entry.results)
}
function Check-PrivateFile([string]$Path, [string]$Label) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Stop-Launch "$Label saknas. Ange en befintlig privat fil utanför Git-katalogen."
  }
  $full = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  if ($full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Launch "$Label ligger i repositoryt. Flytta den till en privat katalog utanför Git."
  }
  return $full
}
function Check-Git {
  $current = (Run $script:git @('branch','--show-current') 'Git-gren').Trim()
  if ($current -ne $branch) { Stop-Launch "Fel Git-gren: $current. Kräver $branch." }
  $head = (Run $script:git @('rev-parse','HEAD') 'Git-revision').Trim()
  if (-not [regex]::IsMatch($head, '^[0-9a-f]{40}$')) { Stop-Launch 'Git-revisionen kunde inte verifieras.' }
  $null = Run $script:git @('merge-base','--is-ancestor',$baseCommit,'HEAD') 'V2-basrevision'
  $status = Run $script:git @('status','--porcelain') 'Ren arbetskatalog'
  if ($status.Trim()) { Stop-Launch 'Arbetskatalogen är inte ren. Stoppa och granska lokala ändringar.' }
  $remote = (Run $script:git @('ls-remote','--exit-code','origin',"refs/heads/$branch") 'GitHub-revision').Trim().Split([char]9)[0]
  if ($head -ne $remote) { Stop-Launch 'Lokal revision avviker från senaste pushade V2-grenen. Hämta och granska den före lansering.' }
  Info "Git-gren och pushad commit verifierade: $head"
}
function Check-Database {
  $integrity = @(Query 'PRAGMA integrity_check')
  if ($integrity.Count -ne 1 -or $integrity[0].integrity_check -ne 'ok') { Stop-Launch 'D1:s integritetskontroll misslyckades.' }
  if (@(Query 'PRAGMA foreign_key_check').Count -ne 0) { Stop-Launch 'D1 innehåller främmande nyckelfel.' }
  $applied = @(Query 'SELECT name FROM d1_migrations ORDER BY id' | ForEach-Object { $_.name })
  $local = @(Get-ChildItem -LiteralPath (Join-Path $root 'migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object { $_.Name })
  if ($local.Count -ne 6 -or $applied.Count -ne $local.Count) { Stop-Launch 'Migreringshistoriken avviker: exakt 0001–0006 ska vara installerade.' }
  for ($i = 0; $i -lt $local.Count; $i++) {
    if ($local[$i] -ne $applied[$i]) { Stop-Launch "Migrationerna har fel ordning eller saknas vid position $($i + 1)." }
  }
  if ($applied[4] -ne '0005_station_dashboard_v2.sql' -or $applied[5] -ne '0006_station_monthly_figures.sql') {
    Stop-Launch 'Migration 0005 eller 0006 är inte installerad i rätt ordning.'
  }
  $tables = @(Query "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('station_schedule_periods','station_shifts','station_tasks','station_task_write_limits','station_notices','station_monthly_figures')" | ForEach-Object { $_.name })
  if ($tables.Count -ne 6) { Stop-Launch 'En eller flera nya V2-tabeller saknas.' }
  $columnSpecs = [ordered]@{
    station_shifts = @('id','period_id','work_date','first_name','starts_at','ends_at','status','revision')
    station_schedule_periods = @('id','station_id','starts_on','ends_on')
    station_notices = @('id','expires_time')
    station_monthly_figures = @('station_id','month','metrics_json')
  }
  foreach ($table in $columnSpecs.Keys) {
    $found = @(Query "PRAGMA table_info($table)" | ForEach-Object { $_.name })
    foreach ($column in $columnSpecs[$table]) { if ($found -notcontains $column) { Stop-Launch "Kolumnen $column saknas i $table." } }
  }
  foreach ($table in $oldTables.Keys) {
    $expression = $oldTables[$table]
    $live = @(Query "SELECT $expression AS key FROM $table")
    $liveKeys = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($row in $live) { [void]$liveKeys.Add([string]$row.key) }
    $before = @($script:baseline.PSObject.Properties[$table].Value)
    foreach ($key in $before) {
      if (-not $liveKeys.Contains([string]$key)) {
        Stop-Launch "Minst en tidigare rad saknas i $table jämfört med backupen. Stoppa lanseringen."
      }
    }
    if ($live.Count -lt $before.Count) { Stop-Launch "Radantalet i $table har minskat jämfört med backupen." }
    Info "$table`: $($live.Count) rader, alla $($before.Count) backuprader kvar."
  }
  Info 'D1-integritet, V2-schema, migrationer och befintliga rader verifierade.'
}
function Check-WeatherPaused {
  $source = Get-Content -LiteralPath (Join-Path $root 'src\StationDashboardV2.tsx') -Raw -Encoding UTF8
  if ($source -notmatch '(?m)^const WEATHER_ENABLED = false;\s*$' -or
      $source -notmatch 'if \(!WEATHER_ENABLED\) return;') {
    Stop-Launch 'Väderflaggan eller stoppet för automatiska anrop avviker från granskad V2-kod.'
  }
  Info 'Väderflaggan är avstängd i klientkoden.'
}
function Minute([string]$Time) { return ([int]$Time.Substring(0,2) * 60 + [int]$Time.Substring(3,2)) }
function Collision($Left, $Right) {
  if ($Left.first_name.Trim().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant() -ne
      $Right.first_name.Trim().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()) { return '' }
  if ($Left.work_date -eq $Right.work_date -and $Left.starts_at -eq $Right.starts_at -and $Left.ends_at -eq $Right.ends_at) { return 'dubblett' }
  if ($Left.status -ne 'active' -or $Right.status -ne 'active') { return '' }
  $a = [datetime]::ParseExact($Left.work_date,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
  $b = [datetime]::ParseExact($Right.work_date,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
  $aStart = $a.AddMinutes((Minute $Left.starts_at)); $aEnd = $a.AddMinutes((Minute $Left.ends_at))
  $bStart = $b.AddMinutes((Minute $Right.starts_at)); $bEnd = $b.AddMinutes((Minute $Right.ends_at))
  if ($Left.ends_at -lt $Left.starts_at) { $aEnd = $aEnd.AddDays(1) }
  if ($Right.ends_at -lt $Right.starts_at) { $bEnd = $bEnd.AddDays(1) }
  if ($aStart -lt $bEnd -and $bStart -lt $aEnd) { return 'överlapp' }
  return ''
}
function Check-Schedule {
  if ((Get-Item -LiteralPath $SchedulePath).Length -gt 2000000) { Stop-Launch 'CSV-filen är för stor.' }
  $firstLine = (Get-Content -LiteralPath $SchedulePath -TotalCount 1 -Encoding UTF8).TrimStart([char]0xFEFF).TrimEnd([char]13)
  if ($firstLine -ne 'datum,förnamn,start,slut,status') { Stop-Launch 'CSV-rubriken ska vara exakt datum,förnamn,start,slut,status.' }
  $raw = @(Import-Csv -LiteralPath $SchedulePath -Delimiter ',' -Encoding UTF8)
  if ($raw.Count -ne 111) { Stop-Launch "CSV innehåller $($raw.Count) rader; exakt 111 förväntas." }
  $script:shifts = @()
  for ($i = 0; $i -lt $raw.Count; $i++) {
    $r = $raw[$i]
    $day = [string]$r.datum; $name = [string]$r.'förnamn'
    $start = [string]$r.start; $end = [string]$r.slut
    $status = [string]$r.status
    if (-not $status.Trim()) { $status = 'active' }
    $status = $status.Trim()
    $parsedDay = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($day,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$parsedDay) -or
        $day -lt '2026-10-01' -or $day -gt '2026-10-31' -or
        $name.Length -gt 60 -or $name.Trim() -cnotmatch "^\p{L}[\p{L} .'-]*$" -or
        $start -cnotmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$' -or
        $end -cnotmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$' -or $start -eq $end -or
        $status -cnotin @('active','cancelled','leave','sick')) {
      Stop-Launch "CSV-rad $($i + 2) har ogiltigt datum, namn, tid eller status."
    }
    $row = [pscustomobject]@{ work_date=$day; first_name=$name.Trim(); starts_at=$start; ends_at=$end; status=$status }
    foreach ($prior in $script:shifts) {
      $conflict = Collision $row $prior
      if ($conflict) { Stop-Launch "CSV-rad $($i + 2) har $conflict mot en annan rad i filen." }
    }
    $script:shifts += $row
  }
  $existing = @(Query "SELECT s.work_date,s.first_name,s.starts_at,s.ends_at,s.status FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-09-30' AND '2026-11-01'")
  foreach ($row in $script:shifts) {
    foreach ($prior in $existing) {
      $conflict = Collision $row $prior
      if ($conflict) { Stop-Launch "CSV har $conflict mot ett befintligt pass. Ingen import görs." }
    }
  }
  $octoberCount = @(Query "SELECT COUNT(*) AS n FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31'")
  $script:beforeOctober = [int]$octoberCount[0].n
  $script:csvHash = (Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash
  if ($script:csvHash -ne $approvedCsvHash) {
    Stop-Launch 'CSV-filen är inte den godkända bilagan (SHA-256 avviker). Ingen import görs.'
  }
  Info "Privat oktoberfil verifierad: 111 rader, inga dubbletter eller aktiva överlapp. Befintliga oktoberrader: $beforeOctober."
  Write-Host 'Förhandsgranskning på den här datorn (lägg inte terminalutskriften i Git eller chatt):'
  $script:shifts | Sort-Object work_date,starts_at,first_name | Format-Table work_date,first_name,starts_at,ends_at,status -AutoSize | Out-Host
  Write-Host 'Granska namn, tider, nattpass, frånvaro och höstens klockomställning mot godkänd källa.'
}
function Http-Status([string]$Url) {
  try { return [int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20).StatusCode }
  catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    Stop-Launch "HTTP-kontroll mot $Url misslyckades utan svar."
  }
}
function Check-Protected([string]$Path) {
  try { $response = Invoke-WebRequest -Uri "$baseUrl$Path" -UseBasicParsing -TimeoutSec 20 }
  catch {
    $response = $_.Exception.Response
    if (-not $response) { Stop-Launch "Skyddat API $Path svarade inte." }
  }
  if ([int]$response.StatusCode -ne 401 -or [string]$response.Headers['Cache-Control'] -notmatch 'no-store') {
    Stop-Launch "Behörighet eller Cache-Control är fel för $Path. Stoppa."
  }
}

try {
  Set-Location $root
  $git = Command-Path 'git.exe'; $node = Command-Path 'node.exe'
  $npm = Command-Path 'npm.cmd'; $npx = Command-Path 'npx.cmd'
  Info 'Startar V2-lansering. Ingen migration eller backupåterställning körs.'
  Check-Git
  $configText = Get-Content -LiteralPath (Join-Path $root 'wrangler.jsonc') -Raw -Encoding UTF8
  $config = ($configText -replace '(?m)^\s*//.*$','' -replace ',(\s*[}\]])','$1') | ConvertFrom-Json
  if ($config.name -ne 'tvattligan' -or $config.main -ne 'worker/index.ts' -or
      @($config.d1_databases).Count -ne 1 -or $config.d1_databases[0].binding -ne 'DB' -or
      $config.d1_databases[0].database_name -ne 'tvattligan' -or
      $config.d1_databases[0].database_id -ne $databaseId) {
    Stop-Launch 'Wrangler-konfigurationen pekar inte på den godkända produktions-Workern och D1-databasen.'
  }
  $who = Run $npx @('wrangler','whoami','--config','wrangler.jsonc','--json') 'Cloudflare-inloggning'
  try { $null = ConvertFrom-Json -InputObject $who }
  catch { Stop-Launch 'Cloudflare-inloggningen kunde inte verifieras som JSON.' }
  Info "Cloudflare-inloggning finns; fjärrläsning av det fasta D1-ID:t $databaseId verifierar kontot."
  $pending = Run $npx @('wrangler','d1','migrations','list','tvattligan','--remote','--config','wrangler.jsonc') 'Kontroll av väntande migrationer'
  if ($pending -match '000[0-9]_[A-Za-z0-9_-]+\.sql') { Stop-Launch 'Wrangler visar väntande migrationer. Stoppa; inga migrationer körs automatiskt.' }
  if (-not $BackupPath) {
    $backupDirectory = Join-Path $env:USERPROFILE 'Documents\StationV2Private'
    $candidate = Get-ChildItem -LiteralPath $backupDirectory -Filter 'tvattligan-before-v2-*.sql' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { $BackupPath = $candidate.FullName; Info "Hittade privat backup: $BackupPath" }
    else { $BackupPath = Read-Host 'Sökväg till redan verifierad privat D1-backup (.sql)' }
  }
  $BackupPath = Check-PrivateFile $BackupPath 'Backupen'
  $backupHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash
  $backupCheck = Run $node @('scripts/verify-d1-backup.mjs',$BackupPath) 'Verifiering av privat backup'
  $backupInfo = ConvertFrom-Json -InputObject $backupCheck
  if ($backupInfo.verified -ne $true -or $backupInfo.sha256.ToUpperInvariant() -ne $backupHash) { Stop-Launch 'Backupens integritet eller SHA-256 avviker.' }
  $baselineJson = Run $node @('scripts/station-v2-backup-keys.mjs',$BackupPath) 'Läsning av backuprader'
  $baseline = ConvertFrom-Json -InputObject $baselineJson
  Info "Backup verifierad: $($backupInfo.bytes) byte. Nycklar stannar i minnet och visas inte."
  Check-Database
  Check-WeatherPaused
  if (-not $SchedulePath) {
    foreach ($folder in @((Join-Path $env:USERPROFILE 'Downloads'), (Join-Path $env:USERPROFILE 'Documents'), (Join-Path $env:USERPROFILE 'Desktop'))) {
      $candidate = Join-Path $folder $approvedCsvName
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { $SchedulePath = $candidate; break }
    }
    if ($SchedulePath) { Info 'Hittade den godkända oktoberfilen på datorn.' }
    else { $SchedulePath = Read-Host "Sökväg till bilagan $approvedCsvName (spara den privat, t.ex. i Hämtade filer)" }
  }
  $SchedulePath = Check-PrivateFile $SchedulePath 'Oktober-CSV'
  Check-Schedule
  Info 'Installerar låsta npm-paket och kör kontroller före publicering.'
  $null = Run $npm @('ci') 'npm ci'
  $null = Run $npx @('playwright','install','chromium') 'Installation av Chromium för test'
  $null = Run $npm @('run','typecheck') 'TypeScript-kontroll'
  $null = Run $npm @('test') 'Enhetstester'
  $null = Run $npm @('run','test:e2e') 'Playwright-tester'
  $null = Run $npm @('run','build') 'Produktionsbuild'
  Info 'TypeScript, enhetstester, Playwright och produktionsbuild passerade.'
  Check-Git
  Check-WeatherPaused
  Check-Database
  if ((Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -ne $backupHash -or
      (Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash -ne $csvHash) {
    Stop-Launch 'Backupen eller CSV-filen ändrades under förkontrollen.'
  }
  Info 'Alla förkontroller passerade. Produktions-Workern är fortfarande oförändrad.'
  $publish = Read-Host 'Skriv PUBLICERA V2 för att publicera till produktion; Enter avbryter'
  if ($publish -cne 'PUBLICERA V2') { Info 'Publicering avbruten på användarens begäran.'; exit 0 }
  $deployStarted = $true
  $null = Run $npx @('wrangler','deploy','--config','wrangler.jsonc') 'Publicering av V2'
  Info 'V2 publicerad. Kör läsande efterkontroller; ingen schemaimport har gjorts.'
  foreach ($path in @('/','/station','/api/staff','/api/wash-programs','/api/stats','/api/push/public-key')) {
    if ((Http-Status "$baseUrl$path") -ne 200) { Stop-Launch "Efterkontrollen misslyckades för $path. Stoppa och granska produktionen." }
  }
  $push = Invoke-RestMethod -Uri "$baseUrl/api/push/public-key" -TimeoutSec 20
  if (@($baseline.push_subscriptions).Count -gt 0 -and $push.configured -ne $true) {
    Stop-Launch 'Pushprenumerationer finns, men produktionsnycklarna saknas efter publicering.'
  }
  foreach ($path in @('/api/station/dashboard','/api/station/v2','/api/admin/station/v2/schedule')) {
    Check-Protected $path
  }
  Check-Database
  Info 'Tvättligans läsande API:er fungerar och skyddade API:er nekar oinloggade anrop.'
  $securePin = Read-Host 'Ange admin-PIN för skyddad dashboardkontroll och valfri schemaimport' -AsSecureString
  if (-not $securePin -or $securePin.Length -eq 0) {
    Stop-Launch "Adminåtkomst saknas. Publicering är gjord; kontrollera /station/admin manuellt och importera CSV där efter förhandsgranskning."
  }
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)
  try { $pin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  try {
    $loginBody = @{pin=$pin} | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "$baseUrl/api/admin/login" -Method Post -ContentType 'application/json; charset=utf-8' -Body $loginBody -WebSession $session -TimeoutSec 20
  } catch { Stop-Launch "Admininloggningen misslyckades. Publicering är gjord; kontrollera PIN och /station/admin manuellt. Inga pass importerades." }
  finally { $pin = $null; $loginBody = $null }
  $dashboard = Invoke-RestMethod -Uri "$baseUrl/api/station/dashboard" -WebSession $session -TimeoutSec 20
  $overview = Invoke-RestMethod -Uri "$baseUrl/api/station/v2" -WebSession $session -TimeoutSec 20
  if (-not $dashboard.business_date -or -not $dashboard.comparison_date -or -not $overview.today) {
    Stop-Launch 'Skyddad dashboard returnerade inte förväntade V2-fält.'
  }
  $adminCookie = $session.Cookies.GetCookies([uri]"$baseUrl/api/station/dashboard")['tvattligan_session']
  if (-not $adminCookie) { Stop-Launch 'Admincookie saknas. Webbläsarkontroll och import stoppas.' }
  $smokeInput = @{baseUrl=$baseUrl;sessionCookie=$adminCookie.Value} | ConvertTo-Json -Compress
  $smoke = $smokeInput | & $node 'scripts/station-v2-live-smoke.mjs' 2>$null
  $smokeInput = $null
  if ($LASTEXITCODE -ne 0) { Stop-Launch 'Den verkliga webbläsarkontrollen misslyckades. Ingen import görs; granska dashboard och väderanrop.' }
  Info ($smoke -join "`n")
  Check-Schedule
  if ((Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash -ne $csvHash) { Stop-Launch 'CSV-filen ändrades efter förhandsgranskningen.' }
  $import = Read-Host 'Skriv IMPORTERA 111 PASS för att lägga till schemat; Enter stoppar före import'
  if ($import -cne 'IMPORTERA 111 PASS') {
    Info 'Schemat importerades inte. Gå till /station/admin för manuell import och kontroll.'
    exit 0
  }
  $payload = @{label='Oktober 2026';starts_on='2026-10-01';ends_on='2026-10-31';shifts=$shifts} | ConvertTo-Json -Depth 8 -Compress
  try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/admin/station/v2/schedule/import" -Method Post -ContentType 'application/json; charset=utf-8' -Body $payload -WebSession $session -TimeoutSec 60
  } catch { Stop-Launch 'Serverimporten misslyckades eller svaret uteblev. Kontrollera /station/admin innan något nytt försök; ingen automatisk återställning görs.' }
  if ($result.imported -ne 111 -or $result.period_id -notmatch '^[0-9a-f-]{36}$') {
    Stop-Launch 'Importsvaret är oväntat. Kontrollera perioden i /station/admin innan nytt försök.'
  }
  $importedRows = @(Query "SELECT work_date,first_name,starts_at,ends_at,status FROM station_shifts WHERE period_id='$($result.period_id)'")
  if ($importedRows.Count -ne 111) { Stop-Launch 'Efterkontroll: antalet importerade pass är inte 111.' }
  $expected = @($shifts | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
  $actual = @($importedRows | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
  for ($i = 0; $i -lt 111; $i++) { if ($expected[$i] -cne $actual[$i]) { Stop-Launch 'Efterkontroll: importerade pass skiljer sig från den privata CSV-filen.' } }
  $octoberCount = @(Query "SELECT COUNT(*) AS n FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31'")
  $afterOctober = [int]$octoberCount[0].n
  if ($afterOctober -ne $beforeOctober + 111) { Stop-Launch 'Efterkontroll: oktobers radantal ökade inte med exakt 111.' }
  $todayOverview = Invoke-RestMethod -Uri "$baseUrl/api/station/v2" -WebSession $session -TimeoutSec 20
  if ($todayOverview.today -ge '2026-10-01' -and $todayOverview.today -le '2026-10-31') {
    foreach ($row in @($shifts | Where-Object { $_.work_date -eq $todayOverview.today -and $_.status -eq 'active' })) {
      $match = @($todayOverview.shifts | Where-Object {
        $_.first_name -ceq $row.first_name -and $_.starts_at -eq $row.starts_at -and $_.ends_at -eq $row.ends_at
      })
      if ($match.Count -lt 1) { Stop-Launch 'Efterkontroll: ett aktivt pass för dagens datum saknas i dashboardens API.' }
    }
  }
  Check-Database
  Info "KLART: V2 är publicerad och 111 pass importerade/verifierade i perioden $($result.period_id). Kontrollera Idag jobbar och push på en avsedd enhet."
} catch {
  Write-Host "STOPP: $($_.Exception.Message)" -ForegroundColor Red
  if ($deployStarted) {
    Write-Host 'Publicering kan ha skett. Kontrollera produktionsstatus och /station/admin innan omstart eller nytt importförsök. Ingen migration eller automatisk återställning har körts.' -ForegroundColor Yellow
  } else {
    Write-Host 'Ingen publicering, migration eller automatisk databasåterställning har körts.' -ForegroundColor Yellow
  }
  exit 1
}
