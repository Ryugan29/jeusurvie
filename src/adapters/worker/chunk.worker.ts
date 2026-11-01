// Point d'entrée du Web Worker de génération : reçoit une demande, rend chunk + maillage en tampons transférés.
import { runChunkJob, type ChunkRequestMsg } from './chunk-protocol';

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ChunkRequestMsg>) => {
  const { result, transfer } = runChunkJob(event.data);
  scope.postMessage(result, transfer);
};
