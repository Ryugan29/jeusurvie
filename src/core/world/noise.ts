// Bruit de gradient 2D maison (type Perlin) — ADR 0004.
// Uniquement + - * Math.floor et le hash entier : résultat bit à bit identique sur tous les moteurs JS.
import { hash2 } from '../shared/hash';

/** Interpolation quintique 6t⁵ − 15t⁴ + 10t³ (dérivées 1re et 2e nulles aux nœuds : pas de facettes). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Produit scalaire entre un des 8 gradients (±1,±1), (±1,0), (0,±1) — choisi par le hash — et (dx, dz). */
function gradDot(seed: number, ix: number, iz: number, salt: number, dx: number, dz: number): number {
  switch (hash2(seed, ix, iz, salt) & 7) {
    case 0: return dx + dz;
    case 1: return -dx + dz;
    case 2: return dx - dz;
    case 3: return -dx - dz;
    case 4: return dx;
    case 5: return -dx;
    case 6: return dz;
    default: return -dz;
  }
}

/**
 * Bruit de gradient 2D en (x, z) ; vaut 0 sur les nœuds entiers, reste dans [-1, 1].
 * `salt` donne un bruit indépendant pour la même graine (octaves, cartes différentes).
 */
export function gradientNoise2(seed: number, x: number, z: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const n00 = gradDot(seed, ix, iz, salt, fx, fz);
  const n10 = gradDot(seed, ix + 1, iz, salt, fx - 1, fz);
  const n01 = gradDot(seed, ix, iz + 1, salt, fx, fz - 1);
  const n11 = gradDot(seed, ix + 1, iz + 1, salt, fx - 1, fz - 1);
  const u = fade(fx), v = fade(fz);
  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  // « + 0 » transforme un éventuel -0 en 0 : une même hauteur a une seule représentation.
  return nx0 + v * (nx1 - nx0) + 0;
}

/** Composantes (x, z) des 8 gradients, dans l'ordre des cas de gradDot. */
const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0] as const;
const GRAD_Z = [1, 1, -1, -1, 0, 0, 1, -1] as const;

/** Dérivée de l'interpolation quintique : 30t²(t − 1)². */
function fadeDerivative(t: number): number {
  const s = t * (t - 1);
  return 30 * s * s;
}

export interface NoiseSample {
  readonly value: number;
  /** Dérivées partielles de la valeur selon x et z (pente du bruit). */
  readonly dx: number;
  readonly dz: number;
}

/**
 * Bruit de gradient avec ses dérivées analytiques (exactes, opérations de base seulement).
 * `value` est identique bit à bit à gradientNoise2 (même calcul).
 */
export function gradientNoise2D(seed: number, x: number, z: number, salt: number): NoiseSample {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const h00 = hash2(seed, ix, iz, salt) & 7, h10 = hash2(seed, ix + 1, iz, salt) & 7;
  const h01 = hash2(seed, ix, iz + 1, salt) & 7, h11 = hash2(seed, ix + 1, iz + 1, salt) & 7;
  const n00 = gradDot(seed, ix, iz, salt, fx, fz);
  const n10 = gradDot(seed, ix + 1, iz, salt, fx - 1, fz);
  const n01 = gradDot(seed, ix, iz + 1, salt, fx, fz - 1);
  const n11 = gradDot(seed, ix + 1, iz + 1, salt, fx - 1, fz - 1);
  const u = fade(fx), v = fade(fz), du = fadeDerivative(fx), dv = fadeDerivative(fz);
  const nx0 = n00 + u * (n10 - n00);
  const nx1 = n01 + u * (n11 - n01);
  // Dérivées des deux interpolations en x (le long de z = iz et z = iz + 1).
  const nx0dx = GRAD_X[h00]! + du * (n10 - n00) + u * (GRAD_X[h10]! - GRAD_X[h00]!);
  const nx0dz = GRAD_Z[h00]! + u * (GRAD_Z[h10]! - GRAD_Z[h00]!);
  const nx1dx = GRAD_X[h01]! + du * (n11 - n01) + u * (GRAD_X[h11]! - GRAD_X[h01]!);
  const nx1dz = GRAD_Z[h01]! + u * (GRAD_Z[h11]! - GRAD_Z[h01]!);
  return {
    value: nx0 + v * (nx1 - nx0) + 0,
    dx: nx0dx + v * (nx1dx - nx0dx) + 0,
    dz: nx0dz + dv * (nx1 - nx0) + v * (nx1dz - nx0dz) + 0,
  };
}

export interface FbmParams {
  /** Nombre de couches de bruit superposées : entier de 1 à MAX_OCTAVES. */
  readonly octaves: number;
  /** Multiplicateur de fréquence d'une octave à la suivante (souvent 2). */
  readonly lacunarity: number;
  /** Multiplicateur d'amplitude d'une octave à la suivante (souvent 0,5). */
  readonly gain: number;
}

/** Au-delà, les détails ajoutés sont plus fins que la précision utile (et le coût croît pour rien). */
export const MAX_OCTAVES = 64;

/** Sel réservé au tirage des décalages d'octave. */
const OFFSET_SALT = 0x0ff5e7;
/** 2⁻¹⁷ : les décalages sont des multiples exacts de cette valeur (aucun arrondi). */
const OFFSET_UNIT = 1 / 131072;

/**
 * fBm : somme d'octaves de bruit de gradient, normalisée par la somme des amplitudes → reste dans [-1, 1].
 * L'octave o utilise le sel `salt * 256 + o` : deux sels différents donnent des bruits indépendants.
 * Chaque octave est décalée d'une fraction de maille (jamais nulle) tirée du hash : sans cela, les nœuds de
 * toutes les octaves coïncident et le relief vaut exactement 0 sur une grille régulière, quelle que soit la graine.
 * @throws RangeError si `params.octaves` n'est pas un entier de 1 à MAX_OCTAVES (erreur de programmation :
 *   les paramètres viennent de params.ts, jamais du joueur).
 */
export function fbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number {
  checkOctaves(params.octaves);
  let sum = 0, amplitude = 1, frequency = 1, norm = 0;
  for (let o = 0; o < params.octaves; o++) {
    sum += amplitude * octaveNoise(seed, x, z, o, frequency, salt);
    norm += amplitude;
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }
  return sum / norm;
}

/**
 * Bruit à crêtes (« ridged ») : chaque octave vaut (1 − |n|)², maximale là où le bruit s'annule → lignes de crêtes
 * fines et vallées larges, comme des montagnes. Moyenne pondérée des octaves → reste dans [0, 1].
 * Mêmes octaves (fréquences, décalages, sels) que fbm2.
 * @throws RangeError comme fbm2.
 */
export function ridgedFbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number {
  checkOctaves(params.octaves);
  let sum = 0, amplitude = 1, frequency = 1, norm = 0;
  for (let o = 0; o < params.octaves; o++) {
    const ridge = 1 - Math.abs(octaveNoise(seed, x, z, o, frequency, salt));
    sum += amplitude * ridge * ridge;
    norm += amplitude;
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }
  return sum / norm;
}

function checkOctaves(octaves: number): void {
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > MAX_OCTAVES) {
    throw new RangeError(`octaves doit être un entier de 1 à ${MAX_OCTAVES} (reçu ${octaves})`);
  }
}

/** Octave o : bruit de gradient à la fréquence donnée, décalé et salé propre à l'octave. */
function octaveNoise(seed: number, x: number, z: number, o: number, frequency: number, salt: number): number {
  const octaveSalt = Math.imul(salt, 256) + o;
  const h = hash2(seed, o, octaveSalt, OFFSET_SALT);
  const ox = ((h & 0xffff) * 2 + 1) * OFFSET_UNIT;
  const oz = ((h >>> 16) * 2 + 1) * OFFSET_UNIT;
  return gradientNoise2(seed, x * frequency + ox, z * frequency + oz, octaveSalt);
}

/**
 * Crêtes « multifractales » à poids (Musgrave) : chaque octave vaut (1 − |n|)², multipliée par un poids tiré de
 * l'octave précédente. Sur les crêtes le détail s'accumule (arêtes, aiguilles) ; dans les creux il s'éteint
 * (versants et vallées lisses). Normalisé → [0, 1]. Mêmes octaves (fréquences, décalages, sels) que fbm2.
 * @throws RangeError comme fbm2.
 */
export function ridgedMultifractal2(seed: number, x: number, z: number, params: FbmParams, salt: number): number {
  checkOctaves(params.octaves);
  let sum = 0, amplitude = 1, frequency = 1, norm = 0, weight = 1;
  for (let o = 0; o < params.octaves; o++) {
    const ridge = 1 - Math.abs(octaveNoise(seed, x, z, o, frequency, salt));
    const signal = ridge * ridge * weight;
    sum += amplitude * signal;
    norm += amplitude;
    // Le poids de l'octave suivante est le signal atteint ici : le détail ne dépasse jamais la crête qui le porte.
    weight = signal;
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }
  return sum / norm;
}

/**
 * fBm « érodé » : chaque octave est atténuée par la pente accumulée des octaves précédentes (et la sienne),
 * n / (1 + |Σ∇n|²) — peu de détail sur les pentes fortes, plus sur les replats, comme un relief usé par l'eau.
 * Normalisé → [-1, 1]. Mêmes octaves que fbm2.
 * @throws RangeError comme fbm2.
 */
export function erodedFbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number {
  checkOctaves(params.octaves);
  let sum = 0, amplitude = 1, frequency = 1, norm = 0, slopeX = 0, slopeZ = 0;
  for (let o = 0; o < params.octaves; o++) {
    const n = octaveNoiseD(seed, x, z, o, frequency, salt);
    slopeX += n.dx;
    slopeZ += n.dz;
    sum += (amplitude * n.value) / (1 + slopeX * slopeX + slopeZ * slopeZ);
    norm += amplitude;
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }
  return sum / norm + 0;
}

/** Comme octaveNoise, avec les dérivées (par rapport à la coordonnée de l'octave). */
function octaveNoiseD(seed: number, x: number, z: number, o: number, frequency: number, salt: number): NoiseSample {
  const octaveSalt = Math.imul(salt, 256) + o;
  const h = hash2(seed, o, octaveSalt, OFFSET_SALT);
  const ox = ((h & 0xffff) * 2 + 1) * OFFSET_UNIT;
  const oz = ((h >>> 16) * 2 + 1) * OFFSET_UNIT;
  return gradientNoise2D(seed, x * frequency + ox, z * frequency + oz, octaveSalt);
}
