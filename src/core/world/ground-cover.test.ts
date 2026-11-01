import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../physics/ground';
import { hash2 } from '../shared/hash';
import { biomeAt } from './biome';
import { CHUNK_SIZE, generateChunk, type ChunkData } from './chunk';
import { COVER_MAX_SLOPE, COVER_PATH_MAX, GROUND_COVER_MODELS, groundCoverInChunk, type CoverItem, type CoverKind } from './ground-cover';
import { pathAt } from './paths';
import { forestFactorAt, resourcesInCells, treeLineAt, type Resource } from './placement';
import { findSummit } from './summit';

const SEED = 12345;
/** Le point de départ et ses voisins : forêt tempérée, quelques sentiers, un peu de relief. */
const NEAR_START: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

const chunks = new Map<string, { chunk: ChunkData; items: CoverItem[] }>();
/** Chunk et couvre-sol (gardés : la génération coûte quelques dizaines de ms). */
function coverOf(cx: number, cz: number, seed = SEED): { chunk: ChunkData; items: CoverItem[] } {
  const key = `${seed}:${cx}:${cz}`;
  let known = chunks.get(key);
  if (known === undefined) {
    const chunk = generateChunk(seed, cx, cz);
    known = { chunk, items: groundCoverInChunk(seed, chunk) };
    chunks.set(key, known);
  }
  return known;
}
const nearStart = (): CoverItem[] => NEAR_START.flatMap(([cx, cz]) => coverOf(cx, cz).items);
const ofKind = (items: readonly CoverItem[], ...kinds: CoverKind[]): CoverItem[] => items.filter((i) => kinds.includes(i.kind));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));

/** Arbres et pins autour du chunk (cases voisines comprises). */
function treesAround(cx: number, cz: number, seed = SEED): Resource[] {
  const cells = CHUNK_SIZE / 8;
  return resourcesInCells(seed, cx * cells - 2, cz * cells - 2, (cx + 1) * cells + 2, (cz + 1) * cells + 2).filter((r) => r.kind === 'tree' || r.kind === 'pine');
}

/** Rapport variance / moyenne du nombre d'éléments par bloc de `blockM` mètres de côté : 1 pour un tirage uniforme au hasard. */
function dispersion(items: readonly { x: number; z: number }[], cells: readonly (readonly [number, number])[], blockM = 4): number {
  const BLOCK_M = blockM, perChunk = CHUNK_SIZE / BLOCK_M;
  const counts = new Map<string, number>();
  for (const [cx, cz] of cells) for (let j = 0; j < perChunk; j++) for (let i = 0; i < perChunk; i++) counts.set(`${cx * perChunk + i},${cz * perChunk + j}`, 0);
  for (const it of items) {
    const key = `${Math.floor(it.x / BLOCK_M)},${Math.floor(it.z / BLOCK_M)}`;
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  const values = [...counts.values()];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return variance / mean;
}

describe('couvre-sol : forme et déterminisme', () => {
  it('chaque type a ses modèles, sans doublon', () => {
    for (const models of Object.values(GROUND_COVER_MODELS)) {
      expect(models.length).toBeGreaterThan(0);
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it('déterministe : mêmes graine et chunk, même liste (même ordre)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 }), (s, cx, cz) => {
        const chunk = generateChunk(s, cx, cz);
        expect(groundCoverInChunk(s, chunk)).toEqual(groundCoverInChunk(s, chunk));
      }),
      { numRuns: 6 },
    );
  });

  it('chaque élément est dans son chunk, avec un modèle de son type, une rotation dans [0, 1) et une échelle positive', () => {
    for (const [cx, cz] of NEAR_START) {
      const { items } = coverOf(cx, cz);
      expect(items.length).toBeGreaterThan(500);
      // Une seule assertion par chunk : des dizaines de milliers d'expect dépassaient le délai du test en suite complète.
      const bad = items.filter(
        (it) =>
          !(it.x >= cx * CHUNK_SIZE && it.x < (cx + 1) * CHUNK_SIZE) ||
          !(it.z >= cz * CHUNK_SIZE && it.z < (cz + 1) * CHUNK_SIZE) ||
          !GROUND_COVER_MODELS[it.kind].includes(it.model) ||
          !(it.rotation >= 0 && it.rotation < 1) ||
          !(it.scale > 0 && it.scale < 3),
      );
      expect(bad.slice(0, 3)).toEqual([]);
    }
  });

  it('autre graine, autre couvre-sol', () => {
    const a = coverOf(0, 0).items, b = coverOf(0, 0, SEED + 1).items;
    expect(b).not.toEqual(a);
  });
});

describe('couvre-sol : densité (herbe partout, en tapis et en touffes)', () => {
  it('autour du départ : un brin ou une touffe tous les 0,5 à 1 m² en moyenne sur le sol herbeux (1 à 2 par m²)', () => {
    const grass = ofKind(nearStart(), 'grass');
    const perM2 = grass.length / (NEAR_START.length * CHUNK_SIZE * CHUNK_SIZE);
    expect(perM2).toBeGreaterThan(0.8);
    expect(perM2).toBeLessThan(3);
  });

  it('le couvre-sol entier reste dans un budget : moins de 4 éléments par m² en moyenne', () => {
    expect(nearStart().length / (NEAR_START.length * CHUNK_SIZE * CHUNK_SIZE)).toBeLessThan(4);
  });

  it('touffes : à l’échelle de 2 m, le nombre de brins varie au moins 2,4 fois plus qu’au hasard (sans touffes : 1,6)', () => {
    expect(dispersion(ofKind(nearStart(), 'grass'), NEAR_START, 2)).toBeGreaterThan(2.4);
  });

  it('tapis : le nombre de brins par bloc de 4 m varie au moins 3 fois plus qu’au hasard (rapport variance / moyenne ; hasard = 1)', () => {
    const grass = ofKind(nearStart(), 'grass');
    expect(dispersion(grass, NEAR_START)).toBeGreaterThan(3);
    // Étalon : le même nombre de points tirés au hasard, uniformément, a un rapport proche de 1.
    const total = NEAR_START.length * CHUNK_SIZE * CHUNK_SIZE;
    const uniform = grass.map((_, i) => ({
      x: -CHUNK_SIZE + ((hash2(1, i, 0, 9) & 0xffff) / 65536) * 3 * CHUNK_SIZE,
      z: -CHUNK_SIZE + ((hash2(1, i, 1, 9) & 0xffff) / 65536) * 3 * CHUNK_SIZE,
    }));
    expect(total).toBeGreaterThan(0);
    expect(dispersion(uniform, NEAR_START)).toBeLessThan(1.5);
    expect(dispersion(uniform, NEAR_START, 2)).toBeLessThan(1.5);
  });

  it('trèfles et fleurs en plaques : plus groupés que l’herbe n’est dispersée au hasard (rapport > 3)', () => {
    expect(dispersion(ofKind(nearStart(), 'clover'), NEAR_START)).toBeGreaterThan(3);
    expect(dispersion(ofKind(nearStart(), 'flower'), NEAR_START)).toBeGreaterThan(3);
  });

  it('il y a de tout : herbe, trèfles, fleurs, fougères, champignons et cailloux', () => {
    const items = nearStart();
    for (const kind of Object.keys(GROUND_COVER_MODELS) as CoverKind[]) expect(ofKind(items, kind).length, kind).toBeGreaterThan(20);
  });

  it('chaque modèle de chaque type est bien utilisé (aucun n’est perdu par un mauvais tirage)', () => {
    const used = new Set(nearStart().map((i) => i.model));
    for (const models of Object.values(GROUND_COVER_MODELS)) for (const m of models) expect(used.has(m), m).toBe(true);
  });
});

describe('couvre-sol : sentiers, pentes, altitude', () => {
  it('rien (herbe, trèfles, fleurs, fougères, champignons) là où le sentier est marqué : pathAt ≤ 0,6 en chaque élément', () => {
    expect(COVER_PATH_MAX).toBeLessThanOrEqual(0.6);
    let nearPath = 0;
    for (const it of ofKind(nearStart(), 'grass', 'clover', 'flower', 'fern', 'mushroom')) {
      const p = pathAt(SEED, it.x, it.z);
      expect(p, `${it.kind} en ${it.x.toFixed(1)} ${it.z.toFixed(1)}`).toBeLessThanOrEqual(0.6);
      if (p > 0) nearPath++;
    }
    expect(nearPath).toBeGreaterThan(50); // l'herbe borde bien les sentiers (le test ne prouve rien sans sentier à proximité)
  });

  it('le centre d’un sentier est nu : aucun élément (cailloux compris) à moins de 30 cm d’un point où pathAt ≥ 0,8', () => {
    let cores = 0;
    for (const [cx, cz] of NEAR_START) {
      const { items } = coverOf(cx, cz);
      for (let gz = 0; gz < CHUNK_SIZE; gz += 2) {
        for (let gx = 0; gx < CHUNK_SIZE; gx += 2) {
          const p = { x: cx * CHUNK_SIZE + gx + 0.5, z: cz * CHUNK_SIZE + gz + 0.5 };
          if (pathAt(SEED, p.x, p.z) < 0.8) continue;
          cores++;
          expect(items.filter((it) => dist(it, p) < 0.3 && pathAt(SEED, it.x, it.z) >= 0.8)).toEqual([]);
        }
      }
    }
    expect(cores).toBeGreaterThan(50);
  });

  it('cailloux : concentrés au bord des sentiers (pathAt entre 0,3 et 0,7), quelques-uns ailleurs, aucun au centre', () => {
    const pebbles = ofKind(nearStart(), 'pebble');
    expect(pebbles.length).toBeGreaterThan(40);
    const onEdge = pebbles.filter((p) => {
      const v = pathAt(SEED, p.x, p.z);
      return v >= 0.3 && v <= 0.7;
    });
    expect(onEdge.length / pebbles.length).toBeGreaterThan(0.6);
    expect(pebbles.length - onEdge.length).toBeGreaterThan(0); // quelques-uns ailleurs
    expect(pebbles.length - onEdge.length).toBeLessThan(0.4 * pebbles.length);
    for (const p of pebbles) expect(pathAt(SEED, p.x, p.z)).toBeLessThan(0.8);
  });

  it('pas d’herbe sur les pentes raides ni au-dessus de la limite des arbres (+ 25 m) : une montagne', () => {
    const summit = findSummit(SEED, { radiusM: 3000, gridStepM: 250 });
    const cx = Math.floor(summit.x / CHUNK_SIZE), cz = Math.floor(summit.z / CHUNK_SIZE);
    let checked = 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [-1, -1]] as const) {
      const { chunk, items } = coverOf(cx + dx, cz + dz);
      const origin = { x: chunk.cx * CHUNK_SIZE, z: chunk.cz * CHUNK_SIZE };
      for (const it of ofKind(items, 'grass', 'clover', 'flower', 'fern')) {
        const g = (x: number, z: number): number => groundHeight(chunk.heights, origin, Math.min(Math.max(x, origin.x), origin.x + CHUNK_SIZE), Math.min(Math.max(z, origin.z), origin.z + CHUNK_SIZE))!;
        const gx = (g(it.x + 1, it.z) - g(it.x - 1, it.z)) / 2, gz = (g(it.x, it.z + 1) - g(it.x, it.z - 1)) / 2;
        expect(Math.sqrt(gx * gx + gz * gz)).toBeLessThanOrEqual(COVER_MAX_SLOPE + 0.2);
        expect(g(it.x, it.z)).toBeLessThan(treeLineAt(biomeAt(SEED, it.x, it.z).cold) + 25);
        checked++;
      }
    }
    expect(summit.height).toBeGreaterThan(150); // on est bien en montagne
    expect(checked).toBeGreaterThan(0);
  });
});

describe('couvre-sol : champignons, fougères et plantes près des arbres', () => {
  it('champignons : toujours au pied d’un arbre (à plus de 70 cm du tronc, à moins de 2,6 m)', () => {
    let count = 0;
    for (const [cx, cz] of NEAR_START) {
      const trees = treesAround(cx, cz);
      for (const m of ofKind(coverOf(cx, cz).items, 'mushroom')) {
        const nearest = Math.min(...trees.map((t) => dist(t, m)));
        expect(nearest, `champignon en ${m.x.toFixed(1)} ${m.z.toFixed(1)}`).toBeGreaterThanOrEqual(0.7);
        expect(nearest, `champignon en ${m.x.toFixed(1)} ${m.z.toFixed(1)}`).toBeLessThanOrEqual(2.6);
        count++;
      }
    }
    expect(count).toBeGreaterThan(20);
  });

  it('au pied des arbres l’herbe s’éclaircit (les champignons restent visibles) : moins de 60 % de la densité habituelle à moins de 2,2 m d’un tronc', () => {
    const { chunk, items } = coverOf(0, 0);
    expect(chunk.cx).toBe(0);
    let nearArea = 0, farArea = 0, near = 0, far = 0;
    for (const [cx, cz] of NEAR_START) {
      const trees = treesAround(cx, cz);
      for (let gz = 0; gz < CHUNK_SIZE; gz += 1) {
        for (let gx = 0; gx < CHUNK_SIZE; gx += 1) {
          const p = { x: cx * CHUNK_SIZE + gx + 0.5, z: cz * CHUNK_SIZE + gz + 0.5 };
          if (trees.some((t) => dist(t, p) < 2.2)) nearArea++;
          else if (trees.every((t) => dist(t, p) > 6)) farArea++;
        }
      }
      for (const g of ofKind(coverOf(cx, cz).items, 'grass')) {
        const d = Math.min(...trees.map((t) => dist(t, g)));
        if (d < 2.2) near++;
        else if (d > 6) far++;
      }
    }
    expect(items.length).toBeGreaterThan(0);
    expect(nearArea).toBeGreaterThan(200);
    expect(near / nearArea).toBeLessThan(0.6 * (far / farArea));
  });

  it('fougères et plantes : surtout en sous-bois, près d’un arbre ou dans un bosquet (≥ 80 %)', () => {
    let near = 0, total = 0;
    for (const [cx, cz] of NEAR_START) {
      const trees = treesAround(cx, cz);
      for (const f of ofKind(coverOf(cx, cz).items, 'fern')) {
        total++;
        if (trees.some((t) => dist(t, f) < 8) || forestFactorAt(SEED, f.x, f.z) >= 1.2) near++;
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(near / total).toBeGreaterThanOrEqual(0.8);
  });

  it('fougères et plantes : au moins 3 fois plus denses dans un bosquet que dans une clairière', () => {
    let grovesM2 = 0, clearingsM2 = 0;
    const ferns = { grove: 0, clearing: 0 };
    for (const [cx, cz] of NEAR_START) {
      for (let gz = 0; gz < CHUNK_SIZE; gz += 4) {
        for (let gx = 0; gx < CHUNK_SIZE; gx += 4) {
          const f = forestFactorAt(SEED, cx * CHUNK_SIZE + gx + 2, cz * CHUNK_SIZE + gz + 2);
          if (f > 1.5) grovesM2 += 16;
          else if (f < 0.4) clearingsM2 += 16;
        }
      }
      for (const fern of ofKind(coverOf(cx, cz).items, 'fern')) {
        const f = forestFactorAt(SEED, fern.x, fern.z);
        if (f > 1.5) ferns.grove++;
        else if (f < 0.4) ferns.clearing++;
      }
    }
    expect(grovesM2).toBeGreaterThan(5000);
    expect(clearingsM2).toBeGreaterThan(5000);
    expect(ferns.grove / grovesM2).toBeGreaterThan(3 * (ferns.clearing / clearingsM2));
  });
});
