param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$toolRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $toolRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $toolRoot "dist\SpriteCheck-$version-win-x64" }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot -eq [IO.Path]::GetPathRoot($outputRoot)) { throw 'Do not build into a drive root.' }
$sdkRoot = Join-Path $PSScriptRoot 'vendor\webview2'
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) { throw 'Extract the Microsoft.Web.WebView2 NuGet SDK to desktop/vendor/webview2 first. See README.' }
$compiler = 'C:\Program Files\dotnet\sdk\10.0.401\Roslyn\bincore\csc.dll'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Get-ChildItem -Path 'C:\Program Files\dotnet\sdk\*\Roslyn\bincore\csc.dll' | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $compiler) { throw 'A .NET SDK with Roslyn is required to build (not required to run).' }
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$appRoot = Join-Path $outputRoot 'app'
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
foreach ($name in @('index.html','style.css','app.mjs','core.mjs','png.mjs','file-drop.mjs','project-file.mjs','compare-model.mjs','compare-view.mjs','shortcuts.mjs','layout.mjs','file-menu.mjs','update.mjs')) {
    Copy-Item -LiteralPath (Join-Path $toolRoot $name) -Destination $appRoot
}
New-Item -ItemType Directory -Path (Join-Path $appRoot 'assets') -Force | Out-Null
# Publish tool icons and synthetic fixtures only. Never publish Artist sheets.
foreach ($name in @('sprite-check.ico','sprite-check-icon.png','sprite-check-icon-64.png','test-sheet.png')) {
    Copy-Item -LiteralPath (Join-Path $toolRoot "assets\$name") -Destination (Join-Path $appRoot 'assets')
}
Copy-Item -LiteralPath (Join-Path $toolRoot 'assets\sprite-check.ico') -Destination $outputRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'SpriteCheck.exe.config') -Destination (Join-Path $outputRoot 'Sprite Check.exe.config')
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) {
    Copy-Item -LiteralPath (Join-Path $sdkRoot "lib\net462\$name") -Destination $outputRoot
}
Copy-Item -LiteralPath (Join-Path $sdkRoot 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $outputRoot
$licenseRoot = Join-Path $outputRoot 'licenses'
New-Item -ItemType Directory -Path $licenseRoot -Force | Out-Null
foreach ($name in @('LICENSE.txt','NOTICE.txt')) { Copy-Item -LiteralPath (Join-Path $sdkRoot $name) -Destination $licenseRoot }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vendor\version.txt') -Destination (Join-Path $licenseRoot 'WebView2-SDK-version.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README-release.txt') -Destination (Join-Path $outputRoot 'README.txt')
Copy-Item -LiteralPath (Join-Path $toolRoot 'README.md') -Destination (Join-Path $outputRoot 'GUIDE.md')
foreach ($name in @('Unity')) { Copy-Item -LiteralPath (Join-Path $toolRoot $name) -Destination $outputRoot -Recurse -Force }
$arguments = @($compiler,'/nologo','/target:winexe','/platform:x64','/optimize+','/langversion:7.3',
    "/out:$(Join-Path $outputRoot 'Sprite Check.exe')", "/win32icon:$(Join-Path $toolRoot 'assets\sprite-check.ico')",
    "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')",'/nostdlib+',
    "/reference:$(Join-Path $framework 'mscorlib.dll')")
foreach ($name in @('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll')) {
    $arguments += "/reference:$(Join-Path $framework $name)"
}
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) {
    $arguments += "/reference:$(Join-Path $outputRoot $name)"
}
$helperArguments = @($arguments | Where-Object { $_ -notlike '/out:*' })
$helperArguments += @("/out:$(Join-Path $outputRoot 'SpriteCheck.Updater.exe')",'/main:UpdateProgram',(Join-Path $PSScriptRoot 'UpdateService.cs'),(Join-Path $PSScriptRoot 'Updater.cs'))
& dotnet @helperArguments
if ($LASTEXITCODE -ne 0) { throw "Updater build failed: $LASTEXITCODE" }
$arguments += @('/main:Program',(Join-Path $PSScriptRoot 'SpriteCheck.cs'),(Join-Path $PSScriptRoot 'UpdateService.cs'),(Join-Path $PSScriptRoot 'Updater.cs'))
& dotnet @arguments
if ($LASTEXITCODE -ne 0) { throw "C# build failed: $LASTEXITCODE" }
Write-Output "Built: $(Join-Path $outputRoot 'Sprite Check.exe')"
