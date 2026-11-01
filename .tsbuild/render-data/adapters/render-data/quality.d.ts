export declare const QUALITY_LEVELS: readonly ["low", "medium", "high", "ultra"];
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
/** Profil d'un premier lancement : HIGH (le rendu validé jusqu'ici, à ~90 images/s sur la machine de référence). */
export declare const DEFAULT_QUALITY_LEVEL: QualityLevel;
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
    readonly farTerrain: {
        readonly halfSizeM: number;
        readonly stepM: number;
    } | null;
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
/** Ce que chaque profil promet au joueur (affiché dans les réglages). */
export declare const QUALITY_DESCRIPTIONS: Readonly<Record<QualityLevel, {
    readonly label: string;
    readonly summary: string;
    readonly details: readonly string[];
}>>;
export declare function qualityFor(level: QualityLevel): QualitySettings;
export declare function isQualityLevel(value: unknown): value is QualityLevel;
/** Profil désigné par un texte (nouveau nom ou ancien nom français) ; undefined s'il n'en désigne aucun. */
export declare function qualityLevelFrom(text: string | null): QualityLevel | undefined;
/** Effets qu'une dérogation peut couper (jamais rallumer : un profil reste un plafond). */
export declare const QUALITY_OVERRIDE_KEYS: readonly ["shadows", "ao", "ssr", "rays", "msaa", "aerial", "dof", "motionBlur", "rain"];
export type QualityOverrideKey = (typeof QUALITY_OVERRIDE_KEYS)[number];
/** `false` : l'effet est coupé ; absent ou `true` : celui du profil. */
export type QualityOverrides = Readonly<Partial<Record<QualityOverrideKey, boolean>>>;
/** Le profil `level` avec ses dérogations (chacune ne fait que couper son effet). */
export declare function resolveQuality(level: QualityLevel, overrides?: QualityOverrides): QualitySettings;
/** Dérogations lues dans l'adresse : `get(nom)` rend la valeur du paramètre ou null (ex. `URLSearchParams.get`). */
export declare function overridesFromUrl(get: (name: string) => string | null): QualityOverrides;
/** Profil demandé par l'adresse (?qualite=low|medium|high|ultra, ou les anciens basse|moyenne|haute) ; undefined sinon. */
export declare function levelFromUrl(get: (name: string) => string | null): QualityLevel | undefined;
/**
 * Réglages d'après l'adresse seule (démo, mesures) : profil ?qualite= (HIGH si absent ou inconnu) et interrupteurs. ?nuages=0
 * garde son ancien sens : nuages plats (le ciel n'est jamais vide, mais les couches détaillées coûtent).
 */
export declare function parseQuality(get: (name: string) => string | null, fallback?: QualityLevel): QualitySettings;
/** Densité de pixels effective : celle de l'écran, plafonnée par la qualité, jamais sous 1 (valeur absurde : 1). */
export declare function pixelRatioFor(devicePixelRatio: number, maxPixelRatio: number): number;
/** Échantillons MSAA réellement demandés : ceux du profil, plafonnés par la carte graphique (au moins 1). */
export declare function msaaSamplesFor(wanted: number, hardwareMax: number): number;
/** Ligne de texte pour le panneau de la démo : le profil, et ce qui est actif ou coupé. */
export declare function describeQuality(q: QualitySettings): string;
