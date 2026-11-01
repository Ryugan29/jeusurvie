// Textures des matières du sol générées SUR LA CARTE GRAPHIQUE au démarrage (et à chaque changement de profil graphique) :
// aucun fichier, aucun réseau, et la résolution suit le profil (256 px en LOW, 2048 px en ULTRA) sans coût notable — la même
// texture calculée par le processeur prendrait des secondes en 2048 px.
// Pour chaque couche (render-data/ground-materials) : deux textures qui se répètent sans couture (tout le bruit est périodique) :
//   - « couleur » : RGB = facteur d'albédo codé (encodeAlbedoFactor), A = hauteur (0 à 1) ;
//   - « matière » : RG = normale (x, y) en espace de la texture, B = rugosité, A = occlusion de cavité.
// La normale est tirée de la hauteur par différences finies au pas du texel : nette en 2048 px, adoucie en 256 px.
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import '@babylonjs/core/Materials/Textures/Procedurals/proceduralTextureSceneComponent';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import { ALBEDO_FACTOR_MAX, SURFACE_LAYERS, SURFACE_LAYER_SPECS, normalSlopeScale, type SurfaceLayer } from '../render-data/ground-materials';

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const v3 = (c: readonly [number, number, number]): string => `vec3(${c.map(f).join(', ')})`;

/** Bibliothèque GLSL commune : hachages sans sinus (stables d'une carte à l'autre), bruit de gradient et Voronoï PÉRIODIQUES. */
const LIBRARY = `
precision highp float;
varying vec2 vUV;
uniform float texel;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 h32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

// Bruit de gradient de période P mailles sur la tuile [0, 1) (P entier) : ~[-1, 1].
float gnoise(vec2 uv, float P, float seed) {
  vec2 p = uv * P;
  vec2 i = floor(p);
  vec2 fr = p - i;
  vec2 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  vec2 s = vec2(seed * 17.31, seed * 9.73);
  vec2 g00 = h22(mod(i, P) + s) * 2.0 - 1.0;
  vec2 g10 = h22(mod(i + vec2(1.0, 0.0), P) + s) * 2.0 - 1.0;
  vec2 g01 = h22(mod(i + vec2(0.0, 1.0), P) + s) * 2.0 - 1.0;
  vec2 g11 = h22(mod(i + vec2(1.0, 1.0), P) + s) * 2.0 - 1.0;
  float n00 = dot(g00, fr), n10 = dot(g10, fr - vec2(1.0, 0.0)), n01 = dot(g01, fr - vec2(0.0, 1.0)), n11 = dot(g11, fr - vec2(1.0, 1.0));
  return 1.6 * mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
// Somme fractale (octaves de période doublée : reste périodique).
float fbm4(vec2 uv, float P, float seed) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gnoise(uv, P, seed + float(i) * 3.7); P *= 2.0; a *= 0.5; }
  return s / 0.9375;
}
float fbm6(vec2 uv, float P, float seed) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * gnoise(uv, P, seed + float(i) * 3.7); P *= 2.0; a *= 0.5; }
  return s / 0.984375;
}
// Arêtes vives (roche) : 1 − |bruit|, au carré.
float ridged5(vec2 uv, float P, float seed) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { float n = 1.0 - abs(gnoise(uv, P, seed + float(i) * 5.1)); s += a * n * n; P *= 2.0; a *= 0.5; }
  return s / 0.96875;
}
// Voronoï périodique : x = distance au point le plus proche, y = au second, z = hachage de sa maille ; rel = vers ce point.
vec3 voronoi(vec2 uv, float P, float seed, float jitter, out vec2 rel) {
  vec2 p = uv * P;
  vec2 c = floor(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  rel = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = c + vec2(float(i), float(j));
      vec2 w = mod(cell, P) + vec2(seed * 7.13, seed * 3.31);
      vec2 o = cell + 0.5 + (h22(w) - 0.5) * jitter;
      vec2 d = o - p;
      float l = length(d);
      if (l < d1) { d2 = d1; d1 = l; id = h12(w + 0.5); rel = d; } else if (l < d2) { d2 = l; }
    }
  }
  return vec3(d1, d2, id);
}

struct Matter { vec3 albedo; float height; float rough; float ao; };
`;

/**
 * Herbe couchée vue de près : chaume et terre sombre entre les brins, brins couchés en tous sens (verts, quelques secs),
 * pointes plus claires, plaques plus sèches. Chaque maille porte deux brins qui peuvent déborder sur ses voisines.
 */
const GRASS = `
Matter layer(vec2 uv) {
  float n1 = fbm4(uv, 4.0, 1.0), n2 = fbm4(uv, 24.0, 2.0);
  vec3 col = mix(vec3(0.075, 0.056, 0.038), vec3(0.15, 0.12, 0.065), smoothstep(-0.3, 0.5, n2));
  float h = 0.12 + 0.08 * n2;
  float rough = 0.95;
  float dryPatch = smoothstep(0.05, 0.55, n1);
  float P = 112.0;
  vec2 p = uv * P;
  vec2 ci = floor(p);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ci + vec2(float(i), float(j));
      vec2 cw = mod(c, P);
      for (int k = 0; k < 3; k++) {
        vec3 r = h32(cw * 1.37 + float(k) * 19.1 + 3.0);
        vec3 r2 = h32(cw * 2.11 + float(k) * 7.3 + 11.0);
        vec2 root = c + r.xy;
        float ang = r.z * 6.2831853;
        vec2 dir = vec2(cos(ang), sin(ang));
        float len = 1.3 + 1.6 * r2.x;
        float wid = 0.09 + 0.07 * r2.y;
        vec2 d = p - root;
        float t = dot(d, dir);
        if (t < 0.0 || t > len) continue;
        float s = abs(dot(d, vec2(-dir.y, dir.x)));
        float tt = t / len;
        float w = wid * (1.0 - 0.85 * tt * tt);
        if (s > w) continue;
        float a = 1.0 - smoothstep(w * 0.55, w, s);
        float bladeH = 0.3 + 0.6 * r2.z + 0.08 * (1.0 - s / w);
        if (bladeH <= h) continue;
        float dry = step(0.8 - 0.35 * dryPatch, h12(cw + float(k) * 3.1 + 41.0));
        vec3 green = mix(vec3(0.05, 0.085, 0.022), vec3(0.085, 0.13, 0.034), r2.x);
        vec3 straw = mix(vec3(0.19, 0.16, 0.075), vec3(0.27, 0.23, 0.12), r2.y);
        vec3 bc = mix(green, straw, dry) * (0.78 + 0.34 * tt);
        col = mix(col, bc, a);
        h = mix(h, bladeH, a);
        rough = mix(rough, mix(0.62, 0.8, dry), a);
      }
    }
  }
  col *= 0.9 + 0.2 * smoothstep(-0.6, 0.6, n1);
  Matter m;
  m.albedo = col;
  m.height = clamp(h, 0.0, 1.0);
  m.rough = rough;
  m.ao = mix(0.5, 1.0, smoothstep(0.08, 0.6, h));
  return m;
}
`;

/** Terre : teinte qui varie (plus humide par plaques), grain fin, fissures de terre sèche, cailloux arrondis et gravier. */
const SOIL = `
float pebbles(vec2 uv, float P, float seed, float chance, float rMin, float rMax, inout vec3 col, inout float h, inout float rough, inout float ao) {
  vec2 rel;
  vec3 v = voronoi(uv, P, seed, 0.7, rel);
  if (v.z > chance) return 0.0;
  vec3 r = h32(vec2(v.z * 91.7, seed));
  float radius = mix(rMin, rMax, r.x);
  float ang = atan(rel.y, rel.x);
  float d = v.x / (radius * (1.0 + 0.14 * sin(3.0 * ang + r.y * 6.28) + 0.07 * sin(5.0 * ang + r.z * 6.28)));
  if (d >= 1.25) return 0.0;
  // Ombre de contact autour du caillou (il est posé, un peu enfoncé).
  ao *= mix(0.6, 1.0, smoothstep(0.95, 1.25, d));
  if (d >= 1.0) return 0.0;
  float dome = sqrt(max(0.0, 1.0 - d * d));
  vec3 stone = mix(vec3(0.16, 0.15, 0.135), vec3(0.3, 0.27, 0.22), r.y) * (0.85 + 0.3 * r.z);
  stone *= 0.85 + 0.25 * gnoise(uv, P * 8.0, seed + 2.0);
  float a = smoothstep(1.0, 0.9, d);
  col = mix(col, stone, a);
  h = mix(h, 0.55 + 0.4 * dome * mix(0.6, 1.0, r.x), a);
  rough = mix(rough, 0.6 + 0.15 * r.z, a);
  return a;
}
Matter layer(vec2 uv) {
  float n1 = fbm4(uv, 3.0, 5.0), n2 = fbm4(uv, 16.0, 6.0), n3 = gnoise(uv, 160.0, 7.0);
  vec3 col = vec3(0.13, 0.098, 0.07) * (0.86 + 0.22 * n1 + 0.14 * n2 + 0.07 * n3);
  float damp = smoothstep(0.05, 0.6, n1);
  col *= 1.0 - 0.28 * damp;
  float h = 0.32 + 0.12 * n2 + 0.05 * n3;
  float rough = mix(0.93, 0.8, damp);
  float ao = 1.0;
  vec2 rel;
  vec3 cr = voronoi(uv + 0.02 * vec2(n2, n1), 9.0, 8.0, 0.9, rel);
  float crack = (1.0 - smoothstep(0.0, 0.045, cr.y - cr.x)) * smoothstep(0.0, 0.35, -n1);
  h -= 0.16 * crack;
  col *= 1.0 - 0.5 * crack;
  ao *= 1.0 - 0.45 * crack;
  pebbles(uv, 18.0, 10.0, 0.42, 0.2, 0.42, col, h, rough, ao);
  pebbles(uv, 56.0, 12.0, 0.32, 0.18, 0.34, col, h, rough, ao);
  pebbles(uv, 150.0, 14.0, 0.25, 0.2, 0.4, col, h, rough, ao);
  Matter m;
  m.albedo = col;
  m.height = clamp(h, 0.0, 1.0);
  m.rough = rough;
  m.ao = ao * mix(0.75, 1.0, smoothstep(0.15, 0.5, h));
  return m;
}
`;

/**
 * Roche : surface à arêtes (bruit « ridged »), grandes fractures (Voronoï) qui découpent des blocs inclinés, strates
 * horizontales légères (sur une falaise, le haut de la texture est le haut du monde), traînées ferreuses et lichens.
 */
const ROCK = `
Matter layer(vec2 uv) {
  vec2 warp = vec2(fbm4(uv, 3.0, 20.0), fbm4(uv, 3.0, 21.0));
  vec2 q = uv + 0.035 * warp;
  float ridge = ridged5(q, 5.0, 22.0);
  float detail = fbm4(q, 40.0, 26.0);
  vec2 relBig, relFine;
  vec3 v = voronoi(q, 4.0, 23.0, 0.85, relBig);
  float crack = 1.0 - smoothstep(0.0, 0.04, v.y - v.x);
  vec3 vf = voronoi(q, 14.0, 27.0, 0.9, relFine);
  float fine = 1.0 - smoothstep(0.0, 0.025, vf.y - vf.x);
  // Chaque bloc est un plan un peu incliné : ses faces prennent la lumière différemment.
  vec3 tilt = h32(vec2(v.z * 37.1, 4.0)) - 0.5;
  float facet = dot(relBig, tilt.xy) * 0.35;
  float strata = sin((q.y * 18.0 + 0.6 * fbm4(q, 4.0, 24.0)) * 6.2831853);
  float h = 0.42 + 0.28 * ridge + 0.05 * strata + facet + 0.06 * detail - 0.32 * crack - 0.08 * fine;
  float tone = fbm4(q, 6.0, 28.0);
  vec3 col = mix(vec3(0.15, 0.145, 0.14), vec3(0.25, 0.235, 0.215), smoothstep(-0.5, 0.6, tone));
  col *= 0.88 + 0.22 * ridge + 0.06 * detail;
  float iron = smoothstep(0.25, 0.7, fbm4(q, 5.0, 29.0)) * 0.6;
  col = mix(col, vec3(0.24, 0.16, 0.1), iron * 0.5);
  float lichenMask = smoothstep(0.32, 0.55, fbm6(uv, 6.0, 25.0)) * smoothstep(0.35, 0.6, h) * (1.0 - crack);
  float lichenKind = step(0.0, gnoise(uv, 3.0, 31.0));
  vec3 lichen = mix(vec3(0.2, 0.2, 0.085), vec3(0.36, 0.36, 0.32), lichenKind) * (0.85 + 0.3 * gnoise(uv, 90.0, 32.0));
  col = mix(col, lichen, lichenMask * 0.85);
  col *= 1.0 - 0.6 * crack - 0.25 * fine;
  Matter m;
  m.albedo = col;
  m.height = clamp(h, 0.0, 1.0);
  m.rough = mix(0.78 + 0.1 * detail, 0.95, lichenMask);
  m.ao = (1.0 - 0.55 * crack - 0.2 * fine) * mix(0.6, 1.0, smoothstep(0.15, 0.6, h));
  return m;
}
`;

/** Neige : ondulations douces, rides de vent (fréquences entières : périodiques), creux bleutés, paillettes plus lisses. */
const SNOW = `
Matter layer(vec2 uv) {
  float n1 = fbm4(uv, 3.0, 40.0), n2 = fbm4(uv, 20.0, 41.0);
  float ripple = sin((uv.x * 4.0 + uv.y * 9.0 + 0.45 * fbm4(uv, 4.0, 42.0)) * 6.2831853);
  float h = 0.5 + 0.2 * n1 + 0.07 * ripple + 0.04 * n2;
  vec3 col = mix(vec3(0.72, 0.77, 0.86), vec3(0.83, 0.85, 0.88), smoothstep(0.25, 0.75, h));
  col *= 0.97 + 0.04 * n2;
  float sparkle = step(0.9965, h12(floor(uv * 1400.0) + 3.0));
  Matter m;
  m.albedo = col;
  m.height = clamp(h, 0.0, 1.0);
  m.rough = mix(0.58, 0.18, sparkle);
  m.ao = mix(0.82, 1.0, smoothstep(0.3, 0.7, h));
  return m;
}
`;

const LAYER_SOURCE: Readonly<Record<SurfaceLayer, string>> = { grass: GRASS, soil: SOIL, rock: ROCK, snow: SNOW };

/** Passe « couleur » : facteur d'albédo codé + hauteur. */
function colorMain(layer: SurfaceLayer): string {
  return `
void main(void) {
  Matter m = layer(vUV);
  vec3 factor = m.albedo / ${v3(SURFACE_LAYER_SPECS[layer].referenceAlbedo)};
  gl_FragColor = vec4(sqrt(clamp(factor / ${f(ALBEDO_FACTOR_MAX)}, 0.0, 1.0)), m.height);
}
`;
}

/** Passe « matière » : normale (différences finies au pas du texel), rugosité, cavité. */
function matterMain(): string {
  return `
uniform float slopeScale;
void main(void) {
  Matter m = layer(vUV);
  float hx = layer(vUV + vec2(texel, 0.0)).height;
  float hy = layer(vUV + vec2(0.0, texel)).height;
  vec3 n = normalize(vec3(-(hx - m.height) * slopeScale, -(hy - m.height) * slopeScale, 1.0));
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, m.rough, m.ao);
}
`;
}

export type GroundTextureKind = 'color' | 'matter';

/** Nom du shader (dans le magasin de Babylon) d'une passe d'une couche. */
export function groundShaderName(layer: SurfaceLayer, kind: GroundTextureKind): string {
  return `solMatiere_${layer}_${kind}`;
}

/** Source GLSL complète d'une passe (exportée pour les tests : structure, uniformes, périodicité). */
export function groundShaderSource(layer: SurfaceLayer, kind: GroundTextureKind): string {
  return LIBRARY + LAYER_SOURCE[layer] + (kind === 'color' ? colorMain(layer) : matterMain());
}

let registered = false;
function registerShaders(): void {
  if (registered) return;
  const store = ShaderStore.ShadersStore as Record<string, string>;
  for (const layer of SURFACE_LAYERS) {
    for (const kind of ['color', 'matter'] as const) store[`${groundShaderName(layer, kind)}PixelShader`] = groundShaderSource(layer, kind);
  }
  registered = true;
}

/** Les deux textures d'une couche. */
export interface GroundLayerTextures {
  readonly color: Texture;
  readonly matter: Texture;
}

export type GroundTextureSet = Readonly<Record<SurfaceLayer, GroundLayerTextures>>;

/**
 * Crée les huit textures (quatre couches × couleur et matière) à la taille demandée. Elles sont calculées une seule fois par la
 * carte graphique, au premier rendu où elles sont prêtes (refreshRate 0), puis gardées avec leurs mipmaps.
 */
export function createGroundTextures(scene: Scene, size: number, anisotropy: number): GroundTextureSet {
  registerShaders();
  const make = (layer: SurfaceLayer, kind: GroundTextureKind): Texture => {
    const texture = new ProceduralTexture(`sol-${layer}-${kind}`, size, groundShaderName(layer, kind), scene, null, true);
    texture.refreshRate = 0;
    texture.setFloat('texel', 1 / size);
    if (kind === 'matter') texture.setFloat('slopeScale', normalSlopeScale(layer, size));
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
    texture.anisotropicFilteringLevel = anisotropy;
    return texture;
  };
  const set = {} as Record<SurfaceLayer, GroundLayerTextures>;
  for (const layer of SURFACE_LAYERS) set[layer] = { color: make(layer, 'color'), matter: make(layer, 'matter') };
  return set;
}

export function disposeGroundTextures(set: GroundTextureSet): void {
  for (const layer of SURFACE_LAYERS) {
    set[layer].color.dispose();
    set[layer].matter.dispose();
  }
}
