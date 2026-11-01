import { describe, expect, it } from 'vitest';
import { GROUND_LAYERS, LAYER_TILE_M, PAINT_GAIN, PAINT_MAX, PAINT_MIN, paintedLayerFactors, paintedLayerRgba, type GroundLayer } from './painted-ground';

const N = 128;
const channel = (f: Float32Array, c: number): number[] => Array.from({ length: f.length / 3 }, (_, i) => f[i * 3 + c]!);
const luma = (f: Float32Array): number[] => Array.from({ length: f.length / 3 }, (_, i) => 0.2126 * f[i * 3]! + 0.7152 * f[i * 3 + 1]! + 0.0722 * f[i * 3 + 2]!);
const mean = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0) / v.length;
const std = (v: readonly number[]): number => {
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
};

describe('paintedLayerFactors (textures « peintes à la main » du sol : facteurs RGB autour de 1, pur)', () => {
  const layers = new Map(GROUND_LAYERS.map((l) => [l, paintedLayerFactors(l, N)] as const));
  const of = (l: GroundLayer): Float32Array => layers.get(l)!;

  it('quatre couches : herbe, terre, roche, neige ; chacune répétée sur quelques mètres', () => {
    expect(GROUND_LAYERS).toEqual(['grass', 'soil', 'rock', 'snow']);
    for (const l of GROUND_LAYERS) {
      expect(LAYER_TILE_M[l]).toBeGreaterThanOrEqual(2);
      expect(LAYER_TILE_M[l]).toBeLessThanOrEqual(12);
    }
  });

  it('size × size pixels RGB, tous bornés à [PAINT_MIN ; PAINT_MAX]', () => {
    for (const f of layers.values()) {
      expect(f).toHaveLength(N * N * 3);
      for (const v of f) {
        expect(v).toBeGreaterThanOrEqual(Math.fround(PAINT_MIN));
        expect(v).toBeLessThanOrEqual(Math.fround(PAINT_MAX));
      }
    }
  });

  it('moyenne ≈ 1 sur chaque canal : la teinte d’ensemble reste celle de la palette (validée par José)', () => {
    for (const f of layers.values()) for (let c = 0; c < 3; c++) expect(Math.abs(mean(channel(f, c)) - 1)).toBeLessThan(0.01);
  });

  it('déterministe : deux appels donnent exactement les mêmes pixels', () => {
    for (const l of GROUND_LAYERS) expect(paintedLayerFactors(l, N)).toEqual(of(l));
  });

  it('nettement plus travaillée que l’ancien grain (écart-type 0,025) : roche > terre > herbe > neige', () => {
    const s = (l: GroundLayer): number => std(luma(of(l)));
    expect(s('snow')).toBeGreaterThan(0.03);
    expect(s('grass')).toBeGreaterThan(0.06);
    expect(s('soil')).toBeGreaterThan(s('grass'));
    expect(s('rock')).toBeGreaterThan(s('soil'));
    expect(s('snow')).toBeLessThan(s('grass'));
  });

  it('herbe peinte : touches chaudes (jaunes) et froides (bleu-vert), pas seulement plus claires ou plus sombres', () => {
    const f = of('grass');
    const warmth = Array.from({ length: N * N }, (_, i) => f[i * 3]! - f[i * 3 + 2]!);
    expect(std(warmth)).toBeGreaterThan(0.05);
  });

  it('roche peinte : fissures sombres entre les blocs et arêtes éclairées', () => {
    const l = luma(of('rock'));
    expect(l.filter((v) => v < 0.7).length / l.length).toBeGreaterThan(0.03);
    expect(l.filter((v) => v > 1.2).length / l.length).toBeGreaterThan(0.03);
  });

  it('terre : des cailloux plus clairs posés dessus (à la taille du jeu, 512 px : en petit, les cailloux sont trop rares pour compter)', () => {
    const l = luma(paintedLayerFactors('soil', 512));
    expect(l.filter((v) => v > 1.2).length / l.length).toBeGreaterThan(0.01);
  });

  it('les quatre couches sont différentes', () => {
    for (const a of GROUND_LAYERS) for (const b of GROUND_LAYERS) if (a !== b) expect(of(a)).not.toEqual(of(b));
  });

  it('se répète sans couture : à travers le bord, l’écart entre colonnes (ou lignes) voisines reste ordinaire', () => {
    for (const f of layers.values()) {
      const l = luma(f);
      const column = (x: number): number => mean(Array.from({ length: N }, (_, y) => l[y * N + x]!));
      const row = (y: number): number => mean(Array.from({ length: N }, (_, x) => l[y * N + x]!));
      for (const at of [column, row]) {
        let typical = 0, largest = 0;
        for (let i = 0; i < N - 1; i++) {
          const d = Math.abs(at(i + 1) - at(i));
          typical += d / (N - 1);
          largest = Math.max(largest, d);
        }
        expect(Math.abs(at(0) - at(N - 1))).toBeLessThanOrEqual(Math.max(largest, 3 * typical));
      }
    }
  });
});

describe('paintedLayerRgba (octets de la texture)', () => {
  it('octet = facteur / PAINT_GAIN × 255, opaque', () => {
    const f = paintedLayerFactors('soil', 32);
    const rgba = paintedLayerRgba('soil', 32);
    expect(PAINT_GAIN).toBe(PAINT_MAX);
    expect(rgba).toHaveLength(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) {
      for (let c = 0; c < 3; c++) expect(rgba[i * 4 + c]).toBe(Math.round((f[i * 3 + c]! / PAINT_GAIN) * 255));
      expect(rgba[i * 4 + 3]).toBe(255);
    }
  });
});
