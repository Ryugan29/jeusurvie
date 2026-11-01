// Éclairage d'environnement (IBL) tiré du ciel de l'heure : une sonde de réflexion qui ne voit que le dôme de ciel (sky-dome), rendue
// dans un petit cube et donnée à la scène comme environnement. Les matériaux PBR (roches, écorces, personnages : render-data/surfaces)
// en tirent leurs reflets et le liseré de ciel sur leurs bords (Fresnel) — bleu à midi, doré au couchant, argenté sous la lune —
// et l'ambiance de leurs faces à l'ombre. Le reste (sol, végétation : matériau standard) ne la lit pas.
// Le cube n'est refait que de temps en temps (le ciel change lentement) : 6 rendus d'une sphère, quelques dixièmes de ms.
// Sa FORCE, elle, est réglée à chaque image (setIntensity) : elle suit la lumière réelle de la scène (render-data/environment-light),
// car un ciel couvert reste clair alors que le soleil s'éteint — sans ce réglage, personnages et rochers ressortent délavés sous la pluie.
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import type { Scene } from '@babylonjs/core/scene';

export interface SkyEnvironmentOptions {
  /** Côté (px) de chaque face du cube : le ciel est flou dans les reflets mats, 64 à 128 suffisent. */
  readonly size: number;
  /** Intervalle (s) entre deux mises à jour du cube. */
  readonly refreshS: number;
}

export class SkyEnvironment {
  readonly probe: ReflectionProbe;
  private sinceRefreshS = Number.POSITIVE_INFINITY;

  constructor(
    private readonly scene: Scene,
    sky: AbstractMesh,
    private readonly options: SkyEnvironmentOptions,
  ) {
    // Mipmaps : les surfaces rugueuses lisent les niveaux flous. Pas de flottants : le ciel peint reste dans [0, 1].
    this.probe = new ReflectionProbe('environnement-ciel', options.size, scene, true, false);
    this.probe.renderList!.push(sky);
    // Rendu à la demande seulement (refresh) : jamais à chaque image.
    this.probe.refreshRate = 0;
    scene.environmentTexture = this.probe.cubeTexture;
  }

  /**
   * Force du reflet du ciel sur tous les matériaux PBR (0 = aucun, 1 = le ciel tel quel), à régler à chaque image avec
   * `iblIntensityFor(lumière)`. `scene.iblIntensity` (« intensité globale de la texture d'IBL ») se multiplie au niveau de la texture
   * d'environnement ; `scene.environmentIntensity` est, de l'aveu de Babylon, un paramètre de débogage : on ne s'en sert pas.
   * Se combine avec le `environmentIntensity` de chaque matériau (render-data/surfaces : peau, roche, écorce…) sans le remplacer.
   */
  setIntensity(intensity: number): void {
    this.scene.iblIntensity = intensity;
  }

  /**
   * À chaque image (durée en s, position de la caméra) : refait le cube quand l'intervalle est écoulé. La sonde se place à la caméra :
   * le dôme la suit, une sonde restée à l'origine finirait hors du ciel à quelques kilomètres du départ.
   */
  /** Retire la sonde (changement de profil graphique : une nouvelle, d'une autre taille, la remplace). */
  dispose(): void {
    if (this.scene.environmentTexture === this.probe.cubeTexture) this.scene.environmentTexture = null;
    this.probe.dispose();
  }

  update(frameS: number, x: number, y: number, z: number): void {
    this.sinceRefreshS += frameS;
    if (this.sinceRefreshS < this.options.refreshS) return;
    this.sinceRefreshS = 0;
    this.probe.position.set(x, y, z);
    this.probe.cubeTexture.resetRefreshCounter();
  }
}
