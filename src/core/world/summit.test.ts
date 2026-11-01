import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findSummit } from './summit';
import { heightAt } from './terrain';

describe('findSummit (sommet le plus haut d’une zone, trouvé de façon déterministe)', () => {
  const search = { radiusM: 1500, gridStepM: 250 };

  it('déterministe, et le point rendu a bien la hauteur annoncée', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (s) => {
        const a = findSummit(s, search);
        expect(findSummit(s, search)).toEqual(a);
        expect(a.height).toBe(heightAt(s, a.x, a.z));
        const limit = search.radiusM + search.gridStepM; // la montée reste dans le rayon + un pas de grille
        expect(a.x * a.x + a.z * a.z).toBeLessThanOrEqual(limit * limit);
      }),
      { numRuns: 10 },
    );
  });

  it('au moins aussi haut que tous les points de la grille de recherche, et que ses voisins immédiats', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (s) => {
        const top = findSummit(s, search);
        for (let x = -search.radiusM; x <= search.radiusM; x += search.gridStepM) {
          for (let z = -search.radiusM; z <= search.radiusM; z += search.gridStepM) {
            if (x * x + z * z <= search.radiusM * search.radiusM) expect(top.height).toBeGreaterThanOrEqual(heightAt(s, x, z));
          }
        }
        const limit = search.radiusM + search.gridStepM;
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
          const x = top.x + dx, z = top.z + dz;
          if (x * x + z * z <= limit * limit) expect(top.height).toBeGreaterThanOrEqual(heightAt(s, x, z));
        }
      }),
      { numRuns: 5 },
    );
  });
});
