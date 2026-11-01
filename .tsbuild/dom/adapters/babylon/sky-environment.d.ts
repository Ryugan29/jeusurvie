import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import type { Scene } from '@babylonjs/core/scene';
export interface SkyEnvironmentOptions {
    /** Côté (px) de chaque face du cube : le ciel est flou dans les reflets mats, 64 à 128 suffisent. */
    readonly size: number;
    /** Intervalle (s) entre deux mises à jour du cube. */
    readonly refreshS: number;
}
export declare class SkyEnvironment {
    private readonly scene;
    private readonly options;
    readonly probe: ReflectionProbe;
    private sinceRefreshS;
    constructor(scene: Scene, sky: AbstractMesh, options: SkyEnvironmentOptions);
    /**
     * Force du reflet du ciel sur tous les matériaux PBR (0 = aucun, 1 = le ciel tel quel), à régler à chaque image avec
     * `iblIntensityFor(lumière)`. `scene.iblIntensity` (« intensité globale de la texture d'IBL ») se multiplie au niveau de la texture
     * d'environnement ; `scene.environmentIntensity` est, de l'aveu de Babylon, un paramètre de débogage : on ne s'en sert pas.
     * Se combine avec le `environmentIntensity` de chaque matériau (render-data/surfaces : peau, roche, écorce…) sans le remplacer.
     */
    setIntensity(intensity: number): void;
    /**
     * À chaque image (durée en s, position de la caméra) : refait le cube quand l'intervalle est écoulé. La sonde se place à la caméra :
     * le dôme la suit, une sonde restée à l'origine finirait hors du ciel à quelques kilomètres du départ.
     */
    update(frameS: number, x: number, y: number, z: number): void;
}
