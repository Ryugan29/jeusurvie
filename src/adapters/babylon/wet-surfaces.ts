// Matières solides mouillées par la pluie (render-data/surfaces → wetSurface) : roches, écorces, champignons et personnages
// (matériaux PBR) deviennent plus sombres et plus lisses — leur reflet du ciel de l'heure (sky-environment) se resserre en
// liseré luisant, comme une pierre après l'averse. Ils ne reçoivent PAS plus de lumière pour autant : l'éclairage d'environnement
// reste celui du sec (sinon personnages et roches ressortent plus clairs que le sol sous la pluie). L'état sec de chaque matériau
// est retenu à sa première humidité appliquée, puis rétabli exactement au sec. Contrat : ces trois réglages (rugosité, intensité
// d'environnement, couleur) appartiennent ici une fois le matériau suivi ; un réglage fait ailleurs ensuite serait écrasé.
// Nouveaux matériaux : la liste de la scène est relue quand sa taille change ou qu'un matériau est retiré (Babylon n'annonce
// les ajouts qu'au tour suivant) ; rien n'est retouché tant que l'humidité (arrondie au 1/64) ne change pas.
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { wetSurface, type Surface } from '../render-data/surfaces';

interface DryLook {
  readonly surface: Surface;
  readonly albedo: Color3;
}

/** Pas d'humidité : en dessous, on ne retouche pas les matériaux (moins de travail pendant que le sol sèche). */
const WETNESS_STEPS = 64;

export class WetSurfaces {
  private readonly dry = new Map<PBRMaterial, DryLook>();
  /** Matériaux arrivés depuis la dernière application : leur état sec est retenu à la prochaine. */
  private readonly pending = new Set<PBRMaterial>();
  private wetness = Number.NaN;
  /** Taille de la liste des matériaux à la dernière lecture (−1 : à lire), ou NaN une fois détaché. */
  private knownMaterials = -1;
  private readonly removed: Observer<Material> | null;

  constructor(private readonly scene: Scene) {
    this.removed = scene.onMaterialRemovedObservable.add((material) => this.forget(material));
  }

  /** Nombre de matériaux suivis. */
  get tracked(): number {
    return this.dry.size + this.pending.size;
  }

  /** À chaque image : humidité des surfaces (0 = sèches, 1 = détrempées). */
  apply(wetness: number): void {
    const w = Number.isFinite(wetness) ? Math.round(Math.min(1, Math.max(0, wetness)) * WETNESS_STEPS) / WETNESS_STEPS : 0;
    if (this.scene.materials.length !== this.knownMaterials && !Number.isNaN(this.knownMaterials)) this.scan();
    if (w === this.wetness && this.pending.size === 0) return;
    for (const material of this.pending) {
      this.dry.set(material, {
        surface: { metallic: material.metallic ?? 0, roughness: material.roughness ?? 1, environmentIntensity: material.environmentIntensity },
        albedo: material.albedoColor.clone(),
      });
    }
    this.pending.clear();
    for (const [material, dry] of this.dry) {
      const wet = wetSurface(dry.surface, w);
      material.roughness = wet.roughness;
      material.environmentIntensity = wet.environmentIntensity;
      material.albedoColor.copyFrom(dry.albedo).scaleInPlace(wet.darken);
    }
    this.wetness = w;
  }

  /** Ne suit plus rien (les matériaux gardent leur état du moment). */
  dispose(): void {
    if (this.removed) this.scene.onMaterialRemovedObservable.remove(this.removed);
    this.knownMaterials = Number.NaN;
    this.dry.clear();
    this.pending.clear();
  }

  /** Relit la liste des matériaux : les nouveaux PBR attendent leur première humidité. */
  private scan(): void {
    for (const material of this.scene.materials) {
      if (material instanceof PBRMaterial && !this.dry.has(material)) this.pending.add(material);
    }
    this.knownMaterials = this.scene.materials.length;
  }

  private forget(material: Material): void {
    if (!(material instanceof PBRMaterial)) return;
    this.pending.delete(material);
    this.dry.delete(material);
    if (!Number.isNaN(this.knownMaterials)) this.knownMaterials = -1; // un ajout a pu remplacer ce retrait : relire
  }
}
