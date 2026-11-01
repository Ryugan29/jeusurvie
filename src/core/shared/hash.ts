// Hash entier déterministe : seulement Math.imul, ^ et >>> (résultat identique sur tous les moteurs JS).
// Les entrées sont ramenées à des entiers 32 bits ; la sortie est un entier non signé 32 bits.

/** Mélange final (avalanche) d'un entier 32 bits — constantes du « lowbias32 » de C. Wellons. */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h;
}

/**
 * Hash de (seed, x, z, salt) → uint32. Arguments ramenés à des entiers 32 bits (la graine du monde est un uint32).
 * Chaque argument est mélangé à son tour : l'ordre compte,
 * donc (x, z) et (z, x) donnent des valeurs différentes. `salt` sépare les usages (octaves, ressources…).
 */
export function hash2(seed: number, x: number, z: number, salt: number): number {
  // Constante de départ (partie fractionnaire du nombre d'or) : évite que des entrées nulles donnent 0.
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(x | 0, 0x85ebca6b));
  h = mix32(h ^ Math.imul(z | 0, 0xc2b2ae35));
  h = mix32(h ^ Math.imul(salt | 0, 0x27d4eb2f));
  return h >>> 0;
}
