# Visual check in one command: builds the game (Windows), runs it with -capture (morning, noon, dusk, night screenshots, then
# quits) and prints what the game logged. Unity must be closed on this project, and Unity Hub open (it holds the licence).
#   powershell -ExecutionPolicy Bypass -File "Tools~/Capture/capture.ps1" [-Quality high] [-SkipBuild]
param(
    [ValidateSet('low', 'medium', 'high', 'ultra')] [string]$Quality = 'high',
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

$project = (Resolve-Path "$PSScriptRoot/../..").Path
$version = ((Get-Content "$project/ProjectSettings/ProjectVersion.txt" | Select-String 'm_EditorVersion:').ToString() -split ':\s*')[1].Trim()
$unity = "C:/Program Files/Unity/Hub/Editor/$version/Editor/Unity.exe"
$out = Join-Path $project 'Builds/Capture'
$exe = Join-Path $out 'JeuSurvie.exe'
$photos = Join-Path $out 'photos'

if (-not (Test-Path $unity)) { throw "Éditeur Unity $version introuvable : $unity" }

if (-not $SkipBuild) {
    Write-Host "Fabrication du jeu (quelques minutes)…"
    $p = Start-Process $unity -Wait -PassThru -ArgumentList @('-batchmode', '-quit', '-projectPath', "`"$project`"",
        '-buildWindows64Player', "`"$exe`"", '-logFile', "`"$out/build.log`"")
    if ($p.ExitCode -ne 0) { throw "Fabrication ratée (code $($p.ExitCode)) : voir $out/build.log" }
}

New-Item -ItemType Directory -Force $photos | Out-Null
Get-ChildItem $photos -Filter *.png | Remove-Item
Write-Host "Lancement du jeu et prise des photos…"
$p = Start-Process $exe -Wait -PassThru -ArgumentList @('-screen-fullscreen', '0', '-screen-width', '1600', '-screen-height', '900',
    '-qualite', $Quality, '-capture', "`"$photos`"", '-logFile', "`"$out/player.log`"")
if ($p.ExitCode -ne 0) { throw "Le jeu s'est arrêté avec le code $($p.ExitCode) : voir $out/player.log" }

Write-Host "`nPhotos : $photos"
Get-ChildItem $photos -Filter *.png | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host "`nMessages du jeu (avertissements et erreurs) :"
Select-String -Path "$out/player.log" -Pattern 'JeuSurvie\]|Exception|error|illisible|introuvable|wrong streams' |
    ForEach-Object { Write-Host "  $($_.Line)" }
