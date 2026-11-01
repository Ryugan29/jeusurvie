import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../../core/physics/ground';
import { CHUNK_SIZE, CHUNK_VERTS, generateChunk } from '../../core/world/chunk';
import { heightAt } from '../../core/world/terrain';
import { quadTriangles } from '../../core/world/triangulation';
import { biomeAt } from '../../core/world/biome';
import { pathAt } from '../../core/world/paths';
import { surfaceVariation } from '../../core/world/surface';
import { buildChunkMesh, worldHeightSampler, worldSamplers } from './mesh-data';
import { terrainColor, terrainLayers } from './palette';
import { SHADE_REACH, terrainShade } from './shade';

const V = CHUNK_VERTS, STEP = CHUNK_SIZE / (V - 1);
const seed = fc.integer({ min: 0, max: 0xffffffff });
const cc = fc.integer({ min: -60, max: 60 });
/** Coordonnée locale franchement à l'intérieur d'un quad : sur une arête, toutes les diagonales donneraient la même hauteur. */
const inQuad = fc
  .tuple(fc.integer({ min: 0, max: V - 2 }), fc.double({ min: 0.05, max: 0.95, noNaN: true }))
  .map(([cell, f]) => (cell + f) * STEP);

function meshOf(s: number, cx: number, cz: number) {
  return buildChunkMesh(generateChunk(s, cx, cz), worldSamplers(s, cx, cz));
}

describe('buildChunkMesh (ChunkData → tampons de maillage, pur)', () => {
  it('tailles : 33×33 sommets, 32×32×2 triangles, couleurs RGBA', () => {
    const m = meshOf(1, 0, 0);
    expect(m.positions).toHaveLength(V * V * 3);
    expect(m.normals).toHaveLength(V * V * 3);
    expect(m.colors).toHaveLength(V * V * 4);
    expect(m.indices).toHaveLength((V - 1) * (V - 1) * 6);
  });

  it('positions locales au chunk (col·2, hauteur float32, row·2) et indices = triangulation partagée', () => {
    const c = generateChunk(5, -2, 3);
    const m = buildChunkMesh(c, worldSamplers(5, -2, 3));
    for (let row = 0; row < V; row++) {
      for (let col = 0; col < V; col++) {
        const i = row * V + col;
        expect([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]).toEqual([col * STEP, c.heights[i], row * STEP]);
      }
    }
    const expected: number[] = [];
    for (let row = 0; row < V - 1; row++) for (let col = 0; col < V - 1; col++) expected.push(...quadTriangles(col, row, V));
    expect([...m.indices]).toEqual(expected);
  });

  it('normales unitaires tournées vers le haut, couleurs = palette(hauteur, normale.y) × ombrage, bornées à 1, alpha 1', () => {
    const c = generateChunk(9, 4, 4);
    const sample = worldHeightSampler(9, 4, 4);
    const m = buildChunkMesh(c, worldSamplers(9, 4, 4));
    let shaded = 0, onPath = 0;
    for (let i = 0; i < V * V; i++) {
      const [nx, ny, nz] = [m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(ny).toBeGreaterThan(0);
      const shade = terrainShade(sample, i % V, Math.floor(i / V), ny);
      if (shade !== 1) shaded++;
      const col = i % V, row = Math.floor(i / V);
      const wx = 4 * CHUNK_SIZE + col * STEP, wz = 4 * CHUNK_SIZE + row * STEP;
      const tint = { ...surfaceVariation(9, wx, wz), cold: biomeAt(9, wx, wz).cold, path: pathAt(9, wx, wz) };
      if (tint.path > 0.5) onPath++;
      const [r, g, b] = terrainColor(c.heights[i]!, ny, tint);
      expect(m.colors[i * 4]).toBeCloseTo(Math.min(1, r * shade), 6);
      expect(m.colors[i * 4 + 1]).toBeCloseTo(Math.min(1, g * shade), 6);
      expect(m.colors[i * 4 + 2]).toBeCloseTo(Math.min(1, b * shade), 6);
      expect(m.colors[i * 4 + 3]).toBe(1);
    }
    expect(shaded).toBeGreaterThan(0);
    expect(onPath).toBeGreaterThan(0); // ce chunk est traversé par un sentier : sa couleur en tient compte
  });

  it('poids des textures peintes par sommet (terre, roche, neige) = terrainLayers, mêmes entrées que la couleur', () => {
    const c = generateChunk(9, 4, 4);
    const m = buildChunkMesh(c, worldSamplers(9, 4, 4));
    expect(m.layers).toHaveLength(V * V * 3);
    let soil = 0;
    for (let i = 0; i < V * V; i++) {
      const wx = 4 * CHUNK_SIZE + (i % V) * STEP, wz = 4 * CHUNK_SIZE + Math.floor(i / V) * STEP;
      const tint = { ...surfaceVariation(9, wx, wz), cold: biomeAt(9, wx, wz).cold, path: pathAt(9, wx, wz) };
      const l = terrainLayers(c.heights[i]!, m.normals[i * 3 + 1]!, tint);
      expect(m.layers[i * 3]).toBeCloseTo(l.soil, 6);
      expect(m.layers[i * 3 + 1]).toBeCloseTo(l.rock, 6);
      expect(m.layers[i * 3 + 2]).toBeCloseTo(l.snow, 6);
      if (l.soil > 0.5) soil++;
    }
    expect(soil).toBeGreaterThan(0); // le sentier de ce chunk montre la texture de terre
  });

  it('le sentier se voit dans les couleurs : les sommets de sentier sont plus chauds (rouge/vert) que les autres', () => {
    const c = generateChunk(9, 4, 4);
    const m = buildChunkMesh(c, worldSamplers(9, 4, 4));
    const ratio = (i: number): number => m.colors[i * 4]! / m.colors[i * 4 + 1]!;
    const on: number[] = [], off: number[] = [];
    for (let i = 0; i < V * V; i++) {
      const wx = 4 * CHUNK_SIZE + (i % V) * STEP, wz = 4 * CHUNK_SIZE + Math.floor(i / V) * STEP;
      const p = pathAt(9, wx, wz);
      // Sommets de sentier sur terrain plat seulement (la pente efface le sentier) ; les autres : sans sentier du tout.
      if (p > 0.9 && m.normals[i * 3 + 1]! > 0.97) on.push(ratio(i));
      else if (p === 0 && m.normals[i * 3 + 1]! > 0.97) off.push(ratio(i));
    }
    expect(on.length).toBeGreaterThan(3);
    expect(off.length).toBeGreaterThan(3);
    expect(on.reduce((a, b) => a + b, 0) / on.length).toBeGreaterThan(off.reduce((a, b) => a + b, 0) / off.length + 0.3);
  });

  it('échantillonneur de surface : la part de sentier au sommet (col, row) est pathAt aux coordonnées monde', () => {
    const surface = worldSamplers(9, -3, 2).surface;
    expect(surface(5, 7).path).toBe(pathAt(9, -3 * CHUNK_SIZE + 5 * STEP, 2 * CHUNK_SIZE + 7 * STEP));
    expect(surface(-4, 36).path).toBe(pathAt(9, -3 * CHUNK_SIZE - 4 * STEP, 2 * CHUNK_SIZE + 36 * STEP));
  });

  it('poids des couches peintes identiques sur le bord commun de deux chunks voisins (la matière se raccorde)', () => {
    fc.assert(
      fc.property(seed, cc, cc, (s, cx, cz) => {
        const a = meshOf(s, cx, cz), east = meshOf(s, cx + 1, cz), south = meshOf(s, cx, cz + 1);
        for (let i = 0; i < V; i++) {
          for (let k = 0; k < 3; k++) {
            expect(east.layers[(i * V) * 3 + k]).toBeCloseTo(a.layers[(i * V + (V - 1)) * 3 + k]!, 5);
            expect(south.layers[i * 3 + k]).toBeCloseTo(a.layers[((V - 1) * V + i) * 3 + k]!, 5);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it('normales et couleurs identiques sur le bord commun de deux chunks voisins (pas de couture visible)', () => {
    fc.assert(
      fc.property(seed, cc, cc, (s, cx, cz) => {
        const a = meshOf(s, cx, cz), east = meshOf(s, cx + 1, cz), south = meshOf(s, cx, cz + 1);
        for (let i = 0; i < V; i++) {
          const aE = i * V + (V - 1), eW = i * V, aS = (V - 1) * V + i, sN = i;
          for (let k = 0; k < 3; k++) {
            expect(east.normals[eW * 3 + k]).toBe(a.normals[aE * 3 + k]);
            expect(south.normals[sN * 3 + k]).toBe(a.normals[aS * 3 + k]);
          }
          for (let k = 0; k < 4; k++) {
            expect(east.colors[eW * 4 + k]).toBe(a.colors[aE * 4 + k]);
            expect(south.colors[sN * 4 + k]).toBe(a.colors[aS * 4 + k]);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it('égalité avec le sol de la physique : un point du maillage a la hauteur de groundHeight', () => {
    fc.assert(
      fc.property(seed, cc, cc, inQuad, inQuad, (s, cx, cz, lx, lz) => {
        const c = generateChunk(s, cx, cz);
        const m = buildChunkMesh(c, worldSamplers(s, cx, cz));
        // Retrouve, indépendamment, le triangle du maillage qui contient (lx, lz) et interpole par barycentres.
        let found: number | undefined;
        for (let t = 0; t < m.indices.length && found === undefined; t += 3) {
          const p = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!].map((i) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!]);
          const [a, b, d] = p as [[number, number, number], [number, number, number], [number, number, number]];
          const det = (b[2] - d[2]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[2] - d[2]);
          const w1 = ((b[2] - d[2]) * (lx - d[0]) + (d[0] - b[0]) * (lz - d[2])) / det;
          const w2 = ((d[2] - a[2]) * (lx - d[0]) + (a[0] - d[0]) * (lz - d[2])) / det;
          const w3 = 1 - w1 - w2;
          if (w1 >= -1e-12 && w2 >= -1e-12 && w3 >= -1e-12) found = w1 * a[1] + w2 * b[1] + w3 * d[1];
        }
        const physics = groundHeight(c.heights, { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE }, cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        expect(found).toBeDefined();
        expect(physics).toBeCloseTo(found!, 8);
      }),
      { numRuns: 60 },
    );
  });

  it('hauteurs voisines en cache : chaque sommet hors du chunk n’est demandé qu’une fois', () => {
    const asked = new Map<string, number>();
    const heights = worldHeightSampler(4, 1, 1);
    const counting = (col: number, row: number): number => {
      const key = `${col},${row}`;
      asked.set(key, (asked.get(key) ?? 0) + 1);
      return heights(col, row);
    };
    buildChunkMesh(generateChunk(4, 1, 1), { heights: counting, surface: worldSamplers(4, 1, 1).surface });
    expect(Math.max(...asked.values())).toBe(1);
    expect(asked.size).toBeLessThanOrEqual((V + 2 * SHADE_REACH) * (V + 2 * SHADE_REACH) - V * V);
  });

  it('worldHeightSampler : float32 de heightAt aux coordonnées monde du sommet (y compris hors du chunk)', () => {
    const sample = worldHeightSampler(3, 2, -1);
    expect(sample(-1, 40)).toBe(Math.fround(heightAt(3, 2 * 64 - 2, -64 + 80)));
  });
});
