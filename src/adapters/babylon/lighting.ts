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
  private readonly heightFogs: HeightFogPlugin[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly options: SceneLightingOptions,
  ) {
    this.ambient = new HemisphericLight('ambiance', new Vector3(0, 1, 0), scene);
    this.ambient.specular = Color3.Black();
    this.sun = new DirectionalLight('soleil', new Vector3(0, -1, 0), scene);
    this.sun.specular = Color3.Black();

    // Brume de distance exponentielle (EXP, et non EXP2 qui reste quasi nulle de près).
    scene.fogMode = Scene.FOGMODE_EXP;
    scene.fogColor = new Color3(0, 0, 0);
    scene.clearColor = this.clearColor;

    // Dôme de ciel : sphère vue de l'intérieur, qui suit la caméra, sans éclairage ni brume.
    this.sky = new SkyDome(scene, { radiusM: options.skyRadiusM ?? options.viewRadiusM * 1.2, segments: options.domeSegments, clouds: options.clouds ?? true });
  }

  /** Ajoute la brume de hauteur à un matériau (le terrain). */
  addHeightFog(material: Material): void {
    this.heightFogs.push(new HeightFogPlugin(material));
  }

  /** `frameS` : durée de l'image (s), pour la dérive des nuages. */
  apply(a: Atmosphere, time: TimeOfDay, frameS: number): void {
    const l = a.light;
    this.elapsedS += frameS;
    const haze = hazeColor(l);
    this.clearColor.set(haze[0], haze[1], haze[2], 1);
    setRgb(this.scene.fogColor, haze);
    // Brume de l'heure (réglée sur la distance de référence), épaissie par la pluie, plus celle du brouillard (render-data/atmosphere).
    this.scene.fogDensity = distanceFogDensity(
      a,
      fogDensityFor(this.options.fogDistanceM ?? this.options.viewRadiusM * this.options.fogDistanceFraction, distanceFogVisibilityFor(time)),
    );
    const heightFog = heightFogFor(time);
    for (const plugin of this.heightFogs) plugin.set(heightFog, this.options.heightFogBaseY, haze);
    setRgb(this.ambient.diffuse, l.ambientColor);
    setRgb(this.ambient.groundColor, l.ambientGroundColor);
    this.ambient.intensity = l.ambientIntensity;
    setRgb(this.sun.diffuse, l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.direction.set(l.sunDirection.x, l.sunDirection.y, l.sunDirection.z);
    this.sky.update(l, haze, this.elapsedS, a, cosmosFor(time));
  }
}
