export declare const QUALITY_LEVELS: readonly ["basse", "moyenne", "haute"];
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
export declare function qualityFor(level: QualityLevel): QualitySettings;
/**
 * Réglages de qualité d'après l'adresse : `get(nom)` rend la valeur du paramètre ou null (ex. `URLSearchParams.get`).
 * Niveau inconnu ou absent : haute. Un interrupteur à « 0 » coupe son effet ; toute autre valeur est ignorée.
 */
export declare function parseQuality(get: (name: string) => string | null): QualitySettings;
/** Densité de pixels effective : celle de l'écran, plafonnée par la qualité, jamais sous 1 (valeur absurde : 1). */
export declare function pixelRatioFor(devicePixelRatio: number, maxPixelRatio: number): number;
/** Ligne de texte pour le panneau de la démo : le niveau, et ce qui est actif ou coupé. */
export declare function describeQuality(q: QualitySettings): string;
