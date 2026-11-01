import type { InputMode } from '../modes/input-mode';
export declare class ReplanGate {
    private cx;
    private cz;
    private mode;
    shouldReplan(x: number, z: number, mode: InputMode): boolean;
}
