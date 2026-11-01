/** Feuillages, herbes, plantes et fleurs : matériau léger, pas PBR. */
export declare const FOLIAGE_MATERIAL: RegExp;
export declare function isFoliageMaterial(materialName: string): boolean;
export interface Surface {
    /** 0 = diélectrique (tout ici), 1 = métal. */
    readonly metallic: number;
    /** 0 = miroir, 1 = parfaitement mat. */
    readonly roughness: number;
    /** Part de l'éclairage d'environnement (ciel) reçue : < 1 car la lumière d'ambiance (hémisphérique) éclaire déjà les ombres. */
    readonly environmentIntensity: number;
}
/** Surface par défaut d'un objet solide (personnages, vêtements, objets) : satiné, un léger reflet de ciel. */
export declare const DEFAULT_SURFACE: Surface;
export declare function surfaceFor(materialName: string): Surface;
/** Matière mouillée : la surface (plus lisse, même éclairage d'environnement), et la part de sa couleur qui reste (l'eau fonce la pierre, l'écorce, la peau). */
export interface WetSurface extends Surface {
    readonly darken: number;
}
/** La surface `s` mouillée à `wetness` (0 = sèche, inchangée ; 1 = détrempée ; bornée à [0, 1]). */
export declare function wetSurface(s: Surface, wetness: number): WetSurface;
