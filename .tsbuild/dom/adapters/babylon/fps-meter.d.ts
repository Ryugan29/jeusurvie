export interface FpsStats {
    readonly fps: number;
    readonly low1: number;
    readonly frames: number;
}
export declare class FpsMeter {
    private readonly windowFrames;
    private readonly samples;
    constructor(windowFrames?: number);
    record(frameMs: number): void;
    stats(): FpsStats;
}
