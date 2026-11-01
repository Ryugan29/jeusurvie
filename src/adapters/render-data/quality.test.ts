import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_LEVEL,
  QUALITY_DESCRIPTIONS,
  QUALITY_LEVELS,
  QUALITY_OVERRIDE_KEYS,
  describeQuality,
  levelFromUrl,
  msaaSamplesFor,
  overridesFromUrl,
  parseQuality,
  pixelRatioFor,
  qualityFor,
  qualityLevelFrom,
  resolveQuality,
  type QualitySettings,
} from './quality';

const query = (text: string) => {
  const params = new URLSearchParams(text);
  return (name: string): string | null => params.get(name);
};
const all = (): QualitySettings[] => QUALITY_LEVELS.map((l) => qualityFor(l));
/** Chaque profil fait au moins aussi bien que le précédent pour cette mesure. */
const nonDecreasing = (measure: (q: QualitySettings) => number): void => {
  const values = all().map(measure);
  for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
};

describe('qualityFor (quatre profils)', () => {
  it('LOW, MEDIUM, HIGH, ULTRA, du plus léger au plus beau ; HIGH par défaut', () => {
    expect(QUALITY_LEVELS).toEqual(['low', 'medium', 'high', 'ultra']);
    expect(DEFAULT_QUALITY_LEVEL).toBe('high');
  });

  it('LOW : ombres simples, ni occlusion, ni reflets, ni rayons, brume classique, sol sans relief', () => {
    const q = qualityFor('low');
    expect(q.shadows).toMatchObject({ cascades: 2, mapSize: 1024 });
    expect(q.ao).toBeNull();
    expect(q.ssr).toBeNull();
    expect(q.rays).toBeNull();
    expect(q.post.aerialPerspective).toBe(false);
    expect(q.terrain.normalMaps).toBe(false);
    expect(q.distances.coverDensity).toBeLessThan(1);
  });

  it('MEDIUM : occlusion ambiante et perspective atmosphérique, sans reflets à l’écran', () => {
    const q = qualityFor('medium');
    expect(q.ao).not.toBeNull();
    expect(q.post.aerialPerspective).toBe(true);
    expect(q.ssr).toBeNull();
  });

  it('HIGH : tout est actif sauf les effets de cinéma (profondeur de champ, flou de mouvement)', () => {
    const q = qualityFor('high');
    for (const effect of [q.shadows, q.ao, q.ssr, q.rays]) expect(effect).not.toBeNull();
    expect(q.post.dof).toBeNull();
    expect(q.post.motionBlur).toBe(0);
  });

  it('ULTRA apporte des techniques que HIGH n’a pas (pas seulement des nombres plus grands)', () => {
    const high = qualityFor('high'), ultra = qualityFor('ultra');
    expect(ultra.shadows!.filter).toBe('pcss');
    expect(high.shadows!.filter).not.toBe('pcss');
    expect(ultra.sky.clouds).toBe('volumetric');
    expect(high.sky.clouds).not.toBe('volumetric');
    expect(ultra.post.dof).not.toBeNull();
    expect(ultra.post.motionBlur).toBeGreaterThan(0);
    expect(ultra.ao!.expensiveBlur).toBe(true);
    expect(ultra.ssr!.blur).toBe(true);
  });

  it('ULTRA ne paie pas ce qui ne se voit pas : occlusion à 16 échantillons au plus, lissés par le flou soigné', () => {
    const ao = qualityFor('ultra').ao!;
    expect(ao.samples).toBeLessThanOrEqual(16);
    expect(ao.expensiveBlur).toBe(true);
  });

  it('chaque profil fait au moins aussi bien que le précédent, partout', () => {
    nonDecreasing((q) => q.image.msaa);
    nonDecreasing((q) => q.image.maxPixelRatio);
    nonDecreasing((q) => q.shadows?.cascades ?? 0);
    nonDecreasing((q) => q.shadows?.mapSize ?? 0);
    nonDecreasing((q) => q.shadows?.rangeM ?? 0);
    nonDecreasing((q) => q.ao?.samples ?? 0);
    nonDecreasing((q) => q.ao?.ratio ?? 0);
    nonDecreasing((q) => q.ssr?.steps ?? 0);
    nonDecreasing((q) => q.rays?.samples ?? 0);
    nonDecreasing((q) => q.sky.envProbeSize);
    nonDecreasing((q) => -q.sky.envProbeRefreshS);
    nonDecreasing((q) => q.post.bloomKernel);
    nonDecreasing((q) => q.terrain.textureSize);
    nonDecreasing((q) => q.terrain.anisotropy);
    nonDecreasing((q) => q.distances.viewRadiusM);
    nonDecreasing((q) => q.distances.farTerrain?.halfSizeM ?? 0);
    nonDecreasing((q) => -(q.distances.farTerrain?.stepM ?? Infinity));
    nonDecreasing((q) => q.distances.vegetationRange);
    nonDecreasing((q) => q.distances.coverRadiusM);
    nonDecreasing((q) => q.distances.coverDensity);
    nonDecreasing((q) => q.rainDrops);
  });

  it('limites des moteurs : cartes et textures en puissance de deux, 1 à 4 cascades, ratios dans ]0, 1]', () => {
    for (const q of all()) {
      const s = q.shadows;
      if (s) {
        expect(Number.isInteger(Math.log2(s.mapSize))).toBe(true);
        expect(s.cascades).toBeGreaterThanOrEqual(1);
        expect(s.cascades).toBeLessThanOrEqual(4);
        expect(s.rangeM).toBeGreaterThan(0);
        expect(s.mapSize).toBeLessThanOrEqual(4096);
      }
      expect(Number.isInteger(Math.log2(q.terrain.textureSize))).toBe(true);
      expect(Number.isInteger(Math.log2(q.sky.envProbeSize))).toBe(true);
      expect([1, 2, 4, 8]).toContain(q.image.msaa);
      expect(q.image.maxPixelRatio).toBeGreaterThanOrEqual(1);
      for (const ratio of [q.ao?.ratio, q.ssr?.ratio, q.rays?.ratio]) {
        if (ratio === undefined) continue;
        expect(ratio).toBeGreaterThan(0);
        expect(ratio).toBeLessThanOrEqual(1);
      }
      // Occlusion ambiante : pleine résolution ou moitié seulement (0,75 donnait une image noire avec la perspective atmosphérique).
      if (q.ao) expect([0.5, 1]).toContain(q.ao.ratio);
      expect(q.distances.coverDensity).toBeGreaterThan(0);
      expect(q.distances.coverDensity).toBeLessThanOrEqual(1);
      expect(q.rainDrops).toBeGreaterThan(0); // il pleut toujours à l'écran
      expect(q.rainDrops).toBeLessThanOrEqual(10000); // particules calculées par le processeur
      if (q.post.dof) expect(q.post.dof.fullM).toBeGreaterThan(q.post.dof.fromM);
    }
  });

  it('le relief lointain dépasse toujours les chunks détaillés', () => {
    for (const q of all()) expect(q.distances.farTerrain!.halfSizeM).toBeGreaterThan(q.distances.viewRadiusM * 2);
  });

  it('chaque profil a un nom affiché, un résumé et des détails', () => {
    for (const level of QUALITY_LEVELS) {
      const d = QUALITY_DESCRIPTIONS[level];
      expect(d.label).toBe(level.toUpperCase());
      expect(d.summary.length).toBeGreaterThan(10);
      expect(d.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('qualityLevelFrom / levelFromUrl (noms nouveaux et anciens)', () => {
  it('les quatre profils, et les anciens noms français', () => {
    for (const level of QUALITY_LEVELS) expect(qualityLevelFrom(level)).toBe(level);
    expect(qualityLevelFrom('basse')).toBe('low');
    expect(qualityLevelFrom('moyenne')).toBe('medium');
    expect(qualityLevelFrom('haute')).toBe('high');
  });

  it('rien d’autre (texte saisi à la main, données enregistrées douteuses)', () => {
    for (const bad of [null, '', 'ULTRA', 'Haute', '1', '<script>', 'constructor', 'toString', '__proto__']) expect(qualityLevelFrom(bad)).toBeUndefined();
    expect(levelFromUrl(query('qualite=epic'))).toBeUndefined();
    expect(levelFromUrl(query('qualite=ultra'))).toBe('ultra');
  });
});

describe('resolveQuality (profil + dérogations)', () => {
  it('sans dérogation : le profil tel quel', () => {
    for (const level of QUALITY_LEVELS) expect(resolveQuality(level)).toEqual(qualityFor(level));
  });

  it('chaque dérogation coupe seulement son effet', () => {
    const full = qualityFor('ultra');
    expect(resolveQuality('ultra', { shadows: false })).toEqual({ ...full, shadows: null });
    expect(resolveQuality('ultra', { ao: false })).toEqual({ ...full, ao: null });
    expect(resolveQuality('ultra', { ssr: false })).toEqual({ ...full, ssr: null });
    expect(resolveQuality('ultra', { rays: false })).toEqual({ ...full, rays: null });
    expect(resolveQuality('ultra', { msaa: false })).toEqual({ ...full, image: { ...full.image, msaa: 1 } });
    expect(resolveQuality('ultra', { aerial: false })).toEqual({ ...full, post: { ...full.post, aerialPerspective: false } });
    expect(resolveQuality('ultra', { dof: false })).toEqual({ ...full, post: { ...full.post, dof: null } });
    expect(resolveQuality('ultra', { motionBlur: false })).toEqual({ ...full, post: { ...full.post, motionBlur: 0 } });
    expect(resolveQuality('ultra', { rain: false })).toEqual({ ...full, rainDrops: 0 });
  });

  it('une dérogation ne rallume jamais ce que le profil a coupé', () => {
    const on = Object.fromEntries(QUALITY_OVERRIDE_KEYS.map((k) => [k, true]));
    expect(resolveQuality('low', on)).toEqual(qualityFor('low'));
  });
});

describe('parseQuality (?qualite= et interrupteurs de l’adresse)', () => {
  it('sans réglage : le profil par défaut (HIGH), ou celui donné', () => {
    expect(parseQuality(query(''))).toEqual(qualityFor('high'));
    expect(parseQuality(query(''), 'low')).toEqual(qualityFor('low'));
  });

  it('?qualite= choisit le profil (anciens noms compris)', () => {
    expect(parseQuality(query('qualite=ultra'))).toEqual(qualityFor('ultra'));
    expect(parseQuality(query('qualite=basse'))).toEqual(qualityFor('low'));
    expect(parseQuality(query('qualite=moyenne'))).toEqual(qualityFor('medium'));
  });

  it('un profil inconnu retombe sur le défaut (jamais d’erreur : c’est une adresse saisie à la main)', () => {
    for (const bad of ['epic', '', 'BASSE', '1', '<script>']) expect(parseQuality(query(`qualite=${bad}`))).toEqual(qualityFor('high'));
  });

  it('les interrupteurs =0 coupent leur effet ; seul « 0 » compte', () => {
    expect(overridesFromUrl(query('ombres=0&ao=0&rayons=0&aa=0&pluie=0&ssr=0&brume=0&dof=0&flou=0'))).toEqual({
      shadows: false,
      ao: false,
      rays: false,
      msaa: false,
      rain: false,
      ssr: false,
      aerial: false,
      dof: false,
      motionBlur: false,
    });
    expect(overridesFromUrl(query('ombres=1&ao=oui'))).toEqual({});
    expect(parseQuality(query('qualite=medium&ao=0'))).toEqual({ ...qualityFor('medium'), ao: null });
  });

  it('?nuages=0 : nuages plats (le ciel n’est jamais vide)', () => {
    expect(parseQuality(query('qualite=ultra&nuages=0')).sky.clouds).toBe('flat');
  });
});

describe('pixelRatioFor (densité de pixels du rendu)', () => {
  it('suit l’écran jusqu’au plafond', () => {
    expect(pixelRatioFor(1.25, 2)).toBe(1.25);
    expect(pixelRatioFor(3, 2)).toBe(2);
    expect(pixelRatioFor(1.5, 1)).toBe(1);
  });

  it('jamais sous 1, et une valeur absurde vaut 1', () => {
    expect(pixelRatioFor(0.5, 2)).toBe(1);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(pixelRatioFor(bad, 2)).toBe(1);
  });
});

describe('msaaSamplesFor (MSAA plafonné par la carte graphique)', () => {
  it('celui du profil tant que la carte le permet', () => {
    expect(msaaSamplesFor(8, 16)).toBe(8);
    expect(msaaSamplesFor(8, 4)).toBe(4);
    expect(msaaSamplesFor(1, 4)).toBe(1);
  });

  it('carte sans MSAA ou valeur absurde : 1', () => {
    for (const bad of [0, -2, Number.NaN]) expect(msaaSamplesFor(4, bad)).toBe(1);
  });
});

describe('describeQuality (la ligne du panneau de la démo)', () => {
  it('ULTRA : le profil et ses techniques', () => {
    const text = describeQuality(qualityFor('ultra'));
    for (const word of ['ULTRA', 'MSAA 8×', 'ombres 4×4096 PCSS', 'contact', 'reflets', 'rayons', 'atmosphère', 'nuages en volume', 'sol 2048 px']) expect(text).toContain(word);
  });

  it('un effet coupé se lit « sans … »', () => {
    const text = describeQuality(parseQuality(query('ombres=0&ao=0&rayons=0&ssr=0&brume=0')));
    for (const word of ['sans ombres', 'sans contact', 'sans rayons', 'sans reflets', 'brume simple']) expect(text).toContain(word);
  });
});
