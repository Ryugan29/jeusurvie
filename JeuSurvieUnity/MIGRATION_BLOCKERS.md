# Blocages et points non vérifiés

## B1 — Éditeur Unity indisponible dans l'environnement de migration (BLOQUANT pour « Validé »)
L'environnement (conteneur Linux sans réseau vers `unity.com`, `download.unity3d.com`, `packages.unity.com`) ne permet ni
d'installer Unity 6000.6.7f1 ni de résoudre les paquets. Conséquences :
- le projet **n'a jamais été ouvert dans Unity** ; la compilation réelle par Unity, l'import des paquets et l'exécution n'ont pas eu lieu ;
- **aucune vérification visuelle** n'a été faite (règle §9 du CLAUDE.md) ;
- **aucune mesure de performance** n'a été faite.

Ce qui a été vérifié à la place :
- `dotnet test` (Tools~/CoreTests) : 28 tests, dont la parité bit à bit avec le TypeScript d'origine — tous verts ;
- `dotnet build` (Tools~/UnityCompileCheck) : TOUT le C# (Core + Runtime + Editor) compile contre les assemblies de référence
  UnityEngine (2021.3, les plus récentes disponibles hors ligne) et des stubs des API de paquets (URP 17 / Render Graph,
  Input System, glTFast 6.20, UnityEditor) écrits d'après la documentation 6000.6 — variante complète et variante de repli ;
- `python3 Tools~/ShaderCheck/check_shaders.py` : les 120 points d'entrée des 8 shaders (chaque passe, mots-clés éteints et
  allumés) compilent avec glslang, les includes URP étant remplacés par des maquettes.

**Action humaine** : ouvrir `JeuSurvieUnity/` dans Unity Hub avec 6000.6.7f1, laisser la configuration automatique se faire,
corriger les éventuelles erreurs de compilation restantes (API de paquets différentes des stubs), lancer le Test Runner
(EditMode) puis Play, et comparer à la version navigateur (`npm run dev`).

## B2 — Assets 3D absents du dépôt (BLOQUANT pour la végétation et les personnages)
`assets/` est ignoré par git dans le projet d'origine (packs CC0 Quaternius : arbres, rochers, herbe, héroïne, héros, démon).
Ils ne sont pas dans ce dépôt et les sites d'origine sont inaccessibles d'ici. Sans eux, comme dans la version navigateur :
pas de végétation ni d'obstacles, la capsule orange remplace l'héroïne, pas de démon — le terrain, le ciel, la météo et tout le
reste fonctionnent.
**Action humaine** : menu *Jeu Survie → Importer les assets du projet Babylon…* (copie `../assets` dans
`Assets/StreamingAssets/assets`), ou lancer avec `-assets <chemin>/assets/models`.

## B3 — Versions exactes des paquets non vérifiables hors ligne
`Packages/manifest.json` : URP `17.6.0` et Test Framework `1.6.0` (paquets cœur liés à l'éditeur : Unity impose sa version),
Input System `1.20.1` (version publiée pour 6000.6 d'après la documentation), glTFast `6.20.0` (série 6.20 documentée ;
le correctif exact peut différer). Si Unity signale une version introuvable, choisir la version proposée par le Package Manager.

## B4 — Champs privés d'URP réglés par réflexion
`m_MainLightShadowmapResolution`, `m_SoftShadowQuality`, `m_AnisotropicFilteringLevel` et les réglages SSAO (`m_Settings`)
n'ont pas de setter public. Si leur nom a changé dans URP 17.6, un avertissement unique s'affiche et la valeur par défaut reste.

## B5 — Écarts visuels assumés, à juger à l'œil
PCSS (ULTRA) remplacé par les ombres douces High d'URP ; reflets à l'écran limités au sol plat mouillé ; rayons de soleil occultés
par toute la profondeur (herbe comprise) ; correspondances approchées pour la vignette, le grain, la teinte d'étalonnage
(ColorCurves Babylon → ColorAdjustments URP) et le seuil du halo.
