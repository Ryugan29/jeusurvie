import type { Vec3 } from '../../core/shared/vec';
export declare function surfaceNormal(ground: (x: number, z: number) => number | undefined, x: number, z: number, d: number): Vec3 | undefined;
