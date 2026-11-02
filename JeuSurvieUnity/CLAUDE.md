# CLAUDE.md — projet Unity « Jeu Survie »

Les règles de qualité du dépôt (`../CLAUDE.md`) s'appliquent. Spécificités du projet Unity :

## Au début de chaque session
1. Lire `MIGRATION_STATUS.md`, `MIGRATION_BLOCKERS.md`, `MIGRATION_ROADMAP.md`, puis `MIGRATION_PARITY.md`.
2. Vérifier l'état réel : `git log`, puis les trois vérifications ci-dessous.

## Vérifications (à lancer après chaque changement)
- Parité et comportement : `cd Tools~/CoreTests && dotnet test`
- Compilation de tout le C# : `cd Tools~/UnityCompileCheck && dotnet build && dotnet build -p:Variant=Minimal`
  (nécessite les assemblies UnityEngine : paquet NuGet `unityengine.modules` 2021.3.33, chemin `-p:UnityRef=…` ; ou, mieux,
  l'éditeur Unity lui-même).
- Shaders : `python3 Tools~/ShaderCheck/check_shaders.py Assets/JeuSurvie/Shaders` (glslang)
- Dans Unity : Test Runner → EditMode ; Play.

## Architecture (ne pas casser)
- `Scripts/Core` (asmdef `noEngineReferences`) : règles et calculs purs. Jamais `UnityEngine` ici.
- Le générateur de monde (genVersion 1) est **scellé** : toute modification doit garder les valeurs d'or
  (`Tests/EditMode/WorldParityTests.cs`) ; sémantique JS conservée (`MathUtil.JsRound`, `Hash.Hash2`, floats `(float)`).
- `Scripts/Runtime` : adaptateurs Unity sans règle de jeu ; `GameBootstrap` est la racine de composition.
- Couleurs vers les shaders : vecteurs linéaires (`ShaderGlobals.V`) ; vers les API Unity de couleur : `ShaderGlobals.ForUnityColor`.
- Profils graphiques : `Core/RenderData/Quality.cs` est le seul endroit qui fixe ce que la carte graphique fait.
- Fixtures de parité : régénérables depuis le TS d'origine (`Tools~/parity`).
