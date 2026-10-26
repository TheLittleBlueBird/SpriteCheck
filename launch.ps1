$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskUrl = 'http://127.0.0.1:4317'
$taskRunning = $false
try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/health" -TimeoutSec 2; $taskRunning = $taskHealth.app -eq 'sprite-check' } catch {}
if (-not $taskRunning) {
    $taskNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $taskNode) { throw 'Node.js is required. Install Node.js, then open this launcher again.' }
    Start-Process -FilePath $taskNode -ArgumentList ('"' + (Join-Path $taskRoot 'server.mjs') + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        Start-Sleep -Milliseconds 150
        try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/health" -TimeoutSec 1; if ($taskHealth.app -eq 'sprite-check') { $taskRunning = $true; break } } catch {}
    }
    if (-not $taskRunning) { throw 'Sprite Check could not start on port 4317. Check whether another app uses that port.' }
}
Start-Process $taskUrl
