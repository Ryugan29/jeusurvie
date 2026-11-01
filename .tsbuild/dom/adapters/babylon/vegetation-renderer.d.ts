import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { type VegetationBatches } from '../render-data/vegetation-instances';
import { type ViewSector } from '../render-data/view-sector';
/** Ce que voit la caméra : son secteur horizontal et sa position (sommet du secteur). */
export interface CameraView {
    readonly sector: ViewSector;
    readonly x: number;
    readonly z: number;
}
/** Ce que le rendu demande à la bibliothèque de modèles (AssetLibrary, ou un faux pour les tests). */
export interface ModelParts {
    partsOf(key: string): readonly Mesh[];
}
export declare class VegetationRenderer {
    private readonly library;
    private readonly chunks;
    /** Modèles dont le tampon doit être refait (chunk ajouté ou retiré, lot entré ou sorti de portée). */
    private readonly dirty;
    /** Change à chaque chunk ajouté ou retiré : de quoi savoir qu'une liste dérivée (les ombres proches) est à refaire. */
    private revisionCount;
    /** Multiplie la portée d'affichage de chaque type (profil graphique : render-data/quality → distances.vegetationRange). */
    private rangeScale;
    constructor(library: ModelParts);
    get size(): number;
    get revision(): number;
    /** Portées d'affichage × k (profil graphique) : prise en compte à la prochaine mise à jour. */
    setRangeScale(k: number): void;
    /**
     * Les instances d'un modèle à au plus `radiusM` mètres de (x, z), tous chunks chargés confondus, qu'elles soient dessinées
     * ou non (portée d'affichage) : sert à projeter les ombres des seuls arbres proches (ombres en cascade).
     */
    nearInstances(model: string, x: number, z: number, radiusM: number): Float32Array;
    add(key: string, cx: number, cz: number, batches: VegetationBatches): void;
    remove(key: string): void;
    /**
     * Met à jour ce qui est dessiné selon la position du joueur (appelé à chaque image : ne refait que ce qui a changé). `view` : le
     * chunk entièrement hors du champ de la caméra n'est pas dessiné (ses arbres ne coûtent plus rien à la carte graphique) ; le
     * secteur de vue est arrondi par pas (render-data/view-sector) : les tampons ne sont refaits qu'au pas franchi.
     */
    update(playerX: number, playerZ: number, view?: CameraView): void;
    private rebuild;
}
