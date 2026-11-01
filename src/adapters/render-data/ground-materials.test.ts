import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ALBEDO_FACTOR_MAX,
  PUDDLE_ROUGHNESS,
  SURFACE_LAYERS,
  SURFACE_LAYER_SPECS,
  WET_ROUGHNESS,
  decodeAlbedoFactor,
  encodeAlbedoFactor,
  normalSlopeScale,
} from './ground-materials';

describe('matières du sol (réglages)', () => {
  it('quatre matières, chacune avec un motif de taille humaine et un relief réaliste (millimètres à centimètres)', () => {
    expect(SURFACE_LAYERS).toEqual(['grass', 'soil', 'rock', 'snow']);
    for (const layer of SURFACE_LAYERS) {
      const s = SURFACE_LAYER_SPECS[layer];
      expect(s.tileM).toBeGreaterThanOrEqual(2);
      expect(s.tileM).toBeLessThanOrEqual(12);
      expect(s.bumpDepthM).toBeGreaterThan(0.005);
      expect(s.bumpDepthM).toBeLessThan(0.2);
      expect(s.roughness).toBeGreaterThan(0.3);
      expect(s.roughness).toBeLessThanOrEqual(1);
    }
  });

  it('albédos de référence physiquement plausibles : herbe et terre sombres, roche moyenne, neige très claire', () => {
    const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(lum(SURFACE_LAYER_SPECS.grass.referenceAlbedo)).toBeLessThan(0.15);
    expect(lum(SURFACE_LAYER_SPECS.soil.referenceAlbedo)).toBeLessThan(0.2);
    expect(lum(SURFACE_LAYER_SPECS.rock.referenceAlbedo)).toBeGreaterThan(0.1);
    expect(lum(SURFACE_LAYER_SPECS.rock.referenceAlbedo)).toBeLessThan(0.35);
    expect(lum(SURFACE_LAYER_SPECS.snow.referenceAlbedo)).toBeGreaterThan(0.7);
  });

  it('l’eau lisse la matière, la flaque est presque un miroir', () => {
    expect(PUDDLE_ROUGHNESS).toBeLessThan(0.1);
    expect(WET_ROUGHNESS).toBeLessThan(Math.min(...SURFACE_LAYERS.map((l) => SURFACE_LAYER_SPECS[l].roughness)));
  });
});

describe('code des facteurs d’albédo (octet ↔ facteur)', () => {
  it('aller-retour exact sur [0, max]', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: ALBEDO_FACTOR_MAX, noNaN: true }), (f) => {
      expect(decodeAlbedoFactor(encodeAlbedoFactor(f))).toBeCloseTo(f, 9);
    }));
  });

  it('borné, et une valeur absurde vaut 0', () => {
    expect(encodeAlbedoFactor(-1)).toBe(0);
    expect(encodeAlbedoFactor(99)).toBe(1);
    expect(encodeAlbedoFactor(Number.NaN)).toBe(0);
  });

  it('plus de précision dans les sombres : le facteur 1 n’est pas au milieu de l’octet mais au-dessus', () => {
    expect(encodeAlbedoFactor(1)).toBeGreaterThan(0.5);
    // Un pas d'octet autour de 1 change le facteur de moins de 1,5 %.
    const code = Math.round(encodeAlbedoFactor(1) * 255);
    expect(decodeAlbedoFactor((code + 1) / 255) - decodeAlbedoFactor(code / 255)).toBeLessThan(0.015);
  });
});

describe('normalSlopeScale (relief en pente réelle)', () => {
  it('proportionnel à la résolution : un texel plus petit, une pente plus forte pour la même hauteur', () => {
    for (const layer of SURFACE_LAYERS) {
      expect(normalSlopeScale(layer, 2048)).toBeCloseTo(4 * normalSlopeScale(layer, 512), 9);
      expect(normalSlopeScale(layer, 512)).toBeCloseTo((SURFACE_LAYER_SPECS[layer].bumpDepthM * 512) / SURFACE_LAYER_SPECS[layer].tileM, 9);
    }
  });
});
