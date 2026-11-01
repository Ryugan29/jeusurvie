// Crée un vrai Web Worker de génération (module ES, servi par Vite) et l'enveloppe dans l'interface WorkerLike.
import type { ChunkRequestMsg, ChunkResultMsg } from './chunk-protocol';
import type { WorkerLike } from './worker-chunk-source';

let created = 0;

export function createChunkWorker(): WorkerLike {
  const worker = new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module', name: `chunks-${created++}` });
  return {
    post: (msg: ChunkRequestMsg) => worker.postMessage(msg),
    onResult: (handler: (msg: ChunkResultMsg) => void) => {
      worker.onmessage = (event: MessageEvent<ChunkResultMsg>) => handler(event.data);
    },
    onError: (handler: () => void) => {
      // L'erreur reste aussi visible dans la console du navigateur (pas de preventDefault).
      worker.onerror = () => handler();
      worker.onmessageerror = () => handler();
    },
    terminate: () => worker.terminate(),
  };
}
