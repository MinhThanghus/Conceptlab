# Start the ConceptLab AI dev stack: FastAPI on :8000 and Vite on :5173.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) { Write-Error 'Backend venv missing. See README "Setup".'; exit 1 }
if (-not (Test-Path (Join-Path $backend '.env'))) { Write-Warning 'backend\.env not found - AI features will report "not configured". Copy .env.example to .env.' }
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) { Write-Error 'Run "npm ci" in frontend first.'; exit 1 }

& $python -m app.cli init-db | Out-Host
$api = Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000' -WorkingDirectory $backend -PassThru -NoNewWindow
try {
    Push-Location $frontend
    npm run dev
} finally {
    Pop-Location
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force }
}
