import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { terrainColor, terrainLayers } from './palette';

const height = fc.double({ min: -80, max: 320, noNaN: true });
const normalY = fc.double({ min: 0, max: 1, noNaN: true });
const unit = fc.double({ min: -1, max: 1, noNaN: true });
const neutral = { patch: 0, snowJitter: 0, cold: 0, path: 0 };
const cold = { patch: 0, snowJitter: 0, cold: 1, path: 0 };
const saturation = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
/** Vert nettement dominant : au moins 25 % au-dessus des autres composantes (indépendant de la luminosité). */
const greenDominates = ([r, g, b]: readonly number[]): boolean => g! >= 1.25 * Math.max(r!, b!);

describe('terrainColor (palette stylisée : herbes en plaques, terre, roche, neige des sommets)', () => {
  it('donne toujours des composantes dans [0, 1]', () => {
    fc.assert(
      fc.property(height, normalY, unit, unit, (h, n, patch, snowJitter) => {
        for (const v of terrainColor(h, n, { patch, snowJitter, cold: 0, path: 0 })) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('terrain plat des plaines et collines : herbe ou prairie, jamais de la terre (le vert passe devant le rouge, loin devant le bleu)', () => {
    for (const h of [-20, -5, 0, 8, 14, 40, 100]) {
      for (const patch of [-1, 0, 1]) {
        const [r, g, b] = terrainColor(h, 1, { patch, snowJitter: 0, cold: 0, path: 0 });
        expect(g).toBeGreaterThanOrEqual(r);
        expect(g).toBeGreaterThanOrEqual(1.8 * b);
      }
    }
  });

  it('tons chauds des aperçus : plaques claires jaune-ocre, plaques sombres et creux vert olive (pas un vert uniforme)', () => {
    const light = terrainColor(14, 1, { ...neutral, patch: 1 }), dark = terrainColor(-10, 1, { ...neutral, patch: -1 });
    expect(light[0] / light[1]).toBeGreaterThan(0.85);
    expect(dark[0] / dark[1]).toBeGreaterThan(0.6);
    expect(greenDominates(dark)).toBe(true);
  });

  it('deux plaques d’herbe voisines ont des verts différents (l’une plus claire)', () => {
    const dark = terrainColor(5, 1, { patch: -0.6, snowJitter: 0, cold: 0, path: 0 }), light = terrainColor(5, 1, { patch: 0.6, snowJitter: 0, cold: 0, path: 0 });
    expect(light[1] - dark[1]).toBeGreaterThan(0.1);
    // … et pas seulement plus claire : plus « prairie dorée » (rouge relevé), sans nouvelle teinte.
    expect(light[0] / light[1]).toBeGreaterThan(dark[0] / dark[1] + 0.05);
  });

  it('pente moyenne : terre (le rouge passe devant le vert, sans être gris)', () => {
    const [r, g, b] = terrainColor(20, 0.84, neutral);
    expect(r).toBeGreaterThan(g - 0.02);
    expect(r).toBeGreaterThan(b + 0.1);
  });

  it('pente raide : roche nette (gris chaud, le vert ne domine plus du tout)', () => {
    for (const h of [-10, 30, 120]) {
      const [r, g, b] = terrainColor(h, 0.62, neutral);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.14);
      expect(g - Math.max(r, b)).toBeLessThan(0.02);
    }
  });

  it('sommets (≥ 200 m) et plat : neige, presque blanche', () => {
    for (const snowJitter of [-1, 0, 1]) {
      const [r, g, b] = terrainColor(205, 1, { patch: 0, snowJitter, cold: 0, path: 0 });
      expect(Math.min(r, g, b)).toBeGreaterThan(0.85);
    }
  });

  it('pas de neige sous 150 m, quelle que soit l’irrégularité de la limite', () => {
    for (const h of [20, 60, 100, 150]) {
      for (const snowJitter of [-1, 1]) expect(Math.min(...terrainColor(h, 1, { patch: 0, snowJitter, cold: 0, path: 0 }))).toBeLessThan(0.5);
    }
  });

  it('la limite de neige est irrégulière : à 180 m, neige d’un côté, pas de l’autre', () => {
    const low = terrainColor(180, 1, { patch: 0, snowJitter: -1, cold: 0, path: 0 }), high = terrainColor(180, 1, { patch: 0, snowJitter: 1, cold: 0, path: 0 });
    expect(Math.min(...low)).toBeGreaterThan(Math.min(...high) + 0.3);
  });

  it('moins de neige sur les pentes raides qu’à plat, à même altitude', () => {
    const flat = terrainColor(220, 1, neutral), steep = terrainColor(220, 0.6, neutral);
    expect(Math.min(...flat)).toBeGreaterThan(Math.min(...steep) + 0.15);
  });

  it('varie sans saut : un petit changement d’entrée donne un petit changement de couleur', () => {
    fc.assert(
      fc.property(height, fc.double({ min: 0, max: 0.99, noNaN: true }), unit, unit, (h, n, patch, snowJitter) => {
        const a = terrainColor(h, n, { patch, snowJitter, cold: 0, path: 0 });
        const b = terrainColor(h + 0.01, n + 0.001, { patch: Math.min(1, patch + 0.001), snowJitter, cold: 0, path: 0 });
        for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.02);
      }),
    );
  });

  describe('sentier de terre (tint.path : 0 = hors sentier, 1 = milieu du sentier)', () => {
    const onPath = { ...neutral, path: 1 };
    const mean = (c: readonly number[]): number => (c[0]! + c[1]! + c[2]!) / 3;

    // Valeurs relevées après le passage aux tons chauds (herbe jaune-vert, prairie ocre, creux olive) ; terre, roche, neige inchangées.
    it('path = 0 : rien ne change (couleurs d’avant les sentiers, à l’identique)', () => {
      const t = (patch: number, cold: number) => ({ patch, snowJitter: 0.1, cold, path: 0 });
      expect(terrainColor(5, 1, t(0.3, 0))).toEqual([0.5352651166666667, 0.7265017055555556, 0.24166170555555558]);
      expect(terrainColor(20, 0.84, t(-0.4, 0))).toEqual([0.52, 0.41, 0.28]);
      expect(terrainColor(60, 0.95, t(0.8, 0.5))).toEqual([0.7207199999999999, 0.8351199999999999, 0.56056]);
      expect(terrainColor(-10, 0.7, t(0, 1))).toEqual([0.56, 0.5, 0.46]);
      expect(terrainColor(205, 0.9, t(0.2, 0.2))).toEqual([0.95, 0.96, 1]);
    });

    it('au milieu du sentier, plat : plus chaud (rouge relevé par rapport au vert) que l’herbe voisine, partout', () => {
      for (const h of [-5, 0, 8, 14, 40, 100]) {
        for (const patch of [-1, 0, 1]) {
          const grass = terrainColor(h, 1, { ...neutral, patch }), dirt = terrainColor(h, 1, { ...onPath, patch });
          expect(dirt[0] / dirt[1]).toBeGreaterThan(grass[0] / grass[1] + 0.2);
        }
      }
    });

    it('… et plus clair que l’herbe des plaines et des plaques sombres (la prairie dorée des hauteurs reste plus vive)', () => {
      for (const h of [-5, 0, 8]) {
        for (const patch of [-1, 0]) {
          expect(mean(terrainColor(h, 1, { ...onPath, patch }))).toBeGreaterThan(mean(terrainColor(h, 1, { ...neutral, patch })) + 0.04);
        }
      }
    });

    it('au milieu du sentier, le vert ne domine plus (terre beige-ocre, pas une herbe)', () => {
      for (const h of [-5, 0, 8, 14, 40, 100]) {
        for (const patch of [-1, 0, 1]) {
          const [r, g, b] = terrainColor(h, 1, { ...onPath, patch });
          expect(greenDominates([r, g, b])).toBe(false);
          expect(r).toBeGreaterThan(g); // ocre : le rouge passe devant le vert…
          expect(g).toBeGreaterThan(b + 0.1); // … et le bleu reste loin derrière (pas un gris)
        }
      }
    });

    it('mélange progressif : à mi-sentier, la couleur est à mi-chemin entre l’herbe et la terre du sentier', () => {
      const grass = terrainColor(10, 1, neutral), dirt = terrainColor(10, 1, onPath), half = terrainColor(10, 1, { ...neutral, path: 0.5 });
      for (let i = 0; i < 3; i++) expect(half[i]).toBeCloseTo((grass[i]! + dirt[i]!) / 2, 9);
    });

    it('la terre du sentier est la même quelle que soit la plaque d’herbe (un sentier est une teinte, pas une herbe)', () => {
      const dark = terrainColor(10, 1, { ...onPath, patch: -1 }), light = terrainColor(10, 1, { ...onPath, patch: 1 });
      for (let i = 0; i < 3; i++) expect(Math.abs(dark[i]! - light[i]!)).toBeLessThan(0.05);
    });

    it('atténué sur les pentes : sentier net à plat, absent sur la roche (pente raide)', () => {
      const flat = terrainColor(20, 1, onPath), gentle = terrainColor(20, 0.9, onPath), rock = terrainColor(20, 0.62, onPath);
      const noPath = (n: number) => terrainColor(20, n, neutral);
      const gap = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      expect(gap(flat, noPath(1))).toBeGreaterThan(0.2);
      expect(gap(gentle, noPath(0.9))).toBeLessThan(gap(flat, noPath(1)));
      expect(gap(rock, noPath(0.62))).toBeLessThan(0.02);
      // Dans le froid, la roche arrive plus tôt : le sentier aussi disparaît plus tôt.
      expect(gap(terrainColor(20, 0.84, { ...cold, path: 1 }), terrainColor(20, 0.84, cold))).toBeLessThan(0.02);
    });

    it('recouvert par la neige : aucune trace de sentier sous la limite des neiges', () => {
      expect(terrainColor(230, 1, onPath)).toEqual(terrainColor(230, 1, neutral));
    });

    it('toujours des composantes dans [0, 1], et sans saut quand le sentier varie un peu', () => {
      fc.assert(
        fc.property(height, normalY, unit, unit, fc.double({ min: 0, max: 0.99, noNaN: true }), (h, n, patch, snowJitter, path) => {
          const a = terrainColor(h, n, { patch, snowJitter, cold: 0, path }), b = terrainColor(h, n, { patch, snowJitter, cold: 0, path: path + 0.01 });
          for (let i = 0; i < 3; i++) {
            expect(a[i]).toBeGreaterThanOrEqual(0);
            expect(a[i]).toBeLessThanOrEqual(1);
            expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.02);
          }
        }),
      );
    });
  });

  describe('biome froid', () => {
    it('herbe plus pâle et bleutée qu’en forêt (même altitude, même plaque)', () => {
      const f = terrainColor(10, 1, neutral), c = terrainColor(10, 1, cold);
      expect(saturation(c)).toBeLessThan(saturation(f) - 0.1);
      expect(c[2] / c[1]).toBeGreaterThan(f[2] / f[1] + 0.2);
    });

    it('plus de roche : une pente moyenne est déjà rocheuse dans le froid, pas en forêt', () => {
      const f = terrainColor(20, 0.84, neutral), c = terrainColor(20, 0.84, cold);
      expect(saturation(c)).toBeLessThan(0.14); // gris de roche
      expect(saturation(f)).toBeGreaterThan(0.2); // terre brune en forêt
    });

    it('neige plus basse : à 130 m et à plat, neige dans le froid, rien en forêt', () => {
      expect(Math.min(...terrainColor(130, 1, cold))).toBeGreaterThan(0.85);
      expect(Math.min(...terrainColor(130, 1, neutral))).toBeLessThan(0.5);
    });

    it('le passage forêt → froid est progressif (pas de saut de couleur pour un petit écart de biome)', () => {
      fc.assert(
        fc.property(height, normalY, fc.double({ min: 0, max: 0.99, noNaN: true }), (h, n, k) => {
          const a = terrainColor(h, n, { patch: 0, snowJitter: 0, cold: k, path: 0 }), b = terrainColor(h, n, { patch: 0, snowJitter: 0, cold: k + 0.01, path: 0 });
          for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.05);
        }),
      );
    });
  });
});

describe('terrainLayers (où le sol montre la texture de terre, de roche ou de neige ; le reste est de l’herbe)', () => {
  const sum = (l: { soil: number; rock: number; snow: number }): number => l.soil + l.rock + l.snow;

  it('poids dans [0, 1], jamais plus de 1 à eux trois (l’herbe prend le reste)', () => {
    fc.assert(
      fc.property(height, normalY, unit, unit, unit, fc.double({ min: 0, max: 1, noNaN: true }), (h, n, patch, snowJitter, c, path) => {
        const l = terrainLayers(h, n, { patch, snowJitter, cold: Math.abs(c), path });
        for (const v of [l.soil, l.rock, l.snow]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(sum(l)).toBeLessThanOrEqual(1 + 1e-9);
      }),
    );
  });

  it('plaine plate : de l’herbe partout', () => {
    for (const h of [-20, 0, 40, 100]) expect(sum(terrainLayers(h, 1, neutral))).toBeCloseTo(0, 6);
  });

  it('mêmes limites que les couleurs : terre sur pente moyenne, roche sur pente raide, neige des sommets', () => {
    expect(terrainLayers(40, 0.83, neutral).soil).toBeGreaterThan(0.99);
    expect(terrainLayers(40, 0.6, neutral).rock).toBeGreaterThan(0.99);
    expect(terrainLayers(240, 1, neutral).snow).toBeGreaterThan(0.99);
    expect(terrainLayers(100, 1, cold).snow).toBeCloseTo(0, 6);
  });

  it('sentier : la terre battue, effacée sur les pentes raides', () => {
    expect(terrainLayers(20, 1, { ...neutral, path: 1 }).soil).toBeCloseTo(1, 6);
    expect(terrainLayers(20, 1, { ...neutral, path: 0.5 }).soil).toBeCloseTo(0.5, 6);
    expect(terrainLayers(20, 0.6, { ...neutral, path: 1 }).rock).toBeGreaterThan(0.99);
  });

  it('biome froid : la roche perce dès une pente moyenne', () => {
    expect(terrainLayers(40, 0.86, cold).rock).toBeGreaterThan(terrainLayers(40, 0.86, neutral).rock + 0.5);
  });
});
