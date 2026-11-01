// Machine pure des modes d'entrée (docs/03-archi.md §10), version minimale du spike.
// La pause est déclenchée par la PERTE de capture de la souris (Échap, changement de fenêtre…).
// « Reprendre » redemande la capture : si le navigateur refuse (délai après Échap, pas de geste), on passe en
// ResumePrompt, où un clic sur la scène (vrai geste de l'utilisateur) redemande la capture.

export type InputMode = 'Playing' | 'Paused' | 'ResumePrompt';
export type ModeEvent = 'captureLost' | 'captureGained' | 'captureRefused';

export const INITIAL_MODE: InputMode = 'ResumePrompt';

export function nextMode(mode: InputMode, event: ModeEvent): InputMode {
  switch (event) {
    case 'captureGained':
      return 'Playing';
    case 'captureLost':
      return mode === 'Playing' ? 'Paused' : mode;
    case 'captureRefused':
      return mode === 'Paused' ? 'ResumePrompt' : mode;
  }
}

export function simulationRuns(mode: InputMode): boolean {
  return mode === 'Playing';
}
