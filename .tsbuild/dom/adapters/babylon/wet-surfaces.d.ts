import type { Scene } from '@babylonjs/core/scene';
export declare class WetSurfaces {
    private readonly scene;
    private readonly dry;
    /** Matériaux arrivés depuis la dernière application : leur état sec est retenu à la prochaine. */
    private readonly pending;
    private wetness;
    /** Taille de la liste des matériaux à la dernière lecture (−1 : à lire), ou NaN une fois détaché. */
    private knownMaterials;
    private readonly removed;
    constructor(scene: Scene);
    /** Nombre de matériaux suivis. */
    get tracked(): number;
    /** À chaque image : humidité des surfaces (0 = sèches, 1 = détrempées). */
    apply(wetness: number): void;
    /** Ne suit plus rien (les matériaux gardent leur état du moment). */
    dispose(): void;
    /** Relit la liste des matériaux : les nouveaux PBR attendent leur première humidité. */
    private scan;
    private forget;
}
