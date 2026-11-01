// Applique une atmosphère (render-data/atmosphere : heure + météo + éclairs) à la scène : ciel peint (sky-dome), brume de
// distance et de hauteur, soleil/lune, ambiance. Aucune allocation par image : les couleurs sont recopiées dans des objets existants.
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { Material } from '@babylonjs/core/Materials/material';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { TimeOfDay } from '../../core/survival/time-of-day';
import { distanceFogVisibilityFor, fogDensityFor, hazeColor, heightFogFor } from '../render-data/fog';
import { distanceFogDensity, type Atmosphere } from '../render-data/atmosphere';
import { cosmosFor } from '../render-data/cosmos';
import type { Rgb } from '../render-data/palette';
import type { CloudQuality } from '../render-data/quality';
import type { AerialState } from './atmosphere-pass';
import { HeightFogPlugin } from './height-fog-plugin';
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
export const AERIAL_SUN_SCATTER = 0.09;
/**
 * Part de la brume de hauteur de l'heure gardée par la perspective atmosphérique. Les densités de render-data/fog ont été réglées
 * pour le seul SOL (la brume des matériaux ne touchait pas la végétation) ; la passe d'image embrume tout — arbres, rochers,
 * personnages —, à pleine densité les arbres à 100 m pâlissaient déjà à midi. Les vallées restent embrumées le matin et le soir.
 */
export const AERIAL_HEIGHT_FOG_SHARE = 0.5;

const setRgb = (target: Color3, c: Rgb): void => {
  target.set(c[0], c[1], c[2]);
};

export class SceneLighting {
  /** L'astre (soleil le jour, lune la nuit) : seule lumière qui porte des ombres. */
  readonly sun: DirectionalLight;
  private readonly ambient: HemisphericLight;
  /** Dôme de ciel : dégradé, nuages, halo du soleil, étoiles. */
  readonly sky: SkyDome;
  /** Temps réel écoulé (s) : fait dériver les nuages, indépendant de l'heure du jeu (cycle accéléré compris). */
  private elapsedS = 0;
  private readonly clearColor = new Color4(0, 0, 0, 1);
  private readonly heightFogs = new Map<Material, HeightFogPlugin>();
  /** Perspective atmosphérique en passe d'image (atmosphere-pass) : la brume des matériaux est alors coupée. */
  private aerial = false;
  /** Distance (m) de référence de la brume de distance (setDistances). */
  private fogDistanceM: number;
  /** L'air de l'image courante, pour la perspective atmosphérique (relu par la passe d'image). */
  private air: AerialState = {
    distanceDensity: 0,
    heightDensity: 0,
    heightThicknessM: 1,
    heightBaseY: 0,
    haze: [0.6, 0.7, 0.8],
    sunDirection: { x: 0, y: -1, z: 0 },
    sunScatter: [0, 0, 0],
  };

  constructor(
    private readonly scene: Scene,
    private readonly options: SceneLightingOptions,
  ) {
    this.fogDistanceM = options.fogDistanceM ?? options.viewRadiusM * options.fogDistanceFraction;
    this.ambient = new HemisphericLight('ambiance', new Vector3(0, 1, 0), scene);
    this.ambient.specular = Color3.Black();
    this.sun = new DirectionalLight('soleil', new Vector3(0, -1, 0), scene);
    this.sun.specular = Color3.Black();

    // Brume de distance exponentielle (EXP, et non EXP2 qui reste quasi nulle de près).
    scene.fogMode = Scene.FOGMODE_EXP;
    scene.fogColor = new Color3(0, 0, 0);
    scene.clearColor = this.clearColor;

    // Dôme de ciel : sphère vue de l'intérieur, qui suit la caméra, sans éclairage ni brume.
    this.sky = new SkyDome(scene, { radiusM: options.skyRadiusM ?? options.viewRadiusM * 1.2, segments: options.domeSegments, clouds: options.clouds ?? 'layered' });
  }

  /** Ajoute la brume de hauteur à un matériau (le terrain). */
  addHeightFog(material: Material): void {
    if (!this.heightFogs.has(material)) this.heightFogs.set(material, new HeightFogPlugin(material));
  }

  /** Oublie la brume de hauteur d'un matériau retiré (relief lointain recréé par un changement de profil). */
  removeHeightFog(material: Material): void {
    this.heightFogs.delete(material);
  }

  /**
   * Perspective atmosphérique en passe d'image (profils MEDIUM et plus) : la brume de distance et de hauteur des matériaux est
   * coupée (la passe les calcule pour tous les pixels, avec la diffusion de l'astre). Sans elle (LOW) : brume des matériaux.
   */
  setAerialPerspective(enabled: boolean): void {
    this.aerial = enabled;
    this.scene.fogMode = enabled ? Scene.FOGMODE_NONE : Scene.FOGMODE_EXP;
  }

  get aerialPerspective(): boolean {
    return this.aerial;
  }

  /**
   * Distances du profil graphique : distance (m) où la visibilité de l'heure est atteinte (le monde dessiné le plus loin) et rayon
   * (m) du dôme de ciel (au-delà de tout ce qui est dessiné, en deçà du plan lointain de la caméra).
   */
  setDistances(fogDistanceM: number, skyRadiusM: number): void {
    this.fogDistanceM = fogDistanceM;
    this.sky.setRadius(skyRadiusM);
  }

  /** Qualité des nuages (profil graphique). */
  setCloudQuality(clouds: CloudQuality): void {
    this.sky.setCloudQuality(clouds);
  }

  /** L'air de l'image courante (densités, couleur de brume, diffusion de l'astre) : pour la passe de perspective atmosphérique. */
  get aerialState(): AerialState {
    return this.air;
  }

  /** `frameS` : durée de l'image (s), pour la dérive des nuages. */
  apply(a: Atmosphere, time: TimeOfDay, frameS: number): void {
    const l = a.light;
    this.elapsedS += frameS;
    const haze = hazeColor(l);
    this.clearColor.set(haze[0], haze[1], haze[2], 1);
    setRgb(this.scene.fogColor, haze);
    // Brume de l'heure (réglée sur la distance de référence), épaissie par la pluie, plus celle du brouillard (render-data/atmosphere).
    const fogDensity = distanceFogDensity(
      a,
      fogDensityFor(this.fogDistanceM, distanceFogVisibilityFor(time)),
    );
    this.scene.fogDensity = fogDensity;
    const heightFog = heightFogFor(time);
    // Avec la perspective atmosphérique, la brume de hauteur est calculée dans la passe d'image (pour tous les pixels).
    const materialHeightFog = this.aerial ? { density: 0, thickness: heightFog.thickness } : heightFog;
    for (const plugin of this.heightFogs.values()) plugin.set(materialHeightFog, this.options.heightFogBaseY, haze);
    this.air = {
      distanceDensity: fogDensity,
      heightDensity: heightFog.density * AERIAL_HEIGHT_FOG_SHARE,
      heightThicknessM: heightFog.thickness,
      heightBaseY: this.options.heightFogBaseY,
      haze,
      sunDirection: l.sunDirection,
      sunScatter: [l.sunColor[0] * l.sunIntensity * AERIAL_SUN_SCATTER, l.sunColor[1] * l.sunIntensity * AERIAL_SUN_SCATTER, l.sunColor[2] * l.sunIntensity * AERIAL_SUN_SCATTER],
    };
    setRgb(this.ambient.diffuse, l.ambientColor);
    setRgb(this.ambient.groundColor, l.ambientGroundColor);
    this.ambient.intensity = l.ambientIntensity;
    setRgb(this.sun.diffuse, l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.direction.set(l.sunDirection.x, l.sunDirection.y, l.sunDirection.z);
    this.sky.update(l, haze, this.elapsedS, a, cosmosFor(time));
  }
}
