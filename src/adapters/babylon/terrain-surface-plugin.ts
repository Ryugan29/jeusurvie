// Matériau physique du sol (plugin de PBRMaterial) : quatre matières générées sur la carte graphique (ground-textures) —
// herbe, terre, roche, neige — mélangées pixel par pixel selon les poids de chaque sommet (terre, roche, neige ; l'herbe prend le
// reste), puis éclairées par le modèle physique de Babylon (soleil, ombres, ciel de l'heure en éclairage d'environnement, reflets).
// - Coordonnées « monde » calculées dans le shader : le motif se raccorde d'un chunk à l'autre sans tampon de plus.
// - Anti-répétition : chaque matière est lue à deux échelles (la grande tournée d'un quart de tour, sa normale avec).
// - Roche projetée sur les trois axes (triplanaire) : sur une falaise, elle ne s'étire pas ; normales mêlées en « whiteout ».
// - Mélange par hauteur : là où deux matières se rencontrent, la plus haute (cailloux, arêtes, brins) passe devant.
// - Couleur = couleur du sommet (palette, en sRGB → linéaire) × facteur de la matière ; rugosité et cavité viennent de la matière.
// - Pluie : l'eau fonce et lisse la matière ; les flaques remplissent d'abord les CREUX de la matière (entre les cailloux, dans les
//   fissures, sur les sentiers), font miroir (rugosité ~0) et montrent des ronds de pluie.
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import {
  ALBEDO_FACTOR_MAX,
  PUDDLE_ROUGHNESS,
  SURFACE_LAYERS,
  SURFACE_LAYER_SPECS,
  WET_ALBEDO_DARKEN,
  WET_ROUGHNESS,
} from '../render-data/ground-materials';
import type { GroundTextureSet } from './ground-textures';

/** Nom de l'attribut de sommet qui porte les poids (terre, roche, neige) : render-data/mesh-data → ChunkMeshData.layers. */
export const TERRAIN_LAYERS_ATTRIBUTE = 'paintedGroundLayers';

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** Part de la grande échelle dans la couleur et le relief, son facteur d'échelle (motif ≈ 3 fois plus grand). */
const MACRO_SHARE = 0.38;
const MACRO_SCALE = 0.31;
/** Force du mélange par hauteur (0 = fondu simple) et largeur de la zone de fondu restante. */
const HEIGHT_BLEND = 0.55;
const BLEND_WIDTH = 0.16;
/** Part de la cavité appliquée à la couleur (le reste de l'ombrage vient de la lumière elle-même). */
const CAVITY_SHARE = 0.7;
/** Part de l'effet de mouillé gardée sur une pente raide (l'eau ruisselle). */
const WET_SLOPE_SHARE = 0.5;
/** Ondulation des ronds de pluie dans les flaques. */
const RIPPLE = 0.22;
/** L'horloge des ondulations reboucle (s). */
const RIPPLE_TIME_WRAP_S = 600;

const SAMPLERS = SURFACE_LAYERS.flatMap((l) => [`tsColor_${l}`, `tsMatter_${l}`]);

const VERTEX_DEFINITIONS = `
#ifdef TERRAINSURFACE
attribute vec3 ${TERRAIN_LAYERS_ATTRIBUTE};
varying vec3 vTsLayers;
#endif
`;

const VERTEX_MAIN_END = `
#ifdef TERRAINSURFACE
  vTsLayers = ${TERRAIN_LAYERS_ATTRIBUTE};
#endif
`;

const FRAGMENT_DEFINITIONS = `
#ifdef TERRAINSURFACE
varying vec3 vTsLayers;
${SAMPLERS.map((s) => `uniform sampler2D ${s};`).join('\n')}
// Résultats calculés au début du shader, relus plus loin (couleur, rugosité, normale) : variables globales.
vec3 tsAlbedo;
float tsRough;
vec3 tsNormal;
float tsHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tsNoise(vec2 p) {
  vec2 i = floor(p), fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(mix(tsHash(i), tsHash(i + vec2(1.0, 0.0)), fr.x), mix(tsHash(i + vec2(0.0, 1.0)), tsHash(i + vec2(1.0, 1.0)), fr.x), fr.y);
}
vec3 tsFactor(vec3 code) { return code * code * ${f(ALBEDO_FACTOR_MAX)}; }
// Une matière lue à deux échelles (anti-répétition). c : couleur (facteur, hauteur) ; m : matière (normale xy, rugosité, cavité).
void tsRead(sampler2D C, sampler2D M, vec2 uv, out vec4 c, out vec4 m) {
  vec2 uv2 = vec2(uv.y, -uv.x) * ${f(MACRO_SCALE)} + vec2(0.17, 0.43);
  vec4 c1 = texture2D(C, uv), c2 = texture2D(C, uv2);
  c = vec4(tsFactor(c1.rgb) * mix(vec3(1.0), tsFactor(c2.rgb), ${f(MACRO_SHARE)}), mix(c1.a, c2.a, ${f(MACRO_SHARE)}));
#ifdef TSNORMALS
  vec4 m1 = texture2D(M, uv), m2 = texture2D(M, uv2);
  vec2 n1 = m1.xy * 2.0 - 1.0, n2 = m2.xy * 2.0 - 1.0;
  // La grande échelle est tournée d'un quart de tour : sa pente aussi.
  m = vec4(n1 + vec2(-n2.y, n2.x) * ${f(MACRO_SHARE)}, mix(m1.z, m2.z, 0.3), m1.w * mix(1.0, m2.w, 0.5));
#else
  m = vec4(0.0, 0.0, -1.0, 1.0);
#endif
}
// Normale d'une projection du dessus (xz) mêlée à la normale du relief (« whiteout »).
vec3 tsTop(vec2 n, vec3 N) { return normalize(vec3(n.x + N.x, N.y, n.y + N.z)); }
#endif
`;

/** Rugosité par défaut d'une couche quand les cartes de matière ne sont pas lues (z = -1 dans tsRead). */
const DEFAULT_ROUGH = `vec4(${SURFACE_LAYERS.map((l) => f(SURFACE_LAYER_SPECS[l].roughness)).join(', ')})`;

const FRAGMENT_MAIN_BEGIN = `
#ifdef TERRAINSURFACE
  vec3 tsN = normalize(vNormalW);
  vec3 tsL = clamp(vTsLayers, 0.0, 1.0);
  vec4 tsW = vec4(max(0.0, 1.0 - tsL.x - tsL.y - tsL.z), tsL);
  vec4 tsCg = vec4(1.0, 1.0, 1.0, 0.5), tsCs = tsCg, tsCr = tsCg, tsCw = tsCg;
  vec4 tsMg = vec4(0.0, 0.0, -1.0, 1.0), tsMs = tsMg, tsMr = tsMg, tsMw = tsMg;
  vec3 tsNg = tsN, tsNs = tsN, tsNr = tsN, tsNw = tsN;
  if (tsW.x > 0.001) { tsRead(tsColor_grass, tsMatter_grass, vPositionW.xz * terrainTiles.x, tsCg, tsMg); tsNg = tsTop(tsMg.xy, tsN); }
  if (tsW.y > 0.001) { tsRead(tsColor_soil, tsMatter_soil, vPositionW.xz * terrainTiles.y, tsCs, tsMs); tsNs = tsTop(tsMs.xy, tsN); }
  if (tsW.z > 0.001) {
    // Roche triplanaire : sur les faces verticales, « haut » de la texture = haut du monde (strates horizontales).
    vec3 tsBw = pow(abs(tsN), vec3(4.0));
    tsBw /= tsBw.x + tsBw.y + tsBw.z;
    vec3 tsP = vPositionW * terrainTiles.z;
    vec4 cx, mx, cy, my, cz, mz;
    tsRead(tsColor_rock, tsMatter_rock, tsP.zy, cx, mx);
    tsRead(tsColor_rock, tsMatter_rock, tsP.xz, cy, my);
    tsRead(tsColor_rock, tsMatter_rock, tsP.xy, cz, mz);
    tsCr = cx * tsBw.x + cy * tsBw.y + cz * tsBw.z;
    tsMr = mx * tsBw.x + my * tsBw.y + mz * tsBw.z;
    vec3 nX = vec3(mx.xy + tsN.zy, abs(tsN.x));
    vec3 nY = vec3(my.xy + tsN.xz, abs(tsN.y));
    vec3 nZ = vec3(mz.xy + tsN.xy, abs(tsN.z));
    nX.z *= sign(tsN.x); nY.z *= sign(tsN.y); nZ.z *= sign(tsN.z);
    tsNr = normalize(nX.zyx * tsBw.x + nY.xzy * tsBw.y + nZ.xyz * tsBw.z);
  }
  if (tsW.w > 0.001) { tsRead(tsColor_snow, tsMatter_snow, vPositionW.xz * terrainTiles.w, tsCw, tsMw); tsNw = tsTop(tsMw.xy, tsN); }
  // Mélange par hauteur : une couche absente ne perce jamais.
  vec4 tsH = tsW + ${f(HEIGHT_BLEND)} * (vec4(tsCg.a, tsCs.a, tsCr.a, tsCw.a) - 0.5);
  tsH = mix(vec4(-1.0), tsH, step(0.001, tsW));
  float tsTop0 = max(max(tsH.x, tsH.y), max(tsH.z, tsH.w)) - ${f(BLEND_WIDTH)};
  vec4 tsB = max(tsH - tsTop0, 0.0);
  tsB /= max(tsB.x + tsB.y + tsB.z + tsB.w, 0.0001);
  vec3 tsFac = tsCg.rgb * tsB.x + tsCs.rgb * tsB.y + tsCr.rgb * tsB.z + tsCw.rgb * tsB.w;
  float tsHeight = tsCg.a * tsB.x + tsCs.a * tsB.y + tsCr.a * tsB.z + tsCw.a * tsB.w;
  vec4 tsRoughs = vec4(tsMg.z, tsMs.z, tsMr.z, tsMw.z);
  tsRoughs = mix(${DEFAULT_ROUGH}, tsRoughs, step(0.0, tsRoughs));
  tsRough = dot(tsRoughs, tsB);
  float tsCavity = dot(vec4(tsMg.w, tsMs.w, tsMr.w, tsMw.w), tsB);
  tsNormal = normalize(tsNg * tsB.x + tsNs * tsB.y + tsNr * tsB.z + tsNw * tsB.w);
  // Couleur du sommet (teinte de la palette, écrite en sRGB) × matière ; la cavité assombrit les creux.
  tsAlbedo = toLinearSpace(vColor.rgb) * tsFac * mix(1.0, tsCavity, ${f(CAVITY_SHARE)});

  // Pluie : la matière fonce et se lisse, surtout sur le plat ; la neige ne change pas.
  float tsWet = terrainWet.x * (1.0 - tsB.w) * mix(${f(WET_SLOPE_SHARE)}, 1.0, clamp(tsN.y, 0.0, 1.0));
  tsAlbedo *= 1.0 - ${f(WET_ALBEDO_DARKEN)} * tsWet;
  tsRough = mix(tsRough, min(tsRough, ${f(WET_ROUGHNESS)}), tsWet);
  if (tsWet > 0.001) {
    // Flaques : l'eau monte dans les creux de la matière, davantage sur les sentiers (terre) et là où le bruit le veut.
    float tsFlat = smoothstep(0.93, 0.99, tsN.y);
    float tsLevel = terrainWet.x * (0.25 + 0.45 * smoothstep(0.35, 0.75, tsNoise(vPositionW.xz * 0.09) * 0.7 + tsNoise(vPositionW.xz * 0.41) * 0.3))
                  * (0.35 + 0.65 * tsB.y) * tsFlat;
    float tsPuddle = smoothstep(0.0, 0.06, tsLevel - tsHeight) * smoothstep(0.25, 0.7, terrainWet.x);
    if (tsPuddle > 0.001) {
      vec3 tsWater = vec3(0.0, 1.0, 0.0);
      if (terrainWet.y > 0.001) {
        // Ronds de pluie : une goutte par case de 50 cm, qui tombe à un instant à elle ; son anneau s'élargit et s'efface.
        vec2 tsCell = floor(vPositionW.xz * 2.0);
        vec2 tsLocal = fract(vPositionW.xz * 2.0) - 0.5 - (vec2(tsHash(tsCell + 3.1), tsHash(tsCell + 7.7)) - 0.5) * 0.4;
        float tsPhase = fract(terrainWet.z * 0.9 + tsHash(tsCell));
        float tsDist = length(tsLocal);
        float tsRing = sin((tsDist - tsPhase * 0.3) * 50.0) * smoothstep(0.08, 0.0, abs(tsDist - tsPhase * 0.3)) * (1.0 - tsPhase);
        tsWater = normalize(tsWater + vec3(tsLocal.x, 0.0, tsLocal.y) / max(tsDist, 0.001) * tsRing * ${f(RIPPLE)} * terrainWet.y);
      }
      tsNormal = normalize(mix(tsNormal, tsWater, tsPuddle));
      tsRough = mix(tsRough, ${f(PUDDLE_ROUGHNESS)}, tsPuddle);
      tsAlbedo *= 1.0 - 0.35 * tsPuddle;
    }
  }
#endif
`;

const FRAGMENT_UPDATE_ALBEDO = `
#ifdef TERRAINSURFACE
  surfaceAlbedo = tsAlbedo;
#endif
`;

const FRAGMENT_UPDATE_METALLICROUGHNESS = `
#ifdef TERRAINSURFACE
  metallicRoughness.r = 0.0;
  metallicRoughness.g = tsRough;
#endif
`;

const FRAGMENT_BEFORE_LIGHTS = `
#ifdef TERRAINSURFACE
  normalW = tsNormal;
#endif
`;

export class TerrainSurfacePlugin extends MaterialPluginBase {
  /** Sol mouillé (0 = sec, 1 = détrempé) : render-data/atmosphere → wetness, à chaque image. */
  wetness = 0;
  /** Pluie qui tombe (0 à 1) : les flaques ondulent. */
  rain = 0;
  /** Horloge (s) des ondulations. */
  timeS = 0;
  private normalMaps: boolean;

  constructor(
    material: Material,
    private textures: GroundTextureSet,
    options: { readonly normalMaps: boolean },
  ) {
    super(material, 'TerrainSurface', 190, { TERRAINSURFACE: false, TSNORMALS: false }, true, true);
    this.normalMaps = options.normalMaps;
  }

  /** Nouvelles textures (changement de profil graphique) et lecture ou non des cartes de matière. */
  setTextures(textures: GroundTextureSet, normalMaps: boolean): void {
    this.textures = textures;
    if (normalMaps !== this.normalMaps) {
      this.normalMaps = normalMaps;
      this.markAllDefinesAsDirty();
    }
  }

  override getClassName(): string {
    return 'TerrainSurfacePlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['TERRAINSURFACE'] = true;
    defines['TSNORMALS'] = this.normalMaps;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(TERRAIN_LAYERS_ATTRIBUTE);
  }

  override getSamplers(samplers: string[]): void {
    samplers.push(...SAMPLERS);
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'terrainTiles', size: 4, type: 'vec4' },
        { name: 'terrainWet', size: 4, type: 'vec4' },
      ],
      fragment: '#ifdef TERRAINSURFACE\nuniform vec4 terrainTiles;\nuniform vec4 terrainWet;\n#endif\n',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const [g, s, r, w] = SURFACE_LAYERS.map((l) => 1 / SURFACE_LAYER_SPECS[l].tileM) as [number, number, number, number];
    uniformBuffer.updateFloat4('terrainTiles', g, s, r, w);
    uniformBuffer.updateFloat4('terrainWet', clamp01(this.wetness), clamp01(this.rain), this.timeS % RIPPLE_TIME_WRAP_S, 0);
    for (const layer of SURFACE_LAYERS) {
      uniformBuffer.setTexture(`tsColor_${layer}`, this.textures[layer].color);
      uniformBuffer.setTexture(`tsMatter_${layer}`, this.textures[layer].matter);
    }
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    for (const layer of SURFACE_LAYERS) activeTextures.push(this.textures[layer].color, this.textures[layer].matter);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return SURFACE_LAYERS.some((l) => this.textures[l].color === texture || this.textures[l].matter === texture);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS, CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN_END };
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFINITIONS,
        CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN,
        CUSTOM_FRAGMENT_UPDATE_ALBEDO: FRAGMENT_UPDATE_ALBEDO,
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: FRAGMENT_UPDATE_METALLICROUGHNESS,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_BEFORE_LIGHTS,
      };
    }
    return null;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
