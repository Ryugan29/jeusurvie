import type { Resource } from '../world/placement';
export interface Circle {
    readonly x: number;
    readonly z: number;
    readonly r: number;
    /** Hauteur (m) de l'obstacle au-dessus du sol : la caméra peut passer au-dessus d'un rocher. Absent = assez haut pour toujours bloquer. */
    readonly height?: number;
}
/**
 * Empreinte au sol d'un modèle, à l'échelle 1, en mètres : centre du cercle (décalage par rapport à l'origine du modèle),
 * rayon `r`, et hauteur `h` du tronc ou du rocher (la caméra s'en sert, le joueur non).
 */
export interface Footprint {
    readonly ox: number;
    readonly oz: number;
    readonly r: number;
    readonly h: number;
}
/**
 * Ce qui arrête le joueur, par modèle de assets/models/nature : le pied du tronc, la masse du rocher. Mesuré sur les sommets
 * des modèles tels qu'ils sont affichés (axes du jeu : le chargement retourne le sens gauche-droite par rapport au fichier),
 * sous 1,8 m de haut. Le rayon d'un rocher est la moyenne de son étendue autour du centre : un cercle ne colle pas à un
 * rocher irrégulier, il vaut mieux un peu de mur invisible qu'un joueur dans la pierre.
 * Les modèles absents d'ici (buissons, herbe, fleurs) se traversent.
 */
export declare const FOOTPRINT_BY_MODEL: Readonly<Record<string, Footprint>>;
/** Distance maximale (m, échelle 1) entre l'origine d'un modèle et le bord de son empreinte. */
export declare const MAX_COLLIDER_EXTENT_M: number;
/**
 * Cercle d'obstacle d'une ressource, ou `undefined` si le joueur la traverse. L'empreinte suit l'instance dessinée :
 * même échelle, même rotation autour de la verticale (angle = rotation × 1 tour) que sa matrice (render-data/vegetation-instances).
 */
export declare function colliderOf(resource: Resource): Circle | undefined;
/** Le joueur (rayon `radius`) centré en `point` est-il dans un des cercles ? */
export declare function overlaps(point: {
    readonly x: number;
    readonly z: number;
}, radius: number, circles: readonly Circle[]): boolean;
/**
 * Repousse le point (x, z) hors des cercles, en gardant `radius` (le rayon du joueur) entre son centre et leur bord.
 * Un point libre est rendu tel quel.
 */
export declare function pushOut(point: {
    readonly x: number;
    readonly z: number;
}, radius: number, circles: readonly Circle[]): {
    x: number;
    z: number;
};
