// Recherche déterministe du plus haut sommet d'une zone (sert à « apparaître près d'un sommet enneigé » dans la
// démo, et préfigure la recherche du point de départ). Lit le monde par heightAt seulement.
import { heightAt } from './terrain';

export interface SummitSearch {
  /** Rayon de recherche autour de l'origine (m). */
  readonly radiusM: number;
  /** Pas de la grille de départ (m). */
  readonly gridStepM: number;
}

export interface Summit {
  readonly x: number;
  readonly z: number;
  readonly height: number;
}

/**
 * Grille grossière, puis montée locale par pas décroissants, le dernier valant exactement 2 m (à égalité : le premier
 * trouvé). La montée reste dans le rayon + un pas de grille (sommet proche du bord de la zone).
 */
export function findSummit(seed: number, search: SummitSearch): Summit {
  let best: Summit = { x: 0, z: 0, height: heightAt(seed, 0, 0) };
  const r = search.radiusM, r2 = r * r;
  const limit = r + search.gridStepM, limit2 = limit * limit;
  for (let x = -r; x <= r; x += search.gridStepM) {
    for (let z = -r; z <= r; z += search.gridStepM) {
      if (x * x + z * z > r2) continue;
      const height = heightAt(seed, x, z);
      if (height > best.height) best = { x, z, height };
    }
  }
  for (let step = Math.max(2, search.gridStepM / 2); ; step = Math.max(2, step / 2)) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        const x = best.x + dx, z = best.z + dz;
        if (x * x + z * z > limit2) continue;
        const height = heightAt(seed, x, z);
        if (height > best.height) {
          best = { x, z, height };
          moved = true;
        }
      }
    }
    if (step === 2) break;
  }
  return best;
}
