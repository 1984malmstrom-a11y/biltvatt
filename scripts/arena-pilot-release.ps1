#Requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateSet('Plan','Preflight','Restore','Inspect','Migrate','PrepareMailer','MailerSecret','DeployMailer','OwnerSql','OwnerBootstrap','DeployPilot','Verify')]
  [string]$Step = 'Plan',
  [string]$BackupPath = '',
  [string]$Origin = ''
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previous = Get-Location
try {
  Set-Location -LiteralPath $root
  if (-not $BackupPath -and $Step -in @('Restore','Migrate')) {
    if (-not $env:USERPROFILE) { throw 'Use -BackupPath for the private Windows SQL export.' }
    $BackupPath = Join-Path $env:USERPROFILE 'ARENAN-Private-Backups\arenan-pilot-before-migrations-20261017.sql'
  }
  $arguments = @((Join-Path $PSScriptRoot 'arena-pilot-release.mjs'), '--step', $Step)
  if ($BackupPath) { $arguments += @('--backup', $BackupPath) }
  if ($Origin) { $arguments += @('--origin', $Origin) }
  if ($Step -eq 'OwnerSql') {
    $email = Read-Host 'Approved individual Owner recovery email'
    $name = Read-Host 'Owner display name'
    $password = Read-Host 'Owner password (12-256 characters)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $oldEncoding = $OutputEncoding
    try {
      $OutputEncoding = New-Object Text.UTF8Encoding($false)
      $payload = @{email=$email; display_name=$name; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)} | ConvertTo-Json -Compress
      $payload | & node @arguments
      $nativeExit = $LASTEXITCODE
    } finally {
      $payload = $null
      $OutputEncoding = $oldEncoding
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      if ($password) { $password.Dispose() }
    }
  } else { & node @arguments; $nativeExit = $LASTEXITCODE }
  if ($nativeExit -ne 0) { throw "Pilot step $Step failed. STOP; no automatic continuation or retry." }
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally { Set-Location -LiteralPath $previous.Path }
