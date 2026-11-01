// Profils graphiques (PUR, sans Babylon) : LE point unique où se décide ce que la carte graphique doit faire. Quatre profils —
// LOW (performances), MEDIUM (équilibré), HIGH (haute qualité), ULTRA (qualité maximale) — chacun décrit TOUT le rendu :
// image (anticrénelage, densité de pixels), ombres, occlusion ambiante, reflets à l'écran, rayons de soleil, perspective
// atmosphérique, ciel et sonde d'environnement, effets d'image (halo, profondeur de champ, flou de mouvement), textures du sol,
// distances d'affichage et densité de la végétation, pluie. Aucun autre fichier ne fixe ces valeurs : les adaptateurs Babylon
// les reçoivent (adapters/babylon/render-pipeline) et l'interface les choisit (ui/graphics-settings-panel).
// Réglages individuels : un profil + des « dérogations » (QualityOverrides) qui ne peuvent que COUPER un effet. L'adresse de la page
// (?ombres=0, ?ao=0…) en produit déjà ; les préférences enregistrées les portent aussi (adapters/storage/graphics-preferences), prêtes
// pour de futurs réglages un par un dans l'interface.

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/** Profil d'un premier lancement : HIGH (le rendu validé jusqu'ici, à ~90 images/s sur la machine de référence). */
export const DEFAULT_QUALITY_LEVEL: QualityLevel = 'high';

/** Anciens noms (adresse ?qualite=basse|moyenne|haute, liens déjà partagés) → profil. */
const LEGACY_LEVELS: Readonly<Record<string, QualityLevel>> = { basse: 'low', moyenne: 'medium', haute: 'high' };

/** Filtrage des ombres : PCF de plus en plus large, puis ombres « à pénombre réaliste » (PCSS : nettes au contact, floues au loin). */
export type ShadowFilter = 'pcf-low' | 'pcf-medium' | 'pcf-high' | 'pcss';

/** Ombres en cascade du soleil : plusieurs cartes d'ombre emboîtées, nettes de près, plus grossières de loin. */
export interface ShadowQuality {
  /** Nombre de cascades (1 à 4). */
  readonly cascades: number;
  /** Côté (px) de la carte d'ombre de chaque cascade (puissance de deux). */
  readonly mapSize: number;
  /** Distance (m) devant la caméra jusqu'où le décor porte une ombre. */
  readonly rangeM: number;
  readonly filter: ShadowFilter;
}

/** Occlusion ambiante à l'écran (SSAO) : assombrit le pied des arbres, des rochers, des personnages. */
export interface AoQuality {
  /** Échantillons par pixel (plus = plus lisse, plus coûteux). */
  readonly samples: number;
  /**
   * Part de la résolution de l'écran utilisée : 1 (pleine) ou 0,5 (moitié de chaque côté) SEULEMENT. Vérifié à l'écran : à 0,75,
   * l'occlusion de Babylon combinée aux autres passes qui lisent la profondeur (perspective atmosphérique) rendait une image noire.
   */
  readonly ratio: number;
  /** Rayon (m) : court, pour ne marquer que les contacts. */
  readonly radiusM: number;
  /** Force (1 = discrète mais visible). */
  readonly strength: number;
  /** Flou bilatéral complet (respecte les bords : pas de halo autour des silhouettes), plus coûteux. */
  readonly expensiveBlur: boolean;
}

/** Reflets à l'écran (SSR) : flaques et sol mouillé reflètent vraiment le décor. Actifs seulement quand le sol est mouillé. */
export interface SsrQuality {
  /** Part de la résolution de l'écran. */
  readonly ratio: number;
  /** Pas de la marche le long du rayon réfléchi (plus = reflets plus lointains et plus justes). */
  readonly steps: number;
  /** Distance (m) maximale d'un reflet. */
  readonly maxDistanceM: number;
  /** Flou du reflet selon la rugosité (sinon reflets nets partout). */
  readonly blur: boolean;
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
  /** Échantillons MSAA de l'image de la scène (1 = sans ; plafonnés à ce que la carte graphique permet) : lisse les bords des objets,
   * et des brins et feuilles découpés (alpha-to-coverage, adapters/babylon/foliage-plugin). */
  readonly msaa: number;
  /** Densité de pixels maximale : sur un écran à 125 % ou 150 %, l'image est calculée en vrais pixels (jusqu'à ce plafond)
   * au lieu d'être étirée — étirée, elle paraît floue et pixelisée. */
  readonly maxPixelRatio: number;
  /** Anticrénelage d'image (FXAA) : rattrape ce que le MSAA ne voit pas (reflets fins). Inutile au-delà de 4× MSAA en haute densité. */
  readonly fxaa: boolean;
}

/** Nuages : aucun, une couche plate légère, deux couches détaillées, ou nuages en volume (marche dans une couche épaisse). */
export type CloudQuality = 'flat' | 'layered' | 'volumetric';

/** Ciel et éclairage d'environnement (sonde qui photographie le ciel pour les matériaux physiques). */
export interface SkyQuality {
  readonly clouds: CloudQuality;
  /** Côté (px) de chaque face du cube d'environnement. */
  readonly envProbeSize: number;
  /** Intervalle (s) entre deux photos du ciel. */
  readonly envProbeRefreshS: number;
}

/** Profondeur de champ : l'arrière-plan lointain s'adoucit comme dans un objectif (le perso et le proche restent nets). */
export interface DofQuality {
  /** Distance (m) à partir de laquelle le flou commence, et où il atteint son maximum. */
  readonly fromM: number;
  readonly fullM: number;
  /** Rayon maximal du flou (px à 1080 lignes). */
  readonly maxBlurPx: number;
}

/** Effets d'image après le rendu. */
export interface PostQuality {
  /** Halo des zones très lumineuses (soleil, éclairs, étoiles brillantes) : taille du noyau (px), 0 = sans. */
  readonly bloomKernel: number;
  /** Perspective atmosphérique physique (diffusion de la lumière du ciel et du soleil dans l'air, brume de hauteur) en passe
   * d'image ; sans elle, brume classique dans chaque matériau. */
  readonly aerialPerspective: boolean;
  readonly dof: DofQuality | null;
  /** Flou de mouvement de la caméra (force, 0 = sans). */
  readonly motionBlur: number;
  /** Grain de film (0 à 100). */
  readonly grain: number;
  /** Renforcement des détails (0 = aucun). */
  readonly sharpen: number;
}

/** Textures du sol, générées au démarrage sur la carte graphique. */
export interface TerrainQuality {
  /** Côté (px) de chaque texture (couleur, relief, rugosité) des couches du sol. */
  readonly textureSize: number;
  /** Filtrage anisotrope (le sol se voit de biais). */
  readonly anisotropy: number;
  /** Relief des matières du sol (cartes de normales) : sans lui, le sol est lisse sous la lumière rasante. */
  readonly normalMaps: boolean;
}

/** Distances d'affichage et densité. */
export interface DistanceQuality {
  /** Rayon (m) des chunks détaillés chargés autour du joueur. */
  readonly viewRadiusM: number;
  /** Relief lointain (grille grossière du vrai terrain) : demi-côté (m) et pas (m) ; null = sans. */
  readonly farTerrain: { readonly halfSizeM: number; readonly stepM: number } | null;
  /** Multiplie la portée d'affichage de chaque type de végétation (arbres, buissons, rochers, herbe). */
  readonly vegetationRange: number;
  /** Rayon (m) du couvre-sol (herbe, fleurs, cailloux) autour du joueur. */
  readonly coverRadiusM: number;
  /** Part du couvre-sol dessinée (1 = tout). */
  readonly coverDensity: number;
}

export interface QualitySettings {
  readonly level: QualityLevel;
  readonly image: ImageQuality;
  /** null : aucune ombre projetée. */
  readonly shadows: ShadowQuality | null;
  /** null : pas d'occlusion ambiante. */
  readonly ao: AoQuality | null;
  /** null : pas de reflets à l'écran (le sol mouillé reflète seulement le ciel). */
  readonly ssr: SsrQuality | null;
  /** null : pas de rayons de soleil. */
  readonly rays: RaysQuality | null;
  readonly sky: SkyQuality;
  readonly post: PostQuality;
  readonly terrain: TerrainQuality;
  readonly distances: DistanceQuality;
  /** Gouttes de pluie au plus autour de la caméra (particules calculées par le processeur) ; 0 : pas de pluie dessinée. */
  readonly rainDrops: number;
}

const LEVELS: Readonly<Record<QualityLevel, Omit<QualitySettings, 'level'>>> = {
  low: {
    image: { msaa: 1, maxPixelRatio: 1, fxaa: true },
    shadows: { cascades: 2, mapSize: 1024, rangeM: 60, filter: 'pcf-low' },
    ao: null,
    ssr: null,
    rays: null,
    sky: { clouds: 'flat', envProbeSize: 32, envProbeRefreshS: 2 },
    post: { bloomKernel: 32, aerialPerspective: false, dof: null, motionBlur: 0, grain: 0, sharpen: 0 },
    terrain: { textureSize: 256, anisotropy: 2, normalMaps: false },
    distances: { viewRadiusM: 320, farTerrain: { halfSizeM: 2000, stepM: 80 }, vegetationRange: 0.6, coverRadiusM: 35, coverDensity: 0.5 },
    rainDrops: 1500,
  },
  medium: {
    image: { msaa: 2, maxPixelRatio: 1.25, fxaa: true },
    shadows: { cascades: 3, mapSize: 1024, rangeM: 100, filter: 'pcf-medium' },
    ao: { samples: 8, ratio: 0.5, radiusM: 0.8, strength: 1, expensiveBlur: false },
    ssr: null,
    rays: { samples: 24, ratio: 0.33, occluderRangeM: 150 },
    sky: { clouds: 'layered', envProbeSize: 64, envProbeRefreshS: 1 },
    post: { bloomKernel: 48, aerialPerspective: true, dof: null, motionBlur: 0, grain: 4, sharpen: 0.08 },
    terrain: { textureSize: 512, anisotropy: 4, normalMaps: true },
    distances: { viewRadiusM: 448, farTerrain: { halfSizeM: 3000, stepM: 50 }, vegetationRange: 0.8, coverRadiusM: 55, coverDensity: 0.75 },
    rainDrops: 3000,
  },
  high: {
    image: { msaa: 4, maxPixelRatio: 1.5, fxaa: true },
    shadows: { cascades: 4, mapSize: 2048, rangeM: 150, filter: 'pcf-high' },
    ao: { samples: 12, ratio: 1, radiusM: 0.8, strength: 1, expensiveBlur: false },
    ssr: { ratio: 0.5, steps: 32, maxDistanceM: 60, blur: false },
    rays: { samples: 32, ratio: 0.5, occluderRangeM: 200 },
    sky: { clouds: 'layered', envProbeSize: 128, envProbeRefreshS: 0.5 },
    post: { bloomKernel: 64, aerialPerspective: true, dof: null, motionBlur: 0, grain: 5, sharpen: 0.1 },
    terrain: { textureSize: 1024, anisotropy: 8, normalMaps: true },
    distances: { viewRadiusM: 512, farTerrain: { halfSizeM: 4000, stepM: 40 }, vegetationRange: 1, coverRadiusM: 70, coverDensity: 1 },
    rainDrops: 6000,
  },
  // ULTRA paie ce qui se voit. Mesuré sur RTX 2080 (2560 px), images comparées à l'œil : occlusion 32 → 16 échantillons, lissés
  // par le flou bilatéral (désormais vraiment appliqué), ~2 ms de gagnés pour la même image. MSAA gardé à 8× : 4× ne rendait que
  // ~2 ms et les feuilles découpées (alpha-to-coverage) n'auraient plus que 5 niveaux de transparence au lieu de 9.
  ultra: {
    image: { msaa: 8, maxPixelRatio: 2, fxaa: false },
    shadows: { cascades: 4, mapSize: 4096, rangeM: 220, filter: 'pcss' },
    ao: { samples: 16, ratio: 1, radiusM: 1.1, strength: 1.1, expensiveBlur: true },
    ssr: { ratio: 1, steps: 64, maxDistanceM: 120, blur: true },
    rays: { samples: 48, ratio: 0.5, occluderRangeM: 300 },
    sky: { clouds: 'volumetric', envProbeSize: 256, envProbeRefreshS: 0.25 },
    post: { bloomKernel: 96, aerialPerspective: true, dof: { fromM: 90, fullM: 900, maxBlurPx: 6 }, motionBlur: 0.35, grain: 5, sharpen: 0.12 },
    terrain: { textureSize: 2048, anisotropy: 16, normalMaps: true },
    distances: { viewRadiusM: 640, farTerrain: { halfSizeM: 6000, stepM: 32 }, vegetationRange: 1.35, coverRadiusM: 90, coverDensity: 1 },
    rainDrops: 9000,
  },
};

/** Ce que chaque profil promet au joueur (affiché dans les réglages). */
export const QUALITY_DESCRIPTIONS: Readonly<Record<QualityLevel, { readonly label: string; readonly summary: string; readonly details: readonly string[] }>> = {
  low: {
    label: 'LOW',
    summary: 'Performances maximales pour les configurations modestes.',
    details: ['Ombres simples (2 cascades, 1024 px)', 'Brume classique, nuages plats', 'Distance de vue 320 m, végétation allégée', 'Textures du sol 256 px, sans relief'],
  },
  medium: {
    label: 'MEDIUM',
    summary: 'Le bon compromis entre qualité et fluidité.',
    details: ['Ombres 3 cascades, occlusion ambiante', 'Perspective atmosphérique et rayons de soleil', 'Distance de vue 450 m', 'Textures du sol 512 px avec relief'],
  },
  high: {
    label: 'HIGH',
    summary: 'Un rendu très riche : ombres fines, reflets de pluie, végétation dense.',
    details: ['Ombres 4 cascades 2048 px', 'Reflets à l’écran sur le sol mouillé', 'Distance de vue 512 m, relief lointain 4 km', 'Textures du sol 1024 px'],
  },
  ultra: {
    label: 'ULTRA',
    summary: 'Le meilleur rendu possible, pour les cartes graphiques puissantes.',
    details: [
      'Ombres 4096 px à pénombre réaliste (PCSS)',
      'Nuages en volume, occlusion ambiante pleine résolution',
      'Profondeur de champ, flou de mouvement, MSAA 8×',
      'Distance de vue 640 m, relief lointain 6 km, textures 2048 px',
    ],
  },
};

export function qualityFor(level: QualityLevel): QualitySettings {
  return { level, ...LEVELS[level] };
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

/** Profil désigné par un texte (nouveau nom ou ancien nom français) ; undefined s'il n'en désigne aucun. */
export function qualityLevelFrom(text: string | null): QualityLevel | undefined {
  if (text === null) return undefined;
  if (isQualityLevel(text)) return text;
  return Object.hasOwn(LEGACY_LEVELS, text) ? LEGACY_LEVELS[text] : undefined;
}

/** Effets qu'une dérogation peut couper (jamais rallumer : un profil reste un plafond). */
export const QUALITY_OVERRIDE_KEYS = ['shadows', 'ao', 'ssr', 'rays', 'msaa', 'aerial', 'dof', 'motionBlur', 'rain'] as const;
export type QualityOverrideKey = (typeof QUALITY_OVERRIDE_KEYS)[number];
/** `false` : l'effet est coupé ; absent ou `true` : celui du profil. */
export type QualityOverrides = Readonly<Partial<Record<QualityOverrideKey, boolean>>>;

/** Le profil `level` avec ses dérogations (chacune ne fait que couper son effet). */
export function resolveQuality(level: QualityLevel, overrides: QualityOverrides = {}): QualitySettings {
  const base = qualityFor(level);
  const off = (key: QualityOverrideKey): boolean => overrides[key] === false;
  return {
    ...base,
    image: off('msaa') ? { ...base.image, msaa: 1 } : base.image,
    shadows: off('shadows') ? null : base.shadows,
    ao: off('ao') ? null : base.ao,
    ssr: off('ssr') ? null : base.ssr,
    rays: off('rays') ? null : base.rays,
    post: {
      ...base.post,
      aerialPerspective: off('aerial') ? false : base.post.aerialPerspective,
      dof: off('dof') ? null : base.post.dof,
      motionBlur: off('motionBlur') ? 0 : base.post.motionBlur,
    },
    rainDrops: off('rain') ? 0 : base.rainDrops,
  };
}

/** Interrupteurs de l'adresse (?ombres=0 …) → dérogation. Seul « 0 » coupe ; toute autre valeur est ignorée. */
const URL_SWITCHES: Readonly<Record<string, QualityOverrideKey>> = {
  ombres: 'shadows',
  ao: 'ao',
  ssr: 'ssr',
  rayons: 'rays',
  aa: 'msaa',
  brume: 'aerial',
  dof: 'dof',
  flou: 'motionBlur',
  pluie: 'rain',
};

/** Dérogations lues dans l'adresse : `get(nom)` rend la valeur du paramètre ou null (ex. `URLSearchParams.get`). */
export function overridesFromUrl(get: (name: string) => string | null): QualityOverrides {
  const out: Partial<Record<QualityOverrideKey, boolean>> = {};
  for (const [name, key] of Object.entries(URL_SWITCHES)) if (get(name) === '0') out[key] = false;
  return out;
}

/** Profil demandé par l'adresse (?qualite=low|medium|high|ultra, ou les anciens basse|moyenne|haute) ; undefined sinon. */
export function levelFromUrl(get: (name: string) => string | null): QualityLevel | undefined {
  return qualityLevelFrom(get('qualite'));
}

/**
 * Réglages d'après l'adresse seule (démo, mesures) : profil ?qualite= (HIGH si absent ou inconnu) et interrupteurs. ?nuages=0
 * garde son ancien sens : nuages plats (le ciel n'est jamais vide, mais les couches détaillées coûtent).
 */
export function parseQuality(get: (name: string) => string | null, fallback: QualityLevel = DEFAULT_QUALITY_LEVEL): QualitySettings {
  const q = resolveQuality(levelFromUrl(get) ?? fallback, overridesFromUrl(get));
  return get('nuages') === '0' ? { ...q, sky: { ...q.sky, clouds: 'flat' } } : q;
}

/** Densité de pixels effective : celle de l'écran, plafonnée par la qualité, jamais sous 1 (valeur absurde : 1). */
export function pixelRatioFor(devicePixelRatio: number, maxPixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(1, Math.min(dpr, maxPixelRatio));
}

/** Échantillons MSAA réellement demandés : ceux du profil, plafonnés par la carte graphique (au moins 1). */
export function msaaSamplesFor(wanted: number, hardwareMax: number): number {
  const max = Number.isFinite(hardwareMax) && hardwareMax >= 1 ? Math.floor(hardwareMax) : 1;
  return Math.max(1, Math.min(Math.floor(wanted), max));
}

/** Ligne de texte pour le panneau de la démo : le profil, et ce qui est actif ou coupé. */
export function describeQuality(q: QualitySettings): string {
  const parts = [
    q.image.msaa > 1 ? `MSAA ${q.image.msaa}×` : 'sans MSAA',
    q.shadows ? `ombres ${q.shadows.cascades}×${q.shadows.mapSize}${q.shadows.filter === 'pcss' ? ' PCSS' : ''}` : 'sans ombres',
    q.ao ? 'contact' : 'sans contact',
    q.ssr ? 'reflets' : 'sans reflets',
    q.rays ? 'rayons' : 'sans rayons',
    q.post.aerialPerspective ? 'atmosphère' : 'brume simple',
    `nuages ${q.sky.clouds === 'flat' ? 'plats' : q.sky.clouds === 'layered' ? 'en couches' : 'en volume'}`,
    `sol ${q.terrain.textureSize} px`,
  ];
  return `Qualité ${QUALITY_DESCRIPTIONS[q.level].label} : ${parts.join(' · ')}`;
}
