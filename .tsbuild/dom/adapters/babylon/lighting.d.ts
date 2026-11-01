import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Material } from '@babylonjs/core/Materials/material';
import { Scene } from '@babylonjs/core/scene';
import type { TimeOfDay } from '../../core/survival/time-of-day';
import { type Atmosphere } from '../render-data/atmosphere';
import { SkyDome } from './sky-dome';
export interface SceneLightingOptions {
    /** Distance de vue (m) : la brume et le dôme s'y adaptent. */
    readonly viewRadiusM: number;
    /**
     * Brume de distance exponentielle : à fogDistanceFraction × distance de vue, la visibilité restante est celle
     * de l'heure (render-data/fog → distanceFogVisibilityFor) ; le reste du bord se fond dans le bas du ciel.
     */
    readonly fogDistanceFraction: number;
    /** Altitude (m) de la base de la brume de hauteur (elle s'amincit au-dessus). */
    readonly heightFogBaseY: number;
    /** Nombre de segments de la sphère du ciel (résolution du dégradé). */
    readonly domeSegments: number;
    /** Nuages peints dans le ciel (défaut : oui). */
    readonly clouds?: boolean;
    /**
     * Distance (m) de référence de la brume de distance, quand le monde dessiné va plus loin que les chunks (relief lointain) :
     * la visibilité de l'heure y est atteinte. Défaut : fogDistanceFraction × viewRadiusM.
     */
    readonly fogDistanceM?: number;
    /** Rayon (m) du dôme de ciel : au-delà de tout ce qui est dessiné (défaut : 1,2 × viewRadiusM). */
    readonly skyRadiusM?: number;
}
export declare class SceneLighting {
    private readonly scene;
    private readonly options;
    /** L'astre (soleil le jour, lune la nuit) : seule lumière qui porte des ombres. */
    readonly sun: DirectionalLight;
    private readonly ambient;
    /** Dôme de ciel : dégradé, nuages, halo du soleil, étoiles. */
    readonly sky: SkyDome;
    /** Temps réel écoulé (s) : fait dériver les nuages, indépendant de l'heure du jeu (cycle accéléré compris). */
    private elapsedS;
    private readonly clearColor;
    private readonly heightFogs;
    constructor(scene: Scene, options: SceneLightingOptions);
    /** Ajoute la brume de hauteur à un matériau (le terrain). */
    addHeightFog(material: Material): void;
    /** `frameS` : durée de l'image (s), pour la dérive des nuages. */
    apply(a: Atmosphere, time: TimeOfDay, frameS: number): void;
}
