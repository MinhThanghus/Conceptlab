<#
Run Muse Code headless on this workspace with the handoff prompt (.muse/prompt.md).

    powershell -ExecutionPolicy Bypass -File scripts/run_muse.ps1 [-Model muse-wonder-1.0] [-Effort high]

The provider key is read from backend/.env (MODEL_API_KEY) and piped to `muse exec --api-key-stdin`;
it is never printed. Events go to .muse/run-<time>.jsonl, errors to .muse/run-<time>.err.
TEMP/TMP point inside the workspace because Muse's sandbox cannot write the system temp folder.
#>
param(
  [string]$Model = 'muse-wonder-1.0',
  [string]$Effort = 'high'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$muse = Join-Path $env:LOCALAPPDATA 'Programs\muse\muse.cmd'
if (-not (Test-Path $muse)) { throw "Muse Code not found at $muse" }
$museDir = Join-Path $root '.muse'
$tmp = Join-Path $museDir 'tmp'
New-Item -ItemType Directory -Force $tmp | Out-Null
$env:TEMP = $tmp
$env:TMP = $tmp

$envFile = Join-Path $root 'backend\.env'
$line = Select-String -Path $envFile -Pattern '^MODEL_API_KEY=' | Select-Object -First 1
if (-not $line) { throw 'MODEL_API_KEY is missing from backend/.env' }
$key = $line.Line.Substring('MODEL_API_KEY='.Length).Trim()
if (-not $key) { throw 'MODEL_API_KEY is empty in backend/.env' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $museDir "run-$stamp.jsonl"
$err = Join-Path $museDir "run-$stamp.err"
$prompt = Join-Path $museDir 'prompt.md'

$museArgs = @(
  'exec', '--api-key-stdin', '--json',
  '--model', $Model, '--reasoning-effort', $Effort, '--contributor-mode', 'off',
  '--workspace', $root, '--trust-workspace', '--disable-approval', '--sandbox-network', 'enabled',
  '--prompt-file', $prompt
)
Write-Output "Muse run started $stamp (model $Model, effort $Effort); log $log"
# Windows PowerShell 5 treats native stderr records as errors; Muse emits status messages
# there even on a successful run. Preserve the real native exit code instead of terminating
# on the first stderr record while still recording it for inspection.
$ErrorActionPreference = 'Continue'
$key | & $muse @museArgs 1> $log 2> $err
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$key = $null
Write-Output "Muse run finished with exit code $code"
exit $code
