// Exécuté une fois, avant les tests : choisit la graine fast-check (FC_SEED ou valeur fixe) et l'affiche,
// pour qu'un échec de propriété puisse être rejoué à l'identique : FC_SEED=<graine> npm test.
export default function setup(): void {
  const fromEnv = Number(process.env['FC_SEED']);
  const seed = process.env['FC_SEED'] !== undefined && Number.isInteger(fromEnv) ? fromEnv : 20261030;
  process.env['FC_SEED'] = String(seed);
  console.info(`[fast-check] graine ${seed} (FC_SEED=${seed} npm test pour rejouer)`);
}
