# ADR 0006 — Port de stockage en texte, rotation, IndexedDB et fichier atomique
**Statut** : accepté — 2026-10-30

## Contexte
Deux supports (navigateur, .exe) et un export doivent rester identiques ; une écriture interrompue ne doit jamais
perdre la partie ; deux onglets ne doivent pas s'écraser.

## Décision
- `SaveRepository` ne manipule que du **texte** : `list`, `read → {text, source: 'current'|'previous'}`,
  `write(id, text, expectedRevision)` (refus `conflict` si la révision stockée diffère), `remove`. Une seule suite de
  tests de contrat pour toutes les implémentations.
- Navigateur : IndexedDB, base préfixée, une transaction (garde de révision, current → previous, écriture) ;
  `persist()` après la première sauvegarde réussie.
- Electron : fichiers `world.json` + `world.prev.json` dans `userData/saves/<saveId>/`, écriture `.tmp` → fsync →
  renommages, nouvelles tentatives sous Windows, repli `.tmp` puis `.prev` ; instance unique ; pas de `meta.json`
  (rétabli si la liste de 10 mondes dépasse 300 ms au spike).
- Réglages dans `localStorage` des deux côtés.

## Options écartées
- **Objets stockés tels quels dans IndexedDB** : export et stockage divergent.
- **IndexedDB aussi dans Electron** : sauvegardes invisibles pour le joueur, liées à l'origine `app://`, et contraire au
  critère S7 validé par José.
- **Web Locks** : la garde de révision suffit.
- **Dossier Documents** : souvent synchronisé par OneDrive (verrous, conflits).

## Conséquences
Un test e2e vérifie que sauvegardes et réglages survivent à une mise à jour du .exe (origine `app://game` figée).
