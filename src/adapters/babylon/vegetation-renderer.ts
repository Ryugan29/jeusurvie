// Végétation : un seul tampon d'instances par morceau de modèle (tronc, feuillage…), toutes les instances des chunks
// chargés et à portée mises bout à bout (« thin instances » : un appel de dessin par morceau, ~17 au total).
// Pourquoi pas un maillage par chunk : toutes les copies d'un modèle partagent les mêmes sommets, et le tampon des
// instances s'y rattache — le dernier chunk chargé effaçait celui des autres (test de régression).
// Portée d'affichage par type : render-data/vegetation-instances → vegetationRangeM, au chunk près.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { concatInstances, instancesWithin, vegetationRangeM, vegetationVisible, type VegetationBatches } from '../render-data/vegetation-instances';

/** Ce que le rendu demande à la bibliothèque de modèles (AssetLibrary, ou un faux pour les tests). */
export interface ModelParts {
  partsOf(key: string): readonly Mesh[];
}

interface Batch {
  readonly matrices: Float32Array;
  readonly rangeM: number;
  shown: boolean;
}

interface ChunkVegetation {
  readonly cx: number;
  readonly cz: number;
  /** Par clé de modèle. */
  readonly batches: ReadonlyMap<string, Batch>;
}

export class VegetationRenderer {
  private readonly chunks = new Map<string, ChunkVegetation>();
  /** Modèles dont le tampon doit être refait (chunk ajouté ou retiré, lot entré ou sorti de portée). */
  private readonly dirty = new Set<string>();

  /** Change à chaque chunk ajouté ou retiré : de quoi savoir qu'une liste dérivée (les ombres proches) est à refaire. */
  private revisionCount = 0;

  constructor(private readonly library: ModelParts) {}

  get size(): number {
    return this.chunks.size;
  }

  get revision(): number {
    return this.revisionCount;
  }

  /**
   * Les instances d'un modèle à au plus `radiusM` mètres de (x, z), tous chunks chargés confondus, qu'elles soient dessinées
   * ou non (portée d'affichage) : sert à projeter les ombres des seuls arbres proches (ombres en cascade).
   */
  nearInstances(model: string, x: number, z: number, radiusM: number): Float32Array {
    const near: Float32Array[] = [];
    for (const chunk of this.chunks.values()) {
      const batch = chunk.batches.get(model);
      if (batch === undefined || !vegetationVisible(chunk.cx, chunk.cz, x, z, radiusM)) continue;
      near.push(instancesWithin(batch.matrices, x, z, radiusM));
    }
    return concatInstances(near);
  }

  add(key: string, cx: number, cz: number, batches: VegetationBatches): void {
    this.remove(key);
    const made = new Map<string, Batch>();
    for (const [model, matrices] of Object.entries(batches)) {
      if (this.library.partsOf(model).length === 0) continue; // modèle non chargé : rien à dessiner
      made.set(model, { matrices, rangeM: vegetationRangeM(model), shown: false });
    }
    this.chunks.set(key, { cx, cz, batches: made });
    this.revisionCount++;
  }

  remove(key: string): void {
    const chunk = this.chunks.get(key);
    if (chunk === undefined) return;
    this.revisionCount++;
    for (const [model, batch] of chunk.batches) if (batch.shown) this.dirty.add(model);
    this.chunks.delete(key);
  }

  /** Met à jour ce qui est dessiné selon la position du joueur (appelé à chaque image : ne refait que ce qui a changé). */
  update(playerX: number, playerZ: number): void {
    for (const chunk of this.chunks.values()) {
      for (const [model, batch] of chunk.batches) {
        const visible = vegetationVisible(chunk.cx, chunk.cz, playerX, playerZ, batch.rangeM);
        if (visible === batch.shown) continue;
        batch.shown = visible;
        this.dirty.add(model);
      }
    }
    for (const model of this.dirty) this.rebuild(model);
    this.dirty.clear();
  }

  private rebuild(model: string): void {
    const shown: Float32Array[] = [];
    for (const chunk of this.chunks.values()) {
      const batch = chunk.batches.get(model);
      if (batch?.shown) shown.push(batch.matrices);
    }
    const merged = concatInstances(shown);
    for (const part of this.library.partsOf(model)) {
      if (merged.length === 0) {
        // Sans instance, Babylon redessinerait le modèle seul à l'origine : on le masque.
        part.setEnabled(false);
        continue;
      }
      part.thinInstanceSetBuffer('matrix', merged, 16, true);
      part.thinInstanceRefreshBoundingInfo(true);
      part.setEnabled(true);
    }
  }
}
