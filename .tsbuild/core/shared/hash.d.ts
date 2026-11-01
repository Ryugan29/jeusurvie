/**
 * Hash de (seed, x, z, salt) → uint32. Arguments ramenés à des entiers 32 bits (la graine du monde est un uint32).
 * Chaque argument est mélangé à son tour : l'ordre compte,
 * donc (x, z) et (z, x) donnent des valeurs différentes. `salt` sépare les usages (octaves, ressources…).
 */
export declare function hash2(seed: number, x: number, z: number, salt: number): number;
