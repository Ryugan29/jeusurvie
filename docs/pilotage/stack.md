# Jeu de survie fantasy — stack

## Résumé (copié tel quel dans chaque brief)
Jeu vidéo solo de survie en 3D, vue à la 3e personne, univers fantasy original et stylisé.
Monde généré procéduralement à partir d'une graine (seed), vaste (rayon ≈ 8 km, bord en montagnes) : terrain naturel
(heightmap par bruit maison déterministe) réparti en biomes (cartes de température/humidité ; chaque biome définit relief,
végétation, ressources et créatures), découpé en tronçons (chunks) générés dans un Web Worker et chargés autour du joueur ;
terrain non modifiable, constructions posées dessus.
Menaces : animaux et monstres en v1, dragons plus tard (IA d'ennemis déterministe, testable hors moteur).
Langage : TypeScript partout. Moteur 3D : Babylon.js (rendu, caméra, animations, lumière) ; collisions cinématiques
dans le cœur du jeu, sans Havok (ADR 0003). Style stylisé coloré « fantasy », modèles CC0 (ADR 0009).
Outillage de build : Vite. Pas de serveur, pas de comptes : tout tourne chez le joueur.
Cœur du jeu pur à pas fixe (`step`), UI en DOM sans framework (ADR 0008), validation de sauvegarde par valibot.
Sauvegardes locales : IndexedDB dans le navigateur, fichier dans le dossier utilisateur pour le .exe,
derrière un même port `SaveRepository`. Version ordinateur : Electron empaqueté en .exe (electron-builder).
Tests : Vitest (cœur du jeu, sans moteur 3D), Playwright (2-3 parcours : lancer, jouer, sauvegarder/recharger).
Contraintes : le cœur du jeu (règles de survie, combat, inventaire, génération du monde) ne dépend jamais
de Babylon.js ; même graine ⇒ même monde (génération déterministe, testée) ; une sauvegarde ne stocke que la graine
et ce que le joueur a changé (ressources récoltées, constructions, état du joueur), jamais le terrain ;
budget de performance : 60 images/s visées sur un PC moyen dans le navigateur, mesuré dès le premier prototype.

## Couches présentes
UI : oui (HUD et menus en HTML/CSS par-dessus la scène 3D) — Serveur/API : non — Données : oui (sauvegardes locales)
— Infra : non — Packaging desktop : oui (Electron, Windows .exe)

## Commandes (lancées par le superviseur pour vérifier)
installer : `npm install` · lancer en local : `npm run dev` · lancer le .exe en dev : `npm run electron:dev`
tests unitaires : `npm test` · tests de bout en bout : `npm run test:e2e`
lint : `npm run lint` · typecheck : `npm run typecheck` · build web : `npm run build`
build .exe : `npm run dist:win` · audit des dépendances : `npm audit` (complet : Electron est en devDependencies)
· fuses du .exe : `npx @electron/fuses read --app <chemin du .exe>` · mesure beauté/fluidité : `npm run dev` puis `?bench=1`

## Environnement local pour les tests
Aucun service externe. Tests du cœur en mémoire (faux `SaveRepository`, horloge et aléatoire injectés).
Tests de bout en bout sur `npm run preview` en local.

## Sécurité propre à la stack
contrôle d'accès : pas de compte, mais deux frontières réelles — rendu ↔ processus principal Electron (IPC vérifiée,
preload à 6 fonctions sans chemin, chemins confinés) et données non fiables (fichiers importés, stockage navigateur
possiblement partagé sur itch.io) : tout passe par `load()` ; règles R1-R15 dans docs/03-archi.md §12 (ADR 0007)
· config exposée au client : tout le code livré est lisible, aucun secret ne doit y figurer
· gestion des secrets : aucun pour l'instant ; certificat de signature du .exe (plus tard) hors repo ; `.gitignore`
couvre *.pfx *.p12 *.pem *.key *.cer *.spc
· durcissement Electron : protocole `app://` confiné, `contextIsolation`, `sandbox`, `nodeIntegration: false`, fuses
verrouillés, permissions refusées sauf capture souris/plein écran, navigation et fenêtres bloquées, CSP stricte +
Trusted Types, aucune ressource réseau (décodeurs Babylon auto-hébergés)
· XSS : `textContent` uniquement, `innerHTML`/`eval` interdits par ESLint
· triche : solo, donc tolérée ; une sauvegarde modifiée ne doit jamais planter le jeu
· outil d'audit : `npm audit` complet

## Déploiement
environnements : local · prévisualisation (build web) · version publiée
plateforme : itch.io (page du jeu : version navigateur jouable + téléchargement du .exe) — à confirmer en phase déploiement
CI : GitHub Actions si le code est mis sur GitHub (lint, typecheck, tests, build web + .exe) — à décider en phase déploiement
migrations : versions de format de sauvegarde, migrées au chargement (chaque sauvegarde porte un numéro de version)
rollback : republier la version précédente sur itch.io

## Conventions
commits : `<gitmoji> type(scope): message` · branches : `main` + une branche par story
· règles particulières : univers 100 % original (aucun nom, lieu, personnage ni visuel repris d'un jeu existant) ;
assets 3D/son uniquement sous licence libre compatible usage commercial (ex. CC0), source notée dans `assets/CREDITS.md`

## Outillage disponible pour cette stack
skills : `pilote-*` · navigateur intégré (pour montrer le jeu à José) · aucun connecteur d'hébergement branché

## Casting
- Concepteur de données → `database-architect` limité au format de sauvegarde et à ses versions.
- Écrivain de code → `frontend-developer` pour toutes les couches (cœur, moteur 3D, UI, Electron).
- Game designer → `game-designer` présent en cadrage, maquette, et en relecture des stories de gameplay.
