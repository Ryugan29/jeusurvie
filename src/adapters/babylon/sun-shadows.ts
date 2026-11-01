// Ombres du soleil en cascade (CascadedShadowGenerator) : plusieurs cartes d'ombre emboîtées devant la caméra — la première,
// minuscule, couvre quelques mètres (ombres nettes autour du joueur), la dernière, grande, couvre jusqu'à la distance
// d'ombre. Arbres, rochers, buissons, personnages projettent ; le terrain et le couvre-sol reçoivent (l'herbe ne projette
// pas : trop de brins pour ce que ça apporte). Bords adoucis (PCF), cascades « stabilisées » : l'ombre ne scintille pas
// quand la caméra bouge. La force suit l'intensité de l'astre (render-data/lighting → shadowStrength).
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { shadowStrength, type Lighting } from '../render-data/lighting';
import type { ShadowQuality } from '../render-data/quality';

/** Répartition des cascades entre « régulière » (0) et « logarithmique » (1) : proche de 1, la 1re cascade reste très fine. */
const CASCADE_LAMBDA = 0.85;
/** Part de chaque cascade où elle se fond dans la suivante : pas de ligne visible entre deux netteté. */
const CASCADE_BLEND = 0.12;

export class SunShadows {
  readonly generator: CascadedShadowGenerator;

  constructor(light: DirectionalLight, camera: Camera, quality: ShadowQuality) {
    this.generator = new CascadedShadowGenerator(quality.mapSize, light, undefined, camera);
    const g = this.generator;
    g.numCascades = quality.cascades;
    g.shadowMaxZ = Math.min(quality.rangeM, camera.maxZ);
    g.lambda = CASCADE_LAMBDA;
    g.cascadeBlendPercentage = CASCADE_BLEND;
    g.stabilizeCascades = true;
    g.depthClamp = true;
    g.autoCalcDepthBounds = false; // sinon une passe de profondeur de plus à chaque image
    g.usePercentageCloserFiltering = true;
    g.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    g.bias = 0.0008;
    g.normalBias = 0.02;
  }

  addCaster(mesh: AbstractMesh): void {
    const list = this.generator.getShadowMap()?.renderList;
    if (list?.includes(mesh)) return;
    this.generator.addShadowCaster(mesh, false);
  }

  addReceiver(mesh: AbstractMesh): void {
    mesh.receiveShadows = true;
  }

  /** La force de l'ombre suit l'intensité de l'astre : à chaque image (aucune allocation). */
  update(l: Lighting): void {
    this.generator.setDarkness(1 - shadowStrength(l));
  }

  dispose(): void {
    this.generator.dispose();
  }
}
