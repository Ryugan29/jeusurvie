// Implémentation du port ChunkSource avec des Web Workers. Chaque worker traite un chunk à la fois : la file reste
// ici, triée par priorité, ce qui permet d'annuler ou de re-prioriser un chunk tant qu'il n'est pas parti.
// Un worker qui plante est arrêté et remplacé ; son chunk est remis en file, avec un nombre d'essais borné.
import type { ChunkSource, ReadyChunk } from '../../app/ports';
import { chunkKey } from '../../core/world/chunk';
import type { ChunkRenderData, ChunkRequestMsg, ChunkResultMsg } from './chunk-protocol';

/** Ce dont la source a besoin d'un worker (le vrai Worker est enveloppé dans create-chunk-workers.ts). */
export interface WorkerLike {
  post(msg: ChunkRequestMsg): void;
  onResult(handler: (msg: ChunkResultMsg) => void): void;
  /** Erreur du script du worker ou message illisible : le worker n'est plus fiable. */
  onError(handler: () => void): void;
  terminate(): void;
}

export interface WorkerChunkSourceOptions {
  /** Nombre d'essais par chunk avant abandon (défaut 3). */
  readonly maxAttempts?: number;
  /** Appelé quand un chunk est abandonné après maxAttempts échecs. */
  readonly onChunkFailed?: (cx: number, cz: number) => void;
  /** Faire calculer le couvre-sol par les workers (défaut : oui). */
  readonly groundCover?: boolean;
}

interface Job {
  readonly cx: number;
  readonly cz: number;
  priority: number;
  /** queued : en file ; running : chez un worker ; ready : résultat reçu, pas encore récupéré. */
  state: 'queued' | 'running' | 'ready';
  /** Toujours voulu ? Un travail annulé en vol est gardé (non voulu) jusqu'à son résultat, pour pouvoir le reprendre. */
  wanted: boolean;
  attempts: number;
  ready?: ReadyChunk<ChunkRenderData>;
}

interface Slot {
  worker: WorkerLike;
  job: Job | undefined;
}

const byPriorityThenPosition = (a: Job, b: Job): number => a.priority - b.priority || a.cz - b.cz || a.cx - b.cx;

export class WorkerChunkSource implements ChunkSource<ChunkRenderData> {
  private readonly jobs = new Map<string, Job>();
  private readonly slots: Slot[] = [];
  private readonly maxAttempts: number;

  constructor(
    private readonly seed: number,
    private readonly createWorker: () => WorkerLike,
    workerCount: number,
    private readonly options: WorkerChunkSourceOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    for (let i = 0; i < Math.max(1, workerCount); i++) this.slots.push(this.newSlot());
  }

  request(cx: number, cz: number, priority: number): void {
    const key = chunkKey(cx, cz);
    const existing = this.jobs.get(key);
    if (existing !== undefined) {
      existing.priority = priority;
      existing.wanted = true; // reprend un travail annulé encore en vol : pas de second calcul
      return;
    }
    this.jobs.set(key, { cx, cz, priority, state: 'queued', wanted: true, attempts: 0 });
    this.pump();
  }

  cancel(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const job = this.jobs.get(key);
    if (job === undefined) return;
    if (job.state === 'running') job.wanted = false;
    else this.jobs.delete(key);
  }

  drainReady(max: number): readonly ReadyChunk<ChunkRenderData>[] {
    const ready = [...this.jobs.values()]
      .filter((j) => j.state === 'ready')
      .sort(byPriorityThenPosition)
      .slice(0, Math.max(0, max));
    for (const job of ready) this.jobs.delete(chunkKey(job.cx, job.cz));
    return ready.map((job) => job.ready!);
  }

  private newSlot(): Slot {
    const slot: Slot = { worker: this.createWorker(), job: undefined };
    slot.worker.onResult((msg) => this.onResult(slot, msg));
    slot.worker.onError(() => this.onWorkerError(slot));
    return slot;
  }

  private onResult(slot: Slot, msg: ChunkResultMsg): void {
    const job = slot.job;
    slot.job = undefined;
    if (job !== undefined) {
      const key = chunkKey(job.cx, job.cz);
      if (!job.wanted) {
        this.jobs.delete(key);
      } else {
        job.state = 'ready';
        job.ready = { data: msg.chunk, render: { mesh: msg.mesh, vegetation: msg.vegetation, groundCover: msg.groundCover } };
      }
    }
    this.pump();
  }

  private onWorkerError(slot: Slot): void {
    slot.worker.terminate();
    const job = slot.job;
    const index = this.slots.indexOf(slot);
    this.slots[index] = this.newSlot();
    if (job !== undefined) {
      const key = chunkKey(job.cx, job.cz);
      job.attempts++;
      if (!job.wanted) {
        this.jobs.delete(key);
      } else if (job.attempts >= this.maxAttempts) {
        this.jobs.delete(key);
        this.options.onChunkFailed?.(job.cx, job.cz);
      } else {
        job.state = 'queued';
      }
    }
    this.pump();
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job !== undefined) continue;
      let next: Job | undefined;
      for (const job of this.jobs.values()) {
        if (job.state === 'queued' && (next === undefined || byPriorityThenPosition(job, next) < 0)) next = job;
      }
      if (next === undefined) return;
      next.state = 'running';
      slot.job = next;
      slot.worker.post({ type: 'generate', seed: this.seed, cx: next.cx, cz: next.cz, groundCover: this.options.groundCover ?? true });
    }
  }
}
