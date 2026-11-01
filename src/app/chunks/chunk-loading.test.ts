import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, chunkKey, generateChunk, type ChunkCoord } from '../../core/world/chunk';
import type { ChunkSource, ReadyChunk } from '../ports';
import { ChunkLoading } from './chunk-loading';
import type { StreamPlan } from './streamer';

/** Faux ChunkSource : enregistre les appels ; `deliver` rend un chunk prêt (comme si le worker avait fini). */
class FakeSource implements ChunkSource<string> {
  readonly calls: string[] = [];
  private ready: ReadyChunk<string>[] = [];
  request(cx: number, cz: number, priority: number): void {
    this.calls.push(`request ${cx},${cz} p${priority}`);
  }
  cancel(cx: number, cz: number): void {
    this.calls.push(`cancel ${cx},${cz}`);
  }
  drainReady(max: number): readonly ReadyChunk<string>[] {
    this.calls.push(`drain ${max}`);
    const out = this.ready.slice(0, max);
    this.ready = this.ready.slice(max);
    return out;
  }
  deliver(cx: number, cz: number): void {
    this.ready.push({ data: generateChunk(1, cx, cz), render: `mesh ${cx},${cz}` });
  }
}

const plan = (wanted: ChunkCoord[], toLoad: ChunkCoord[] = wanted, toUnload: string[] = []): StreamPlan => ({ wanted, toLoad, toUnload });
const c = (cx: number, cz: number): ChunkCoord => ({ cx, cz });
const centerD2 = (x: number, z: number, k: ChunkCoord): number =>
  ((k.cx + 0.5) * CHUNK_SIZE - x) ** 2 + ((k.cz + 0.5) * CHUNK_SIZE - z) ** 2;

describe('ChunkLoading (suivi demandés / chargés / déchargés)', () => {
  it('demande les chunks à charger avec la distance² au joueur comme priorité', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 4);
    loading.applyPlan(plan([c(0, 0), c(1, 0)]), 10, 20);
    expect(src.calls).toEqual([`request 0,0 p${centerD2(10, 20, c(0, 0))}`, `request 1,0 p${centerD2(10, 20, c(1, 0))}`]);
    expect(loading.pendingCount).toBe(2);
  });

  it('récupère au plus N chunks par image, les marque chargés avec leurs données', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 2);
    loading.applyPlan(plan([c(0, 0), c(1, 0), c(2, 0)]), 0, 0);
    src.deliver(0, 0);
    src.deliver(1, 0);
    src.deliver(2, 0);
    const first = loading.collect();
    expect(first.map((r) => r.key)).toEqual(['0,0', '1,0']);
    expect(first[0]?.render).toBe('mesh 0,0');
    expect(loading.collect().map((r) => r.key)).toEqual(['2,0']);
    expect([...loading.loaded.keys()]).toEqual(['0,0', '1,0', '2,0']);
    expect(loading.chunks.get('1,0')).toEqual(generateChunk(1, 1, 0));
    expect(loading.pendingCount).toBe(0);
  });

  it('annule les chunks demandés qui ne sont plus voulus, et ignore leur résultat s’il arrive quand même', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 9);
    loading.applyPlan(plan([c(0, 0), c(5, 5)]), 0, 0);
    loading.applyPlan(plan([c(0, 0)], []), 0, 0);
    expect(src.calls).toContain('cancel 5,5');
    src.deliver(5, 5);
    expect(loading.collect()).toEqual([]);
    expect(loading.loaded.has('5,5')).toBe(false);
  });

  it('annulé en vol puis redemandé : redemandé une fois, chargé une seule fois', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 9);
    loading.applyPlan(plan([c(3, 3)]), 0, 0);
    loading.applyPlan(plan([], []), 0, 0);
    loading.applyPlan(plan([c(3, 3)]), 0, 0);
    expect(src.calls.filter((x) => x.startsWith('request 3,3'))).toHaveLength(2);
    expect(src.calls.filter((x) => x === 'cancel 3,3')).toHaveLength(1);
    src.deliver(3, 3);
    src.deliver(3, 3); // un doublon tardif ne doit pas créer un second chargement
    expect(loading.collect().map((r) => r.key)).toEqual(['3,3']);
    expect(loading.collect()).toEqual([]);
  });

  it('un chunk déjà demandé et toujours voulu n’est ni annulé ni redemandé', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 9);
    loading.applyPlan(plan([c(0, 0)]), 0, 0);
    loading.applyPlan(plan([c(0, 0)]), 0, 0);
    expect(src.calls).toHaveLength(1);
  });

  it('décharge ce que le plan demande de libérer et le rend à l’appelant (pour retirer le maillage)', () => {
    const src = new FakeSource();
    const loading = new ChunkLoading(src, 9);
    loading.applyPlan(plan([c(0, 0), c(7, 7)]), 0, 0);
    src.deliver(0, 0);
    src.deliver(7, 7);
    loading.collect();
    const unloaded = loading.applyPlan(plan([c(0, 0)], [], [chunkKey(7, 7)]), 0, 0);
    expect(unloaded).toEqual([{ key: '7,7', cx: 7, cz: 7 }]);
    expect(loading.loaded.has('7,7')).toBe(false);
    expect(loading.chunks.has('7,7')).toBe(false);
  });
});
