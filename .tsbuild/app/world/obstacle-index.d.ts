import { type Circle } from '../../core/physics/colliders';
export declare class ObstacleIndex {
    private readonly seed;
    private readonly maxCachedCells;
    /** Par case « gx:gz » : le cercle de sa ressource, ou null si elle n'a rien de solide. */
    private readonly cells;
    constructor(seed: number, maxCachedCells?: number);
    /** Obstacles susceptibles de toucher un joueur au point (x, z). */
    near(x: number, z: number): Circle[];
    /** Obstacles susceptibles de toucher la perche de la caméra, du point (ax, az) au point (bx, bz) (marge de la caméra < rayon du joueur). */
    along(ax: number, az: number, bx: number, bz: number): Circle[];
    /** Obstacles dont l'origine est à moins de REACH_M du rectangle [x0, x1] × [z0, z1]. */
    private inBox;
    private cell;
}
