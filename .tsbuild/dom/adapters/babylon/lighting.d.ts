import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Material } from '@babylonjs/core/Materials/material';
import { Scene } from '@babylonjs/core/scene';
import type { TimeOfDay } from '../../core/survival/time-of-day';
import { type Atmosphere } from '../render-data/atmosphere';
import type { CloudQuality } from '../render-data/quality';
import type { AerialState } from './atmosphere-pass';
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
    /** Qualité des nuages (défaut : en couches) : render-data/quality → sky.clouds. */
    readonly clouds?: CloudQuality;
    /**
     * Distance (m) de référence de la brume de distance, quand le monde dessiné va plus loin que les chunks (relief lointain) :
     * la visibilité de l'heure y est atteinte. Défaut : fogDistanceFraction × viewRadiusM.
     */
    readonly fogDistanceM?: number;
    /** Rayon (m) du dôme de ciel : au-delà de tout ce qui est dessiné (défaut : 1,2 × viewRadiusM). */
    readonly skyRadiusM?: number;
}
/** Part de la lumière de l'astre que l'air diffuse vers l'œil (multipliée par la phase de Mie : halo autour de l'astre dans la brume). */
export declare const AERIAL_SUN_SCATTER = 0.09;
/**
 * Part de la brume de hauteur de l'heure gardée par la perspective atmosphérique. Les densités de render-data/fog ont été réglées
 * pour le seul SOL (la brume des matériaux ne touchait pas la végétation) ; la passe d'image embrume tout — arbres, rochers,
 * personnages —, à pleine densité les arbres à 100 m pâlissaient déjà à midi. Les vallées restent embrumées le matin et le soir.
 */
export declare const AERIAL_HEIGHT_FOG_SHARE = 0.5;
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
    /** Perspective atmosphérique en passe d'image (atmosphere-pass) : la brume des matériaux est alors coupée. */
    private aerial;
    /** Distance (m) de référence de la brume de distance (setDistances). */
    private fogDistanceM;
    /** L'air de l'image courante, pour la perspective atmosphérique (relu par la passe d'image). */
    private air;
    constructor(scene: Scene, options: SceneLightingOptions);
    /** Ajoute la brume de hauteur à un matériau (le terrain). */
    addHeightFog(material: Material): void;
    /** Oublie la brume de hauteur d'un matériau retiré (relief lointain recréé par un changement de profil). */
    removeHeightFog(material: Material): void;
    /**
     * Perspective atmosphérique en passe d'image (profils MEDIUM et plus) : la brume de distance et de hauteur des matériaux est
     * coupée (la passe les calcule pour tous les pixels, avec la diffusion de l'astre). Sans elle (LOW) : brume des matériaux.
     */
    setAerialPerspective(enabled: boolean): void;
    get aerialPerspective(): boolean;
    /**
     * Distances du profil graphique : distance (m) où la visibilité de l'heure est atteinte (le monde dessiné le plus loin) et rayon
     * (m) du dôme de ciel (au-delà de tout ce qui est dessiné, en deçà du plan lointain de la caméra).
     */
    setDistances(fogDistanceM: number, skyRadiusM: number): void;
    /** Qualité des nuages (profil graphique). */
    setCloudQuality(clouds: CloudQuality): void;
    /** L'air de l'image courante (densités, couleur de brume, diffusion de l'astre) : pour la passe de perspective atmosphérique. */
    get aerialState(): AerialState;
    /** `frameS` : durée de l'image (s), pour la dérive des nuages. */
    apply(a: Atmosphere, time: TimeOfDay, frameS: number): void;
}
