export type InputMode = 'Playing' | 'Paused' | 'ResumePrompt';
export type ModeEvent = 'captureLost' | 'captureGained' | 'captureRefused';
export declare const INITIAL_MODE: InputMode;
export declare function nextMode(mode: InputMode, event: ModeEvent): InputMode;
export declare function simulationRuns(mode: InputMode): boolean;
