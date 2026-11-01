// Accumulateur pur du pas fixe (docs/03-archi.md §3) : la simulation avance par ticks réguliers,
// le rendu interpole entre les deux derniers états avec `alpha`.

/** Une image plus longue (onglet en arrière-plan, gros ralentissement) compte pour cette durée. */
export const MAX_FRAME_MS = 250;

export interface AdvanceResult {
  /** Nombre de ticks de simulation à jouer pour cette image. */
  readonly steps: number;
  /** Temps restant, à reporter à l'image suivante (toujours < stepMs). */
  readonly accMs: number;
  /** Avancement vers le prochain tick, dans [0, 1) : sert à interpoler le rendu. */
  readonly alpha: number;
}

export function advance(accMs: number, frameMs: number, stepMs: number, maxSteps = 5): AdvanceResult {
  const frame = Number.isFinite(frameMs) && frameMs > 0 ? Math.min(frameMs, MAX_FRAME_MS) : 0;
  let acc = accMs + frame;
  let steps = Math.floor(acc / stepMs);
  if (steps > maxSteps) {
    // Trop de retard : on joue maxSteps ticks et on abandonne le reste (sinon la machine ne rattrape jamais).
    steps = maxSteps;
    acc -= Math.floor(acc / stepMs) * stepMs;
  } else {
    acc -= steps * stepMs;
  }
  if (acc < 0) acc = 0;
  return { steps, accMs: acc, alpha: acc / stepMs };
}
