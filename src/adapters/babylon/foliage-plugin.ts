// Végétation vivante sur un StandardMaterial (plugin de matériau Babylon) : vent, dégradé pied → pointe, teinte par instance
// (herbes sèches dorées en plaques, feuillus d'automne en groupes, arbres plus ou moins clairs). Tout est calculé sommet par
// sommet à partir de la position de l'instance (4e colonne de sa matrice) : marche avec les « thin instances », sans tampon
// de couleurs ni calcul côté processeur.
// Les formules sont la copie exacte de render-data/foliage.ts (testées là-bas) ; les constantes y sont lues directement.
// Le vent ne bouge que l'image vue par la caméra (et l'occlusion ambiante, qui passe par le même shader) : les ombres portées
// restent celles du modèle au repos. Ce n'est visible nulle part : l'herbe ne projette pas d'ombre (render-data/shadow-casters),
// les feuilles des arbres ne frémissent que de quelques centimètres.
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { ThinEngine } from '@babylonjs/core/Engines/thinEngine';
import '@babylonjs/core/Engines/Extensions/engine.alphaToCoverage';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import {
  AUTUMN_FROM,
  AUTUMN_FULL,
  AUTUMN_GROUP_M,
  AUTUMN_ORANGE,
  AUTUMN_RED,
  AUTUMN_YELLOW,
  DRY_FROM,
  DRY_FULL,
  DRY_GOLD,
  DRY_PATCH_M,
  DRY_STRAY,
  FLUTTER_RAD_S,
  FOLIAGE_ALBEDO,
  FOLIAGE_HDR_HEADROOM,
  FLUTTER_SHARE,
  GUST_FLOOR,
  GUST_SPACING_M,
  SHADE_FOOT,
  SHADE_TIP,
  SHADE_TOP,
  SPRING_GREEN,
  WIND_DIR,
  WIND_SPEED_MS,
  type FoliageKind,
  type FoliageProfile,
} from '../render-data/foliage';
import type { Rgb } from '../render-data/palette';

/** Le vent, partagé par tous les matériaux de végétation : l'heure (s) avance à chaque image, la force coupe tout (?vent=0). */
export interface WindState {
  timeS: number;
  strength: number;
  /** Lumière de l'astre qui traverse les feuilles et les brins (mise à jour à chaque image ; absente : pas de translucidité). */
  sun?: SunGlow;
}

/** L'astre vu par la végétation : direction VERS lui (unitaire), couleur, force (0 la nuit sans lune, 1 en plein soleil). */
export interface SunGlow {
  readonly toSun: [number, number, number];
  readonly color: [number, number, number];
  strength: number;
}

/**
 * Translucidité par type : part de la lumière de l'astre qui traverse quand on regarde vers lui (contre-jour). Au soleil bas, la
 * prairie et les feuillages s'allument d'or — la lumière « peinte » des illustrations fantasy. Les aiguilles des pins, épaisses,
 * en laissent moins passer.
 */
const TRANSLUCENCY: Readonly<Record<FoliageKind, number>> = { grass: 0.45, plant: 0.45, flower: 0.35, tree: 0.5, pine: 0.25, bush: 0.4 };

/** Mode du shader : 0 = vent seul (fleurs), 1 = herbe (touffes sèches), 2 = feuillus (automne), 3 = petites plantes et persistants (luminosité). */
const MODE: Readonly<Record<FoliageKind, number>> = { flower: 0, grass: 1, plant: 3, tree: 2, pine: 3, bush: 3 };

const f = (v: number): string => v.toFixed(4);
const v3 = (c: Rgb): string => `vec3(${c.map(f).join(', ')})`;

const UNIFORMS =
  '#ifdef FOLIAGE\nuniform vec4 foliageParams;\nuniform vec4 foliageWind;\nuniform vec4 foliageSun;\nuniform vec4 foliageSunColor;\nuniform vec4 foliageAlbedo;\n#endif\n';

const VERTEX_DEFINITIONS = `
#ifdef FOLIAGE
varying float vFolH;
varying vec4 vFolTint;
varying float vFolBright;
float folHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float folNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 t = p - i;
  vec2 u = t * t * (3.0 - 2.0 * t);
  float a = folHash(i), b = folHash(i + vec2(1.0, 0.0)), c = folHash(i + vec2(0.0, 1.0)), d = folHash(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float folGust(vec2 p, float t) {
  float a = (dot(p, vec2(${f(WIND_DIR.x)}, ${f(WIND_DIR.z)})) - ${f(WIND_SPEED_MS)} * t) * 6.2831853 / ${f(GUST_SPACING_M)};
  return (0.5 + 0.5 * sin(a)) * (0.6 + 0.4 * sin(a * 0.37 + 1.3));
}
#endif
`;

const VERTEX_WORLDPOS = `
#ifdef FOLIAGE
  vec2 folAt = finalWorld[3].xz;
  float folScale = length(finalWorld[1].xyz);
  vFolH = clamp(positionUpdated.y / foliageParams.x, 0.0, 1.0);
  vFolTint = vec4(0.0);
  vFolBright = 1.0;
  if (foliageParams.w > 0.5 && foliageParams.w < 1.5) {
    float folPatch = folNoise(folAt / ${f(DRY_PATCH_M)}) + 0.12 * (folHash(folAt + vec2(31.7, -11.3)) - 0.5);
    float folStray = folHash(folAt + vec2(-7.1, 23.9)) < ${f(DRY_STRAY)} ? 0.8 : 0.0;
    vFolTint = vec4(${v3(DRY_GOLD)}, max(smoothstep(${f(DRY_FROM)}, ${f(DRY_FULL)}, folPatch), folStray));
    vFolBright = 0.88 + 0.24 * folHash(folAt + vec2(5.3, 17.9));
  } else if (foliageParams.w > 1.5 && foliageParams.w < 2.5) {
    float folAutumn = smoothstep(${f(AUTUMN_FROM)}, ${f(AUTUMN_FULL)}, folNoise(folAt / ${f(AUTUMN_GROUP_M)} + vec2(0.37, -0.61)));
    float folHue = folHash(folAt + vec2(13.1, -3.7));
    vec3 folFall = folHue < 0.5 ? mix(${v3(AUTUMN_YELLOW)}, ${v3(AUTUMN_ORANGE)}, folHue * 2.0) : mix(${v3(AUTUMN_ORANGE)}, ${v3(AUTUMN_RED)}, folHue * 2.0 - 1.0);
    float folSpring = 0.3 * folHash(folAt + vec2(-41.3, 9.7));
    vFolTint = vec4(mix(${v3(SPRING_GREEN)}, folFall, smoothstep(0.3, 0.5, folAutumn)), max(folSpring, folAutumn));
    vFolBright = 0.86 + 0.28 * folHash(folAt + vec2(2.9, 61.1));
  } else if (foliageParams.w > 2.5) {
    vFolBright = 0.88 + 0.24 * folHash(folAt + vec2(2.9, 61.1));
  }
  float folBend = foliageParams.y * folScale * vFolH * vFolH;
  if (folBend > 0.0) {
    float folSway = folBend * (${f(GUST_FLOOR)} + ${f(1 - GUST_FLOOR)} * folGust(folAt, foliageWind.x));
    float folLocal = dot(positionUpdated.xz, vec2(1.7, 1.3)) * 2.0;
    float folFlutter = folBend * ${f(FLUTTER_SHARE)} * sin(foliageWind.x * ${f(FLUTTER_RAD_S)} + folLocal + folAt.x * 1.3 + folAt.y * 1.7);
    worldPos.xz += vec2(${f(WIND_DIR.x)}, ${f(WIND_DIR.z)}) * folSway + vec2(${f(-WIND_DIR.z)}, ${f(WIND_DIR.x)}) * folFlutter;
  }
#endif
`;

const FRAGMENT_DEFINITIONS = `
#ifdef FOLIAGE
varying float vFolH;
varying vec4 vFolTint;
varying float vFolBright;
float folCoverage = 1.0;
#endif
`;

// Bords découpés lisses (alpha-to-coverage) : l'alpha de la texture est « affûté » — il passe de 0 à 1 sur un seul pixel autour
// du seuil de découpe — puis devient la part d'échantillons MSAA couverts. Le bord d'un brin ou d'une feuille est alors lissé
// comme celui d'un vrai triangle, et l'herbe lointaine ne s'amincit plus en pointillés (les mipmaps adoucissent l'alpha,
// l'affûtage le retend). Le pixel n'est jeté que s'il ne couvre rien.
const FRAGMENT_UPDATE_ALPHA = `
#ifdef FOLIAGE
  folCoverage = clamp((baseColor.a - alphaCutOff) / max(fwidth(baseColor.a), 0.0001) + 0.5, 0.0, 1.0);
  alpha = folCoverage > 0.0 ? max(alpha, alphaCutOff) : 0.0;
#endif
`;

// Normale ramenée vers le haut (herbe, petites plantes) : les brins prennent la lumière du sol qui les porte, au lieu de briller ou
// de noircir selon l'orientation du modèle — la prairie et le sol se fondent, l'herbe n'a plus l'air posée dessus.
const FRAGMENT_BEFORE_LIGHTS = `
#ifdef FOLIAGE
  normalW = normalize(mix(normalW, vec3(0.0, 1.0, 0.0), foliageWind.y));
#endif
`;

// Contre-jour : face à l'astre, la lumière traverse feuilles et brins (plus vers la pointe, plus fine). Une petite part, sans
// direction, garde la végétation « vivante » à l'ombre (lumière diffusée à travers le feuillage).
const FRAGMENT_BEFORE_FOG = `
#ifdef FOLIAGE
  float folBack = pow(clamp(dot(-viewDirectionW, foliageSun.xyz), 0.0, 1.0), 5.0);
  color.rgb += baseColor.rgb / ${f(FOLIAGE_HDR_HEADROOM)} * foliageSunColor.rgb * foliageSun.w * (0.1 + 0.9 * folBack) * mix(0.35, 1.0, vFolH);
#endif
`;

const FRAGMENT_BEFORE_FRAGCOLOR = `
#ifdef FOLIAGE
  color.a = folCoverage;
#endif
`;

/** Part de la normale ramenée vers le haut, par type de végétation (0 = normale du modèle). */
const UP_NORMAL: Readonly<Record<FoliageKind, number>> = { grass: 0.85, plant: 0.55, flower: 0.5, tree: 0, pine: 0, bush: 0.3 };

// Albédo réaliste (render-data/foliage → FOLIAGE_ALBEDO) : texture sRGB repassée en linéaire, ramenée vers le gris et à la
// luminosité d'une vraie feuille ; × la marge de lumière (le matériau léger plafonne l'éclairage à 1, divisé d'autant ailleurs).
const FRAGMENT_DIFFUSE = `
#ifdef FOLIAGE
  baseColor.rgb = toLinearSpace(max(baseColor.rgb, vec3(0.0)));
  baseColor.rgb = mix(vec3(dot(baseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), baseColor.rgb, foliageAlbedo.x) * foliageAlbedo.y;
  baseColor.rgb *= mix(vec3(1.0), mix(${v3(SHADE_FOOT)}, ${v3(SHADE_TIP)}, smoothstep(0.0, ${f(SHADE_TOP)}, vFolH)), foliageParams.z);
  vec3 folLuma = vec3(0.2126, 0.7152, 0.0722);
  vec3 folToward = vFolTint.rgb * (dot(baseColor.rgb, folLuma) / max(dot(vFolTint.rgb, folLuma), 0.001));
  baseColor.rgb = mix(baseColor.rgb, folToward, vFolTint.a) * vFolBright;
#endif
`;

/** Alpha-to-coverage, si le moteur le connaît (WebGL ; ailleurs, les bords restent simplement découpés). */
function setAlphaToCoverage(engine: AbstractEngine, enable: boolean): void {
  (engine as unknown as Partial<Pick<ThinEngine, 'setAlphaToCoverage'>>).setAlphaToCoverage?.(enable);
}

export class FoliagePlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly profile: FoliageProfile,
    private readonly wind: WindState,
  ) {
    super(material, 'Foliage', 210, { FOLIAGE: false }, true, true);
    // L'alpha-to-coverage n'est actif que le temps de dessiner ce matériau (jamais pour les effets d'image qui suivent).
    material.onUnBindObservable.add(() => setAlphaToCoverage(material.getScene().getEngine(), false));
  }

  override getClassName(): string {
    return 'FoliagePlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['FOLIAGE'] = true;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; vertex: string; fragment: string } {
    return {
      ubo: [
        { name: 'foliageParams', size: 4, type: 'vec4' },
        { name: 'foliageWind', size: 4, type: 'vec4' },
        { name: 'foliageSun', size: 4, type: 'vec4' },
        { name: 'foliageSunColor', size: 4, type: 'vec4' },
        { name: 'foliageAlbedo', size: 4, type: 'vec4' },
      ],
      vertex: UNIFORMS,
      fragment: UNIFORMS,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene?: Scene, engine?: AbstractEngine): void {
    const p = this.profile;
    uniformBuffer.updateFloat4('foliageParams', p.heightRefM, p.windM * this.wind.strength, p.gradient, MODE[p.kind]);
    uniformBuffer.updateFloat4('foliageWind', this.wind.timeS, UP_NORMAL[p.kind], 0, 0);
    const sun = this.wind.sun;
    if (sun) {
      uniformBuffer.updateFloat4('foliageSun', sun.toSun[0], sun.toSun[1], sun.toSun[2], sun.strength * TRANSLUCENCY[p.kind]);
      uniformBuffer.updateFloat4('foliageSunColor', sun.color[0], sun.color[1], sun.color[2], 0);
    } else {
      uniformBuffer.updateFloat4('foliageSun', 0, 1, 0, 0);
      uniformBuffer.updateFloat4('foliageSunColor', 0, 0, 0, 0);
    }
    const albedo = FOLIAGE_ALBEDO[p.kind];
    uniformBuffer.updateFloat4('foliageAlbedo', albedo.saturation, albedo.value * FOLIAGE_HDR_HEADROOM, 0, 0);
    if (engine) setAlphaToCoverage(engine, true);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: VERTEX_DEFINITIONS, CUSTOM_VERTEX_UPDATE_WORLDPOS: VERTEX_WORLDPOS };
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: FRAGMENT_DEFINITIONS,
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: FRAGMENT_DIFFUSE,
        CUSTOM_FRAGMENT_UPDATE_ALPHA: FRAGMENT_UPDATE_ALPHA,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAGMENT_BEFORE_LIGHTS,
        CUSTOM_FRAGMENT_BEFORE_FOG: FRAGMENT_BEFORE_FOG,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: FRAGMENT_BEFORE_FRAGCOLOR,
      };
    }
    return null;
  }
}
