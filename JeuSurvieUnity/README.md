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

## Commandes du jeu
ZQSD/WASD (touches physiques) marcher · souris regarder · molette distance · Maj marche lente · Échap pause ·
F panneau · O réglages graphiques.
Récolte : **clic gauche (maintenu)** utiliser l'outil en main (abattre, casser, extraire, faucher, bêcher) · **E** cueillir,
ramasser une branche ou un objet au sol · **1 à 8** prendre l'outil du raccourci (réappuyer : mains nues) · **Tab** sac
(glisser : déplacer, empiler, échanger · clic droit : diviser · glisser sur la barre : raccourci · glisser hors du sac :
déposer · Tab ou Échap : fermer).
Démo : F1 matin · F2 midi · F3 crépuscule · F4 nuit · F5 cycle ×60 · F6 météo suivante.

## Récolte, outils, inventaire, sauvegarde
- Règles (Core, testées) : `Core/Config/ItemData.cs` (objets, outils et qualités pierre/cuivre/fer) et
  `Core/Config/HarvestData.cs` (outil, travail, gains, repousse de chaque ressource) sont les seuls endroits à régler.
- Camp de départ (zone d'essai) devant l'arrivée : les outils sur un tronc et une ressource de chaque sorte autour.
- Sauvegarde automatique (chaque minute, à la pause, en quittant) dans
  `%USERPROFILE%\AppData\LocalLow\<société>\JeuSurvieUnity\sauvegardes\monde-<graine>.json` (précédente en `.bak`) ;
  « Nouvelle partie » (voile de pause, deux clics) met l'ancienne de côté sans l'effacer. `-sauvegarde=0` : partie non
  enregistrée (les captures et les tests ne touchent jamais à la sauvegarde).
- Modèles : `Tools~/Blender/recolte.py` (objets, décor récoltable, icônes) ; les 12 outils en haute définition par
  `Tools~/Blender/outils_hd.py` (matières CC0 Poly Haven dans `Tools~/Sources/polyhaven`, hors git) ; sons Kenney CC0 dans
  `Assets/JeuSurvie/Resources/Audio`.
- Animations de l'héroïne : `Tools~/Blender/animations.py … export <dossier heroine>` transfère les mouvements Mixamo et
  Quaternius 2 (`Tools~/Sources/mixamo`, `Tools~/Sources/quaternius-ual2`, hors git) sur son squelette et écrit
  `models/characters/heroine/animations.gltf` + `animations.json` (moment du coup, vitesse) ; `… candidats` fait les
  planches de choix ; `Tools~/Blender/test_anim.py` teste le transfert. Durées des gestes : `HarvestData.Gestures`.
  (`gestes.py` et `hero.gltf` ne servent plus.)

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
- Unity : Window → General → Test Runner → EditMode (103 tests) et PlayMode (11 tests, dont le parcours complet de récolte
  au camp, photos dans `Builds/Capture/recolte-*.png`).
- Hors Unity : `cd Tools~/CoreTests && dotnet test`.
