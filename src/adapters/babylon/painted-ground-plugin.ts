// Sol peint sur un StandardMaterial (plugin de matériau Babylon) : quatre textures peintes (render-data/painted-ground),
// mélangées pixel par pixel selon les poids de chaque sommet (terre, roche, neige ; l'herbe prend le reste), puis
// multipliées à la couleur du sommet (palette) — la palette donne la teinte, la texture la matière.
// - Coordonnées « monde » calculées dans le shader : le motif se raccorde d'un chunk à l'autre sans tampon de plus.
// - Chaque couche est lue à deux échelles (la grande tournée) : la répétition du motif ne se voit plus de loin.
// - La roche est projetée sur les trois axes : sur une falaise, elle ne s'étire pas en traînées verticales.
// - Mélange « par hauteur » : là où deux couches se rencontrent, la plus claire (cailloux, arêtes de roche) passe
//   devant, d'où des limites franches et dessinées plutôt qu'un fondu flou.
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { GROUND_LAYERS, LAYER_TILE_M, PAINT_GAIN, type GroundLayer } from '../render-data/painted-ground';
import type { Rgb } from '../render-data/palette';

/** Nom de l'attribut de sommet qui porte les poids (terre, roche, neige) : render-data/mesh-data → ChunkMeshData.layers. */
export const PAINTED_GROUND_ATTRIBUTE = 'paintedGroundLayers';

const SAMPLER: Readonly<Record<GroundLayer, string>> = { grass: 'pgGrass', soil: 'pgSoil', rock: 'pgRock', snow: 'pgSnow' };
/** Part de la grande échelle dans la couleur, et son facteur d'échelle (motif ≈ 3 fois plus grand). */
const MACRO_SHARE = 0.4;
const MACRO_SCALE = 0.31;
/** Force du mélange par hauteur (0 = fondu simple) et largeur de la zone de fondu restante. */
const HEIGHT_BLEND = 0.6;
const BLEND_WIDTH = 0.2;

const f = (v: number): string => v.toFixed(4);

const VERTEX_DEFINITIONS = `
#ifdef PAINTEDGROUND
attribute vec3 ${PAINTED_GROUND_ATTRIBUTE};
varying vec3 vPgLayers;
#endif
`;

const VERTEX_MAIN_END = `
#ifdef PAINTEDGROUND
  vPgLayers = ${PAINTED_GROUND_ATTRIBUTE};
#endif
`;

/** Sol détrempé : part de luminosité retirée, renfort de couleur, et part de l'effet gardée sur une pente raide. */
export const WET_DARKEN = 0.38;
const WET_SATURATE = 2.2;
const WET_SLOPE_SHARE = 0.5;
/** Reflet du ciel sur le sol mouillé : face au sol, et en rasant (Fresnel) ; ondulation des flaques sous la pluie. */
const SHEEN_BASE = 0.04;
const SHEEN_GRAZE = 0.55;
const RIPPLE = 0.25;
/** L'horloge des ondulations reboucle (s). */
const RIPPLE_TIME_WRAP_S = 600;

const FRAGMENT_DEFINITIONS = `
#ifdef PAINTEDGROUND
varying vec3 vPgLayers;
uniform sampler2D ${SAMPLER.grass};
uniform sampler2D ${SAMPLER.soil};
uniform sampler2D ${SAMPLER.rock};
uniform sampler2D ${SAMPLER.snow};
// Facteur de la couche (≈ 1 en moyenne) : petite échelle × variation de la grande échelle, tournée d'un quart de tour.
vec3 pgSample(sampler2D s, vec2 uv) {
  vec3 near = texture2D(s, uv).rgb * ${f(PAINT_GAIN)};
  vec3 far = texture2D(s, vec2(uv.y, -uv.x) * ${f(MACRO_SCALE)} + vec2(0.17, 0.43)).rgb * ${f(PAINT_GAIN)};
  return near * mix(vec3(1.0), far, ${f(MACRO_SHARE)});
}
float pgLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float pgHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pgHash(i), pgHash(i + vec2(1.0, 0.0)), f.x), mix(pgHash(i + vec2(0.0, 1.0)), pgHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
#endif
`;

const FRAGMENT_DIFFUSE = `
#ifdef PAINTEDGROUND
  vec3 pgL = clamp(vPgLayers, 0.0, 1.0);
  vec4 pgW = vec4(max(0.0, 1.0 - pgL.x - pgL.y - pgL.z), pgL);
  vec3 pgGrassC = vec3(1.0), pgSoilC = vec3(1.0), pgRockC = vec3(1.0), pgSnowC = vec3(1.0);
  if (pgW.x > 0.001) pgGrassC = pgSample(${SAMPLER.grass}, vPositionW.xz * paintedGroundTiles.x);
  if (pgW.y > 0.001) pgSoilC = pgSample(${SAMPLER.soil}, vPositionW.xz * paintedGroundTiles.y);
  if (pgW.z > 0.001) {
    vec3 pgN = pow(abs(normalize(vNormalW)), vec3(4.0));
    pgN /= pgN.x + pgN.y + pgN.z;
    vec3 pgP = vPositionW * paintedGroundTiles.z;
    // Sur les faces verticales, « haut » de la texture = haut du monde : l'arête éclairée des blocs reste au-dessus.
    pgRockC = pgSample(${SAMPLER.rock}, vec2(pgP.z, -pgP.y)) * pgN.x
            + pgSample(${SAMPLER.rock}, pgP.xz) * pgN.y
            + pgSample(${SAMPLER.rock}, vec2(pgP.x, -pgP.y)) * pgN.z;
  }
  if (pgW.w > 0.001) pgSnowC = pgSample(${SAMPLER.snow}, vPositionW.xz * paintedGroundTiles.w);
  vec4 pgH = pgW + ${f(HEIGHT_BLEND)} * (vec4(pgLuma(pgGrassC), pgLuma(pgSoilC), pgLuma(pgRockC), pgLuma(pgSnowC)) - 1.0);
  pgH = mix(vec4(-1.0), pgH, step(0.001, pgW)); // une couche absente ne perce jamais
  float pgTop = max(max(pgH.x, pgH.y), max(pgH.z, pgH.w)) - ${f(BLEND_WIDTH)};
  vec4 pgB = max(pgH - pgTop, 0.0);
  pgB /= max(pgB.x + pgB.y + pgB.z + pgB.w, 0.0001);
  // Les textures stockent facteur / gain ; la couleur diffuse du matériau (= gain) rend le facteur exact.
  baseColor.rgb *= (pgGrassC * pgB.x + pgSoilC * pgB.y + pgRockC * pgB.z + pgSnowC * pgB.w) / ${f(PAINT_GAIN)};
  // Sol mouillé : plus sombre et un peu plus saturé (l'eau fonce la terre et l'herbe), davantage sur le plat où l'eau stagne ;
  // la neige ne change pas.
  float pgWet = paintedGroundWet.x * (1.0 - pgB.w) * mix(${f(WET_SLOPE_SHARE)}, 1.0, clamp(normalize(vNormalW).y, 0.0, 1.0));
  baseColor.rgb = mix(baseColor.rgb, baseColor.rgb * baseColor.rgb * ${f(WET_SATURATE)}, pgWet * 0.35) * (1.0 - ${f(WET_DARKEN)} * pgWet);
#endif
`;

// Reflets de pluie, après l'éclairage : le sol mouillé reflète le ciel, surtout en rasant (Fresnel) ; sur le plat (terre, herbe),
// des flaques — taches de bruit — font miroir et ondulent sous la pluie. Rien quand le sol est sec.
const FRAGMENT_BEFORE_FOG = `
#ifdef PAINTEDGROUND
  if (pgWet > 0.001) {
    vec3 pgNrm = normalize(vNormalW);
    float pgFlat = smoothstep(0.94, 0.995, pgNrm.y);
    // Flaques : surtout sur la terre (sentiers), un peu dans l'herbe ; petites taches sur le plat.
    float pgPud = smoothstep(0.62, 0.68, pgNoise(vPositionW.xz * 0.11) * 0.7 + pgNoise(vPositionW.xz * 0.47) * 0.3)
                * pgFlat * (pgB.y + 0.35 * pgB.x) * smoothstep(0.35, 0.85, paintedGroundWet.x);
    vec3 pgN = normalize(mix(pgNrm, vec3(0.0, 1.0, 0.0), pgPud));
    if (pgPud > 0.001 && paintedGroundWet.y > 0.001) {
      // Ronds de pluie : une goutte par case de 50 cm, qui tombe à un instant à elle ; son anneau s'élargit et s'efface.
      vec2 pgCell = floor(vPositionW.xz * 2.0);
      vec2 pgLocal = fract(vPositionW.xz * 2.0) - 0.5 - (vec2(pgHash(pgCell + 3.1), pgHash(pgCell + 7.7)) - 0.5) * 0.4;
      float pgPhase = fract(paintedGroundSky.w * 0.9 + pgHash(pgCell));
      float pgDist = length(pgLocal);
      float pgRing = sin((pgDist - pgPhase * 0.3) * 50.0) * smoothstep(0.08, 0.0, abs(pgDist - pgPhase * 0.3)) * (1.0 - pgPhase);
      pgN = normalize(pgN + vec3(pgLocal.x, 0.0, pgLocal.y) / max(pgDist, 0.001) * pgRing * ${f(RIPPLE)} * paintedGroundWet.y);
    }
    vec3 pgR = reflect(-viewDirectionW, pgN);
    vec3 pgSkyR = mix(paintedGroundSky.rgb, paintedGroundZenith.rgb, sqrt(clamp(pgR.y, 0.0, 1.0)));
    float pgFres = pow(1.0 - clamp(dot(pgN, viewDirectionW), 0.0, 1.0), 5.0);
    float pgSheen = pgWet * (${f(SHEEN_BASE)} + ${f(SHEEN_GRAZE)} * pgFres);
    // L'eau absorbe un peu : le fond de la flaque fonce, son reflet du ciel est un peu terni.
    float pgMirror = pgPud * (0.15 + 0.6 * pgFres);
    color.rgb *= 1.0 - 0.35 * pgPud;
    color.rgb = mix(color.rgb, pgSkyR * 0.8, clamp(max(pgSheen, pgMirror), 0.0, 1.0));
  }
#endif
`;

export class PaintedGroundPlugin extends MaterialPluginBase {
  /** Sol mouillé (0 = sec, 1 = détrempé) : render-data/atmosphere → wetness, à chaque image. */
  wetness = 0;
  /** Pluie qui tombe (0 à 1) : les flaques ondulent. */
  rain = 0;
  /** Couleurs du ciel reflétées : près de l'horizon (en rasant) et au zénith. */
  skyHorizon: Rgb = [0.5, 0.6, 0.7];
  skyZenith: Rgb = [0.3, 0.45, 0.7];
  /** Horloge (s) des ondulations. */
  timeS = 0;

  constructor(
    material: Material,
    private readonly textures: Readonly<Record<GroundLayer, BaseTexture>>,
  ) {
    super(material, 'PaintedGround', 190, { PAINTEDGROUND: false }, true, true);
  }

  override getClassName(): string {
    return 'PaintedGroundPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['PAINTEDGROUND'] = true;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(PAINTED_GROUND_ATTRIBUTE);
  }

  override getSamplers(samplers: string[]): void {
    for (const layer of GROUND_LAYERS) samplers.push(SAMPLER[layer]);
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'paintedGroundTiles', size: 4, type: 'vec4' },
        { name: 'paintedGroundWet', size: 4, type: 'vec4' },
        { name: 'paintedGroundSky', size: 4, type: 'vec4' },
        { name: 'paintedGroundZenith', size: 4, type: 'vec4' },
      ],
      fragment: '#ifdef PAINTEDGROUND\nuniform vec4 paintedGroundTiles;\nuniform vec4 paintedGroundWet;\nuniform vec4 paintedGroundSky;\nuniform vec4 paintedGroundZenith;\n#endif\n',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const [grass, soil, rock, snow] = GROUND_LAYERS.map((l) => 1 / LAYER_TILE_M[l]) as [number, number, number, number];
    uniformBuffer.updateFloat4('paintedGroundTiles', grass, soil, rock, snow);
    uniformBuffer.updateFloat4('paintedGroundWet', Math.min(1, Math.max(0, this.wetness)), Math.min(1, Math.max(0, this.rain)), 0, 0);
    const [hr, hg, hb] = this.skyHorizon, [zr, zg, zb] = this.skyZenith;
    uniformBuffer.updateFloat4('paintedGroundSky', hr, hg, hb, this.timeS % RIPPLE_TIME_WRAP_S);
    uniformBuffer.updateFloat4('paintedGroundZenith', zr, zg, zb, 0);
    for (const layer of GROUND_LAYERS) uniformBuffer.setTexture(SAMPLER[layer], this.textures[layer]);
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    for (const layer of GROUND_LAYERS) activeTextures.push(this.textures[layer]);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return GROUND_LAYERS.some((l) => this.textures[l] === texture);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS, CUSTOM_VERTEX_MAIN_END: VERTEX_MAIN_END };
    if (shaderType === 'fragment') {
      return { CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFINITIONS, CUSTOM_FRAGMENT_UPDATE_DIFFUSE: FRAGMENT_DIFFUSE, CUSTOM_FRAGMENT_BEFORE_FOG: FRAGMENT_BEFORE_FOG };
    }
    return null;
  }
}
