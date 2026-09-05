[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [string]$Command = "help",
  [Parameter(Position=1, ValueFromRemainingArguments=$true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Info([string]$Message) { Write-Host "[SkillPass] $Message" -ForegroundColor Cyan }
function Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

function Show-Help {
@"
SkillPass deployment helper for Windows PowerShell (no GitHub connection required)

  .\deploy.ps1 demo
      Start the deterministic local demo with Docker.

  .\deploy.ps1 init-testnet
      Create .env.testnet, generate a facilitator secret, and import
      deployments/testnet.json when populated.

  .\deploy.ps1 doctor
      Validate testnet configuration before deployment.

  .\deploy.ps1 testnet
      Start the CKB-testnet service + facilitator.

  .\deploy.ps1 fiber-init C:\path\to\ckb-private-key
      Prepare the local official Fiber v0.9.0 container directory.
      It does NOT fund a wallet or open a channel.

  .\deploy.ps1 testnet-fiber
      Start SkillPass + facilitator + self-hosted Fiber container.

  .\deploy.ps1 smoke  [demo|testnet|testnet-fiber]
  .\deploy.ps1 status [demo|testnet|testnet-fiber]
  .\deploy.ps1 logs   [demo|testnet|testnet-fiber] [service]
  .\deploy.ps1 backup-state [demo|testnet|testnet-fiber]
      Export SkillPass/facilitator application state to backups\<timestamp>\.
      Fiber channel/node storage is intentionally excluded.

  .\deploy.ps1 stop   [demo|testnet|testnet-fiber]

No command creates a new wallet, transfers CKB, funds Fiber, opens channels,
or spends user funds.
"@
}

function Require-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker Desktop is required. Install/start Docker Desktop and retry." }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker is installed but the daemon is not reachable. Start Docker Desktop." }
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker Compose v2 is required ('docker compose')." }
}

function Read-EnvFile([string]$Path = ".env.testnet") {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($raw in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot $Path))) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $i = $line.IndexOf("=")
    if ($i -gt 0) { $map[$line.Substring(0,$i).Trim()] = $line.Substring($i+1).Trim() }
  }
  return $map
}

function Set-EnvValue([string]$Key, [string]$Value, [string]$Path = ".env.testnet") {
  $full = Join-Path $PSScriptRoot $Path
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $full) { foreach ($line in [IO.File]::ReadAllLines($full)) { [void]$lines.Add($line) } }
  $done = $false
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ('^' + [regex]::Escape($Key) + '=')) { $lines[$i] = "$Key=$Value"; $done = $true; break }
  }
  if (-not $done) { [void]$lines.Add("$Key=$Value") }
  [IO.File]::WriteAllLines($full, $lines, [Text.UTF8Encoding]::new($false))
}

function New-Secret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
}

function Init-Testnet {
  if (-not (Test-Path ".env.testnet.example")) { Fail ".env.testnet.example is missing from this package." }
  if (-not (Test-Path ".env.testnet")) {
    Copy-Item ".env.testnet.example" ".env.testnet"
    Info "Created .env.testnet"
  } else { Info ".env.testnet already exists; preserving it." }

  $envMap = Read-EnvFile
  $token = [string]$envMap["FACILITATOR_AUTH_TOKEN"]
  if (-not $token -or $token.StartsWith("REPLACE")) {
    Set-EnvValue "FACILITATOR_AUTH_TOKEN" (New-Secret)
    Info "Generated FACILITATOR_AUTH_TOKEN in .env.testnet"
  }

  if (Test-Path "deployments/testnet.json") {
    try {
      $deployment = Get-Content "deployments/testnet.json" -Raw | ConvertFrom-Json
      if ($deployment.codeHash -and -not ([string]$deployment.codeHash).Contains("REPLACE")) { Set-EnvValue "CAPABILITY_CODE_HASH" ([string]$deployment.codeHash) }
      if ($deployment.hashType) { Set-EnvValue "CAPABILITY_HASH_TYPE" ([string]$deployment.hashType) }
      if ($deployment.depTxHash -and -not ([string]$deployment.depTxHash).Contains("REPLACE")) { Set-EnvValue "CAPABILITY_DEP_TX_HASH" ([string]$deployment.depTxHash) }
      if ($null -ne $deployment.depIndex) { Set-EnvValue "CAPABILITY_DEP_INDEX" ([string]$deployment.depIndex) }
      Info "Imported populated deployments/testnet.json values into .env.testnet"
    } catch { Warn "Could not parse deployments/testnet.json: $($_.Exception.Message)" }
  }
  Info "Edit any remaining CAPABILITY_* placeholders, then run: .\deploy.ps1 doctor"
}

function Doctor {
  if (-not (Test-Path ".env.testnet")) { Fail ".env.testnet is missing. Run .\deploy.ps1 init-testnet" }
  $e = Read-EnvFile
  $failed = $false
  function Check([bool]$Ok, [string]$Name, [string]$Help="") {
    if ($Ok) { Write-Host "[OK]   $Name" -ForegroundColor Green }
    else { Write-Host "[FAIL] $Name $Help" -ForegroundColor Red; $script:doctorFailed = $true }
  }
  $script:doctorFailed = $false
  Check (([string]$e.CAPABILITY_CODE_HASH) -match '^0x[0-9a-fA-F]{64}$') "CAPABILITY_CODE_HASH"
  Check (([string]$e.CAPABILITY_DEP_TX_HASH) -match '^0x[0-9a-fA-F]{64}$') "CAPABILITY_DEP_TX_HASH"
  Check (([string]$e.CAPABILITY_HASH_TYPE) -match '^(data|data1|data2|type)$') "CAPABILITY_HASH_TYPE"
  Check (([string]$e.CAPABILITY_DEP_INDEX) -match '^\d+$') "CAPABILITY_DEP_INDEX"
  Check (([string]$e.FACILITATOR_AUTH_TOKEN).Length -ge 32 -and -not ([string]$e.FACILITATOR_AUTH_TOKEN).StartsWith("REPLACE")) "FACILITATOR_AUTH_TOKEN"
  Check (([string]$e.PAYMENT_AMOUNT) -match '^[1-9][0-9]*$') "PAYMENT_AMOUNT"
  Check (([string]$e.PAYMENTS_REQUIRED) -match '^(true|false)$') "PAYMENTS_REQUIRED"
  Check (([string]$e.FIBER_NETWORK) -eq 'testnet') "FIBER_NETWORK=testnet"
  Check (([string]$e.FIBER_PAYMENT_PROOF) -match '^(invoice-status|preimage)$') "FIBER_PAYMENT_PROOF"
  Check (([string]$e.PUBLIC_BASE_URL) -match '^https?://') "PUBLIC_BASE_URL"
  Check (([string]$e.TRUST_PROXY) -match '^(true|false)$') "TRUST_PROXY"
  if ($e.CKB_RPC_URL) { Check (([string]$e.CKB_RPC_URL) -match '^https?://') "CKB_RPC_URL" }
  $timeout = 0; [void][int]::TryParse([string]$e.PAYMENT_TIMEOUT_SECONDS, [ref]$timeout)
  Check ($timeout -ge 1 -and $timeout -le 3600) "PAYMENT_TIMEOUT_SECONDS" "(1..3600)"
  $ttl = 0; [void][int]::TryParse([string]$e.SERVICE_RECEIPT_TTL_SECONDS, [ref]$ttl)
  Check ($ttl -ge 60 -and $ttl -le 2592000) "SERVICE_RECEIPT_TTL_SECONDS" "(60..2592000)"

  if ($e.FIBER_BACKEND -eq "mock") { Warn "FIBER_BACKEND=mock is staging only and is not real payment evidence." }
  elseif ($e.FIBER_BACKEND -eq "fnn") { Check (([string]$e.FIBER_RPC_URL) -match '^https?://') "FIBER_RPC_URL" }
  else { Check $false "FIBER_BACKEND" "(must be mock or fnn)" }

  if ($e.SKILLPASS_BIND -and $e.SKILLPASS_BIND -notin @("127.0.0.1","localhost")) {
    Warn "SKILLPASS_BIND=$($e.SKILLPASS_BIND) exposes the service beyond loopback. Put TLS/rate limiting at a trusted reverse proxy."
  }
  if ($script:doctorFailed) { Fail "Deployment configuration is incomplete." }
  Info "Static deployment configuration looks valid."
}

function Get-ComposeArgs([string]$Mode) {
  switch ($Mode) {
    "demo" { return @("-f","deploy/compose.demo.yaml") }
    "testnet" { return @("--env-file",".env.testnet","-f","deploy/compose.testnet.yaml") }
    "testnet-fiber" { return @("--env-file",".env.testnet","-f","deploy/compose.testnet.yaml","-f","deploy/compose.fiber.yaml") }
    default { Fail "Unknown deployment mode: $Mode" }
  }
}

function Compose([string]$Mode, [string[]]$More) {
  $composeArgs = Get-ComposeArgs $Mode
  & docker compose @composeArgs @More
  if ($LASTEXITCODE -ne 0) { Fail "docker compose failed for mode '$Mode'." }
}

function Wait-Service([string]$Mode, [string]$Service, [int]$TimeoutSeconds=180) {
  $composeArgs = Get-ComposeArgs $Mode
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $cid = (& docker compose @composeArgs ps -q $Service 2>$null | Select-Object -First 1)
    if ($cid) {
      $state = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $cid 2>$null | Select-Object -First 1)
      if ($state -in @("healthy","running")) { Info "$Service is $state"; return }
      if ($state -in @("unhealthy","exited","dead")) { & docker compose @composeArgs logs --tail=120 $Service; Fail "$Service became $state" }
    }
    Start-Sleep -Seconds 2
  }
  & docker compose @composeArgs logs --tail=120 $Service
  Fail "Timed out waiting for $Service"
}

function Smoke([string]$Mode="testnet") {
  if ($Mode -eq "demo") { $port = if ($env:SKILLPASS_PORT) {$env:SKILLPASS_PORT} else {"8787"}; $paths=@("/health","/") }
  else {
    $e=Read-EnvFile; $port=if ($e.SKILLPASS_PORT) {$e.SKILLPASS_PORT} else {"8787"}; $paths=@("/livez","/readyz","/api/config","/api/status","/.well-known/skillpass.json","/api/openapi.json")
  }
  $base="http://127.0.0.1:$port"
  foreach ($path in $paths) {
    try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri ($base+$path); if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 300) { Fail "$path returned HTTP $($r.StatusCode)" } }
    catch { Fail "HTTP smoke failed for ${base}${path}: $($_.Exception.Message)" }
  }
  Info "HTTP smoke passed: $base"
}

function Start-Mode([string]$Mode) {
  Require-Docker
  if ($Mode -ne "demo") { Doctor }
  Compose $Mode @("up","-d","--build")
  if ($Mode -eq "testnet-fiber") { Wait-Service $Mode "fiber" 240 }
  if ($Mode -ne "demo") { Wait-Service $Mode "facilitator" 180; Wait-Service $Mode "skillpass" 240 }
  else { Wait-Service $Mode "demo" 120 }
  Smoke $Mode
  $port="8787"; if ($Mode -ne "demo") { $e=Read-EnvFile; if ($e.SKILLPASS_PORT) {$port=$e.SKILLPASS_PORT} }
  Info "Ready: http://127.0.0.1:$port"
}

function Backup-State([string]$Mode="testnet") {
  Require-Docker
  $composeArgs = Get-ComposeArgs $Mode
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $dir = Join-Path $PSScriptRoot ("backups\" + $stamp)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $copied = 0
  foreach ($item in @(
    @{ Service="facilitator"; Source="/state/fiber-settled.json"; Name="fiber-settled.json" },
    @{ Service="skillpass"; Source="/state/service-state.json"; Name="service-state.json" }
  )) {
    $cid = (& docker compose @composeArgs ps -q $item.Service 2>$null | Select-Object -First 1)
    if (-not $cid) { continue }
    $destination = Join-Path $dir $item.Name
    & docker cp "${cid}:$($item.Source)" $destination *> $null
    if ($LASTEXITCODE -eq 0) { $copied++; Info "Backed up $($item.Service) state -> backups\$stamp\$($item.Name)" }
  }
  $readme = @"
SkillPass application-state backup created UTC $stamp
Mode: $Mode

This backup intentionally excludes .env.testnet, wallet keys, and Fiber channel/node storage.
For self-hosted Fiber, use Fiber's official backup/restore procedure for channel storage.
"@
  [IO.File]::WriteAllText((Join-Path $dir "README.txt"), $readme, [Text.UTF8Encoding]::new($false))
  if ($copied -eq 0) { Warn "No state files existed yet; created backup metadata only." }
  Info "Backup directory: backups\$stamp"
}

function Fiber-Init([string]$KeyPath) {
  Require-Docker
  if (-not (Test-Path ".env.testnet")) { Init-Testnet }
  if (-not $KeyPath -or -not (Test-Path $KeyPath -PathType Leaf)) { Fail "Usage: .\deploy.ps1 fiber-init C:\path\to\ckb-private-key" }
  $e=Read-EnvFile; $version=if ($e.FIBER_VERSION) {$e.FIBER_VERSION} else {"0.9.0"}
  $fiberDir=Join-Path $PSScriptRoot ".runtime\fiber-node"
  $ckbDir=Join-Path $fiberDir "ckb"; New-Item -ItemType Directory -Force -Path $ckbDir | Out-Null
  $dest=Join-Path $ckbDir "key"; if (Test-Path $dest) { Fail "$dest already exists; refusing to overwrite a Fiber wallet key." }
  Copy-Item $KeyPath $dest
  Info "Copied the supplied key into the local .runtime/fiber-node directory."
  & docker pull "nervos/fiber:$version"; if ($LASTEXITCODE -ne 0) { Fail "Could not pull nervos/fiber:$version" }
  & docker run --rm --entrypoint sh -v "${fiberDir}:/fiber" "nervos/fiber:$version" -c 'set -eu; if [ ! -f /fiber/config.yml ]; then cp /usr/local/share/fiber/config/testnet/config.yml /fiber/config.yml; fi; sed -i "s/127.0.0.1:8227/0.0.0.0:8227/g" /fiber/config.yml'
  if ($LASTEXITCODE -ne 0) { Fail "Fiber container initialization failed." }
  $e=Read-EnvFile
  if (-not $e.FIBER_SECRET_KEY_PASSWORD) { Set-EnvValue "FIBER_SECRET_KEY_PASSWORD" (New-Secret); Info "Generated FIBER_SECRET_KEY_PASSWORD." }
  Set-EnvValue "FIBER_BACKEND" "fnn"
  Info "Fiber directory initialized. Funding and channel opening remain explicit operator actions."
}

switch ($Command.ToLowerInvariant()) {
  "demo" { Start-Mode "demo" }
  "init-testnet" { Init-Testnet }
  "doctor" { Doctor }
  "testnet" { Start-Mode "testnet" }
  "fiber-init" { Fiber-Init ($Rest | Select-Object -First 1) }
  "testnet-fiber" {
    if (-not (Test-Path ".runtime\fiber-node\config.yml") -or -not (Test-Path ".runtime\fiber-node\ckb\key")) { Fail "Run .\deploy.ps1 fiber-init <key-path> first." }
    Start-Mode "testnet-fiber"
  }
  "smoke" { Require-Docker; $mode = if ($Rest.Count) { $Rest[0] } else { "testnet" }; Smoke $mode }
  "status" { Require-Docker; $mode = if ($Rest.Count) { $Rest[0] } else { "demo" }; Compose $mode @("ps") }
  "logs" {
    Require-Docker; $mode=if ($Rest.Count) {$Rest[0]} else {"demo"}; $more=@("logs","-f","--tail=200"); if ($Rest.Count -gt 1) {$more += $Rest[1]}; Compose $mode $more
  }
  "backup-state" { Require-Docker; $mode = if ($Rest.Count) { $Rest[0] } else { "testnet" }; Backup-State $mode }
  "stop" { Require-Docker; $mode = if ($Rest.Count) { $Rest[0] } else { "demo" }; Compose $mode @("down") }
  "help" { Show-Help }
  "-h" { Show-Help }
  "--help" { Show-Help }
  default { Show-Help; Fail "Unknown command: $Command" }
}
