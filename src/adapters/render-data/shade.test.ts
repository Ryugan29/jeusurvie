import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHADE_MAX, SHADE_MIN, SHADE_REACH, terrainShade } from './shade';

// Champs de hauteur synthétiques, en indices de sommets (un sommet tous les 2 m).
const flat = (): number => 3;
const bowl = (c: number, r: number): number => 0.08 * (c * c + r * r); // creux centré en (0, 0)
const dome = (c: number, r: number): number => -0.08 * (c * c + r * r); // crête centrée en (0, 0)

describe('terrainShade (occlusion cuite dans les couleurs de sommets)', () => {
  it('terrain plat : ni assombri ni éclairci', () => {
    expect(terrainShade(flat, 0, 0, 1)).toBe(1);
  });

  it('un creux est plus sombre qu’une crête, et le plat est entre les deux', () => {
    const hollow = terrainShade(bowl, 0, 0, 1), crest = terrainShade(dome, 0, 0, 1);
    expect(hollow).toBeLessThanOrEqual(0.9); // creux nettement assombri (retour de José : relief peu lisible à midi)
    expect(crest).toBeGreaterThan(1);
  });

  it('une pente est légèrement assombrie par rapport au plat', () => {
    const plane = (c: number): number => 1.2 * c;
    expect(terrainShade(plane, 0, 0, 0.6)).toBeLessThan(terrainShade(flat, 0, 0, 1));
  });

  it('reste toujours dans [SHADE_MIN, SHADE_MAX] (effet léger)', () => {
    expect(SHADE_MIN).toBeGreaterThanOrEqual(0.65);
    expect(SHADE_REACH).toBe(6);
    expect(SHADE_MAX).toBeLessThanOrEqual(1.15);
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (k, ny) => {
        const s = terrainShade((c, r) => k * (c * c - r * r * 0.5 + c * r), 0, 0, ny);
        expect(s).toBeGreaterThanOrEqual(SHADE_MIN);
        expect(s).toBeLessThanOrEqual(SHADE_MAX);
      }),
    );
  });

  it('ne dépend que des hauteurs autour du sommet (même résultat où que soit le sommet : pas de couture)', () => {
    const field = (c: number, r: number): number => Math.sin(c * 0.3) * 4 + Math.cos(r * 0.2) * 3;
    const shifted = (c: number, r: number): number => field(c + 10, r - 7);
    expect(terrainShade(shifted, 5, 9, 0.9)).toBe(terrainShade(field, 15, 2, 0.9));
  });
});
