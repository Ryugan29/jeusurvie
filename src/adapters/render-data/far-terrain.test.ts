import { describe, expect, it } from 'vitest';
import { forestFactorAt } from '../../core/world/placement';
import { heightAt } from '../../core/world/terrain';
import { buildFarTerrain, CANOPY, farCenterFor, farColor } from './far-terrain';

describe('buildFarTerrain (relief lointain : grille grossière du vrai terrain)', () => {
  const seed = 12345;
  const options = { halfSizeM: 200, stepM: 50 };

  it('(2n + 1)² sommets, positions relatives au centre, hauteurs = heightAt (float32)', () => {
    const mesh = buildFarTerrain(seed, 1000, -600, options);
    const side = 9;
    expect(mesh.positions.length).toBe(side * side * 3);
    expect(mesh.colors.length).toBe(side * side * 4);
    expect(mesh.indices.length).toBe((side - 1) * (side - 1) * 6);
    // Sommet (col 0, row 0) : coin (−200, −200) du centre.
    expect(mesh.positions[0]).toBe(-200);
    expect(mesh.positions[2]).toBe(-200);
    expect(mesh.positions[1]).toBe(Math.fround(heightAt(seed, 800, -800)));
    // Centre de la grille.
    const mid = (4 * side + 4) * 3;
    expect([mesh.positions[mid], mesh.positions[mid + 2]]).toEqual([0, 0]);
    expect(mesh.positions[mid + 1]).toBe(Math.fround(heightAt(seed, 1000, -600)));
  });

  it('normales unitaires tournées vers le haut, couleurs dans [0, 1], alpha 1', () => {
    const mesh = buildFarTerrain(seed, 3000, 2000, options);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1, 5);
      expect(mesh.normals[i + 1]).toBeGreaterThan(0);
    }
    for (let i = 0; i < mesh.colors.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        expect(mesh.colors[i + k]).toBeGreaterThanOrEqual(0);
        expect(mesh.colors[i + k]).toBeLessThanOrEqual(1);
      }
      expect(mesh.colors[i + 3]).toBe(1);
    }
  });

  it('indices dans la grille, triangles vus du dessus (même convention que les chunks)', () => {
    const mesh = buildFarTerrain(seed, 0, 0, options);
    const count = mesh.positions.length / 3;
    for (const index of mesh.indices) expect(index).toBeLessThan(count);
    // Premier triangle : produit vectoriel des arêtes orienté vers le bas en main gauche (comme quadTriangles).
    const p = (i: number) => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!] as const;
    const [a, b, c] = [p(mesh.indices[0]!), p(mesh.indices[1]!), p(mesh.indices[2]!)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    expect(u[2]! * v[0]! - u[0]! * v[2]!).toBeLessThan(0);
  });

  it('déterministe', () => {
    expect(buildFarTerrain(seed, 500, 500, options)).toEqual(buildFarTerrain(seed, 500, 500, options));
  });

  it('réglages absurdes : RangeError', () => {
    for (const bad of [{ halfSizeM: 0, stepM: 50 }, { halfSizeM: 100, stepM: 0 }, { halfSizeM: Number.NaN, stepM: 50 }, { halfSizeM: 1e6, stepM: 1 }]) {
      expect(() => buildFarTerrain(seed, 0, 0, bad)).toThrow(RangeError);
    }
  });
});

describe('farColor (couleur vue de loin)', () => {
  it('une forêt dense se voit plus sombre et plus proche de la canopée que la prairie', () => {
    const seed = 12345;
    // Cherche un point de bosquet et un point de clairière.
    let grove: [number, number] | undefined, clearing: [number, number] | undefined;
    for (let x = -2000; x < 2000 && !(grove && clearing); x += 37) {
      const f = forestFactorAt(seed, x, 300);
      if (f > 2.2 && !grove) grove = [x, 300];
      if (f < 0.1 && !clearing) clearing = [x, 300];
    }
    expect(grove && clearing).toBeTruthy();
    const g = farColor(seed, grove![0], grove![1], 0, 1);
    const c = farColor(seed, clearing![0], clearing![1], 0, 1);
    const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    expect(g[0] + g[1] + g[2]).toBeLessThan(c[0] + c[1] + c[2]);
    expect(dist(g, CANOPY)).toBeLessThan(dist(c, CANOPY));
  });

  it('pas d’arbres sur la neige des sommets', () => {
    const snowy = farColor(12345, 0, 0, 400, 1);
    expect(Math.min(...snowy)).toBeGreaterThan(0.85);
  });
});

describe('farCenterFor (centre aimanté)', () => {
  it('arrondit au multiple du pas, sans −0', () => {
    expect(farCenterFor(740, -260, 500)).toEqual({ x: 500, z: -500 });
    expect(farCenterFor(-10, 10, 500)).toEqual({ x: 0, z: 0 });
    expect(Object.is(farCenterFor(-10, 0, 500).x, -0)).toBe(false);
  });
});
