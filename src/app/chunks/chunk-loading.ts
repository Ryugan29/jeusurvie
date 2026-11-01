// Suivi du chargement des chunks (pur, testé avec un faux ChunkSource) : quels chunks sont demandés, chargés,
// à annuler ou à décharger. Les coordonnées sont gardées en mémoire à côté des clés (jamais relues depuis le texte).
import { CHUNK_SIZE, chunkKey, type ChunkCoord, type ChunkData } from '../../core/world/chunk';
import type { ChunkSource, ReadyChunk } from '../ports';
import type { StreamPlan } from './streamer';

export interface LoadedChunk<TRender> extends ReadyChunk<TRender> {
  readonly key: string;
}

export interface UnloadedChunk extends ChunkCoord {
  readonly key: string;
}

export class ChunkLoading<TRender> {
  private readonly requested = new Map<string, ChunkCoord>();
  private readonly loadedCoords = new Map<string, ChunkCoord>();
  private readonly chunkData = new Map<string, ChunkData>();

  constructor(
    private readonly source: ChunkSource<TRender>,
    /** Nombre maximal de chunks intégrés par image (évite les à-coups quand beaucoup arrivent ensemble). */
    private readonly maxPerFrame: number,
  ) {}

  /** Données des chunks chargés (pour le sol de la physique). */
  get chunks(): ReadonlyMap<string, ChunkData> {
    return this.chunkData;
  }

  /** Coordonnées des chunks chargés (pour le prochain plan de streaming). */
  get loaded(): ReadonlyMap<string, ChunkCoord> {
    return this.loadedCoords;
  }

  get pendingCount(): number {
    return this.requested.size;
  }

  /**
   * Applique un plan calculé pour un joueur en (x, z) : demande ce qui manque (priorité = distance² au joueur),
   * annule les demandes devenues inutiles, et décharge ce qui doit l'être. Rend les chunks déchargés.
   */
  applyPlan(plan: StreamPlan, x: number, z: number): readonly UnloadedChunk[] {
    const wanted = new Set<string>();
    for (const c of plan.wanted) wanted.add(chunkKey(c.cx, c.cz));
    for (const [key, c] of this.requested) {
      if (wanted.has(key)) continue;
      this.source.cancel(c.cx, c.cz);
      this.requested.delete(key);
    }
    for (const c of plan.toLoad) {
      const key = chunkKey(c.cx, c.cz);
      if (this.requested.has(key) || this.loadedCoords.has(key)) continue;
      const dx = (c.cx + 0.5) * CHUNK_SIZE - x, dz = (c.cz + 0.5) * CHUNK_SIZE - z;
      this.source.request(c.cx, c.cz, dx * dx + dz * dz);
      this.requested.set(key, c);
    }
    const unloaded: UnloadedChunk[] = [];
    for (const key of plan.toUnload) {
      const c = this.loadedCoords.get(key);
      if (c === undefined) continue;
      this.loadedCoords.delete(key);
      this.chunkData.delete(key);
      unloaded.push({ key, cx: c.cx, cz: c.cz });
    }
    return unloaded;
  }

  /** Intègre au plus `maxPerFrame` chunks prêts parmi ceux encore demandés. */
  collect(): readonly LoadedChunk<TRender>[] {
    const loaded: LoadedChunk<TRender>[] = [];
    for (const ready of this.source.drainReady(this.maxPerFrame)) {
      const key = chunkKey(ready.data.cx, ready.data.cz);
      const coord = this.requested.get(key);
      if (coord === undefined) continue; // annulé entre-temps, ou doublon
      this.requested.delete(key);
      this.loadedCoords.set(key, coord);
      this.chunkData.set(key, ready.data);
      loaded.push({ key, data: ready.data, render: ready.render });
    }
    return loaded;
  }
}
