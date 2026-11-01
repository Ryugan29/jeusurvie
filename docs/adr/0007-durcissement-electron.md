# ADR 0007 — Durcissement d'Electron, IPC et sécurité du jeu
**Statut** : accepté — 2026-10-30 — **modifie `docs/pilotage/stack.md`** (« contrôle d'accès sans objet » était faux)

## Contexte
Pas de compte ni de serveur, mais deux frontières réelles : le rendu ↔ le processus principal d'Electron (qui a accès au
disque), et les fichiers importés ou le stockage du navigateur (non fiables, origine itch.io possiblement partagée).

## Décision
Configuration et règles R1 à R15 de `docs/03-archi.md` §12 : isolation, sandbox, protocole `app://` confiné, navigation
et fenêtres bloquées, permissions refusées sauf capture souris et plein écran, CSP stricte avec Trusted Types, IPC qui
vérifie l'expéditeur, les types, l'identifiant et la taille, preload à 6 fonctions sans chemin, dialogues dans le
processus principal, fuses verrouillés, aucune ressource réseau, `textContent` uniquement, aucun chemin absolu stocké,
`window.__game` absent de la production, `npm audit` complet avant chaque sortie. Le processus principal vérifie taille
et JSON ; la validation complète se fait dans le cœur à chaque `load()`.

## Options écartées
- **Revalider le schéma complet dans le processus principal** : obligerait `electron/` à importer le cœur ou à dupliquer
  le schéma ; la barrière est `load()`, appliquée à toute lecture.
- **Mise à jour automatique en v1** : exige un .exe signé et un canal protégé ; itch gère les mises à jour.
- **`file://`** : workers, CSP et origine de stockage instables.

## Conséquences
Sans certificat, Windows affichera « éditeur inconnu » : accepté en v1, décision de José à la phase déploiement. Le
certificat éventuel reste hors repo.
