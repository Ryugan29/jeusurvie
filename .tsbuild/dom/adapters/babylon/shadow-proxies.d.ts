import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ModelParts } from './vegetation-renderer';
/** Ce que les doubles demandent à la végétation (VegetationRenderer, ou un faux pour les tests). */
export interface NearInstances {
    /** Change quand un chunk est ajouté ou retiré. */
    readonly revision: number;
    nearInstances(model: string, x: number, z: number, radiusM: number): Float32Array;
}
export interface ShadowProxiesOptions {
    /** Rayon (m) autour du joueur des instances qui projettent. */
    readonly radiusM: number;
    /** Déplacement (m) du joueur qui déclenche une mise à jour. */
    readonly stepM: number;
}
export declare class ShadowProxies {
    private readonly source;
    private readonly options;
    private readonly proxies;
    private readonly meshes;
    private lastX;
    private lastZ;
    private lastRevision;
    /** @param onProxy appelé une fois pour chaque double : c'est là qu'on l'ajoute aux projeteurs d'ombre. */
    constructor(library: ModelParts, source: NearInstances, models: readonly string[], options: ShadowProxiesOptions, onProxy: (proxy: Mesh) => void);
    isProxy(mesh: unknown): boolean;
    /** À appeler à chaque image avec la position du joueur : ne refait les instances que si c'est nécessaire. */
    update(playerX: number, playerZ: number): void;
}
