# État réel de la migration

_Mis à jour : 2026-11-02 — branche `claude/adoring-bell-n8hwym`._

## En une phrase
Tout le jeu Babylon.js existant (le « spike beau et fluide » : monde procédural infini, végétation, héroïne, démon, cycle
jour/nuit, météo, ciel, pluie, profils graphiques, réglages) est **porté en code Unity 6.6 / URP** ; la logique est **prouvée
identique** au TypeScript par des tests, le reste est **compilé et vérifié syntaxiquement mais pas encore exécuté dans Unity**.

## Vérifié (preuves exécutées ici)
| Vérification | Commande | Résultat |
|---|---|---|
| Suite d'origine (référence) | `npm test` (racine) | 781/781 verts |
| Parité + comportement du port C# | `cd JeuSurvieUnity/Tools~/CoreTests && dotnet test` | **28/28 verts** (valeurs d'or genVersion 1 bit à bit, 5 chunks complets, ressources, couvre-sol, maillages, météo, lumière, atmosphère, session de 1 200 images) |
| Compilation de tout le C# Unity | `cd JeuSurvieUnity/Tools~/UnityCompileCheck && dotnet build` (+ `-p:Variant=Minimal`) | 0 erreur, 2 variantes |
| Shaders HLSL | `python3 JeuSurvieUnity/Tools~/ShaderCheck/check_shaders.py JeuSurvieUnity/Assets/JeuSurvie/Shaders` | 120/120 points d'entrée |
| Régénération des fixtures depuis le TS | `npx vitest run --config JeuSurvieUnity/Tools~/parity/vitest.parity.config.ts` | OK |

## Non vérifié (voir MIGRATION_BLOCKERS.md)
- Ouverture, compilation et exécution **dans Unity** (éditeur indisponible ici).
- **Rendu visuel** : aucune image Unity n'a été vue.
- **Performances** : rien de mesuré.
- Végétation et personnages : dépendent des assets CC0 absents du dépôt.

## Contenu du projet
- `Assets/JeuSurvie/Scripts/Core` — 40 fichiers (~3 600 lignes), port pur (asmdef sans moteur).
- `Assets/JeuSurvie/Scripts/Runtime` — 18 fichiers (~3 000 lignes) : composition, streaming, rendu, végétation, personnages, entrées, UI.
- `Assets/JeuSurvie/Scripts/Editor` — configuration automatique, import des assets Babylon.
- `Assets/JeuSurvie/Shaders` — 8 shaders URP + include commun.
- `Assets/JeuSurvie/Tests/EditMode` — tests NUnit (Unity Test Runner et dotnet) + fixtures de parité.
- `Tools~/` — outillage hors Unity (ignoré par l'éditeur) : tests dotnet, vérification de compilation, vérification de shaders,
  générateur de fixtures.

## Parité
Voir MIGRATION_PARITY.md : 100 % des systèmes du jeu existant ont une contrepartie Unity ; statut « Testé » pour le cœur
(26 modules), « Implémenté » pour le rendu, l'interface et les personnages ; **0 « Validé »** tant que B1 n'est pas levé.
