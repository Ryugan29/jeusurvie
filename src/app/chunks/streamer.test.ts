import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, chunkCoordOf, chunkKey, type ChunkCoord } from '../../core/world/chunk';
import { WORLD_RADIUS_M } from '../../core/world/params';
import { chunksAround, effectiveViewRadius, planStreaming, type StreamParams } from './streamer';

const centerDist = (x: number, z: number, c: ChunkCoord): number =>
  Math.hypot((c.cx + 0.5) * CHUNK_SIZE - x, (c.cz + 0.5) * CHUNK_SIZE - z);
const coord = fc.double({ min: -20_000, max: 20_000, noNaN: true });
const radius = fc.integer({ min: 0, max: 700 });
const mapOf = (coords: readonly ChunkCoord[]): Map<string, ChunkCoord> => new Map(coords.map((c) => [chunkKey(c.cx, c.cz), c]));

/** Applique un plan à l'ensemble des chunks chargés (comme le ferait le chargeur, une fois tout reçu). */
function apply(loaded: Map<string, ChunkCoord>, plan: ReturnType<typeof planStreaming>): void {
  for (const k of plan.toUnload) loaded.delete(k);
  for (const c of plan.toLoad) loaded.set(chunkKey(c.cx, c.cz), c);
}

describe('chunksAround', () => {
  it('commence par le chunk sous les pieds du joueur', () => {
    const [first] = chunksAround(100, -30, 300, 500);
    expect(first).toEqual(chunkCoordOf(100, -30));
  });

  it('le chunk sous les pieds n’est jamais exclu, même hors de la limite du monde', () => {
    expect(chunksAround(20_000, 0, 200, 50)[0]).toEqual(chunkCoordOf(20_000, 0));
    expect(chunksAround(20_000, 0, 200, 50)).toHaveLength(1);
  });

  it('trie par distance croissante, reste dans le rayon et n’oublie aucun chunk du rayon dans le monde (sans plafond)', () => {
    fc.assert(
      fc.property(fc.double({ min: -7000, max: 7000, noNaN: true }), fc.double({ min: -7000, max: 7000, noNaN: true }), radius, (x, z, r) => {
        const list = chunksAround(x, z, r, 10_000);
        for (let i = 1; i < list.length; i++) {
          expect(centerDist(x, z, list[i]!)).toBeGreaterThanOrEqual(centerDist(x, z, list[i - 1]!) - 1e-9);
        }
        const keys = new Set(list.map((c) => chunkKey(c.cx, c.cz)));
        expect(keys.size).toBe(list.length);
        const here = chunkCoordOf(x, z);
        const span = Math.ceil(r / CHUNK_SIZE) + 1;
        for (let dx = -span; dx <= span; dx++) {
          for (let dz = -span; dz <= span; dz++) {
            const c = { cx: here.cx + dx, cz: here.cz + dz };
            if (c.cx === here.cx && c.cz === here.cz) continue;
            const inside = centerDist(x, z, c) <= r && centerDist(0, 0, c) <= WORLD_RADIUS_M + r;
            expect(keys.has(chunkKey(c.cx, c.cz))).toBe(inside);
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('respecte le plafond en gardant les plus proches', () => {
    const all = chunksAround(0, 0, 500, 10_000);
    const capped = chunksAround(0, 0, 500, 20);
    expect(capped).toHaveLength(20);
    expect(capped).toEqual(all.slice(0, 20));
  });

  it('ne demande jamais de chunk au-delà de WORLD_RADIUS_M + distance de vue (sauf celui sous les pieds)', () => {
    fc.assert(
      fc.property(coord, coord, radius, (x, z, r) => {
        const [, ...others] = chunksAround(x, z, r, 10_000);
        for (const c of others) expect(centerDist(0, 0, c)).toBeLessThanOrEqual(WORLD_RADIUS_M + r);
      }),
      { numRuns: 60 },
    );
  });
});

describe('effectiveViewRadius', () => {
  it('borne la distance de vue par le plafond : π·(r/64)² ≤ maxChunks', () => {
    expect(effectiveViewRadius(200, 10_000)).toBe(200);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 1, max: 2000 }), (r, max) => {
        const eff = effectiveViewRadius(r, max);
        expect(eff).toBeLessThanOrEqual(r);
        expect(Math.PI * (eff / CHUNK_SIZE) ** 2).toBeLessThanOrEqual(max + 1e-9);
      }),
    );
  });
});

describe('planStreaming', () => {
  const params: StreamParams = { viewRadiusM: 200, unloadMarginM: 64, maxChunks: 40 };

  it('à vide : tout ce qui est voulu est à charger, dans l’ordre de distance', () => {
    const plan = planStreaming(10, 10, new Map(), params);
    expect(plan.toLoad).toEqual(chunksAround(10, 10, effectiveViewRadius(200, 40), 40));
    expect(plan.toUnload).toEqual([]);
  });

  it('ne recharge pas ce qui est déjà chargé et décharge ce qui est trop loin', () => {
    const loaded = mapOf([{ cx: 0, cz: 0 }, { cx: 50, cz: 50 }]);
    const plan = planStreaming(10, 10, loaded, params);
    expect(plan.toLoad.some((c) => c.cx === 0 && c.cz === 0)).toBe(false);
    expect(plan.toUnload).toEqual([chunkKey(50, 50)]);
  });

  it('hystérésis : un chunk juste au-delà de la vue (dans la marge) reste chargé', () => {
    const loaded = mapOf([{ cx: 3, cz: 0 }]); // centre à 224 m de (0, 32) : hors vue (200), dans la marge (264)
    const plan = planStreaming(0, 32, loaded, params);
    expect(plan.toUnload).toEqual([]);
    expect(plan.toLoad.some((c) => c.cx === 3 && c.cz === 0)).toBe(false);
  });

  it('après application du plan, jamais plus de maxChunks chargés', () => {
    fc.assert(
      fc.property(coord, coord, fc.array(fc.tuple(fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 }))), (x, z, extra) => {
        const here = chunkCoordOf(x, z);
        const loaded = mapOf(extra.map(([a, b]) => ({ cx: here.cx + a, cz: here.cz + b })));
        apply(loaded, planStreaming(x, z, loaded, params));
        expect(loaded.size).toBeLessThanOrEqual(params.maxChunks);
      }),
      { numRuns: 60 },
    );
  });

  it('au plafond, des petits pas (aller-retour) ne déchargent jamais un chunk pour le recharger au pas suivant', () => {
    const capped: StreamParams = { viewRadiusM: 400, unloadMarginM: 64, maxChunks: 40 };
    fc.assert(
      fc.property(
        fc.double({ min: -6000, max: 6000, noNaN: true }),
        fc.double({ min: -6000, max: 6000, noNaN: true }),
        fc.array(fc.tuple(fc.double({ min: -30, max: 30, noNaN: true }), fc.double({ min: -30, max: 30, noNaN: true })), { minLength: 2, maxLength: 12 }),
        (x0, z0, steps) => {
          const loaded = new Map<string, ChunkCoord>();
          apply(loaded, planStreaming(x0, z0, loaded, capped));
          let x = x0, z = z0, lastUnloaded = new Set<string>();
          for (const [dx, dz] of steps) {
            x += dx;
            z += dz;
            const plan = planStreaming(x, z, loaded, capped);
            for (const c of plan.toLoad) expect(lastUnloaded.has(chunkKey(c.cx, c.cz))).toBe(false);
            apply(loaded, plan);
            expect(loaded.size).toBeLessThanOrEqual(capped.maxChunks);
            lastUnloaded = new Set(plan.toUnload);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
