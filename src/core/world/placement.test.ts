import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { biomeAt } from './biome';
import { CHUNK_SIZE } from './chunk';
import { pathAt } from './paths';
import { FOREST_FACTOR_MAX, forestFactorAt, PATH_CLEAR_THRESHOLD, RESOURCE_CELL_M, resourcesInCells, resourcesInChunk, SPAWN_CLEAR_RADIUS_M, TREE_MAX_SLOPE, treeLineAt, VARIANT_COUNT, type Resource } from './placement';
import { heightAt } from './terrain';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const cell = fc.integer({ min: -900, max: 900 });
const CELLS_PER_CHUNK = CHUNK_SIZE / RESOURCE_CELL_M;
const byId = (list: readonly Resource[]): Map<string, Resource> => new Map(list.map((r) => [r.id, r]));
const slopeAt = (s: number, x: number, z: number): number => {
  const h = heightAt(s, x, z);
  return Math.max(Math.abs(heightAt(s, x + 1, z) - h), Math.abs(heightAt(s, x, z + 1) - h));
};

describe('placement des ressources (végétation, rochers) sur la grille globale', () => {
  it('la grille divise exactement les chunks', () => {
    expect(Number.isInteger(CELLS_PER_CHUNK)).toBe(true);
  });

  it('déterministe ; id « r:{gx}:{gz} » unique, et la ressource est bien dans sa case', () => {
    fc.assert(
      fc.property(seed, cell, cell, (s, gx, gz) => {
        const list = resourcesInCells(s, gx, gz, gx + 6, gz + 6);
        expect(resourcesInCells(s, gx, gz, gx + 6, gz + 6)).toEqual(list);
        expect(byId(list).size).toBe(list.length);
        for (const r of list) {
          expect(Number.isInteger(r.variant) && r.variant >= 0 && r.variant < VARIANT_COUNT).toBe(true);
          const [, cx, cz] = r.id.split(':').map(Number) as [number, number, number];
          expect(r.id).toBe(`r:${cx}:${cz}`);
          expect(Math.floor(r.x / RESOURCE_CELL_M)).toBe(cx);
          expect(Math.floor(r.z / RESOURCE_CELL_M)).toBe(cz);
          expect(r.rotation).toBeGreaterThanOrEqual(0);
          expect(r.rotation).toBeLessThan(1);
          expect(r.scale).toBeGreaterThanOrEqual(0.8);
          expect(r.scale).toBeLessThanOrEqual(1.25);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('indépendant de la taille des chunks : un bloc d’un seul tenant = l’union de ses quatre quarts', () => {
    fc.assert(
      fc.property(seed, cell, cell, (s, gx, gz) => {
        const whole = byId(resourcesInCells(s, gx, gz, gx + 12, gz + 12));
        const parts = byId([
          ...resourcesInCells(s, gx, gz, gx + 6, gz + 6),
          ...resourcesInCells(s, gx + 6, gz, gx + 12, gz + 6),
          ...resourcesInCells(s, gx, gz + 6, gx + 6, gz + 12),
          ...resourcesInCells(s, gx + 6, gz + 6, gx + 12, gz + 12),
        ]);
        expect(parts).toEqual(whole);
      }),
      { numRuns: 20 },
    );
  });

  it('resourcesInChunk = les cases du chunk', () => {
    const c = resourcesInChunk(5, 2, -3);
    expect(c).toEqual(resourcesInCells(5, 2 * CELLS_PER_CHUNK, -3 * CELLS_PER_CHUNK, 3 * CELLS_PER_CHUNK, -2 * CELLS_PER_CHUNK));
  });

  it(`aucune ressource à moins de ${3} m du point de départ`, () => {
    expect(SPAWN_CLEAR_RADIUS_M).toBe(3);
    fc.assert(
      fc.property(seed, (s) => {
        for (const r of resourcesInCells(s, -2, -2, 2, 2)) expect(r.x * r.x + r.z * r.z).toBeGreaterThanOrEqual(9);
      }),
      { numRuns: 200 },
    );
  });

  it('arbres : jamais sur une pente trop raide ni au-dessus de la limite des arbres', () => {
    fc.assert(
      fc.property(seed, cell, cell, (s, gx, gz) => {
        for (const r of resourcesInCells(s, gx, gz, gx + 8, gz + 8)) {
          if (r.kind !== 'tree' && r.kind !== 'pine') continue;
          expect(slopeAt(s, r.x, r.z)).toBeLessThanOrEqual(TREE_MAX_SLOPE);
          expect(heightAt(s, r.x, r.z)).toBeLessThan(treeLineAt(biomeAt(s, r.x, r.z).cold));
        }
      }),
      { numRuns: 40 },
    );
  });

  it('type selon le biome : feuillus et fleurs en forêt, pins dans le froid', () => {
    fc.assert(
      fc.property(seed, cell, cell, (s, gx, gz) => {
        for (const r of resourcesInCells(s, gx, gz, gx + 8, gz + 8)) {
          const cold = biomeAt(s, r.x, r.z).cold;
          if (r.kind === 'tree' || r.kind === 'flowers') expect(cold).toBeLessThan(0.5);
          if (r.kind === 'pine') expect(cold).toBeGreaterThanOrEqual(0.5);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('densité contrôlée : autour du départ (forêt), de 10 à 45 ressources par chunk en moyenne, dont des arbres', () => {
    fc.assert(
      fc.property(seed, (s) => {
        let total = 0, trees = 0;
        for (let cx = -2; cx < 2; cx++) {
          for (let cz = -2; cz < 2; cz++) {
            const list = resourcesInChunk(s, cx, cz);
            total += list.length;
            trees += list.filter((r) => r.kind === 'tree' || r.kind === 'pine').length;
          }
        }
        expect(total / 16).toBeGreaterThanOrEqual(10);
        expect(total / 16).toBeLessThanOrEqual(45);
        expect(trees).toBeGreaterThan(0);
      }),
      { numRuns: 20 },
    );
  });

  it('rien ne pousse sur un sentier (arbres, rochers, buissons, herbe) : pathAt ≤ seuil à chaque position, mais ça pousse au bord', () => {
    for (const s of [12345, 1, 777]) {
      let nearEdge = 0;
      const list = resourcesInCells(s, -60, -60, 60, 60);
      expect(list.length).toBeGreaterThan(1000);
      for (const r of list) {
        const onPath = pathAt(s, r.x, r.z);
        expect(onPath).toBeLessThanOrEqual(PATH_CLEAR_THRESHOLD);
        if (onPath > 0) nearEdge++;
      }
      expect(nearEdge).toBeGreaterThan(0);
    }
  });
});

describe('bosquets et clairières : la forêt se groupe au lieu d’être répartie au hasard', () => {
  /** Arbres et pins (feuillus et résineux) des chunks [-6, 6)² : 12 × 12 chunks, ≈ 770 m de côté. */
  const treesOf = (s: number): Resource[] => {
    const out: Resource[] = [];
    for (let cz = -6; cz < 6; cz++) for (let cx = -6; cx < 6; cx++) out.push(...resourcesInChunk(s, cx, cz).filter((r) => r.kind === 'tree' || r.kind === 'pine'));
    return out;
  };
  /** Nombre d'arbres et de pins dans la même zone AVANT les bosquets (placement uniforme, mêmes graines) : l'ordre de grandeur à garder. */
  const UNIFORM_TREE_COUNT: Readonly<Record<number, number>> = { 12345: 1516, 1: 1601, 777: 1322 };
  const SEEDS = [12345, 1, 777] as const;

  it('forestFactorAt : déterministe, de presque 0 (clairière) à FOREST_FACTOR_MAX (bosquet), de moyenne ≈ 1', () => {
    let sum = 0, n = 0, lowest = Infinity, highest = 0;
    for (let z = -2000; z < 2000; z += 40) {
      for (let x = -2000; x < 2000; x += 40) {
        const f = forestFactorAt(7, x, z);
        expect(forestFactorAt(7, x, z)).toBe(f);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(FOREST_FACTOR_MAX);
        sum += f; n++; lowest = Math.min(lowest, f); highest = Math.max(highest, f);
      }
    }
    expect(sum / n).toBeGreaterThan(0.85);
    expect(sum / n).toBeLessThan(1.15);
    expect(lowest).toBeLessThan(0.15);
    expect(highest).toBeGreaterThan(2.3);
  });

  it('autant d’arbres qu’avant à 25 % près : on les regroupe, on n’en ajoute pas', () => {
    for (const s of SEEDS) {
      const count = treesOf(s).length;
      expect(count).toBeGreaterThan(0.75 * UNIFORM_TREE_COUNT[s]!);
      expect(count).toBeLessThan(1.25 * UNIFORM_TREE_COUNT[s]!);
    }
  });

  it('groupement : le nombre d’arbres par bloc de 32 m varie au moins 2 fois plus qu’au hasard (rapport variance / moyenne ; hasard = 1)', () => {
    for (const s of SEEDS) {
      const blocks = new Map<string, number>();
      for (let bz = -12; bz < 12; bz++) for (let bx = -12; bx < 12; bx++) blocks.set(bx + ',' + bz, 0);
      for (const r of treesOf(s)) {
        const key = Math.floor(r.x / 32) + ',' + Math.floor(r.z / 32);
        blocks.set(key, (blocks.get(key) ?? 0) + 1);
      }
      const counts = [...blocks.values()];
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / counts.length;
      expect(variance / mean, 'graine ' + s).toBeGreaterThan(2);
    }
  });

  it('des clairières (chunks presque vides d’arbres) et des bosquets (chunks très boisés) existent', () => {
    for (const s of SEEDS) {
      let clearings = 0, groves = 0;
      for (let cz = -6; cz < 6; cz++) {
        for (let cx = -6; cx < 6; cx++) {
          const trees = resourcesInChunk(s, cx, cz).filter((r) => r.kind === 'tree' || r.kind === 'pine').length;
          if (trees <= 3) clearings++;
          if (trees >= 20) groves++;
        }
      }
      expect(clearings, 'clairières, graine ' + s).toBeGreaterThanOrEqual(6);
      expect(groves, 'bosquets, graine ' + s).toBeGreaterThanOrEqual(6);
    }
  });
});
