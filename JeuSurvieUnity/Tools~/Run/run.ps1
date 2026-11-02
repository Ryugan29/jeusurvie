# Plays the game without opening the Unity editor: builds it (Windows) only when the project changed since the last build,
# then starts it. Called by run.bat at the root of the repository; extra arguments go to the game (e.g. -qualite ultra).
param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$GameArgs)
$ErrorActionPreference = 'Stop'

$project = (Resolve-Path "$PSScriptRoot/../..").Path
$out = Join-Path $project 'Builds/Jeu'
$exe = Join-Path $out 'JeuSurvie.exe'
$stamp = Join-Path $out '.stamp'
$log = Join-Path $out 'build.log'
$hubWaitSeconds = 30

function Fail([string]$message) {
    Write-Host "`n$message" -ForegroundColor Red
    exit 1
}

# What a build is made of (code, scene, assets, models, settings, packages): file count (catches deletions) and newest change.
function Get-SourceState {
    $files = Get-ChildItem -Path (Join-Path $project 'Assets'), (Join-Path $project 'Packages'), (Join-Path $project 'ProjectSettings') -Recurse -File
    $newest = $files | Measure-Object -Property LastWriteTimeUtc -Maximum | Select-Object -ExpandProperty Maximum
    return @{ Count = $files.Count; Newest = $newest }
}

# The stamp holds the source file count; its date is the moment the last build STARTED (edits made during a build count).
function Test-BuildNeeded {
    if (-not (Test-Path $exe) -or -not (Test-Path $stamp)) { return $true }
    $state = Get-SourceState
    return $state.Newest -gt (Get-Item $stamp).LastWriteTimeUtc -or "$($state.Count)" -ne (Get-Content $stamp -Raw).Trim()
}

function Test-ProjectOpenInEditor {
    $mine = [regex]::Escape($project.Replace('\', '/'))
    $editors = Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Replace('\', '/') -match $mine }
    return [bool]$editors
}

# Unity in the background needs the licence held by Unity Hub (its licensing client).
function Start-HubIfNeeded {
    if (Get-Process 'Unity.Licensing.Client' -ErrorAction SilentlyContinue) { return }
    $hub = Get-StartApps | Where-Object { $_.Name -like '*Unity Hub*' } | Select-Object -First 1
    if (-not $hub) { Fail "Unity Hub est introuvable : ouvre-le une fois (il garde ta licence Unity), puis relance run.bat." }
    Write-Host "Ouverture de Unity Hub (il garde ta licence Unity)…"
    Start-Process "shell:AppsFolder\$($hub.AppID)"
    for ($i = 0; $i -lt $hubWaitSeconds; $i++) {
        if (Get-Process 'Unity.Licensing.Client' -ErrorAction SilentlyContinue) { return }
        Start-Sleep -Seconds 1
    }
    Fail "Unity Hub ne répond pas : ouvre-le, vérifie que tu es connecté à ton compte, puis relance run.bat."
}

function Invoke-Build {
    $version = ((Get-Content (Join-Path $project 'ProjectSettings/ProjectVersion.txt') | Select-String 'm_EditorVersion:').ToString() -split ':\s*')[1].Trim()
    $unity = "C:/Program Files/Unity/Hub/Editor/$version/Editor/Unity.exe"
    if (-not (Test-Path $unity)) { Fail "Unity $version n'est pas installé : installe-le depuis Unity Hub (onglet Installs)." }
    if (Test-ProjectOpenInEditor) { Fail "Le projet est ouvert dans Unity : ferme-le (Unity Hub peut rester ouvert), puis relance run.bat." }
    Start-HubIfNeeded
    New-Item -ItemType Directory -Force $out | Out-Null
    $started = (Get-Date).ToUniversalTime()
    $count = (Get-SourceState).Count
    Write-Host "Fabrication du jeu (1 à 5 minutes, Unity travaille sans fenêtre)…"
    $p = Start-Process $unity -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-batchmode', '-quit', '-projectPath', "`"$project`"",
        '-buildWindows64Player', "`"$exe`"", '-logFile', "`"$log`"")
    if ($p.ExitCode -ne 0 -or -not (Test-Path $exe)) {
        if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'No valid Unity Editor license' -Quiet)) { Fail "Licence Unity non trouvée : ouvre Unity Hub, connecte-toi, puis relance run.bat." }
        Fail "La fabrication a échoué (code $($p.ExitCode)). Détail : $log"
    }
    Set-Content -Path $stamp -Value $count
    (Get-Item $stamp).LastWriteTimeUtc = $started
    Write-Host "Jeu fabriqué."
}

if (Test-BuildNeeded) { Invoke-Build } else { Write-Host "Rien n'a changé depuis la dernière fabrication : lancement direct." }
Write-Host "Lancement du jeu…"
if ($GameArgs) { Start-Process $exe -ArgumentList $GameArgs } else { Start-Process $exe }
