import type { CameraView } from './vegetation-renderer';
import { type VegetationBatches } from '../render-data/vegetation-instances';
import type { ModelParts } from './vegetation-renderer';
export interface GroundCoverOptions {
    /** Rayon (m) autour du joueur où le couvre-sol est dessiné (défaut COVER_RADIUS_M). */
    readonly radiusM?: number;
    /** Largeur (m) de la bande où il rétrécit avant le bord (défaut COVER_FADE_M). */
    readonly fadeM?: number;
    /** Part des éléments dessinés (1 = tous ; défaut 1). */
    readonly density?: number;
    /** Déplacement (m) du joueur qui déclenche une mise à jour des tampons (défaut 2,5). */
    readonly stepM?: number;
}
export interface GroundCoverStats {
    /** Chunks dont le couvre-sol est gardé en mémoire. */
    readonly chunks: number;
    /** Instances dessinées (somme sur les modèles). */
    readonly instances: number;
    /** Triangles envoyés au GPU (instances × triangles de chaque morceau de modèle). */
    readonly triangles: number;
    /** Appels de dessin : un par morceau de modèle qui a des instances. */
    readonly drawCalls: number;
    /** Refontes des tampons depuis le début (une par pas de déplacement, ou chunk ajouté ou retiré). */
    readonly rebuilds: number;
}
export declare class GroundCoverRenderer {
    private readonly library;
    private readonly chunks;
    private readonly models;
    private radiusM;
    private readonly fadeM;
    /** Part des éléments dessinés (profil graphique : render-data/quality → distances.coverDensity). */
    private density;
    private readonly stepM;
    private lastX;
    private view;
    private lastSector;
    private lastZ;
    private dirty;
    private rebuilds;
    constructor(library: ModelParts, options?: GroundCoverOptions);
    get size(): number;
    /** Rayon (m) et part des éléments dessinés (profil graphique) : les tampons sont refaits à la prochaine mise à jour. */
    setReach(radiusM: number, density: number): void;
    get radius(): number;
    add(key: string, cx: number, cz: number, batches: VegetationBatches): void;
    remove(key: string): void;
    /**
     * À appeler à chaque image avec la position du joueur : ne refait les tampons que si c'est nécessaire. `view` : seuls les éléments
     * dans le champ de la caméra (ou tout près) sont dessinés ; refait aussi quand le cap arrondi change (render-data/view-sector).
     */
    update(playerX: number, playerZ: number, view?: CameraView): void;
    stats(): GroundCoverStats;
    private rebuild;
    private stateOf;
    /** Donne le tampon aux morceaux du modèle (la première fois, ou s'il a grandi), puis n'envoie que les instances utiles. */
    private apply;
}
