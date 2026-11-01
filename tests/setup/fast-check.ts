import fc from 'fast-check';

// Graine fixée par tests/setup/fast-check-seed.global.ts (affichée en tête de `npm test`).
const seed = Number(process.env['FC_SEED'] ?? 20261030);

// Nombre d'essais borné pour garder `npm test` rapide ; augmenter localement pour une chasse aux bugs.
fc.configureGlobal({ numRuns: 100, seed });
