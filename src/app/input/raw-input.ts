// Normalisation pure des entrées brutes du navigateur (testée hors navigateur).
import type { InputMode } from '../modes/input-mode';

/** Modes où le joueur est « en jeu » (plus tard aussi Placing et Overlay). */
export function isInGame(mode: InputMode): boolean {
  return mode === 'Playing';
}

/** Touches dont le comportement du navigateur gêne le jeu : focus (Tab), défilement (Espace), rechargement (F5). */
const BLOCKED_IN_GAME = new Set(['Tab', 'Space', 'F5']);

/** Faut-il empêcher le comportement par défaut du navigateur pour cette touche, dans ce mode ? */
export function blocksBrowserDefault(code: string, mode: InputMode): boolean {
  return isInGame(mode) && BLOCKED_IN_GAME.has(code);
}

const LINE_PX = 16;
const PAGE_PX = 800;
const MAX_WHEEL_PX = 1000;

/** Molette → pixels, quel que soit le mode du navigateur (0 pixels, 1 lignes, 2 pages). */
export function normalizeWheel(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  const scale = deltaMode === 0 ? 1 : deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 0;
  return Math.max(-MAX_WHEEL_PX, Math.min(MAX_WHEEL_PX, deltaY * scale)) + 0;
}

/** Plus grand mouvement de souris accepté pour un seul événement (pixels). */
export const MAX_LOOK_DELTA_PX = 200;

export function clampLookDelta(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return Math.max(-MAX_LOOK_DELTA_PX, Math.min(MAX_LOOK_DELTA_PX, px));
}
