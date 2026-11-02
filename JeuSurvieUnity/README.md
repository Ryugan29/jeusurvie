# Jeu Survie — version Unity 6.6 (URP)

Successeur direct du jeu Babylon.js de ce dépôt (`../src`), migré système par système. Rapport complet : voir
`MIGRATION_REPORT.md` ; état et preuves : `MIGRATION_STATUS.md`.

## Ouvrir et lancer
1. Unity Hub → *Add project from disk* → ce dossier `JeuSurvieUnity/` → éditeur **6000.6.7f1**.
2. À la première ouverture, les paquets se résolvent (URP, Input System, glTFast, Test Framework) puis la configuration
   automatique crée l'asset URP, son renderer (SSAO + passes d'atmosphère), l'espace de couleur linéaire et la scène
   `Assets/JeuSurvie/Scenes/Main.unity`. Relançable : menu **Jeu Survie → Configurer le projet**.
   Si Unity demande d'activer le nouveau système d'entrées, accepter (le code marche aussi avec l'ancien).
3. Modèles 3D (CC0, absents du dépôt comme dans la version navigateur) : menu **Jeu Survie → Importer les assets du projet
   Babylon…** (copie `../assets` vers `Assets/StreamingAssets/assets`). Sans eux : terrain, ciel, météo complets, capsule à la
   place de l'héroïne, pas de végétation.
4. **Play**. Cliquer pour capturer la souris.

## Commandes du jeu (identiques à l'original)
ZQSD/WASD (touches physiques) marcher · souris regarder · molette distance · Maj marche lente · Échap pause ·
1 matin · 2 midi · 3 crépuscule · 4 nuit · 5 cycle ×60 · 6 météo suivante · F panneau · O réglages graphiques.

## Paramètres de lancement (ex-paramètres d'adresse)
Dans l'inspecteur de `GameBootstrap` (champ *Launch Arguments*) ou en ligne de commande d'un build :
`-seed 12345 -x -3500 -z -2000 -heure nuit -meteo orage -qualite ultra -lieu montagne -view 512 -regard 0.6 -inclinaison 0.35 -recul 7`
Interrupteurs « =0 » : `-ombres=0 -ao=0 -ssr=0 -rayons=0 -aa=0 -brume=0 -dof=0 -flou=0 -pluie=0 -nuages=0 -vent=0
-translucide=0 -lointain=0 -ibl=0 -magie=0 -elagage=0 -couvert=0 -vegetation=0 -personnages=0 -tenue=0 -post=0 -gouttes=0`
(`-tenue=0` : feuilles de la tenue de l'elfe figées, sans tissu ; `-recul` : distance de la caméra, 2,5 à 14 m ; `-cap 3.14` :
l'elfe tournée vers la caméra, en radians, pour photographier son devant)
· `-couvert 50` (rayon du couvre-sol) · `-tonemap neutre` · `-assets <dossier models>` · `-capture <dossier>` (captures
matin/midi/crépuscule/nuit puis quitte).

## Tests
- Unity : Window → General → Test Runner → EditMode (28 tests).
- Hors Unity : `cd Tools~/CoreTests && dotnet test`.
