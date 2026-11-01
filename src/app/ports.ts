// Ports de l'application (docs/03-archi.md §7) : interfaces seulement, implémentées par les adapters.
// Ils vivent dans app et non dans le cœur : la charge de rendu d'un chunk ou les entrées brutes ne concernent pas
// les règles du jeu.
import type { ChunkData } from '../core/world/chunk';
import type { ModeEvent } from './modes/input-mode';

/** Un chunk généré, avec les données de rendu préparées à côté (opaques pour l'app). */
export interface ReadyChunk<TRender = unknown> {
  readonly data: ChunkData;
  readonly render: TRender;
}

/** Source de chunks (ex. générés dans un Web Worker). Priorité : plus petite = plus urgente (ex. distance²). */
export interface ChunkSource<TRender = unknown> {
  /** Demande un chunk ; redemander met seulement à jour sa priorité. */
  request(cx: number, cz: number, priority: number): void;
  /** Le chunk n'est plus voulu : il ne sera pas rendu par drainReady. */
  cancel(cx: number, cz: number): void;
  /** Rend au plus `max` chunks prêts, triés par priorité puis (cz, cx), et les oublie. */
  drainReady(max: number): readonly ReadyChunk<TRender>[];
}

/** Entrées brutes accumulées depuis le dernier `sample()`. */
export interface RawInput {
  /** Touches tenues, par position physique (KeyboardEvent.code). */
  readonly keysDown: ReadonlySet<string>;
  /** Touches enfoncées depuis le dernier échantillon (sans répétition automatique). */
  readonly pressed: readonly string[];
  /** Mouvement de souris capturée, en pixels. */
  readonly look: { readonly dx: number; readonly dy: number };
  /** Molette, en pixels (voir normalizeWheel). */
  readonly wheel: number;
  /** Événements de capture de la souris, pour la machine des modes. */
  readonly modeEvents: readonly ModeEvent[];
}

export interface InputDevice {
  sample(): RawInput;
  requestPointerLock(): void;
  releasePointerLock(): void;
  /** Libellé affichable d'une touche selon le clavier du joueur (ex. KeyW → « Z » en AZERTY). */
  labelFor(code: string): Promise<string>;
}
