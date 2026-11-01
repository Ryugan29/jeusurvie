import { describe, expect, it } from 'vitest';
import { luminance } from './lighting';
import { evergreenTint, foliageProfileFor, hash01, heightShade, retint, treeTint, tuftTint, valueNoise, WIND_DIR, WIND_SPEED_MS, windGust, windOffset, type InstanceTint } from './foliage';

describe('foliageProfileFor (quel traitement végétal pour quel matériau du pack)', () => {
  it('herbe, petites plantes, fleurs, feuillus, pins, buissons : chacun son traitement', () => {
    expect(foliageProfileFor('Grass')?.kind).toBe('grass');
    expect(foliageProfileFor('Leaves')?.kind).toBe('plant');
    expect(foliageProfileFor('Flowers')?.kind).toBe('flower');
    expect(foliageProfileFor('Leaves_NormalTree')?.kind).toBe('tree');
    expect(foliageProfileFor('Leaves_Pine')?.kind).toBe('pine');
    expect(foliageProfileFor('Leaves_TwistedTree')?.kind).toBe('bush');
  });

  it('écorces, roches, cailloux, champignons, matériaux inconnus : aucun (ni vent, ni teinte)', () => {
    for (const name of ['Bark_NormalTree', 'Bark_DeadTree', 'Rocks', 'PathRocks', 'Mushrooms', 'MI_Hair_2', 'Inconnu']) {
      expect(foliageProfileFor(name), name).toBeUndefined();
    }
  });

  it('le couvre-sol a un dégradé pied sombre → pointe claire ; les fleurs et les arbres non (leurs couleurs restent celles du pack)', () => {
    expect(foliageProfileFor('Grass')!.gradient).toBeGreaterThan(0.5);
    expect(foliageProfileFor('Leaves')!.gradient).toBeGreaterThan(0.5);
    expect(foliageProfileFor('Flowers')!.gradient).toBe(0);
    expect(foliageProfileFor('Leaves_NormalTree')!.gradient).toBe(0);
  });

  it('le vent plie l’herbe bien plus qu’il ne fait frémir les feuilles des arbres (quelques centimètres)', () => {
    const grass = foliageProfileFor('Grass')!, tree = foliageProfileFor('Leaves_NormalTree')!;
    expect(grass.windM).toBeGreaterThan(3 * tree.windM);
    expect(tree.windM).toBeGreaterThan(0);
    expect(tree.windM).toBeLessThanOrEqual(0.08);
    // Hauteur de référence (m, dans le modèle) : la pointe de l'herbe, le haut d'un arbre.
    expect(grass.heightRefM).toBeLessThan(2.5);
    expect(tree.heightRefM).toBeGreaterThan(5);
  });
});

describe('heightShade (dégradé du couvre-sol : pied sombre, presque ombré → pointe jaune-vert lumineuse)', () => {
  it('le pied est nettement plus sombre que la pointe', () => {
    expect(luminance(heightShade(0))).toBeLessThan(0.6 * luminance(heightShade(1)));
  });

  it('la pointe tire vers le jaune (rouge relevé par rapport au vert, bleu baissé), le pied vers un vert froid', () => {
    const foot = heightShade(0), tip = heightShade(1);
    expect(tip[0] / tip[1]).toBeGreaterThan(foot[0] / foot[1] + 0.1);
    expect(tip[2]).toBeLessThan(tip[1]);
  });

  it('monte sans saut ni retour en arrière, et reste borné hors de [0, 1]', () => {
    let previous = -1;
    for (let h = 0; h <= 1.0001; h += 0.05) {
      const l = luminance(heightShade(h));
      expect(l).toBeGreaterThanOrEqual(previous);
      if (previous >= 0) expect(l - previous).toBeLessThan(0.1);
      previous = l;
    }
    expect(heightShade(-1)).toEqual(heightShade(0));
    expect(heightShade(3)).toEqual(heightShade(1));
  });
});

describe('hash01 et valueNoise (hasard reproductible par position, recopié dans le shader)', () => {
  it('hash01 : dans [0, 1), même position → même valeur, réparti uniformément', () => {
    let sum = 0, n = 0;
    for (let x = -3000; x < 3000; x += 37.3) {
      for (let z = -3000; z < 3000; z += 41.7) {
        const v = hash01(x, z);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        sum += v;
        n++;
      }
    }
    expect(hash01(12.5, -7.25)).toBe(hash01(12.5, -7.25));
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });

  it('valueNoise : dans [0, 1], varie sans saut (deux points proches ont presque la même valeur)', () => {
    for (let x = -50; x < 50; x += 0.73) {
      for (let z = -50; z < 50; z += 0.91) {
        const a = valueNoise(x, z), b = valueNoise(x + 0.01, z + 0.01);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        expect(Math.abs(a - b)).toBeLessThan(0.05);
      }
    }
  });
});

/** Positions sur une grille (pas `step` m) d'un carré de côté `side` m centré en (cx, cz). */
function grid(side: number, step: number, cx = 0, cz = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let x = cx - side / 2; x < cx + side / 2; x += step) for (let z = cz - side / 2; z < cz + side / 2; z += step) out.push([x, z]);
  return out;
}
const fraction = (points: readonly [number, number][], test: (x: number, z: number) => boolean): number =>
  points.filter(([x, z]) => test(x, z)).length / points.length;

describe('tuftTint (touffes d’herbe et plantes : quelques-unes sèches et dorées, en plaques, comme les aperçus)', () => {
  const dry = (x: number, z: number): boolean => tuftTint(x, z).amount > 0.5;
  const points = grid(400, 0.9, 300, -200);

  it('une minorité de touffes sèches (5 à 20 %)', () => {
    const f = fraction(points, dry);
    expect(f).toBeGreaterThan(0.05);
    expect(f).toBeLessThan(0.2);
  });

  it('en plaques : à 1 m d’une touffe sèche, une autre l’est bien plus souvent qu’au hasard', () => {
    const base = fraction(points, dry);
    const near = fraction(points.filter(([x, z]) => dry(x, z)), (x, z) => dry(x + 1, z));
    expect(near).toBeGreaterThan(3 * base);
  });

  it('les sèches tirent vers l’or (rouge > vert > bleu) ; luminosité variée mais douce (± 15 %)', () => {
    for (const [x, z] of points.slice(0, 4000)) {
      const t = tuftTint(x, z);
      expect(t.amount).toBeGreaterThanOrEqual(0);
      expect(t.amount).toBeLessThanOrEqual(1);
      expect(t.brightness).toBeGreaterThanOrEqual(0.85);
      expect(t.brightness).toBeLessThanOrEqual(1.15);
      if (t.amount > 0.5) {
        expect(t.target[0]).toBeGreaterThan(1.1 * t.target[1]);
        expect(t.target[1]).toBeGreaterThan(t.target[2]);
      }
    }
  });
});

describe('treeTint (feuillus : 15 à 25 % d’automne, en groupes ; les autres, verts plus ou moins clairs et jaunes)', () => {
  const autumn = (x: number, z: number): boolean => treeTint(x, z).amount > 0.5;
  const trees = grid(4000, 7, 0, 0);

  it('15 à 25 % des arbres en automne', () => {
    const f = fraction(trees, autumn);
    expect(f).toBeGreaterThan(0.15);
    expect(f).toBeLessThan(0.25);
  });

  it('en groupes, pas isolés : à 14 m d’un arbre d’automne, l’autre l’est le plus souvent', () => {
    expect(fraction(trees.filter(([x, z]) => autumn(x, z)), (x, z) => autumn(x + 14, z))).toBeGreaterThan(0.6);
  });

  it('automne : orange, rouge ou jaune (rouge loin devant, bleu bas), et les trois existent', () => {
    let reds = 0, yellows = 0;
    for (const [x, z] of trees) {
      const t = treeTint(x, z);
      if (t.amount <= 0.5) continue;
      expect(t.target[0]).toBeGreaterThan(t.target[1] + 0.15);
      expect(t.target[2]).toBeLessThan(0.3);
      const ratio = t.target[1] / t.target[0];
      if (ratio < 0.4) reds++;
      if (ratio > 0.65) yellows++;
    }
    expect(reds).toBeGreaterThan(50);
    expect(yellows).toBeGreaterThan(50);
  });

  it('les arbres verts varient : certains plus clairs, d’autres plus sombres', () => {
    const greens = trees.filter(([x, z]) => !autumn(x, z)).map(([x, z]) => treeTint(x, z).brightness);
    expect(greens.reduce((a, b) => Math.min(a, b), 2)).toBeLessThan(0.92);
    expect(greens.reduce((a, b) => Math.max(a, b), 0)).toBeGreaterThan(1.08);
  });
});

describe('retint (applique la teinte d’une instance à une couleur de texture)', () => {
  const tint = (over: Partial<InstanceTint>): InstanceTint => ({ target: [0.9, 0.5, 0.1], amount: 0, brightness: 1, ...over });
  const leaf = [0.35, 0.6, 0.12] as const;

  it('sans teinte : la couleur, à la luminosité de l’instance près', () => {
    expect(retint(leaf, tint({}))).toEqual(leaf);
    const darker = retint(leaf, tint({ brightness: 0.8 }));
    for (let i = 0; i < 3; i++) expect(darker[i]).toBeCloseTo(leaf[i]! * 0.8, 9);
  });

  it('teinte pleine : la couleur cible, à la luminosité de la texture (les nuances peintes restent)', () => {
    const c = retint(leaf, tint({ amount: 1 }));
    expect(luminance(c)).toBeCloseTo(luminance(leaf), 6);
    expect(c[0] / c[1]).toBeCloseTo(0.9 / 0.5, 6);
  });
});

describe('vent (balancement doux, rafales qui traversent la prairie)', () => {
  it('rafale dans [0, 1], qui avance dans le sens du vent à vitesse constante', () => {
    for (const [x, z, t] of [[0, 0, 0], [12.3, -40, 3.7], [-800, 250, 91.2]] as const) {
      const g = windGust(x, z, t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      const d = 9.5; // la même rafale, 9,5 m plus loin, d / vitesse secondes plus tard
      expect(windGust(x + d * WIND_DIR.x, z + d * WIND_DIR.z, t + d / WIND_SPEED_MS)).toBeCloseTo(g, 6);
    }
  });

  it('le pied ne bouge pas ; plus haut, ça bouge plus, sans dépasser le débattement prévu', () => {
    for (let time = 0; time < 30; time += 0.37) {
      const foot = windOffset(5, 8, 0, time, 0.3, 0);
      expect(Math.hypot(foot.dx, foot.dz)).toBe(0);
      const mid = windOffset(5, 8, 0.5, time, 0.3, 0), tip = windOffset(5, 8, 1, time, 0.3, 0);
      expect(Math.hypot(tip.dx, tip.dz)).toBeGreaterThan(Math.hypot(mid.dx, mid.dz));
      expect(Math.hypot(tip.dx, tip.dz)).toBeLessThanOrEqual(0.3 * 1.15);
    }
  });

  it('sans vent (débattement 0), rien ne bouge', () => {
    const o = windOffset(3, 4, 1, 12, 0, 0.5);
    expect(Math.hypot(o.dx, o.dz)).toBe(0);
  });

  it('doux et continu : d’une image à l’autre (1/60 s), la pointe bouge de moins d’un centimètre', () => {
    for (let time = 0; time < 20; time += 0.21) {
      const a = windOffset(-12, 30, 1, time, 0.3, 1.2), b = windOffset(-12, 30, 1, time + 1 / 60, 0.3, 1.2);
      expect(Math.hypot(a.dx - b.dx, a.dz - b.dz)).toBeLessThan(0.01);
    }
  });

  it('les brins penchent surtout dans le sens du vent', () => {
    let along = 0;
    for (let time = 0; time < 60; time += 0.5) {
      const o = windOffset(7, -3, 1, time, 0.3, 0);
      along += o.dx * WIND_DIR.x + o.dz * WIND_DIR.z;
    }
    expect(along).toBeGreaterThan(0);
  });
});

describe('evergreenTint (pins, buissons : jamais d’automne, seulement plus ou moins clairs)', () => {
  it('aucune teinte, luminosité variée d’un arbre à l’autre (± 12 %)', () => {
    const all = grid(600, 7).map(([x, z]) => evergreenTint(x, z));
    for (const t of all) expect(t.amount).toBe(0);
    const b = all.map((t) => t.brightness);
    expect(b.reduce((a, v) => Math.min(a, v), 2)).toBeLessThan(0.92);
    expect(b.reduce((a, v) => Math.max(a, v), 0)).toBeGreaterThan(1.08);
    expect(b.reduce((a, v) => Math.max(a, v), 0)).toBeLessThanOrEqual(1.12);
  });
});
