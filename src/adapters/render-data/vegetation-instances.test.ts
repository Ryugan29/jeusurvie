import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { colliderOf, FOOTPRINT_BY_MODEL } from '../../core/physics/colliders';
import { groundHeight } from '../../core/physics/ground';
import { CHUNK_SIZE, generateChunk } from '../../core/world/chunk';
import { resourcesInChunk, type Resource } from '../../core/world/placement';
import { VEGETATION_VARIANTS } from '../../core/world/resource-models';
import { modelKeyFor, VEGETATION_MODELS, VEGETATION_SINK_M, concatInstances, instancesWithin, vegetationInstances, vegetationRangeM, vegetationVisible } from './vegetation-instances';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const cc = fc.integer({ min: -40, max: 40 });

describe('vegetationInstances (ressources d’un chunk → matrices d’instances par modèle)', () => {
  it('chaque type a au moins un modèle ; la variante choisit le modèle', () => {
    for (const kind of Object.keys(VEGETATION_MODELS) as Resource['kind'][]) expect(VEGETATION_MODELS[kind].length).toBeGreaterThan(0);
    const r: Resource = { id: 'r:0:0', kind: 'rock', variant: 1, x: 1, z: 1, rotation: 0, scale: 1 };
    expect(modelKeyFor(r)).toBe(VEGETATION_VARIANTS.rock[1]);
  });

  it('une matrice (16 nombres) par ressource, regroupées par modèle', () => {
    fc.assert(
      fc.property(seed, cc, cc, (s, cx, cz) => {
        const chunk = generateChunk(s, cx, cz), resources = resourcesInChunk(s, cx, cz);
        const batches = vegetationInstances(resources, chunk);
        let total = 0;
        for (const [model, m] of Object.entries(batches)) {
          expect(m.length % 16).toBe(0);
          total += m.length / 16;
          expect(resources.filter((r) => modelKeyFor(r) === model)).toHaveLength(m.length / 16);
        }
        expect(total).toBe(resources.length);
      }),
      { numRuns: 20 },
    );
  });

  it('la zone bloquante d’un rocher est là où le rocher est dessiné (matrice d’instance, vecteur ligne comme Babylon)', () => {
    let checked = 0;
    for (const [cx, cz] of [[3, -2], [0, 0], [-4, 5]] as const) {
      const chunk = generateChunk(12345, cx, cz);
      for (const r of resourcesInChunk(12345, cx, cz).filter((x) => x.kind === 'rock')) {
        const m = vegetationInstances([r], chunk)[modelKeyFor(r)]!;
        const fp = FOOTPRINT_BY_MODEL[modelKeyFor(r)]!;
        // Le point (ox, oz) du modèle, déplacé par la matrice : x' = ox·m[0] + oz·m[8] + m[12], z' = ox·m[2] + oz·m[10] + m[14].
        const drawn = { x: fp.ox * m[0]! + fp.oz * m[8]! + m[12]!, z: fp.ox * m[2]! + fp.oz * m[10]! + m[14]! };
        const c = colliderOf(r)!;
        expect(Math.abs(c.x - drawn.x)).toBeLessThan(0.01);
        expect(Math.abs(c.z - drawn.z)).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('enfoncement léger (5 à 30 cm) : rien ne flotte au-dessus du sol sur une pente', () => {
    expect(VEGETATION_SINK_M).toBeGreaterThanOrEqual(0.05);
    expect(VEGETATION_SINK_M).toBeLessThanOrEqual(0.3);
  });

  it('chaque instance est posée sur le sol du chunk (même triangulation que le rendu), légèrement enfoncée', () => {
    fc.assert(
      fc.property(seed, cc, cc, (s, cx, cz) => {
        const chunk = generateChunk(s, cx, cz), resources = resourcesInChunk(s, cx, cz);
        const batches = vegetationInstances(resources, chunk);
        const seen = new Map<string, number>();
        for (const r of resources) {
          const model = modelKeyFor(r), k = seen.get(model) ?? 0;
          seen.set(model, k + 1);
          const m = batches[model]!.subarray(k * 16, k * 16 + 16);
          const ground = groundHeight(chunk.heights, { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE }, r.x, r.z)!;
          // Matrices en float32 : on compare à la valeur arrondie en float32.
          expect(m[12]).toBe(Math.fround(r.x));
          expect(m[13]).toBe(Math.fround(ground - VEGETATION_SINK_M * r.scale));
          expect(m[14]).toBe(Math.fround(r.z));
        }
      }),
      { numRuns: 20 },
    );
  });

  it('rotation autour de la verticale et échelle uniforme (convention Babylon : translation en 12, 13, 14)', () => {
    const chunk = generateChunk(1, 0, 0);
    const r: Resource = { id: 'r:2:2', kind: 'rock', variant: 0, x: 20, z: 20, rotation: 0.25, scale: 1.2 };
    const m = vegetationInstances([r], chunk)[modelKeyFor(r)]!;
    // Quart de tour : l'axe X local devient −Z (Babylon RotationY : [c,0,−s] ; [0,1,0] ; [s,0,c]).
    expect([m[0], m[1], m[2]].map((v) => +v!.toFixed(6))).toEqual([0, 0, -1.2]);
    expect([m[4], m[5], m[6]].map((v) => +v!.toFixed(6))).toEqual([0, 1.2, 0]);
    expect([m[8], m[9], m[10]].map((v) => +v!.toFixed(6))).toEqual([1.2, 0, 0]);
    expect([m[3], m[7], m[11], m[15]]).toEqual([0, 0, 0, 1]);
  });
});

describe("vegetationRangeM (distance d’affichage par modèle : le gros se voit de loin, le petit seulement de près)", () => {
  const range = (kind: Resource['kind']): number => vegetationRangeM(VEGETATION_MODELS[kind][0]!);

  it('chaque modèle de végétation a une portée finie et positive', () => {
    for (const models of Object.values(VEGETATION_MODELS)) for (const m of models) expect(vegetationRangeM(m)).toBeGreaterThan(0);
  });

  it("arbres ≥ buissons et rochers ≥ herbe et fleurs ; même portée pour tous les modèles d’un même type", () => {
    expect(range('tree')).toBeGreaterThanOrEqual(range('bush'));
    expect(range('bush')).toBeGreaterThan(range('grass'));
    expect(range('rock')).toBeGreaterThan(range('flowers'));
    expect(range('pine')).toBe(range('tree'));
    for (const [kind, models] of Object.entries(VEGETATION_MODELS)) for (const m of models) expect(vegetationRangeM(m)).toBe(range(kind as Resource['kind']));
  });

  it('un modèle inconnu est une erreur de programmation, pas un 0 silencieux', () => {
    expect(() => vegetationRangeM('Inconnu')).toThrow();
  });
});

describe('vegetationVisible (un lot est dessiné si le chunk est à portée du joueur)', () => {
  it('le chunk sous les pieds du joueur est toujours visible, même avec une portée minuscule', () => {
    expect(vegetationVisible(0, 0, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 1)).toBe(true);
    expect(vegetationVisible(-3, 5, -3 * CHUNK_SIZE + 1, 5 * CHUNK_SIZE + 1, 1)).toBe(true);
  });

  it('mesure la distance au bord le plus proche du chunk (pas à son centre)', () => {
    // Joueur à 100 m du bord est du chunk (0, 0) : visible à 100 m de portée, pas à 99 m.
    expect(vegetationVisible(0, 0, CHUNK_SIZE + 100, 10, 100)).toBe(true);
    expect(vegetationVisible(0, 0, CHUNK_SIZE + 100, 10, 99)).toBe(false);
  });

  it('dans les diagonales, la distance est euclidienne', () => {
    // Coin le plus proche à (3, 4) du joueur : distance 5.
    expect(vegetationVisible(0, 0, CHUNK_SIZE + 3, CHUNK_SIZE + 4, 5)).toBe(true);
    expect(vegetationVisible(0, 0, CHUNK_SIZE + 3, CHUNK_SIZE + 4, 4.9)).toBe(false);
  });
});

describe('concatInstances (les lots d’un même modèle, un par chunk, deviennent un seul tampon)', () => {
  it('met les lots bout à bout, dans l’ordre', () => {
    const a = new Float32Array([1, 2, 3, 4]), b = new Float32Array([5, 6]), c = new Float32Array([7]);
    expect(Array.from(concatInstances([a, b, c]))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('aucun lot : tampon vide ; la longueur est la somme des longueurs', () => {
    expect(concatInstances([]).length).toBe(0);
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 6 }), (counts) => {
        const batches = counts.map((n) => new Float32Array(n * 16));
        expect(concatInstances(batches).length).toBe(counts.reduce((x, y) => x + y, 0) * 16);
      }),
    );
  });
});

describe('instancesWithin (les instances proches d’un point : les arbres qui peuvent jeter une ombre devant le joueur)', () => {
  /** Matrices d'instances posées aux points (x, z) : la translation est aux éléments 12 et 14. */
  const at = (...points: readonly [number, number][]): Float32Array => {
    const m = new Float32Array(points.length * 16);
    points.forEach(([x, z], i) => m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1], i * 16));
    return m;
  };
  const positions = (m: Float32Array): [number, number][] => Array.from({ length: m.length / 16 }, (_, i): [number, number] => [m[i * 16 + 12]!, m[i * 16 + 14]!]);

  it('garde celles à portée (distance horizontale, bord compris), écarte les autres, dans l’ordre', () => {
    const kept = instancesWithin(at([0, 0], [30, 0], [0, 50], [50, 0.1], [-20, -20]), 0, 0, 50);
    expect(positions(kept)).toEqual([[0, 0], [30, 0], [0, 50], [-20, -20]].map(([x, z]) => [x, z]));
  });

  it('autour du point donné, pas de l’origine ; rien ne reste si tout est loin ; une matrice garde ses 16 nombres', () => {
    const m = at([100, 100], [103, 104]);
    expect(positions(instancesWithin(m, 100, 100, 6))).toEqual([[100, 100], [103, 104]]);
    expect(instancesWithin(m, 0, 0, 6).length).toBe(0);
    expect(Array.from(instancesWithin(m, 100, 100, 6).subarray(0, 16))).toEqual(Array.from(m.subarray(0, 16)));
  });

  it('propriété : le résultat est exactement la part des instances à portée', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -200, max: 200 }), fc.integer({ min: -200, max: 200 })), { maxLength: 30 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 1, max: 150 }),
        (points, px, pz, radius) => {
          const expected = points.filter(([x, z]) => Math.hypot(x - px, z - pz) <= radius);
          expect(positions(instancesWithin(at(...points), px, pz, radius))).toEqual(expected);
        },
      ),
    );
  });
});
