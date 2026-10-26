$ErrorActionPreference = 'Stop'
$taskScript = Join-Path $PSScriptRoot 'server.mjs'
$taskListeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue)
foreach ($taskListener in $taskListeners) {
    $taskServerProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskListener.OwningProcess)
    if ($taskServerProcess.Name -eq 'node.exe' -and $taskServerProcess.CommandLine -and $taskServerProcess.CommandLine.Contains($taskScript)) {
        Stop-Process -Id $taskServerProcess.ProcessId
    }
}
