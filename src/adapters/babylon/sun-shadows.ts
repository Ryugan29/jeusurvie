// Ombres du soleil en cascade (CascadedShadowGenerator) : plusieurs cartes d'ombre emboîtées devant la caméra — la première,
// minuscule, couvre quelques mètres (ombres nettes autour du joueur), la dernière, grande, couvre jusqu'à la distance
// d'ombre. Arbres, rochers, buissons, personnages projettent ; le terrain et le couvre-sol reçoivent (l'herbe ne projette
// pas : trop de brins pour ce que ça apporte). Cascades « stabilisées » : l'ombre ne scintille pas quand la caméra bouge.
// Filtrage selon le profil (render-data/quality → shadows.filter) : PCF de plus en plus large (LOW à HIGH), puis en ULTRA des
// ombres à PÉNOMBRE RÉALISTE (PCSS, « contact hardening ») : nettes là où l'objet touche le sol, de plus en plus floues en s'en
// éloignant, comme sous un vrai soleil (disque de 0,5°). La force suit l'intensité de l'astre (render-data/lighting → shadowStrength).
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { shadowStrength, type Lighting } from '../render-data/lighting';
import type { ShadowFilter, ShadowQuality } from '../render-data/quality';

/** Répartition des cascades entre « régulière » (0) et « logarithmique » (1) : proche de 1, la 1re cascade reste très fine. */
const CASCADE_LAMBDA = 0.85;
/** Part de chaque cascade où elle se fond dans la suivante : pas de ligne visible entre deux netteté. */
const CASCADE_BLEND = 0.12;
/** Qualité du filtrage PCF par profil. */
const PCF_QUALITY: Readonly<Record<Exclude<ShadowFilter, 'pcss'>, number>> = {
  'pcf-low': ShadowGenerator.QUALITY_LOW,
  'pcf-medium': ShadowGenerator.QUALITY_MEDIUM,
  'pcf-high': ShadowGenerator.QUALITY_HIGH,
};
/** Taille apparente de la source (part de la carte d'ombre) pour la pénombre PCSS : un soleil net, sans flou exagéré. */
const PCSS_LIGHT_SIZE = 0.035;
/**
 * Échantillons PCSS (recherche des bloqueurs + flou) : LOW = 16 + 16, MEDIUM = 16 + 32, HIGH = 32 + 64. Pénombre aussi fine :
 * LOW suffit, images identiques à l'œil ; mesuré en ULTRA sur RTX 2080 (2560 px) : HIGH coûtait ~15 ms par image de plus.
 */
const PCSS_QUALITY = ShadowGenerator.QUALITY_LOW;

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
    if (quality.filter === 'pcss') {
      g.useContactHardeningShadow = true;
      g.contactHardeningLightSizeUVRatio = PCSS_LIGHT_SIZE;
      g.filteringQuality = PCSS_QUALITY;
    } else {
      g.usePercentageCloserFiltering = true;
      g.filteringQuality = PCF_QUALITY[quality.filter];
    }
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
