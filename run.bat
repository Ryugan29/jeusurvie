@echo off
rem Lance le jeu Unity sans ouvrir l'editeur : le fabrique si le projet a change, puis le demarre.
rem Arguments transmis au jeu, par exemple : run.bat -qualite ultra -heure nuit
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "JeuSurvieUnity\Tools~\Run\run.ps1" %*
if errorlevel 1 pause
