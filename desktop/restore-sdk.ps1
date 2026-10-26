$ErrorActionPreference = 'Stop'
$sdkVersion = '1.0.4314.35'
$expected = '90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4'
$vendor = Join-Path $PSScriptRoot 'vendor'
New-Item -ItemType Directory -Path $vendor -Force | Out-Null
$package = Join-Path $vendor 'webview2.nupkg'
if (-not (Test-Path -LiteralPath $package)) {
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $package
}
if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'WebView2 SDK checksum mismatch.' }
$sdk = Join-Path $vendor 'webview2'
if (-not (Test-Path -LiteralPath $sdk)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($package, $sdk)
}
Set-Content -LiteralPath (Join-Path $vendor 'version.txt') -Value $sdkVersion -Encoding ascii
Write-Output "WebView2 SDK $sdkVersion verified."
