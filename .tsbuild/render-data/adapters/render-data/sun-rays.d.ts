import type { Vec3 } from '../../core/shared/vec';
/** Repère de la caméra (axes en coordonnées du monde, unitaires) et son champ de vue. */
export interface CameraBasis {
    readonly forward: Vec3;
    readonly right: Vec3;
    readonly up: Vec3;
    /** Tangente de la moitié du champ de vue vertical. */
    readonly tanHalfFovY: number;
    /** Largeur / hauteur de l'image. */
    readonly aspect: number;
}
/**
 * Position à l'écran (u, v dans [0, 1] à l'intérieur de l'image ; hors de [0, 1] si l'astre est hors champ ; v vers le haut) de
 * l'astre dans la direction `toSun` (unitaire, vers l'astre), et `facing` = cosinus de l'angle avec le regard.
 * Rien (undefined) si l'astre est derrière ou exactement de côté.
 */
export declare function sunScreenUv(toSun: Vec3, camera: CameraBasis): {
    u: number;
    v: number;
    facing: number;
} | undefined;
/** Force des rayons (0 à `strength`) selon le cosinus de l'angle entre le regard et l'astre : seulement quand on regarde vers lui. */
export declare function sunRayIntensity(strength: number, facing: number): number;
