import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, describeQuality, parseQuality, pixelRatioFor, qualityFor } from './quality';

const query = (text: string) => {
  const params = new URLSearchParams(text);
  return (name: string): string | null => params.get(name);
};

describe('qualityFor (réglages par niveau)', () => {
  it('trois niveaux, du plus léger au plus beau', () => {
    expect(QUALITY_LEVELS).toEqual(['basse', 'moyenne', 'haute']);
  });

  it('basse : le strict minimum (2 cascades d’ombre, ni occlusion, ni rayons, ni nuages)', () => {
    const q = qualityFor('basse');
    expect(q.shadows).toMatchObject({ cascades: 2 });
    expect(q.ao).toBeNull();
    expect(q.rays).toBeNull();
    expect(q.clouds).toBe(false);
  });

  it('haute : tout est actif', () => {
    const q = qualityFor('haute');
    expect(q.shadows).not.toBeNull();
    expect(q.ao).not.toBeNull();
    expect(q.rays).not.toBeNull();
    expect(q.clouds).toBe(true);
  });

  it('chaque niveau fait au moins aussi bien que le précédent (cascades, cartes d’ombre, échantillons d’occlusion)', () => {
    const [low, mid, high] = QUALITY_LEVELS.map((l) => qualityFor(l));
    expect(mid!.shadows!.cascades).toBeGreaterThanOrEqual(low!.shadows!.cascades);
    expect(high!.shadows!.cascades).toBeGreaterThanOrEqual(mid!.shadows!.cascades);
    expect(mid!.shadows!.mapSize).toBeGreaterThanOrEqual(low!.shadows!.mapSize);
    expect(high!.shadows!.mapSize).toBeGreaterThanOrEqual(mid!.shadows!.mapSize);
    expect(high!.ao!.samples).toBeGreaterThanOrEqual(mid!.ao!.samples);
  });

  it('pluie : nombre de gouttes croissant avec le niveau, toujours de la pluie visible (même en basse)', () => {
    const [low, mid, high] = QUALITY_LEVELS.map((l) => qualityFor(l).rainDrops);
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThanOrEqual(low!);
    expect(high).toBeGreaterThanOrEqual(mid!);
    expect(high).toBeLessThanOrEqual(10000); // particules calculées par le processeur : à mesurer avant d'aller plus haut
  });

  it('image : MSAA (1, 2, 4 ou 8 échantillons) et densité de pixels plafonnée, croissants avec le niveau', () => {
    const [low, mid, high] = QUALITY_LEVELS.map((l) => qualityFor(l).image);
    for (const image of [low!, mid!, high!]) {
      expect([1, 2, 4, 8]).toContain(image.msaa);
      expect(image.maxPixelRatio).toBeGreaterThanOrEqual(1);
    }
    expect(high!.msaa).toBeGreaterThanOrEqual(4); // l'herbe et les feuilles découpées ne crénellent plus
    expect(mid!.msaa).toBeGreaterThanOrEqual(low!.msaa);
    expect(high!.maxPixelRatio).toBeGreaterThanOrEqual(mid!.maxPixelRatio);
    expect(mid!.maxPixelRatio).toBeGreaterThanOrEqual(low!.maxPixelRatio);
  });

  it('cartes d’ombre en puissance de deux, 1 à 4 cascades (limites de Babylon)', () => {
    for (const level of QUALITY_LEVELS) {
      const s = qualityFor(level).shadows;
      if (s === null) continue;
      expect(Number.isInteger(Math.log2(s.mapSize))).toBe(true);
      expect(s.cascades).toBeGreaterThanOrEqual(1);
      expect(s.cascades).toBeLessThanOrEqual(4);
      expect(s.rangeM).toBeGreaterThan(0);
    }
  });
});

describe('parseQuality (?qualite=basse|moyenne|haute et interrupteurs ?ombres=0 ?ao=0 ?rayons=0 ?nuages=0)', () => {
  it('sans réglage : haute', () => {
    expect(parseQuality(query(''))).toEqual(qualityFor('haute'));
  });

  it('?qualite= choisit le niveau', () => {
    expect(parseQuality(query('qualite=basse'))).toEqual(qualityFor('basse'));
    expect(parseQuality(query('qualite=moyenne'))).toEqual(qualityFor('moyenne'));
    expect(parseQuality(query('qualite=haute'))).toEqual(qualityFor('haute'));
  });

  it('un niveau inconnu retombe sur haute (jamais d’erreur : c’est une adresse saisie à la main)', () => {
    for (const bad of ['ultra', '', 'BASSE', '1', '<script>']) expect(parseQuality(query(`qualite=${bad}`))).toEqual(qualityFor('haute'));
  });

  it('chaque interrupteur =0 coupe seulement son effet', () => {
    const full = qualityFor('haute');
    expect(parseQuality(query('ombres=0'))).toEqual({ ...full, shadows: null });
    expect(parseQuality(query('ao=0'))).toEqual({ ...full, ao: null });
    expect(parseQuality(query('rayons=0'))).toEqual({ ...full, rays: null });
    expect(parseQuality(query('nuages=0'))).toEqual({ ...full, clouds: false });
    expect(parseQuality(query('aa=0'))).toEqual({ ...full, image: { ...full.image, msaa: 1 } });
    expect(parseQuality(query('pluie=0'))).toEqual({ ...full, rainDrops: 0 });
  });

  it('les interrupteurs se combinent avec le niveau, et seul « 0 » coupe', () => {
    expect(parseQuality(query('qualite=moyenne&ao=0'))).toEqual({ ...qualityFor('moyenne'), ao: null });
    expect(parseQuality(query('ombres=1&ao=oui'))).toEqual(qualityFor('haute'));
    expect(parseQuality(query('ombres=0&ao=0&rayons=0&nuages=0'))).toMatchObject({ shadows: null, ao: null, rays: null, clouds: false });
  });

  it('un interrupteur ne rallume jamais ce que le niveau a coupé', () => {
    expect(parseQuality(query('qualite=basse&ao=1&rayons=1&nuages=1'))).toEqual(qualityFor('basse'));
  });
});

describe('pixelRatioFor (densité de pixels du rendu)', () => {
  it('suit l’écran jusqu’au plafond', () => {
    expect(pixelRatioFor(1.25, 2)).toBe(1.25);
    expect(pixelRatioFor(1.5, 2)).toBe(1.5);
    expect(pixelRatioFor(3, 2)).toBe(2);
    expect(pixelRatioFor(1.5, 1)).toBe(1);
  });

  it('jamais sous 1, et une valeur absurde vaut 1', () => {
    expect(pixelRatioFor(0.5, 2)).toBe(1);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(pixelRatioFor(bad, 2)).toBe(1);
  });
});

describe('describeQuality (la ligne du panneau de la démo : ce qui est actif)', () => {
  it('haute : le niveau et chaque effet actif, avec la taille des ombres', () => {
    const text = describeQuality(qualityFor('haute'));
    expect(text).toContain('haute');
    expect(text).toContain('ombres 4×2048');
    expect(text).toContain('contact');
    expect(text).toContain('rayons');
    expect(text).toContain('nuages');
    expect(text).toContain('MSAA 4×');
  });

  it('un effet coupé se lit « sans … »', () => {
    const text = describeQuality(parseQuality(query('ombres=0&ao=0&rayons=0&nuages=0')));
    for (const word of ['sans ombres', 'sans contact', 'sans rayons', 'sans nuages']) expect(text).toContain(word);
  });
});
