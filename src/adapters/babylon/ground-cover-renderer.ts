// Couvre-sol (herbe, trèfles, fleurs, fougères, champignons, cailloux) : un tampon d'instances par modèle (« thin instances »),
// rempli avec ce qui est dans le rayon de rendu autour du joueur, rétréci en douceur vers le bord (render-data/ground-cover-instances).
// Les lots arrivent par chunk (calculés dans le worker) ; le tampon n'est refait que quand le joueur s'est déplacé d'un pas
// (quelques mètres) ou qu'un chunk entre ou sort — jamais à chaque image. Un appel de dessin par morceau de modèle.
// Les tampons sont réutilisés (pas de Float32Array neuf à chaque refonte) et leurs limites ne sont pas recalculées :
// le maillage est toujours « actif » (pas de test de visibilité sur la boîte de tous les brins).
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { COVER_FADE_M, COVER_RADIUS_M, shrinkInstances } from '../render-data/ground-cover-instances';
import { vegetationVisible, type VegetationBatches } from '../render-data/vegetation-instances';
import type { ModelParts } from './vegetation-renderer';

export interface GroundCoverOptions {
  /** Rayon (m) autour du joueur où le couvre-sol est dessiné (défaut COVER_RADIUS_M). */
  readonly radiusM?: number;
  /** Largeur (m) de la bande où il rétrécit avant le bord (défaut COVER_FADE_M). */
  readonly fadeM?: number;
  /** Déplacement (m) du joueur qui déclenche une mise à jour des tampons (défaut 2,5). */
  readonly stepM?: number;
}

export interface GroundCoverStats {
  /** Chunks dont le couvre-sol est gardé en mémoire. */
  readonly chunks: number;
  /** Instances dessinées (somme sur les modèles). */
  readonly instances: number;
  /** Triangles envoyés au GPU (instances × triangles de chaque morceau de modèle). */
  readonly triangles: number;
  /** Appels de dessin : un par morceau de modèle qui a des instances. */
  readonly drawCalls: number;
  /** Refontes des tampons depuis le début (une par pas de déplacement, ou chunk ajouté ou retiré). */
  readonly rebuilds: number;
}

interface ChunkCover {
  readonly cx: number;
  readonly cz: number;
  /** Par clé de modèle (seulement ceux dont la bibliothèque a des morceaux). */
  readonly batches: ReadonlyMap<string, Float32Array>;
}

/** État d'un modèle : son tampon (réutilisé, grandit au besoin), le nombre d'instances qui y sont, et s'il est rattaché aux morceaux. */
interface ModelState {
  buffer: Float32Array;
  count: number;
  attached: boolean;
}

const DEFAULT_STEP_M = 2.5;
/** Quand le tampon doit grandir, marge prise en plus pour ne pas le refaire à chaque nouveau chunk. */
const GROWTH = 1.25;

export class GroundCoverRenderer {
  private readonly chunks = new Map<string, ChunkCover>();
  private readonly models = new Map<string, ModelState>();
  private readonly radiusM: number;
  private readonly fadeM: number;
  private readonly stepM: number;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private dirty = true;
  private rebuilds = 0;

  constructor(
    private readonly library: ModelParts,
    options: GroundCoverOptions = {},
  ) {
    this.radiusM = options.radiusM ?? COVER_RADIUS_M;
    this.fadeM = options.fadeM ?? COVER_FADE_M;
    this.stepM = options.stepM ?? DEFAULT_STEP_M;
  }

  get size(): number {
    return this.chunks.size;
  }

  add(key: string, cx: number, cz: number, batches: VegetationBatches): void {
    this.remove(key);
    const made = new Map<string, Float32Array>();
    for (const [model, matrices] of Object.entries(batches)) {
      if (this.library.partsOf(model).length > 0) made.set(model, matrices); // modèle non chargé : rien à dessiner
    }
    this.chunks.set(key, { cx, cz, batches: made });
    this.dirty = true;
  }

  remove(key: string): void {
    if (this.chunks.delete(key)) this.dirty = true;
  }

  /** À appeler à chaque image avec la position du joueur : ne refait les tampons que si c'est nécessaire. */
  update(playerX: number, playerZ: number): void {
    const moved = Math.hypot(playerX - this.lastX, playerZ - this.lastZ); // NaN avant la première fois : « déplacé »
    if (!this.dirty && !(moved >= this.stepM) && !Number.isNaN(moved)) return;
    this.rebuild(playerX, playerZ);
    this.lastX = playerX;
    this.lastZ = playerZ;
    this.dirty = false;
    this.rebuilds++;
  }

  stats(): GroundCoverStats {
    let instances = 0, triangles = 0, drawCalls = 0;
    for (const [model, state] of this.models) {
      if (state.count === 0) continue;
      instances += state.count;
      for (const part of this.library.partsOf(model)) {
        triangles += (part.getTotalIndices() / 3) * state.count;
        drawCalls++;
      }
    }
    return { chunks: this.chunks.size, instances, triangles, drawCalls, rebuilds: this.rebuilds };
  }

  private rebuild(px: number, pz: number): void {
    const near: ChunkCover[] = [];
    const modelKeys = new Set<string>(this.models.keys());
    for (const chunk of this.chunks.values()) {
      for (const model of chunk.batches.keys()) modelKeys.add(model);
      if (vegetationVisible(chunk.cx, chunk.cz, px, pz, this.radiusM)) near.push(chunk);
    }
    for (const model of modelKeys) {
      let needed = 0;
      for (const chunk of near) needed += (chunk.batches.get(model)?.length ?? 0) / 16;
      const state = this.stateOf(model);
      if (state.buffer.length < needed * 16) {
        state.buffer = new Float32Array(Math.ceil(needed * GROWTH) * 16);
        state.attached = false;
      }
      let count = 0;
      for (const chunk of near) {
        const batch = chunk.batches.get(model);
        if (batch !== undefined) count = shrinkInstances(batch, px, pz, count, this.radiusM, this.fadeM, state.buffer);
      }
      state.count = count;
      this.apply(model, state);
    }
  }

  private stateOf(model: string): ModelState {
    let state = this.models.get(model);
    if (state === undefined) {
      state = { buffer: new Float32Array(0), count: 0, attached: false };
      this.models.set(model, state);
    }
    return state;
  }

  /** Donne le tampon aux morceaux du modèle (la première fois, ou s'il a grandi), puis n'envoie que les instances utiles. */
  private apply(model: string, state: ModelState): void {
    const parts: readonly Mesh[] = this.library.partsOf(model);
    for (const part of parts) {
      if (state.count === 0) {
        // Sans instance, Babylon redessinerait le modèle seul à l'origine : on le masque.
        part.setEnabled(false);
        continue;
      }
      if (!state.attached) {
        part.doNotSyncBoundingInfo = true; // les limites de dizaines de milliers de brins ne sont jamais recalculées
        part.alwaysSelectAsActiveMesh = true; // donc pas de test de visibilité sur ces limites
        part.thinInstanceSetBuffer('matrix', state.buffer, 16, false);
      }
      part.thinInstanceCount = state.count;
      part.thinInstanceBufferUpdated('matrix');
      part.setEnabled(true);
    }
    if (state.count > 0) state.attached = true;
  }
}
