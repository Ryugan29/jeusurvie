# ADR 0005 — Format de sauvegarde, versions et validation
**Statut** : accepté — 2026-10-30

## Contexte
La sauvegarde doit être petite, lisible, identique sur disque et à l'export, robuste aux fichiers abîmés ou modifiés, et
survivre aux mises à jour du jeu. Le joueur n'est pas technique : une partie perdue est inacceptable.

## Décision
- **Un monde = un document JSON** (`SaveFile { format, formatVersion, gameVersion, body }`), réécrit en entier
  (≈ 150-250 Ko après 10 h). On ne stocke que ce qui ne se recalcule pas depuis la graine.
- **Non sauvegardé** : terrain, ressources non récoltées, ruines non fouillées, créatures, endurance, assaut en cours, PRNG.
- Horloge : `elapsedSeconds`, `day` (continue après une mort), `dayFraction`, `nextAssaultDay` ; phase dérivée.
- Récoltes : `Record<ResourceId, secondes>`, purgé une fois la ressource repoussée.
- `load(raw)` unique, sans exception : taille avant lecture (≤ 5 Mo) → parse → enveloppe → migrations pures sur données
  validées → schéma valibot strict qui reconstruit → plafonds → bornes → références. Hors bornes : ramené ; sinon refus
  et proposition de la sauvegarde précédente. Sauvegarde plus récente que le jeu : refusée, jamais touchée.
- Réglages séparés, non exportés.

## Options écartées
- **Découpage par chunk** : complique l'atomicité sans gain à cette taille.
- **Binaire ou compressé** : illisible, sans gain.
- **Somme de contrôle** : ne protège de rien en solo, la validation suffit.
- **Réparation automatique détaillée** (« N corrections ») : reportée.
- **Copies avant migration dès maintenant** : inutiles tant que rien n'est publié — **à rétablir avant la première
  publication**, avec une sauvegarde de référence par version.

## Conséquences
Le format peut être cassé librement jusqu'à la première publication.
