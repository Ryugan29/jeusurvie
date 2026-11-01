// Niveaux de qualité d'image (PUR, sans Babylon) : ce que chaque niveau active, et comment l'adresse de la page
// (?qualite=basse|moyenne|haute, ?ombres=0, ?ao=0, ?rayons=0, ?nuages=0, ?pluie=0) le modifie. Les interrupteurs servent à mesurer le
// coût de chaque effet : ils coupent, ils ne rallument jamais ce que le niveau a coupé.

export const QUALITY_LEVELS = ['basse', 'moyenne', 'haute'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/** Ombres en cascade du soleil : plusieurs cartes d'ombre emboîtées, nettes de près, plus grossières de loin. */
export interface ShadowQuality {
  /** Nombre de cascades (1 à 4). */
  readonly cascades: number;
  /** Côté (px) de la carte d'ombre de chaque cascade (puissance de deux). */
  readonly mapSize: number;
  /** Distance (m) devant la caméra jusqu'où le décor porte une ombre. */
  readonly rangeM: number;
}

/** Occlusion ambiante à l'écran (SSAO) : assombrit le pied des arbres, des rochers, des personnages. */
export interface AoQuality {
  /** Échantillons par pixel (plus = plus lisse, plus coûteux). */
  readonly samples: number;
  /** Part de la résolution de l'écran utilisée (1 = pleine, 0,5 = moitié de chaque côté). */
  readonly ratio: number;
  /** Rayon (m) : court, pour ne marquer que les contacts. */
  readonly radiusM: number;
  /** Force (1 = discrète mais visible). */
  readonly strength: number;
}

/** Rayons de soleil à l'écran, calculés sur une image réduite. */
export interface RaysQuality {
  /** Échantillons le long de chaque rayon. */
  readonly samples: number;
  /** Part de la résolution de l'écran (carte de profondeur des obstacles). */
  readonly ratio: number;
  /** Distance (m) au-delà de laquelle un obstacle ne cache plus le soleil : le terrain lointain ne vaut pas ses appels de dessin. */
  readonly occluderRangeM: number;
}

/** Netteté de l'image : anticrénelage et résolution. */
export interface ImageQuality {
  /** Échantillons MSAA de l'image de la scène (1 = sans) : lisse les bords des objets, et des brins et feuilles découpés
   * (alpha-to-coverage, adapters/babylon/foliage-plugin). */
  readonly msaa: number;
  /** Densité de pixels maximale : sur un écran à 125 % ou 150 %, l'image est calculée en vrais pixels (jusqu'à ce plafond)
   * au lieu d'être étirée — étirée, elle paraît floue et pixelisée. */
  readonly maxPixelRatio: number;
}

export interface QualitySettings {
  readonly level: QualityLevel;
  readonly image: ImageQuality;
  /** null : aucune ombre projetée. */
  readonly shadows: ShadowQuality | null;
  /** null : pas d'occlusion ambiante. */
  readonly ao: AoQuality | null;
  /** null : pas de rayons de soleil. */
  readonly rays: RaysQuality | null;
  /** Nuages peints dans le ciel. */
  readonly clouds: boolean;
  /** Gouttes de pluie au plus autour de la caméra (particules calculées par le processeur) ; 0 : pas de pluie dessinée. */
  readonly rainDrops: number;
}

const LEVELS: Readonly<Record<QualityLevel, Omit<QualitySettings, 'level'>>> = {
  basse: {
    image: { msaa: 1, maxPixelRatio: 1 },
    shadows: { cascades: 2, mapSize: 1024, rangeM: 60 },
    ao: null,
    rays: null,
    clouds: false,
    rainDrops: 1500,
  },
  moyenne: {
    image: { msaa: 2, maxPixelRatio: 1.25 },
    shadows: { cascades: 3, mapSize: 1024, rangeM: 90 },
    ao: { samples: 8, ratio: 0.5, radiusM: 0.8, strength: 1 },
    rays: null,
    clouds: true,
    rainDrops: 3000,
  },
  haute: {
    image: { msaa: 4, maxPixelRatio: 2 },
    shadows: { cascades: 4, mapSize: 2048, rangeM: 120 },
    ao: { samples: 16, ratio: 0.75, radiusM: 0.8, strength: 1 },
    rays: { samples: 32, ratio: 0.5, occluderRangeM: 200 },
    clouds: true,
    rainDrops: 6000,
  },
};

export function qualityFor(level: QualityLevel): QualitySettings {
  return { level, ...LEVELS[level] };
}

function isLevel(text: string | null): text is QualityLevel {
  return (QUALITY_LEVELS as readonly (string | null)[]).includes(text);
}

/**
 * Réglages de qualité d'après l'adresse : `get(nom)` rend la valeur du paramètre ou null (ex. `URLSearchParams.get`).
 * Niveau inconnu ou absent : haute. Un interrupteur à « 0 » coupe son effet ; toute autre valeur est ignorée.
 */
export function parseQuality(get: (name: string) => string | null): QualitySettings {
  const asked = get('qualite');
  const base = qualityFor(isLevel(asked) ? asked : 'haute');
  return {
    ...base,
    image: get('aa') === '0' ? { ...base.image, msaa: 1 } : base.image,
    shadows: get('ombres') === '0' ? null : base.shadows,
    ao: get('ao') === '0' ? null : base.ao,
    rays: get('rayons') === '0' ? null : base.rays,
    clouds: get('nuages') === '0' ? false : base.clouds,
    rainDrops: get('pluie') === '0' ? 0 : base.rainDrops,
  };
}

/** Densité de pixels effective : celle de l'écran, plafonnée par la qualité, jamais sous 1 (valeur absurde : 1). */
export function pixelRatioFor(devicePixelRatio: number, maxPixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(1, Math.min(dpr, maxPixelRatio));
}

/** Ligne de texte pour le panneau de la démo : le niveau, et ce qui est actif ou coupé. */
export function describeQuality(q: QualitySettings): string {
  const parts = [
    q.image.msaa > 1 ? `MSAA ${q.image.msaa}×` : 'sans MSAA',
    q.shadows ? `ombres ${q.shadows.cascades}×${q.shadows.mapSize}` : 'sans ombres',
    q.ao ? 'contact' : 'sans contact',
    q.rays ? 'rayons' : 'sans rayons',
    q.clouds ? 'nuages' : 'sans nuages',
  ];
  return `Qualité ${q.level} : ${parts.join(' · ')}`;
}
