import { describe, expect, it } from 'vitest';
import { generateChunk } from '../../core/world/chunk';
import { runChunkJob, type ChunkRequestMsg, type ChunkResultMsg } from './chunk-protocol';
import { WorkerChunkSource, type WorkerLike } from './worker-chunk-source';

class FakeWorker implements WorkerLike {
  readonly posted: ChunkRequestMsg[] = [];
  terminated = false;
  private resultHandler: ((msg: ChunkResultMsg) => void) | undefined;
  private errorHandler: (() => void) | undefined;
  post(msg: ChunkRequestMsg): void {
    this.posted.push(msg);
  }
  onResult(handler: (msg: ChunkResultMsg) => void): void {
    this.resultHandler = handler;
  }
  onError(handler: () => void): void {
    this.errorHandler = handler;
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Le worker termine le travail reçu en position `index` (dans l'ordre des envois) et renvoie son résultat. */
  finish(index: number): void {
    this.deliver(runChunkJob(this.posted[index]!).result);
  }
  deliver(msg: ChunkResultMsg): void {
    this.resultHandler!(msg);
  }
  /** Le worker plante (erreur de script ou message illisible). */
  fail(): void {
    this.errorHandler!();
  }
}

/** Source branchée sur une fabrique de faux workers ; `workers` liste tous ceux créés, dans l'ordre. */
function setup(count: number, options: { maxAttempts?: number; groundCover?: boolean } = {}) {
  const workers: FakeWorker[] = [];
  const failed: string[] = [];
  const src = new WorkerChunkSource(
    9,
    () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    count,
    { ...options, onChunkFailed: (cx, cz) => failed.push(`${cx},${cz}`) },
  );
  return { src, workers, failed };
}

const keys = (src: WorkerChunkSource, max = 99): string[] => src.drainReady(max).map((r) => `${r.data.cx},${r.data.cz}`);
const sent = (w: FakeWorker): string[] => w.posted.map((m) => `${m.cx},${m.cz}`);

describe('WorkerChunkSource (port ChunkSource)', () => {
  it('envoie une demande à un worker libre, puis rend le chunk prêt avec son maillage', () => {
    const { src, workers } = setup(1);
    const w = workers[0]!;
    src.request(1, 2, 10);
    expect(w.posted).toEqual([{ type: 'generate', seed: 9, cx: 1, cz: 2, groundCover: true }]);
    expect(src.drainReady(5)).toEqual([]);
    w.finish(0);
    const [ready] = src.drainReady(5);
    expect(ready?.data).toEqual(generateChunk(9, 1, 2));
    expect(ready?.render.mesh.indices.length).toBeGreaterThan(0);
    expect(Object.keys(ready?.render.vegetation ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(ready?.render.groundCover ?? {}).length).toBeGreaterThan(0);
    expect(src.drainReady(5)).toEqual([]);
  });

  it('l’option groundCover: false est transmise aux workers : pas de couvre-sol à calculer', () => {
    const { src, workers } = setup(1, { groundCover: false });
    src.request(0, 0, 1);
    expect(workers[0]!.posted[0]!.groundCover).toBe(false);
    workers[0]!.finish(0);
    expect(src.drainReady(1)[0]?.render.groundCover).toEqual({});
  });

  it('genVersion vient du chunk généré (pas d’une valeur recopiée en dur)', () => {
    const { src, workers } = setup(1);
    src.request(0, 0, 1);
    const result = runChunkJob(workers[0]!.posted[0]!).result;
    workers[0]!.deliver({ ...result, chunk: { ...result.chunk, genVersion: 7 as unknown as 1 } });
    expect(src.drainReady(1)[0]?.data.genVersion).toBe(7);
  });

  it('un worker ne traite qu’un chunk à la fois ; la file part par priorité (la plus petite d’abord)', () => {
    const { src, workers } = setup(1);
    const w = workers[0]!;
    src.request(0, 0, 5);
    src.request(9, 9, 50);
    src.request(1, 1, 1);
    expect(sent(w)).toEqual(['0,0']);
    w.finish(0);
    expect(sent(w)).toEqual(['0,0', '1,1']);
    w.finish(1);
    expect(sent(w)).toEqual(['0,0', '1,1', '9,9']);
  });

  it('drainReady rend les chunks prêts triés par priorité, au plus `max`', () => {
    const { src, workers } = setup(3);
    src.request(0, 0, 30);
    src.request(1, 0, 10);
    src.request(2, 0, 20);
    for (const w of workers) w.finish(0);
    expect(keys(src, 2)).toEqual(['1,0', '2,0']);
    expect(keys(src)).toEqual(['0,0']);
  });

  it('à priorité égale, ordre déterministe (cz, puis cx)', () => {
    const { src, workers } = setup(4);
    src.request(5, 1, 7);
    src.request(2, 1, 7);
    src.request(9, 0, 7);
    src.request(1, 3, 7);
    for (const i of [3, 0, 2, 1]) workers[i]!.finish(0);
    expect(keys(src)).toEqual(['9,0', '2,1', '5,1', '1,3']);
  });

  it('une nouvelle demande du même chunk ne renvoie pas de travail mais met à jour sa priorité', () => {
    const { src, workers } = setup(1);
    const w = workers[0]!;
    src.request(0, 0, 1);
    src.request(5, 5, 50);
    src.request(6, 6, 40);
    src.request(5, 5, 2);
    w.finish(0);
    expect(sent(w)).toEqual(['0,0', '5,5']);
  });

  it('annuler avant l’envoi : jamais envoyé ; après l’envoi : le résultat est jeté', () => {
    const { src, workers } = setup(1);
    const w = workers[0]!;
    src.request(0, 0, 1);
    src.request(3, 3, 2);
    src.cancel(3, 3);
    src.cancel(0, 0);
    w.finish(0);
    expect(w.posted).toHaveLength(1);
    expect(src.drainReady(9)).toEqual([]);
  });

  it('annulé en vol puis redemandé : pas de second calcul, le résultat en cours est gardé', () => {
    const { src, workers } = setup(1);
    const w = workers[0]!;
    src.request(4, 4, 1);
    src.cancel(4, 4);
    src.request(4, 4, 1);
    expect(w.posted).toHaveLength(1);
    w.finish(0);
    expect(keys(src)).toEqual(['4,4']);
    expect(w.posted).toHaveLength(1);
  });

  it('annuler un chunk prêt mais pas encore récupéré le retire', () => {
    const { src, workers } = setup(1);
    src.request(0, 0, 1);
    workers[0]!.finish(0);
    src.cancel(0, 0);
    expect(src.drainReady(9)).toEqual([]);
  });

  it('worker en erreur : arrêté, remplacé, et son chunk remis en file', () => {
    const { src, workers } = setup(1);
    src.request(2, 3, 1);
    workers[0]!.fail();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(sent(workers[1]!)).toEqual(['2,3']);
    workers[1]!.finish(0);
    expect(keys(src)).toEqual(['2,3']);
  });

  it('après maxAttempts échecs sur le même chunk : abandon, erreur signalée, les autres chunks continuent', () => {
    const { src, workers, failed } = setup(1, { maxAttempts: 2 });
    src.request(2, 3, 1);
    src.request(7, 7, 5);
    workers[0]!.fail();
    workers[1]!.fail();
    expect(failed).toEqual(['2,3']);
    const last = workers[workers.length - 1]!;
    expect(sent(last)).toEqual(['7,7']);
    last.finish(0);
    expect(keys(src)).toEqual(['7,7']);
  });
});
