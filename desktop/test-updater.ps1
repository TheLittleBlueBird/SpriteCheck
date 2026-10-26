param([string]$Package,[string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$toolRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $toolRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $Package) { $Package = Join-Path $toolRoot "dist\SpriteCheck-$version-win-x64.zip" }
if (-not $EvidenceDirectory) { $EvidenceDirectory = Join-Path $toolRoot 'dist\updater-tests' }
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$compiler = Get-ChildItem -Path 'C:\Program Files\dotnet\sdk\*\Roslyn\bincore\csc.dll' | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$runner = Join-Path $EvidenceDirectory 'UpdaterTests.exe'
$arguments = @($compiler,'/nologo','/target:exe','/platform:x64','/langversion:7.3','/main:UpdaterTests',"/out:$runner",'/nostdlib+',"/reference:$(Join-Path $framework 'mscorlib.dll')")
foreach ($name in @('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll')) { $arguments += "/reference:$(Join-Path $framework $name)" }
foreach ($name in @('UpdateService.cs','Updater.cs','UpdaterTests.cs')) { $arguments += Join-Path $PSScriptRoot $name }
& dotnet @arguments
if ($LASTEXITCODE -ne 0) { throw 'Updater test build failed' }
& $runner $Package $EvidenceDirectory
if ($LASTEXITCODE -ne 0) { throw 'Updater tests failed' }
