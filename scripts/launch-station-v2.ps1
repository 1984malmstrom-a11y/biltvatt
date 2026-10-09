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
$launchLocked = $false
$snapshotPath = ''
$oldTables = [ordered]@{
  sales = 'id'
  sales_audit = 'CAST(id AS TEXT)'
  staff = 'id'
  wash_programs = 'id'
  push_subscriptions = 'id'
  notification_events = 'id'
  station_store_daily_sales = "station_id || '|' || business_date"
  station_store_sales_audit = 'CAST(id AS TEXT)'
  station_schedule_periods = 'id'
  station_shifts = 'id'
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
function Run-UnitTests {
  $reportPath = Join-Path ([IO.Path]::GetTempPath()) ("station-v2-vitest-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    try {
      $null = Run $script:npm @('test','--','--reporter=json',"--outputFile=$reportPath") 'Enhetstester'
    } catch {
      $runFailure = $_.Exception.Message
      $failedNames = @()
      if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
        try {
          $report = Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
          $knownFiles = @(Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter '*.test.ts' -File | ForEach-Object { $_.Name })
          foreach ($suite in @($report.testResults)) {
            $file = [IO.Path]::GetFileName([string]$suite.name)
            if ($knownFiles -notcontains $file) { continue }
            foreach ($test in @($suite.assertionResults)) {
              if ($test.status -ne 'failed') { continue }
              # Only test names from tracked test files are shown. Failure messages and
              # captured stdout/stderr may contain secrets and are never displayed.
              $name = ([string]$test.fullName -replace '[\r\n\t]', ' ').Trim()
              if ($name.Length -gt 140) { $name = $name.Substring(0, 140) + '…' }
              if ($name) { $failedNames += "$file`: $name" }
              if ($failedNames.Count -ge 5) { break }
            }
            if ($failedNames.Count -ge 5) { break }
          }
        } catch { $failedNames = @() }
      }
      if ($failedNames.Count -gt 0) {
        Stop-Launch "$runFailure Misslyckade test: $($failedNames -join '; '). Felutskrifter och privata värden visas inte."
      }
      Stop-Launch "$runFailure Vitest gav ingen läsbar felrapport. Felutskrifter och privata värden visas inte."
    }
  } finally {
    Remove-Item -LiteralPath $reportPath -ErrorAction SilentlyContinue
  }
}
function Run-PlaywrightTests {
  $raw = Run $script:node @('scripts/run-isolated-e2e.mjs') 'Isolerade Playwright-tester'
  try { $report = ConvertFrom-Json -InputObject $raw }
  catch { Stop-Launch 'Playwright-körningen gav inte giltig, begränsad JSON-diagnostik.' }
  if ($report.ok -eq $true -and [int]$report.passed -ge 25) {
    Info "Playwright passerade i en ny lokal testmiljö ($($report.passed) test)."
    return
  }
  $stages = @('isolated_npm_ci','isolated_npm_ci_timeout','isolated_local_setup','isolated_local_build','isolated_local_build_timeout','assertion','webserver_browser_or_runner','isolated_playwright_timeout','isolated_runner')
  $stage = if ($stages -contains [string]$report.stage) { [string]$report.stage } else { 'okänt steg' }
  $safeFailures = @()
  foreach ($failure in @($report.failures)) {
    $file = [string]$failure.file
    if ($file -notmatch '^e2e/[a-z0-9-]+\.spec\.ts$') { continue }
    $line = [int]$failure.line
    $assertion = [string]$failure.assertion
    if ($assertion -notmatch '^(toBeVisible|toBeDisabled|toHaveValue|toContainText|toBe|toEqual|toHaveText|toHaveCount|timeout|locator|test_failure)$') { $assertion = 'test_failure' }
    $source = ([string]$failure.source -replace '[\r\n\t]', ' ').Trim()
    if ($source.Length -gt 140 -or $source -notmatch '^(await\s+)?expect\b|^\)\.(to|not\.)|^\.(to|not\.)') { $source = '' }
    $safeFailures += "$file`:$line ($assertion) $source"
  }
  $detail = if ($safeFailures.Count) { " Påstående: $($safeFailures -join '; ')." } else { ' Ingen testspecifik felrad gavs; kontrollera start av lokal server eller Chromium.' }
  $buildDetail = ''
  if ($report.PSObject.Properties['buildDetail']) {
    $candidate = [string]$report.buildDetail
    if ($candidate.Length -le 240 -and $candidate -match '^[a-zA-Z0-9 .,:;()_<>|\-]+$') { $buildDetail = " Byggfel: $candidate." }
  }
  $diagnostic = ''
  if ($report.PSObject.Properties['diagnostic'] -and $report.diagnostic) {
    $values = @($report.diagnostic.rootStatus,$report.diagnostic.staffStatus,$report.diagnostic.moduleStatus,$report.diagnostic.pageErrorCount,$report.diagnostic.staffCount,$report.diagnostic.rootChildCount,$report.diagnostic.consoleErrorCount,$report.diagnostic.failedRequestCount)
    if (@($values | Where-Object { [int]$_ -lt -1 -or [int]$_ -gt 599 }).Count -eq 0) {
      $later = if ($report.diagnostic.headingVisibleLater -eq $true) { 'ja' } else { 'nej' }
      $mime = if (@('javascript','html','other','unavailable') -contains [string]$report.diagnostic.moduleMime) { [string]$report.diagnostic.moduleMime } else { 'okänd' }
      $consoleType = if (@('none','module_mime','module_resolution','csp','fetch','http_status','other') -contains [string]$report.diagnostic.consoleCategory) { [string]$report.diagnostic.consoleCategory } else { 'okänd' }
      $badPath = if ([string]$report.diagnostic.badScriptPath -match '^/[a-zA-Z0-9_./@:%-]{1,150}$') { [string]$report.diagnostic.badScriptPath } else { 'okänd' }
      $diagnostic = " HTTP /=$($values[0]), /api/staff=$($values[1]), /src/main.tsx=$($values[2]), modul=$mime, konsoltyp=$consoleType, felmodul=$badPath, demoantal=$($values[4]), rubrik senare=$later, rotbarn=$($values[5]), JS-fel=$($values[3]), konsolfel=$($values[6]), nätverksfel=$($values[7])."
    }
  }
  Stop-Launch "Playwright stoppade i steg $stage.$detail$buildDetail$diagnostic PIN, tokens och testutdata visas inte."
}
function Command-Path([string]$Name) {
  $found = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $found) { Stop-Launch "Verktyget $Name saknas. Installera det innan lanseringen." }
  return $found.Source
}
function Refresh-ProductionSnapshot([string]$Label) {
  $directory = Split-Path -Parent $script:BackupPath
  $next = Join-Path $directory ("tvattligan-v2-privat-kontroll-" + [guid]::NewGuid().ToString('N') + '.sql')
  $raw = Run $script:node @('scripts/station-v2-snapshot.mjs','export',$next) "$Label`: läsande D1-export"
  try { $report = ConvertFrom-Json -InputObject $raw }
  catch { Stop-Launch "$Label misslyckades: exporthjälpen returnerade inte giltig JSON." }
  if ($report.ok -ne $true) {
    Stop-Launch "$Label misslyckades vid D1-export (typ $($report.errorType), avslutskod $($report.exitCode), Windows-status $($report.windowsStatus)). Ingen publicering sker."
  }
  $checked = Run $script:node @('scripts/verify-d1-backup.mjs',$next) "$Label`: integritet för färsk D1-export"
  try { $verified = ConvertFrom-Json -InputObject $checked }
  catch { Stop-Launch "$Label misslyckades: den nya privata D1-exporten kunde inte verifieras." }
  if ($verified.verified -ne $true) { Stop-Launch "$Label misslyckades: den nya privata D1-exporten är ogiltig." }
  $previous = $script:snapshotPath
  $script:snapshotPath = $next
  if ($previous -and (Test-Path -LiteralPath $previous -PathType Leaf)) {
    Remove-Item -LiteralPath $previous -ErrorAction SilentlyContinue
  }
  Info "$Label`: färsk privat D1-export verifierad ($($report.bytes) byte)."
}
function Query([string]$Sql, [string]$Label) {
  if (-not $script:snapshotPath) { Stop-Launch "$Label misslyckades: ingen verifierad produktionsbild finns." }
  $raw = Run $script:node @('scripts/station-v2-snapshot.mjs','query',$script:snapshotPath,$Sql) "$Label`: lokal läskontroll"
  try { $data = ConvertFrom-Json -InputObject $raw }
  catch { Stop-Launch "$Label misslyckades: ögonblicksbilden gav inte giltig JSON." }
  if ($data.ok -ne $true -or $null -eq $data.results) {
    Stop-Launch "$Label misslyckades (typ $($data.errorType)). Ingen produktionsdata skrevs."
  }
  return @($data.results)
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
function Find-ApprovedCsv {
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue([pscustomobject]@{ Path=$env:USERPROFILE; Depth=0 })
  $visited = 0
  while ($queue.Count -gt 0 -and $visited -lt 3000) {
    $current = $queue.Dequeue(); $visited++
    if ($current.Depth -gt 6 -or -not (Test-Path -LiteralPath $current.Path -PathType Container)) { continue }
    $candidate = Join-Path $current.Path $approvedCsvName
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -eq $approvedCsvHash) { return $candidate }
    }
    foreach ($folder in @(Get-ChildItem -LiteralPath $current.Path -Directory -Force -ErrorAction SilentlyContinue)) {
      if ($folder.Name -in @('AppData','node_modules','.git','.cache','.npm','.wrangler','Temp')) { continue }
      $queue.Enqueue([pscustomobject]@{ Path=$folder.FullName; Depth=$current.Depth + 1 })
    }
  }
  return ''
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
function Check-Database([switch]$AfterReset) {
  Refresh-ProductionSnapshot 'Databaskontroll'
  $integrity = @(Query 'PRAGMA integrity_check' 'SQLite-integritet')
  if ($integrity.Count -ne 1 -or $integrity[0].integrity_check -ne 'ok') { Stop-Launch 'D1:s integritetskontroll misslyckades.' }
  if (@(Query 'PRAGMA foreign_key_check' 'Främmande nycklar').Count -ne 0) { Stop-Launch 'D1 innehåller främmande nyckelfel.' }
  $applied = @(Query 'SELECT name FROM d1_migrations ORDER BY id' 'Migreringshistorik' | ForEach-Object { $_.name })
  $local = @(Get-ChildItem -LiteralPath (Join-Path $root 'migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object { $_.Name })
  if ($local.Count -ne 6 -or $applied.Count -ne $local.Count) { Stop-Launch 'Migreringshistoriken avviker: exakt 0001–0006 ska vara installerade.' }
  for ($i = 0; $i -lt $local.Count; $i++) {
    if ($local[$i] -ne $applied[$i]) { Stop-Launch "Migrationerna har fel ordning eller saknas vid position $($i + 1)." }
  }
  if ($applied[4] -ne '0005_station_dashboard_v2.sql' -or $applied[5] -ne '0006_station_monthly_figures.sql') {
    Stop-Launch 'Migration 0005 eller 0006 är inte installerad i rätt ordning.'
  }
  $tables = @(Query "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('station_schedule_periods','station_shifts','station_tasks','station_task_write_limits','station_notices','station_monthly_figures')" 'V2-tabeller' | ForEach-Object { $_.name })
  if ($tables.Count -ne 6) { Stop-Launch 'En eller flera nya V2-tabeller saknas.' }
  $columnSpecs = [ordered]@{
    station_shifts = @('id','period_id','work_date','first_name','starts_at','ends_at','status','revision')
    station_schedule_periods = @('id','station_id','starts_on','ends_on')
    station_notices = @('id','expires_time')
    station_monthly_figures = @('station_id','month','metrics_json')
  }
  foreach ($table in $columnSpecs.Keys) {
    $found = @(Query "PRAGMA table_info($table)" "Kolumner i $table" | ForEach-Object { $_.name })
    foreach ($column in $columnSpecs[$table]) { if ($found -notcontains $column) { Stop-Launch "Kolumnen $column saknas i $table." } }
  }
  foreach ($table in $oldTables.Keys) {
    if ($AfterReset -and $table -in @('sales','sales_audit','notification_events')) { continue }
    $expression = $oldTables[$table]
    $live = @(Query "SELECT $expression AS key FROM $table" "Bevarade rader i $table")
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
function Check-LaunchState([bool]$Locked, [bool]$ResetDone) {
  $state = @(Query "SELECT key,value FROM settings WHERE key IN ('station_v2_launch_lock','station_v2_zero_reset_done','station_v2_launch_programs')" 'Lanseringsstatus')
  $values = @{}; foreach ($row in $state) { $values[$row.key] = $row.value }
  if (($values['station_v2_launch_lock'] -eq '1') -ne $Locked -or
      ([bool]$values['station_v2_zero_reset_done']) -ne $ResetDone) { Stop-Launch 'Lanseringsspärr eller engångsstatus avviker. Stoppa utan ändring.' }
  if ($Locked -and -not $values['station_v2_launch_programs']) { Stop-Launch 'Ursprungliga aktiva tvättprogram saknas.' }
  if ($Locked -or $ResetDone) {
    try { $originallyActive = @(ConvertFrom-Json -InputObject $values['station_v2_launch_programs']) }
    catch { Stop-Launch 'Listan över ursprungliga tvättprogram är ogiltig.' }
    if ($originallyActive.Count -eq 0) { Stop-Launch 'Inget ursprungligt aktivt tvättprogram finns att återställa.' }
  }
  if ($Locked) {
    $stillActive = @(Query 'SELECT id FROM wash_programs WHERE active=1' 'Spärrade tvättprogram')
    if ($stillActive.Count -ne 0) { Stop-Launch 'Ett tvättprogram är fortfarande aktivt; nya registreringar kan ske. Stoppa.' }
  }
  if (-not $Locked -and $ResetDone) {
    $activeIds = @(Query 'SELECT id FROM wash_programs WHERE active=1' 'Återställda tvättprogram' | ForEach-Object { $_.id } | Sort-Object)
    $expectedIds = @($originallyActive | ForEach-Object { [string]$_ } | Sort-Object)
    if ($activeIds.Count -ne $expectedIds.Count) { Stop-Launch 'Antalet återställda tvättprogram avviker.' }
    for ($i=0; $i -lt $expectedIds.Count; $i++) {
      if ($activeIds[$i] -cne $expectedIds[$i]) { Stop-Launch 'Tvättprogrammens aktivstatus återställdes inte korrekt.' }
    }
  }
}
function Write-LaunchState([string]$Operation) {
  $raw = Run $script:node @('scripts/station-v2-write.mjs',$Operation) "Lanseringsspärr: $Operation"
  try { $result = ConvertFrom-Json -InputObject $raw }
  catch { Stop-Launch "Lanseringsspärr: $Operation gav inte ett giltigt statusmeddelande." }
  if ($result.ok -ne $true) { Stop-Launch "Lanseringsspärr: $Operation misslyckades ($($result.errorType))." }
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
  $existing = @(Query "SELECT s.period_id,s.work_date,s.first_name,s.starts_at,s.ends_at,s.status FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-09-30' AND '2026-11-01'" 'Befintliga oktoberpass')
  $script:scheduleAlreadyImported = $false
  $script:schedulePeriodId = ''
  $periods = @($existing | Where-Object { $_.work_date -ge '2026-10-01' -and $_.work_date -le '2026-10-31' } | Select-Object -ExpandProperty period_id -Unique)
  if ($periods.Count -eq 1 -and $existing.Count -eq 111) {
    $expectedRows = @($script:shifts | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
    $actualRows = @($existing | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
    $same = $true
    for ($i = 0; $i -lt 111; $i++) { if ($expectedRows[$i] -cne $actualRows[$i]) { $same = $false; break } }
    if ($same) { $script:scheduleAlreadyImported = $true; $script:schedulePeriodId = [string]$periods[0] }
  }
  if (-not $script:scheduleAlreadyImported) {
  foreach ($row in $script:shifts) {
    foreach ($prior in $existing) {
      $conflict = Collision $row $prior
      if ($conflict) { Stop-Launch "CSV har $conflict mot ett befintligt pass. Ingen import görs." }
    }
  }
  }
  $octoberCount = @(Query "SELECT COUNT(*) AS n FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31'" 'Antal oktoberpass före import')
  $script:beforeOctober = [int]$octoberCount[0].n
  $script:csvHash = (Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash
  if ($script:csvHash -ne $approvedCsvHash) {
    Stop-Launch 'CSV-filen är inte den godkända bilagan (SHA-256 avviker). Ingen import görs.'
  }
  Info "Privat oktoberfil verifierad: 111 rader, inga dubbletter eller aktiva överlapp. Befintliga oktoberrader: $beforeOctober. Redan importerad: $scheduleAlreadyImported."
  Write-Host 'Förhandsgranskning på den här datorn (lägg inte terminalutskriften i Git eller chatt):'
  $script:shifts | Sort-Object work_date,starts_at,first_name | Format-Table work_date,first_name,starts_at,ends_at,status -AutoSize | Out-Host
  Write-Host 'Filens godkända SHA-256, alla rader och konflikter är kontrollerade automatiskt. Förhandsgranskningen visas lokalt.'
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
  $null = Run $npm @('ci') 'Installation av låsta npm-paket'
  $wranglerCli = 'node_modules/wrangler/wrangler-dist/cli.js'
  if (-not (Test-Path -LiteralPath $wranglerCli -PathType Leaf)) { Stop-Launch 'Lokal Wrangler-installation saknas efter npm ci.' }
  $configText = Get-Content -LiteralPath (Join-Path $root 'wrangler.jsonc') -Raw -Encoding UTF8
  $config = ($configText -replace '(?m)^\s*//.*$','' -replace ',(\s*[}\]])','$1') | ConvertFrom-Json
  if ($config.name -ne 'tvattligan' -or $config.main -ne 'worker/index.ts' -or
      @($config.d1_databases).Count -ne 1 -or $config.d1_databases[0].binding -ne 'DB' -or
      $config.d1_databases[0].database_name -ne 'tvattligan' -or
      $config.d1_databases[0].database_id -ne $databaseId) {
    Stop-Launch 'Wrangler-konfigurationen pekar inte på den godkända produktions-Workern och D1-databasen.'
  }
  $who = Run $node @($wranglerCli,'whoami','--config','wrangler.jsonc','--json') 'Cloudflare-inloggning'
  try { $null = ConvertFrom-Json -InputObject $who }
  catch { Stop-Launch 'Cloudflare-inloggningen kunde inte verifieras som JSON.' }
  Info "Cloudflare-inloggning finns. Den kommande privata D1-exporten verifierar åtkomst till det fasta databas-ID:t $databaseId."
  $pending = Run $node @($wranglerCli,'d1','migrations','list','tvattligan','--remote','--config','wrangler.jsonc') 'Kontroll av väntande migrationer'
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
  foreach ($table in $oldTables.Keys) {
    $entry = $baseline.PSObject.Properties[$table]
    if (-not $entry -or $null -eq $entry.Value) {
      Stop-Launch "Backupkontrollen saknar tabellnycklar för $table. Stoppa utan att tolka saknade V1-rader som tomma."
    }
  }
  Info "Backup verifierad: $($backupInfo.bytes) byte. Nycklar stannar i minnet och visas inte."
  Refresh-ProductionSnapshot 'Inledande produktionsstatus'
  $initialState = @(Query "SELECT key,value FROM settings WHERE key IN ('station_v2_launch_lock','station_v2_zero_reset_done')" 'Inledande lanseringsstatus')
  $stateValues = @{}; foreach ($row in $initialState) { $stateValues[$row.key] = $row.value }
  $resumeLocked = $stateValues['station_v2_launch_lock'] -eq '1'
  $resumeResetDone = [bool]$stateValues['station_v2_zero_reset_done']
  if ($resumeResetDone -and -not $resumeLocked) { Stop-Launch 'Tvättligans engångsnollställning är redan färdig och spärren är hävd. Skriptet kör inte en andra gång.' }
  Check-Database -AfterReset:$resumeResetDone
  Check-WeatherPaused
  if (-not $SchedulePath) {
    $SchedulePath = Find-ApprovedCsv
    if ($SchedulePath) { Info 'Hittade den godkända oktoberfilen på datorn.' }
    else { $SchedulePath = Read-Host "Hittade inte den redan godkända oktoberfilen automatiskt. Ange dess befintliga sökväg ($approvedCsvName)" }
  }
  $SchedulePath = Check-PrivateFile $SchedulePath 'Oktober-CSV'
  Check-Schedule
  Info 'Kör lokala tester och produktionsbuild före publicering.'
  $null = Run $npx @('playwright','install','chromium') 'Installation av Chromium för test'
  $null = Run $npm @('run','typecheck') 'TypeScript-kontroll'
  Run-UnitTests
  Run-PlaywrightTests
  $null = Run $npm @('run','build') 'Produktionsbuild'
  Info 'TypeScript, enhetstester, Playwright och produktionsbuild passerade.'
  Check-Git
  Check-WeatherPaused
  Check-Database -AfterReset:$resumeResetDone
  if ((Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -ne $backupHash -or
      (Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash -ne $csvHash) {
    Stop-Launch 'Backupen eller CSV-filen ändrades under förkontrollen.'
  }
  Info 'Alla förkontroller passerade. Produktions-Workern är fortfarande oförändrad.'
  Check-LaunchState $resumeLocked $resumeResetDone
  $publish = Read-Host 'Skriv PUBLICERA V2 för att publicera till produktion; Enter avbryter'
  if ($publish -cne 'PUBLICERA V2') { Info 'Publicering avbruten på användarens begäran.'; exit 0 }
  if (-not $resumeResetDone) {
    $zero = Read-Host 'Skriv NOLLSTÄLL TVÄTTLIGAN för att ta bort gamla tvättförsäljningar efter en ny privat backup; Enter avbryter'
    if ($zero -cne 'NOLLSTÄLL TVÄTTLIGAN') { Info 'Nollställning och publicering avbröts.'; exit 0 }
  }
  $launchLocked = $true
  if (-not $resumeLocked) { Write-LaunchState 'lock' }
  Refresh-ProductionSnapshot 'Spärrad produktionsstatus'
  Check-LaunchState $true $resumeResetDone
  if (-not $resumeResetDone) {
    $lockedSalesRows = @(Query 'SELECT COUNT(*) AS n FROM sales' 'Tvättförsäljningar före nollställning')
    $lockedSalesCount = [int]$lockedSalesRows[0].n
    $finalBackupPath = Join-Path (Split-Path -Parent $BackupPath) ("tvattligan-before-zero-reset-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
    Copy-Item -LiteralPath $snapshotPath -Destination $finalBackupPath -ErrorAction Stop
    $finalBackupPath = Check-PrivateFile $finalBackupPath 'Nollställningsbackupen'
    $finalBackupHash = (Get-FileHash -LiteralPath $finalBackupPath -Algorithm SHA256).Hash
    $finalCheck = ConvertFrom-Json -InputObject (Run $node @('scripts/verify-d1-backup.mjs',$finalBackupPath) 'Verifiering av spärrad backup')
    if ($finalCheck.verified -ne $true -or $finalCheck.sha256.ToUpperInvariant() -ne $finalBackupHash) { Stop-Launch 'Den spärrade backupen kunde inte verifieras.' }
    Info "Privat backup efter spärr verifierad och sparad: $finalBackupPath"
  }
  $deployStarted = $true
  $null = Run $node @($wranglerCli,'deploy','--config','wrangler.jsonc') 'Publicering av V2'
  Info 'V2 publicerad. Kör läsande efterkontroller; ingen schemaimport har gjorts.'
  foreach ($path in @('/','/station','/api/staff','/api/wash-programs','/api/push/public-key')) {
    if ((Http-Status "$baseUrl$path") -ne 200) { Stop-Launch "Efterkontrollen misslyckades för $path. Stoppa och granska produktionen." }
  }
  if ((Http-Status "$baseUrl/api/stats") -ne 503) { Stop-Launch 'Tvättligans lanseringsspärr syns inte från den publicerade Workern.' }
  $push = Invoke-RestMethod -Uri "$baseUrl/api/push/public-key" -TimeoutSec 20
  if (@($baseline.push_subscriptions).Count -gt 0 -and $push.configured -ne $true) {
    Stop-Launch 'Pushprenumerationer finns, men produktionsnycklarna saknas efter publicering.'
  }
  foreach ($path in @('/api/station/dashboard','/api/station/v2','/api/admin/station/v2/schedule')) {
    Check-Protected $path
  }
  Check-Database -AfterReset:$resumeResetDone
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
  $resetStatus = Invoke-RestMethod -Uri "$baseUrl/api/admin/launch/status" -WebSession $session -TimeoutSec 20
  if ($resetStatus.locked -ne $true -or [bool]$resetStatus.reset_done -ne $resumeResetDone -or
      (-not $resumeResetDone -and [int]$resetStatus.sales_count -ne [int]$lockedSalesCount)) {
    Stop-Launch 'Nollställningens behörighet, spärr eller förväntat antal stämmer inte.'
  }
  if (-not $resumeResetDone) {
    try {
      $resetBody = @{ confirmation='NOLLSTÄLL TVÄTTLIGAN'; backup_sha256=$finalBackupHash; expected_sales_count=[int]$lockedSalesCount } | ConvertTo-Json -Compress
      $resetResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/launch/reset-wash" -Method Post -ContentType 'application/json; charset=utf-8' -Body $resetBody -WebSession $session -TimeoutSec 60
    } catch { Stop-Launch 'Engångsnollställningens svar uteblev eller nekades. Spärren är kvar; kör samma lanseringskommando igen för säker återupptagning.' }
    finally { $resetBody = $null }
    if ($resetResult.deleted_sales -ne [int]$lockedSalesCount) { Stop-Launch 'Nollställningens antal avviker. Spärren är kvar.' }
  }
  Check-Database -AfterReset
  Check-LaunchState $true $true
  foreach ($table in @('sales','sales_audit','maintenance_previews','maintenance_preview_sales','reset_batches')) {
    $remaining = @(Query "SELECT COUNT(*) AS n FROM $table" "Nollställning: $table")
    if ([int]$remaining[0].n -ne 0) { Stop-Launch "Gamla rader finns kvar i $table. Spärren är kvar." }
  }
  $remainingGoalEvents = @(Query "SELECT COUNT(*) AS n FROM notification_events WHERE event_type IN ('daily_goal_close','daily_goal_reached')" 'Gamla målstyrda pushhändelser')
  if ([int]$remainingGoalEvents[0].n -ne 0) {
    Stop-Launch 'Gamla målstyrda pushhändelser finns kvar. Spärren är kvar.'
  }
  Info 'Tvättligans tidigare försäljning, historik, audit och målstyrda pushhändelser är borta. Butiksförsäljning och prenumerationer är kvar.'
  $adminCookie = $session.Cookies.GetCookies([uri]"$baseUrl/api/station/dashboard")['tvattligan_session']
  if (-not $adminCookie) { Stop-Launch 'Admincookie saknas. Webbläsarkontroll och import stoppas.' }
  $smokeInput = @{baseUrl=$baseUrl;sessionCookie=$adminCookie.Value} | ConvertTo-Json -Compress
  $smoke = $smokeInput | & $node 'scripts/station-v2-live-smoke.mjs' 2>$null
  $smokeInput = $null
  if ($LASTEXITCODE -ne 0) { Stop-Launch 'Den verkliga webbläsarkontrollen misslyckades. Ingen import görs; granska dashboard och väderanrop.' }
  Info ($smoke -join "`n")
  Check-Schedule
  if ((Get-FileHash -LiteralPath $SchedulePath -Algorithm SHA256).Hash -ne $csvHash) { Stop-Launch 'CSV-filen ändrades efter förhandsgranskningen.' }
  if ($scheduleAlreadyImported) {
    $result = [pscustomobject]@{ imported=111; period_id=$schedulePeriodId }
    Info 'De 111 godkända passen finns redan exakt i en importerad period. Ingen andra import görs.'
  } else {
    $import = Read-Host 'Skriv IMPORTERA 111 PASS för att lägga till schemat; Enter stoppar före import'
    if ($import -cne 'IMPORTERA 111 PASS') {
      Info 'Schemat importerades inte. Lanseringsspärren ligger kvar tills importen har gjorts och verifierats.'
      exit 0
    }
    $payload = @{label='Oktober 2026';starts_on='2026-10-01';ends_on='2026-10-31';shifts=$shifts} | ConvertTo-Json -Depth 8 -Compress
    try {
      $result = Invoke-RestMethod -Uri "$baseUrl/api/admin/station/v2/schedule/import" -Method Post -ContentType 'application/json; charset=utf-8' -Body $payload -WebSession $session -TimeoutSec 60
    } catch { Stop-Launch 'Serverimporten misslyckades eller svaret uteblev. Spärren är kvar; kör samma kommando igen för kontrollerad återupptagning.' }
    if ($result.imported -ne 111 -or $result.period_id -notmatch '^[0-9a-f-]{36}$') {
      Stop-Launch 'Importsvaret är oväntat. Spärren är kvar; kör samma kommando igen för kontroll.'
    }
  }
  Check-Database -AfterReset
  $importedRows = @(Query "SELECT work_date,first_name,starts_at,ends_at,status FROM station_shifts WHERE period_id='$($result.period_id)'" 'Återläsning av importerad schemaperiod')
  if ($importedRows.Count -ne 111) { Stop-Launch 'Efterkontroll: antalet importerade pass är inte 111.' }
  $expected = @($shifts | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
  $actual = @($importedRows | ForEach-Object { "$($_.work_date)|$($_.first_name)|$($_.starts_at)|$($_.ends_at)|$($_.status)" } | Sort-Object)
  for ($i = 0; $i -lt 111; $i++) { if ($expected[$i] -cne $actual[$i]) { Stop-Launch 'Efterkontroll: importerade pass skiljer sig från den privata CSV-filen.' } }
  $octoberCount = @(Query "SELECT COUNT(*) AS n FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id='tingsryd' AND s.work_date BETWEEN '2026-10-01' AND '2026-10-31'" 'Antal oktoberpass efter import')
  $afterOctober = [int]$octoberCount[0].n
  $expectedOctober = if ($scheduleAlreadyImported) { $beforeOctober } else { $beforeOctober + 111 }
  if ($afterOctober -ne $expectedOctober) { Stop-Launch 'Efterkontroll: oktobers radantal avviker.' }
  $todayOverview = Invoke-RestMethod -Uri "$baseUrl/api/station/v2" -WebSession $session -TimeoutSec 20
  if ($todayOverview.today -ge '2026-10-01' -and $todayOverview.today -le '2026-10-31') {
    foreach ($row in @($shifts | Where-Object { $_.work_date -eq $todayOverview.today -and $_.status -eq 'active' })) {
      $match = @($todayOverview.shifts | Where-Object {
        $_.first_name -ceq $row.first_name -and $_.starts_at -eq $row.starts_at -and $_.ends_at -eq $row.ends_at
      })
      if ($match.Count -lt 1) { Stop-Launch 'Efterkontroll: ett aktivt pass för dagens datum saknas i dashboardens API.' }
    }
  }
  Write-LaunchState 'unlock'
  Refresh-ProductionSnapshot 'Kontroll efter öppning'
  Check-LaunchState $false $true
  if ((Http-Status "$baseUrl/api/stats") -ne 200 -or (Http-Status "$baseUrl/api/wash-programs") -ne 200) {
    Stop-Launch 'Tvättligans API öppnade inte korrekt efter nollställningen.'
  }
  $launchLocked = $false
  Info "KLART: V2 är publicerad, Tvättligan nollställd och 111 pass importerade/verifierade i perioden $($result.period_id). Kontrollera Idag jobbar och push på en avsedd enhet."
} catch {
  Write-Host "STOPP: $($_.Exception.Message)" -ForegroundColor Red
  if ($deployStarted) {
    Write-Host 'Publicering kan ha skett. Kontrollera produktionsstatus och /station/admin innan omstart eller nytt importförsök. Ingen migration eller automatisk återställning har körts.' -ForegroundColor Yellow
  } else {
    Write-Host 'Ingen publicering, migration eller automatisk databasåterställning har körts.' -ForegroundColor Yellow
  }
  if ($launchLocked) { Write-Host 'VIKTIGT: Tvättligans lanseringsspärr kan vara aktiv. Den privata backupen måste behållas. Kontrollera status innan ett nytt försök.' -ForegroundColor Yellow }
  exit 1
}
