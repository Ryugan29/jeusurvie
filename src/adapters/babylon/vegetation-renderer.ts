// Végétation : un seul tampon d'instances par morceau de modèle (tronc, feuillage…), toutes les instances des chunks
// chargés et à portée mises bout à bout (« thin instances » : un appel de dessin par morceau, ~17 au total).
// Pourquoi pas un maillage par chunk : toutes les copies d'un modèle partagent les mêmes sommets, et le tampon des
// instances s'y rattache — le dernier chunk chargé effaçait celui des autres (test de régression).
// Portée d'affichage par type : render-data/vegetation-instances → vegetationRangeM, au chunk près.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CHUNK_SIZE } from '../../core/world/chunk';
import { concatInstances, instancesWithin, vegetationRangeM, vegetationVisible, type VegetationBatches } from '../render-data/vegetation-instances';
import { inSector, type ViewSector } from '../render-data/view-sector';

/** Ce que voit la caméra : son secteur horizontal et sa position (sommet du secteur). */
export interface CameraView {
  readonly sector: ViewSector;
  readonly x: number;
  readonly z: number;
}

/** Rayon (m) d'un chunk vu du dessus (demi-diagonale) + la couronne d'un grand arbre qui déborde du chunk. */
const CHUNK_VIEW_RADIUS_M = (CHUNK_SIZE * Math.SQRT2) / 2 + 6;

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
  /** Multiplie la portée d'affichage de chaque type (profil graphique : render-data/quality → distances.vegetationRange). */
  private rangeScale = 1;

  constructor(private readonly library: ModelParts) {}

  get size(): number {
    return this.chunks.size;
  }

  get revision(): number {
    return this.revisionCount;
  }

  /** Portées d'affichage × k (profil graphique) : prise en compte à la prochaine mise à jour. */
  setRangeScale(k: number): void {
    this.rangeScale = Number.isFinite(k) && k > 0 ? k : 1;
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

  /**
   * Met à jour ce qui est dessiné selon la position du joueur (appelé à chaque image : ne refait que ce qui a changé). `view` : le
   * chunk entièrement hors du champ de la caméra n'est pas dessiné (ses arbres ne coûtent plus rien à la carte graphique) ; le
   * secteur de vue est arrondi par pas (render-data/view-sector) : les tampons ne sont refaits qu'au pas franchi.
   */
  update(playerX: number, playerZ: number, view?: CameraView): void {
    for (const chunk of this.chunks.values()) {
      const inView =
        view === undefined ||
        inSector(view.sector, view.x, view.z, (chunk.cx + 0.5) * CHUNK_SIZE, (chunk.cz + 0.5) * CHUNK_SIZE, CHUNK_VIEW_RADIUS_M);
      for (const [model, batch] of chunk.batches) {
        const visible = inView && vegetationVisible(chunk.cx, chunk.cz, playerX, playerZ, batch.rangeM * this.rangeScale);
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
