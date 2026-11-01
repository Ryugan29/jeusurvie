import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../../core/physics/ground';
import { CHUNK_SIZE, generateChunk } from '../../core/world/chunk';
import { GROUND_COVER_MODELS, groundCoverInChunk, type CoverItem } from '../../core/world/ground-cover';
import {
  COVER_FADE_M,
  COVER_RADIUS_M,
  COVER_SINK_M,
  GRASS_HEIGHT_SCALE,
  coverScaleAt,
  groundCoverInstances,
  coverKept,
  shrinkInstances,
} from './ground-cover-instances';
import { viewSectorFor } from './view-sector';

const item = (over: Partial<CoverItem> = {}): CoverItem => ({ kind: 'grass', model: 'Grass_Common_Short', x: 10, z: 20, rotation: 0, scale: 1, ...over });
/** Une matrice d'instance (16 nombres) à la position (x, z), d'échelle s : de quoi reconnaître la translation et la taille. */
function matrix(x: number, z: number, s = 1): number[] {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, 3, z, 1];
}

describe('groundCoverInstances (éléments d’un chunk → matrices par modèle)', () => {
  it('une matrice par élément, regroupées par modèle, dans l’ordre de la liste', () => {
    const chunk = generateChunk(12345, 0, 0);
    const items = groundCoverInChunk(12345, chunk);
    const batches = groundCoverInstances(items, chunk);
    let total = 0;
    for (const [model, m] of Object.entries(batches)) {
      expect(m.length % 16).toBe(0);
      total += m.length / 16;
      const mine = items.filter((i) => i.model === model);
      expect(m.length / 16).toBe(mine.length);
      mine.slice(0, 5).forEach((it, k) => {
        expect(m[k * 16 + 12]).toBe(Math.fround(it.x));
        expect(m[k * 16 + 14]).toBe(Math.fround(it.z));
      });
    }
    expect(total).toBe(items.length);
    for (const model of Object.keys(batches)) expect(Object.values(GROUND_COVER_MODELS).flat()).toContain(model);
  });

  it('chaque élément est posé sur le sol du chunk (même triangulation que le rendu), à peine enfoncé', () => {
    expect(COVER_SINK_M).toBeGreaterThanOrEqual(0);
    expect(COVER_SINK_M).toBeLessThanOrEqual(0.1);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 }), (s, cx, cz) => {
        const chunk = generateChunk(s, cx, cz);
        const items = groundCoverInChunk(s, chunk).slice(0, 60);
        const batches = groundCoverInstances(items, chunk);
        const seen = new Map<string, number>();
        for (const it of items) {
          const k = seen.get(it.model) ?? 0;
          seen.set(it.model, k + 1);
          const m = batches[it.model]!.subarray(k * 16, k * 16 + 16);
          const ground = groundHeight(chunk.heights, { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE }, it.x, it.z)!;
          expect(m[13]).toBe(Math.fround(ground - COVER_SINK_M * it.scale * (GRASS_HEIGHT_SCALE[it.model] ?? 1)));
        }
      }),
      { numRuns: 4 },
    );
  });

  it('herbes écrasées : de la cheville au genou (modèles de 1,3 et 1,8 m), largeur gardée', () => {
    const short = 1.31 * GRASS_HEIGHT_SCALE['Grass_Common_Short']!, tall = 1.84 * GRASS_HEIGHT_SCALE['Grass_Common_Tall']!;
    expect(short).toBeGreaterThan(0.4);
    expect(short).toBeLessThan(0.6);
    expect(tall).toBeLessThan(0.9);
    const m = groundCoverInstances([item({ scale: 1 })], generateChunk(1, 0, 0))['Grass_Common_Short']!;
    expect(m[0]).toBeCloseTo(1, 6);
    expect(m[5]).toBeCloseTo(GRASS_HEIGHT_SCALE['Grass_Common_Short']!, 6);
  });

  it('rotation autour de la verticale et échelle uniforme hors herbes (convention Babylon, comme la végétation)', () => {
    const chunk = generateChunk(1, 0, 0);
    const m = groundCoverInstances([item({ model: 'Clover_1', rotation: 0.25, scale: 0.5 })], chunk)['Clover_1']!;
    expect([m[0], m[1], m[2]].map((v) => +v!.toFixed(6))).toEqual([0, 0, -0.5]);
    expect([m[4], m[5], m[6]].map((v) => +v!.toFixed(6))).toEqual([0, 0.5, 0]);
    expect([m[8], m[9], m[10]].map((v) => +v!.toFixed(6))).toEqual([0.5, 0, 0]);
    expect([m[3], m[7], m[11], m[15]]).toEqual([0, 0, 0, 1]);
  });

  it('aucun élément : aucun lot', () => {
    expect(groundCoverInstances([], generateChunk(1, 0, 0))).toEqual({});
  });
});

describe('coverScaleAt (le couvre-sol rétrécit en approchant du bord du rayon de rendu)', () => {
  it('rayon par défaut entre 60 et 80 m, bande de rétrécissement de 10 à 30 m', () => {
    expect(COVER_RADIUS_M).toBeGreaterThanOrEqual(60);
    expect(COVER_RADIUS_M).toBeLessThanOrEqual(80);
    expect(COVER_FADE_M).toBeGreaterThanOrEqual(10);
    expect(COVER_FADE_M).toBeLessThanOrEqual(30);
  });

  it('pleine taille jusqu’au début de la bande, nul au bord du rayon et au-delà', () => {
    expect(coverScaleAt(0, 70, 25)).toBe(1);
    expect(coverScaleAt(45, 70, 25)).toBe(1);
    expect(coverScaleAt(70, 70, 25)).toBe(0);
    expect(coverScaleAt(500, 70, 25)).toBe(0);
  });

  it('décroît sans à-coup (jamais plus grand plus loin) et passe par la moitié au milieu de la bande', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }), (a, b) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        expect(coverScaleAt(near, 70, 25)).toBeGreaterThanOrEqual(coverScaleAt(far, 70, 25));
      }),
    );
    expect(coverScaleAt(57.5, 70, 25)).toBeCloseTo(0.5, 9);
    for (const d of [47, 52, 60, 65, 69]) {
      expect(coverScaleAt(d, 70, 25)).toBeGreaterThan(0);
      expect(coverScaleAt(d, 70, 25)).toBeLessThan(1);
    }
  });
});

describe('shrinkInstances (instances d’un lot → celles qui sont à portée du joueur, rétrécies vers le bord)', () => {
  const src = new Float32Array([...matrix(0, 0), ...matrix(50, 0), ...matrix(60, 0), ...matrix(70, 0), ...matrix(0, -80)]);

  it('garde ce qui est dans le rayon, écarte le reste ; renvoie le nombre d’instances écrites', () => {
    const out = new Float32Array(src.length);
    const n = shrinkInstances(src, 0, 0, 0, 70, 25, out);
    expect(n).toBe(3); // (0,0), (50,0), (60,0) ; (70,0) est au bord (taille nulle) et (0,-80) hors rayon
    expect([out[12], out[13], out[14]]).toEqual([0, 3, 0]);
    expect(out[16 + 12]).toBe(50);
    expect(out[32 + 12]).toBe(60);
  });

  it('pleine taille près du joueur ; rétrécie dans la bande (échelle × facteur, position et hauteur inchangées)', () => {
    const out = new Float32Array(src.length);
    shrinkInstances(src, 0, 0, 0, 70, 25, out);
    expect(out[0]).toBe(1); // à 0 m : intacte
    const f50 = coverScaleAt(50, 70, 25), f60 = coverScaleAt(60, 70, 25);
    expect(f50).toBeLessThan(1);
    expect(f60).toBeLessThan(f50);
    expect(out[16]).toBeCloseTo(f50, 6); // 3 lignes de la partie rotation-échelle
    expect(out[16 + 5]).toBeCloseTo(f50, 6);
    expect(out[16 + 10]).toBeCloseTo(f50, 6);
    expect(out[16 + 13]).toBe(3); // hauteur inchangée
    expect(out[32]).toBeCloseTo(f60, 6);
    expect(out[16 + 15]).toBe(1);
  });

  it('mesure la distance au joueur (x, z), pas à l’origine ; la source n’est pas modifiée', () => {
    const copy = Float32Array.from(src);
    const out = new Float32Array(src.length);
    const n = shrinkInstances(src, 60, 0, 0, 70, 25, out);
    expect(n).toBe(4); // tout sauf (0, -80) : (0,0) est à 60 m (rétrécie), (70,0) à 10 m
    expect(out[0]).toBeCloseTo(coverScaleAt(60, 70, 25), 6);
    expect(out[3 * 16 + 12]).toBe(70);
    expect(Array.from(src)).toEqual(Array.from(copy));
  });

  it('écrit à partir de l’instance `at` : permet de mettre plusieurs chunks bout à bout dans un même tampon', () => {
    const out = new Float32Array(16 * 4);
    const first = shrinkInstances(new Float32Array(matrix(1, 1)), 0, 0, 0, 70, 25, out);
    const second = shrinkInstances(new Float32Array(matrix(2, 2)), 0, 0, first, 70, 25, out);
    expect([first, second]).toEqual([1, 2]);
    expect([out[12], out[16 + 12]]).toEqual([1, 2]);
  });

  it('un tampon trop petit n’est jamais dépassé : le surplus est ignoré', () => {
    const out = new Float32Array(16 * 2);
    expect(shrinkInstances(src, 0, 0, 0, 70, 25, out)).toBe(2);
  });
});

describe('shrinkInstances : densité et secteur de vue (profils graphiques, élagage)', () => {
  const at = (pts: readonly (readonly [number, number])[]): Float32Array => {
    const m = new Float32Array(pts.length * 16);
    pts.forEach(([x, z], i) => m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1], i * 16));
    return m;
  };

  it('secteur de vue : devant gardé, derrière et loin écarté, tout près gardé', () => {
    const src = at([[0, 30], [0, -30], [0, -5]]);
    const out = new Float32Array(src.length);
    const view = { sector: viewSectorFor(0, 1, 16 / 9), x: 0, z: 0 };
    expect(shrinkInstances(src, 0, 0, 0, 70, 25, out, 1, view)).toBe(2);
    expect(out[14]).toBe(30);
    expect(out[16 + 14]).toBe(-5);
  });

  it('densité : une part fixe des éléments, toujours les mêmes (aucun scintillement)', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 400; i++) pts.push([(i % 20) * 1.7 - 17, Math.floor(i / 20) * 1.7 - 17]);
    const src = at(pts);
    const out = new Float32Array(src.length);
    const half = shrinkInstances(src, 0, 0, 0, 70, 25, out, 0.5);
    expect(half).toBeGreaterThan(150);
    expect(half).toBeLessThan(250);
    for (const [x, z] of pts) expect(coverKept(x, z, 0.5)).toBe(coverKept(x, z, 0.5));
    expect(shrinkInstances(src, 0, 0, 0, 70, 25, out, 1)).toBe(400);
  });
});
