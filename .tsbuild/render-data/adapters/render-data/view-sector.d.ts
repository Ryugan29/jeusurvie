/** Secteur de vue horizontal : direction (unitaire) et cosinus du demi-angle gardé. */
export interface ViewSector {
    readonly dirX: number;
    readonly dirZ: number;
    readonly cosHalf: number;
    /** En deçà de cette distance (m) du joueur, tout est gardé (derrière la caméra compris). */
    readonly nearM: number;
}
/** Pas d'arrondi du cap (rad) : 15°. */
export declare const SECTOR_STEP_RAD: number;
/** Marge (rad) ajoutée au demi-angle de vue : le pas d'arrondi + un peu (grands objets à cheval sur le bord). */
export declare const SECTOR_MARGIN_RAD: number;
/** Rayon (m) toujours gardé autour du joueur (caméra derrière lui, ombres de contact, objets qui débordent dans le champ). */
export declare const SECTOR_NEAR_M = 14;
/** Cap arrondi au pas (rad). */
export declare function quantizedYaw(yaw: number): number;
/**
 * Secteur pour une caméra regardant selon le cap `yaw` (rad, direction (sin yaw, cos yaw) au sol), de champ vertical `fovY` (rad) et
 * de rapport largeur / hauteur `aspect`. Un demi-angle (marge comprise) qui atteindrait 180° garde tout (cosHalf = −1).
 */
export declare function viewSectorFor(yaw: number, fovY: number, aspect: number, nearM?: number): ViewSector;
/** Un point (x, z) est-il gardé, vu depuis le joueur (px, pz) ? `radiusM` : taille de l'objet (il élargit le secteur). */
export declare function inSector(s: ViewSector, px: number, pz: number, x: number, z: number, radiusM?: number): boolean;
/** Deux secteurs donnent-ils le même élagage (même cap arrondi, même ouverture) ? */
export declare function sameSector(a: ViewSector | undefined, b: ViewSector | undefined): boolean;
