# ADR 0001 — Couches, règle de dépendance et garde-fous automatiques
**Statut** : accepté — 2026-10-30

## Contexte
Tout le code est écrit par une IA. La règle « le cœur du jeu ne dépend de rien » ne tient que si elle est vérifiée par
la machine, pas seulement écrite.

## Décision
Couches `core ← app ← adapters/ui ← main.ts` ; `electron/` séparé et n'important pas `src/`. Garde-fous dès le premier commit :
ESLint par zones de chemin (imports relatifs et `import type` compris), `no-restricted-properties` (`Math.random`,
`Date.now`, `performance.now`) et `no-restricted-globals` dans le cœur, fonctions trigonométriques interdites dans
`core/world`, `innerHTML`/`eval` interdits partout ; TypeScript en project references, cœur sans DOM ni Node ;
un test d'import interdit volontaire vérifie que le lint échoue. Seule dépendance autorisée du cœur : valibot.

## Options écartées
- **Règles écrites sans outil** : non vérifiables, la dérive est certaine.
- **`no-restricted-imports` sur des noms de paquets seulement** : ne bloque ni les imports relatifs ni `Math.random`.
- **Un seul tsconfig** : le cœur verrait la lib DOM.

## Conséquences
Un peu de configuration au départ ; ensuite toute fuite casse le lint. Le code jetable du spike vit dans `src/spike/`,
interdit d'import, supprimé avant S1.
