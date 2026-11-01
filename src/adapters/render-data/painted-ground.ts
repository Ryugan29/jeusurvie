// Textures « peintes à la main » du sol (ADR 0009, fantasy colorée), générées au démarrage : aucun fichier, aucun réseau.
// PUR et déterministe, sans Babylon. Quatre couches, chacune un motif qui se répète sans couture (tout est périodique) :
//   herbe : taches chaudes et froides, puis touches de pinceau (brins couchés, jaunes ou bleu-vert) ;
//   terre : taches, petites fissures et cailloux clairs à reflet sur le dessus, ombre portée dessous ;
//   roche : blocs à facettes (une pente de lumière par bloc), fissures sombres, arête éclairée en haut de chaque bloc ;
//   neige : ombres bleutées, rides de vent, paillettes.
// Ce sont des FACTEURS RGB autour de 1 (moyenne 1 par canal), multipliés aux couleurs de sommets (palette) : la teinte
// d'ensemble reste celle de la palette, la texture n'apporte que la matière. Un octet ne dépasse pas 1, donc la texture
// stocke facteur / PAINT_GAIN et le matériau a pour couleur diffuse PAINT_GAIN (qui rend le facteur exact).
import { hash2 } from '../../core/shared/hash';
import { smoothstep } from '../../core/shared/math';
import type { Rgb } from './palette';

export type GroundLayer = 'grass' | 'soil' | 'rock' | 'snow';
export const GROUND_LAYERS: readonly GroundLayer[] = ['grass', 'soil', 'rock', 'snow'];
/** Côté (m) du motif de chaque couche dans le monde. */
export const LAYER_TILE_M: Readonly<Record<GroundLayer, number>> = { grass: 4, soil: 3, rock: 8, snow: 6 };

export const PAINT_MIN = 0.45;
export const PAINT_MAX = 1.5;
/** Couleur diffuse (gris) du matériau du sol : l'octet 255 de la texture vaut alors PAINT_MAX. */
export const PAINT_GAIN = PAINT_MAX;

/** Graine fixe : les mêmes textures à chaque lancement (captures et comparaisons reproductibles). */
const SEED = 0x9a17;
/** Les tailles en pixels ci-dessous sont données pour une texture de 512 px et suivent la taille demandée. */
const REFERENCE_SIZE = 512;

const UNIT = 1 / 65535;
const low = (h: number): number => (h & 0xffff) * UNIT;
const high = (h: number): number => (h >>> 16) * UNIT;
const wrap = (i: number, size: number): number => ((i % size) + size) % size;

/** Toile : décalages RGB autour de 0 (le facteur final vaut 1 + décalage). */
class Canvas {
  readonly px: Float32Array;
  readonly scale: number;
  constructor(readonly size: number) {
    this.px = new Float32Array(size * size * 3);
    this.scale = size / REFERENCE_SIZE;
  }

  /** Ajoute un bruit périodique (`cells` mailles par côté) pondéré par canal : `amount` = décalage RGB pour un bruit de 1. */
  noise(cells: number, salt: number, amount: Rgb): void {
    const n = periodicNoise(this.size, cells, salt);
    for (let i = 0; i < n.length; i++) for (let c = 0; c < 3; c++) this.px[i * 3 + c] = this.px[i * 3 + c]! + n[i]! * amount[c]!;
  }

  /** Grain par pixel, gris, d'amplitude ± `amount`. */
  grain(salt: number, amount: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = amount * (2 * low(hash2(SEED, x, y, salt)) - 1);
        for (let c = 0; c < 3; c++) this.px[(y * this.size + x) * 3 + c] = this.px[(y * this.size + x) * 3 + c]! + v;
      }
    }
  }

  /** Peint (par-dessus, pas en addition) vers la couleur `target` avec l'opacité `a` ∈ [0, 1]. */
  paint(x: number, y: number, target: Rgb, a: number): void {
    const i = (wrap(y, this.size) * this.size + wrap(x, this.size)) * 3;
    for (let c = 0; c < 3; c++) this.px[i + c] = this.px[i + c]! + (target[c]! - this.px[i + c]!) * a;
  }

  /** Touche de pinceau : trait épais, fondu sur les bords et aux deux bouts, qui sort d'un bord et revient par l'autre. */
  stroke(x0: number, y0: number, angle: number, length: number, width: number, target: Rgb, opacity: number): void {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const steps = Math.max(2, Math.ceil(length * 1.5));
    const half = Math.max(0.5, width / 2);
    const reach = Math.ceil(half);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const taper = 1 - (2 * t - 1) * (2 * t - 1);
      const cx = x0 + dx * length * t, cy = y0 + dy * length * t;
      for (let o = -reach; o <= reach; o++) {
        const edge = 1 - Math.abs(o) / (half + 0.5);
        if (edge <= 0) continue;
        // Un pixel peut être peint par deux pas voisins : l'opacité par pas reste basse pour un trait régulier.
        this.paint(Math.round(cx - dy * o), Math.round(cy + dx * o), target, Math.min(1, opacity * taper * edge * 0.8));
      }
    }
  }

  /** Facteurs finaux : 1 + décalage, bornés, recentrés pour que chaque canal ait une moyenne de 1. */
  factors(): Float32Array {
    const out = new Float32Array(this.px.length);
    const count = this.size * this.size;
    for (let c = 0; c < 3; c++) {
      let shift = 0;
      for (let pass = 0; pass < 6; pass++) {
        let sum = 0;
        for (let i = 0; i < count; i++) {
          const v = Math.min(PAINT_MAX, Math.max(PAINT_MIN, 1 + this.px[i * 3 + c]! + shift));
          out[i * 3 + c] = v;
          sum += v;
        }
        shift += 1 - sum / count;
      }
    }
    return out;
  }
}

/** Bruit de valeur périodique dans [−1, 1] (`cells` × `cells` mailles sur le côté, sans couture), lissé. */
function periodicNoise(size: number, cells: number, salt: number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) lattice[j * cells + i] = 2 * low(hash2(SEED, i, j, salt)) - 1;
  const at = (i: number, j: number): number => lattice[(j % cells) * cells + (i % cells)]!;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells, iy = Math.floor(fy), ty = smoothstep(0, 1, fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, ix = Math.floor(fx), tx = smoothstep(0, 1, fx - ix);
      const top = at(ix, iy) + tx * (at(ix + 1, iy) - at(ix, iy));
      const bottom = at(ix, iy + 1) + tx * (at(ix + 1, iy + 1) - at(ix, iy + 1));
      out[y * size + x] = top + ty * (bottom - top);
    }
  }
  return out;
}

// --- Herbe ---------------------------------------------------------------------------------------------------------
const GRASS_STROKES = {
  pixelsPerStroke: 50,
  length: { min: 8, span: 14 },
  width: { min: 1.4, span: 1.4 },
  /** Les brins penchent tous à peu près du même côté (± 0,5 rad) : effet de pinceau, pas de bruit. */
  lean: 0.9,
  spread: 0.5,
  light: [0.26, 0.22, -0.14] as Rgb,
  dark: [-0.32, -0.2, 0.04] as Rgb,
  gold: [0.16, 0.08, -0.22] as Rgb,
};

function paintGrass(size: number): Float32Array {
  const k = new Canvas(size);
  k.noise(4, 11, [0.12, 0.04, -0.16]); // grandes taches chaudes / froides
  k.noise(12, 12, [0.12, 0.12, 0.1]);
  k.noise(48, 13, [0.03, 0.03, 0.03]);
  const s = GRASS_STROKES;
  const count = Math.round((size * size) / s.pixelsPerStroke);
  for (let i = 0; i < count; i++) {
    const a = hash2(SEED, i, 0, 14), b = hash2(SEED, i, 1, 14), c = hash2(SEED, i, 2, 14);
    const kind = c & 7;
    const target = kind < 3 ? s.light : kind < 6 ? s.dark : s.gold;
    k.stroke(
      low(a) * size,
      high(a) * size,
      s.lean + s.spread * (2 * low(b) - 1),
      (s.length.min + s.length.span * high(b)) * k.scale,
      (s.width.min + s.width.span * low(c >>> 3)) * k.scale,
      target,
      0.75 + 0.25 * high(c),
    );
  }
  return k.factors();
}

// --- Terre ---------------------------------------------------------------------------------------------------------
const PEBBLES = {
  pixelsPerPebble: 2600,
  /** Rayon : surtout des petits cailloux, quelques gros (tirage au carré). */
  radius: { min: 2.5, span: 10 },
  fill: [0.2, 0.22, 0.28] as Rgb, // plus clairs et moins bruns que la terre
  highlight: [0.44, 0.44, 0.42] as Rgb,
  shadow: [-0.38, -0.38, -0.32] as Rgb,
};

function paintSoil(size: number): Float32Array {
  const k = new Canvas(size);
  k.noise(5, 21, [0.14, 0.11, 0.07]); // terre plus sèche / plus humide
  k.noise(20, 22, [0.1, 0.1, 0.09]);
  k.grain(23, 0.05);
  const cracks = Math.round((size * size) / 2500);
  for (let i = 0; i < cracks; i++) {
    const a = hash2(SEED, i, 0, 24), b = hash2(SEED, i, 1, 24);
    k.stroke(low(a) * size, high(a) * size, low(b) * Math.PI * 2, (6 + 10 * high(b)) * k.scale, Math.max(1, k.scale), [-0.3, -0.3, -0.25], 0.9);
  }
  const p = PEBBLES;
  const count = Math.max(4, Math.round((size * size) / p.pixelsPerPebble));
  for (let i = 0; i < count; i++) {
    const a = hash2(SEED, i, 0, 25), b = hash2(SEED, i, 1, 25), c = hash2(SEED, i, 2, 25);
    const u = low(b);
    const rx = Math.max(2.5, (p.radius.min + p.radius.span * u * u) * k.scale);
    pebble(k, low(a) * size, high(a) * size, rx, rx * (0.55 + 0.35 * high(b)), c);
  }
  return k.factors();
}

/**
 * Caillou au contour irrégulier (rayon modulé par deux ondulations tirées au hasard) : ombre portée en bas à droite,
 * corps clair, reflet sur le haut (lumière « peinte » venant du haut).
 */
function pebble(k: Canvas, cx: number, cy: number, rx: number, ry: number, h: number): void {
  const p = PEBBLES;
  const off = Math.max(1, rx * 0.35);
  const reach = Math.ceil(Math.max(rx, ry) * 1.3 + off + 1);
  const phase3 = low(h) * Math.PI * 2, phase5 = high(h) * Math.PI * 2;
  const outline = (x: number, y: number): number => {
    const a = Math.atan2(y, x);
    return Math.hypot(x / rx, y / ry) / (1 + 0.16 * Math.sin(3 * a + phase3) + 0.08 * Math.sin(5 * a + phase5));
  };
  for (let y = -reach; y <= reach; y++) {
    for (let x = -reach; x <= reach; x++) {
      const d = outline(x, y);
      const px = Math.round(cx + x), py = Math.round(cy + y);
      if (d < 1) {
        const top = smoothstep(0.1, -0.6, y / ry) * smoothstep(0.2, 0.75, d);
        k.paint(px, py, [p.fill[0] + (p.highlight[0] - p.fill[0]) * top, p.fill[1] + (p.highlight[1] - p.fill[1]) * top, p.fill[2] + (p.highlight[2] - p.fill[2]) * top], 0.95);
      } else if (outline(x - off, y - off) < 1) {
        k.paint(px, py, p.shadow, 0.7);
      }
    }
  }
}

// --- Roche ---------------------------------------------------------------------------------------------------------
const ROCK = {
  /** Blocs par côté du motif : plus larges que hauts (strates), rangées décalées d'un demi-bloc. Rangées en nombre pair. */
  columns: 4,
  rows: 8,
  /** Déformation des contours (px à 512) : des blocs naturels, pas des pavés. */
  warpPx: 16,
  crevice: { widthPx: 3, minPx: 1.5, offset: [-0.55, -0.55, -0.5] as Rgb },
  bevel: { widthPx: 5, minPx: 2, light: [0.36, 0.34, 0.3] as Rgb, dark: -0.16 },
  facet: 0.18,
  tint: 0.09,
};

function paintRock(size: number): Float32Array {
  const k = new Canvas(size);
  k.noise(3, 30, [0.07, 0.03, -0.05]); // grandes zones plus chaudes / plus froides
  k.noise(24, 31, [0.05, 0.05, 0.05]);
  k.grain(32, 0.03);
  const r = ROCK;
  const cellW = size / r.columns, cellH = size / r.rows;
  // Un point par maille, décalé au hasard ; l'ensemble se répète (les mailles voisines bouclent).
  const site = (i: number, j: number): { x: number; y: number; id: number } => {
    const wi = wrap(i, r.columns), wj = wrap(j, r.rows);
    const h = hash2(SEED, wi, wj, 33);
    const stagger = wj % 2 === 0 ? 0 : 0.5;
    return { x: (i + stagger + 0.2 + 0.6 * low(h)) * cellW, y: (j + 0.25 + 0.5 * high(h)) * cellH, id: wj * r.columns + wi };
  };
  const warpX = periodicNoise(size, 6, 36), warpY = periodicNoise(size, 6, 37);
  const width = periodicNoise(size, 10, 38), open = periodicNoise(size, 7, 39);
  const warp = r.warpPx * k.scale;
  const crevice = Math.max(r.crevice.minPx, r.crevice.widthPx * k.scale);
  const bevel = Math.max(r.bevel.minPx, r.bevel.widthPx * k.scale);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = y * size + x;
      const wx = x + warp * warpX[n]!, wy = y + warp * warpY[n]!;
      const ci = Math.floor(wx / cellW), cj = Math.floor(wy / cellH);
      let d1 = Infinity, d2 = Infinity, best = site(ci, cj);
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 2; i <= ci + 2; i++) {
          const s = site(i, j);
          const d = Math.hypot(wx - s.x, wy - s.y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = s;
          } else if (d < d2) d2 = d;
        }
      }
      const edge = (d2 - d1) / 2; // ≈ distance (px) au bord du bloc
      const h = hash2(SEED, best.id, 0, 34);
      const tint = r.tint * (2 * low(h) - 1);
      // Facette : chaque bloc est un plan incliné, plus clair d'un côté (direction tirée au hasard, plutôt vers le haut).
      const angle = -Math.PI / 2 + (high(h) - 0.5) * 2.2;
      const facet = (r.facet * ((wx - best.x) * Math.cos(angle) + (wy - best.y) * Math.sin(angle))) / cellH;
      const i3 = n * 3;
      for (let c = 0; c < 3; c++) k.px[i3 + c] = k.px[i3 + c]! + tint + facet + (c === 0 ? tint * 0.3 : c === 2 ? -tint * 0.3 : 0);
      // Fissures de largeur variable, refermées par endroits (blocs soudés) : pas un quadrillage.
      const w = crevice * (0.55 + 0.9 * (0.5 + 0.5 * width[n]!));
      const opening = smoothstep(-0.55, -0.15, open[n]!);
      if (edge < w) {
        k.paint(x, y, r.crevice.offset, opening * smoothstep(w, w * 0.3, edge));
      } else if (edge < w + bevel) {
        const t = opening * smoothstep(w + bevel, w, edge);
        if (wy < best.y) k.paint(x, y, r.bevel.light, 0.85 * t); // arête du haut : éclairée
        else for (let c = 0; c < 3; c++) k.px[i3 + c] = k.px[i3 + c]! + r.bevel.dark * t; // arête du bas : dans l'ombre
      }
    }
  }
  // Quelques fêlures dans les blocs.
  const cracks = Math.round((size * size) / 6000);
  for (let i = 0; i < cracks; i++) {
    const a = hash2(SEED, i, 0, 35), b = hash2(SEED, i, 1, 35);
    k.stroke(low(a) * size, high(a) * size, low(b) * Math.PI * 2, (10 + 18 * high(b)) * k.scale, Math.max(1, 1.5 * k.scale), r.crevice.offset, 0.8);
  }
  return k.factors();
}

// --- Neige ---------------------------------------------------------------------------------------------------------
function paintSnow(size: number): Float32Array {
  const k = new Canvas(size);
  k.noise(4, 41, [-0.1, -0.05, 0.05]); // creux bleutés
  k.noise(14, 42, [0.06, 0.06, 0.04]);
  // Rides de vent : sinus le long d'une direction à fréquences entières (périodique), déformé par un bruit (périodique aussi).
  const warp = periodicNoise(size, 6, 43);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const ripple = Math.sin(2 * Math.PI * ((3 * x) / size + (7 * y) / size) + 2.5 * warp[i]!);
      k.px[i * 3] = k.px[i * 3]! + 0.05 * ripple;
      k.px[i * 3 + 1] = k.px[i * 3 + 1]! + 0.045 * ripple;
      k.px[i * 3 + 2] = k.px[i * 3 + 2]! + 0.02 * ripple;
    }
  }
  const sparkles = Math.round((size * size) / 900);
  for (let i = 0; i < sparkles; i++) {
    const a = hash2(SEED, i, 0, 44);
    k.paint(Math.floor(low(a) * size), Math.floor(high(a) * size), [0.25, 0.25, 0.25], 1);
  }
  return k.factors();
}

const PAINTERS: Readonly<Record<GroundLayer, (size: number) => Float32Array>> = {
  grass: paintGrass,
  soil: paintSoil,
  rock: paintRock,
  snow: paintSnow,
};

/** Facteurs RGB (size × size × 3, ligne par ligne) dans [PAINT_MIN, PAINT_MAX], de moyenne 1 par canal. */
export function paintedLayerFactors(layer: GroundLayer, size: number): Float32Array {
  return PAINTERS[layer](size);
}

/** Octets RGBA 8 bits de la texture (opaque) : octet = facteur / PAINT_GAIN × 255. */
export function paintedLayerRgba(layer: GroundLayer, size: number): Uint8Array {
  const f = paintedLayerFactors(layer, size);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round((f[i * 3 + c]! / PAINT_GAIN) * 255);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
