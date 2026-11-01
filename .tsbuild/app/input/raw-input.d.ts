import type { InputMode } from '../modes/input-mode';
/** Modes où le joueur est « en jeu » (plus tard aussi Placing et Overlay). */
export declare function isInGame(mode: InputMode): boolean;
/** Faut-il empêcher le comportement par défaut du navigateur pour cette touche, dans ce mode ? */
export declare function blocksBrowserDefault(code: string, mode: InputMode): boolean;
/** Molette → pixels, quel que soit le mode du navigateur (0 pixels, 1 lignes, 2 pages). */
export declare function normalizeWheel(deltaY: number, deltaMode: number): number;
/** Plus grand mouvement de souris accepté pour un seul événement (pixels). */
export declare const MAX_LOOK_DELTA_PX = 200;
export declare function clampLookDelta(px: number): number;
