// Perspective atmosphérique en passe d'image (profils MEDIUM et plus) : la lumière traverse l'air entre l'objet et l'œil.
// Pour chaque pixel, la profondeur du rendu multiple (pré-passe, la même que l'occlusion ambiante : aucun dessin de plus) redonne
// sa position dans le monde ; on calcule alors EXACTEMENT, le long du regard :
//   - l'extinction par la brume de distance (densité de l'heure et de la météo, render-data/atmosphere) ;
//   - l'extinction par la brume de HAUTEUR, intégrée le long du rayon (densité qui décroît exponentiellement avec l'altitude) :
//     les fonds de vallée se remplissent, les sommets émergent, et c'est vrai pour TOUT (sol, arbres, rochers, personnages) ;
//   - la lumière que l'air renvoie vers l'œil : la couleur de brume de l'heure (celle de l'horizon du ciel, le lointain s'y fond)
//     plus la diffusion vers l'avant de l'astre (phase de Henyey-Greenstein) : face au soleil bas, la brume s'illumine.
// Le ciel (profondeur vide) n'est pas touché : son dôme a déjà sa brume d'horizon (sky-dome).
// Profil LOW : pas de cette passe, la brume classique des matériaux (Babylon) la remplace (SceneLighting.setAerialPerspective).
//
// Profondeur de champ (ULTRA, DistanceBlur) : l'arrière-plan lointain s'adoucit comme dans un objectif ; le joueur et le proche
// restent nets (pas de flou d'avant-plan : la lisibilité du jeu passe d'abord).
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Matrix, Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import type { PrePassEffectConfiguration } from '@babylonjs/core/Rendering/prePassEffectConfiguration';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { DofQuality } from '../render-data/quality';
import type { Rgb } from '../render-data/palette';

const AERIAL_SHADER = 'perspectiveAtmospherique';
const BLUR_SHADER = 'flouDeDistance';

const AERIAL_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform mat4 invView;
uniform vec2 tanFov;
uniform vec3 cameraPos;
uniform vec4 fogParams;     // x : brume de distance (par m), y : brume de hauteur à la base (par m), z : 1 / épaisseur (par m), w : altitude de la base
uniform vec3 hazeColor;     // lumière renvoyée par l'air (linéaire, comme l'horizon du ciel)
uniform vec3 sunToward;     // vers l'astre, unitaire
uniform vec4 sunScatter;    // rgb : lumière de l'astre diffusée vers l'avant, a : anisotropie (g)

float hgPhase(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

void main(void) {
  vec4 color = texture2D(textureSampler, vUV);
  float viewZ = texture2D(depthSampler, vUV).r;
  if (viewZ <= 0.0) { gl_FragColor = color; return; }
  vec3 posView = vec3((vUV.x * 2.0 - 1.0) * tanFov.x, (vUV.y * 2.0 - 1.0) * tanFov.y, 1.0) * viewZ;
  float dist = length(posView);
  vec3 world = (invView * vec4(posView, 1.0)).xyz;
  vec3 rayDir = (world - cameraPos) / max(dist, 1e-4);
  // Brume de hauteur intégrée le long du rayon : ∫ d₀·exp(−k·(y(t) − base)) dt, y variant linéairement de la caméra au point.
  float k = fogParams.z;
  float startH = max(cameraPos.y - fogParams.w, -8.0 / max(k, 1e-4));
  float dy = world.y - cameraPos.y;
  float kdy = k * dy;
  float spread = abs(kdy) > 1e-3 ? (1.0 - exp(-kdy)) / kdy : 1.0 - 0.5 * kdy;
  float tauHeight = fogParams.y * exp(-k * startH) * dist * spread;
  float tau = fogParams.x * dist + tauHeight;
  float transmittance = exp(-tau);
  float mu = dot(rayDir, sunToward);
  vec3 inscatter = hazeColor + sunScatter.rgb * hgPhase(mu, sunScatter.a);
  gl_FragColor = vec4(color.rgb * transmittance + inscatter * (1.0 - transmittance), color.a);
}
`;

const BLUR_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 texelSize;
uniform vec4 dof;           // x : début du flou (m), y : flou plein (m), z : rayon maximal (px)
uniform vec2 tanFov;

float cocAt(vec2 uv) {
  float viewZ = texture2D(depthSampler, uv).r;
  if (viewZ <= 0.0) return 1.0; // le ciel est « infiniment loin »
  float dist = viewZ * length(vec3((uv.x * 2.0 - 1.0) * tanFov.x, (uv.y * 2.0 - 1.0) * tanFov.y, 1.0));
  return smoothstep(dof.x, dof.y, dist);
}

void main(void) {
  float coc = cocAt(vUV);
  vec4 center = texture2D(textureSampler, vUV);
  if (coc < 0.02) { gl_FragColor = center; return; }
  float radius = coc * dof.z;
  vec3 sum = center.rgb;
  float total = 1.0;
  // Disque de Vogel (16 points) : répartition régulière, sans motif ; un voisin plus net que le centre pèse moins
  // (le proche ne bave pas sur le lointain).
  for (int i = 0; i < 16; i++) {
    float r = sqrt((float(i) + 0.5) / 16.0) * radius;
    float a = float(i) * 2.39996323;
    vec2 uv = vUV + vec2(cos(a), sin(a)) * r * texelSize;
    float w = clamp(cocAt(uv) / coc, 0.0, 1.0);
    sum += texture2D(textureSampler, uv).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(sum / total, center.a);
}
`;

const store = ShaderStore.ShadersStore as Record<string, string>;
store[`${AERIAL_SHADER}FragmentShader`] = AERIAL_FRAGMENT;
store[`${BLUR_SHADER}FragmentShader`] = BLUR_FRAGMENT;

/** Ce que la perspective atmosphérique reçoit à chaque image (SceneLighting → aerialState). */
export interface AerialState {
  /** Densité (par m) de la brume de distance. */
  readonly distanceDensity: number;
  /** Densité (par m) de la brume de hauteur à son altitude de base, son épaisseur (m) et cette altitude (m). */
  readonly heightDensity: number;
  readonly heightThicknessM: number;
  readonly heightBaseY: number;
  /** Couleur de la brume (linéaire, la même que l'horizon du ciel). */
  readonly haze: Rgb;
  /** Direction de la lumière (de l'astre vers le sol). */
  readonly sunDirection: { readonly x: number; readonly y: number; readonly z: number };
  /** Lumière de l'astre diffusée vers l'avant par l'air (couleur × force). */
  readonly sunScatter: Rgb;
}

/** Anisotropie de la diffusion par l'air chargé (brume, aérosols) : très tournée vers l'avant. */
export const AERIAL_MIE_G = 0.72;

/** Configuration de la pré-passe : seule la profondeur (z de la vue) est demandée. */
function depthOnly(name: string): PrePassEffectConfiguration {
  return { name, enabled: false, texturesRequired: [Constants.PREPASS_DEPTH_TEXTURE_TYPE] };
}

/** Texture de profondeur de la pré-passe (undefined tant qu'elle n'existe pas). */
function prePassDepth(scene: Scene): Texture | undefined {
  const prePass = scene.prePassRenderer;
  if (!prePass) return undefined;
  const index = prePass.getIndex(Constants.PREPASS_DEPTH_TEXTURE_TYPE);
  return index < 0 ? undefined : (prePass.getRenderTarget().textures[index] as Texture | undefined);
}

function setTanFov(target: Vector2, camera: Camera, scene: Scene): void {
  const tanY = Math.tan(camera.fov / 2);
  target.set(tanY * scene.getEngine().getAspectRatio(camera), tanY);
}

export class AerialPerspective {
  readonly postProcess: PostProcess;
  private readonly invView = new Matrix();
  private readonly tanFov = new Vector2();
  private readonly params = new Vector4();
  private readonly haze = new Color3();
  private readonly sunToward = new Vector3(0, 1, 0);
  private readonly scatter = new Vector4(0, 0, 0, AERIAL_MIE_G);

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    scene.enablePrePassRenderer();
    this.postProcess = new PostProcess(
      'perspective-atmospherique',
      AERIAL_SHADER,
      ['invView', 'tanFov', 'cameraPos', 'fogParams', 'hazeColor', 'sunToward', 'sunScatter'],
      ['depthSampler'],
      1,
      camera,
      Texture.NEAREST_SAMPLINGMODE,
      scene.getEngine(),
      false,
      null,
      Constants.TEXTURETYPE_HALF_FLOAT,
    );
    this.postProcess._prePassEffectConfiguration = depthOnly('perspective-atmospherique');
    this.postProcess.onApply = (effect: Effect) => this.bind(effect);
  }

  /** À chaque image : l'état de l'air (aucune allocation). */
  update(state: AerialState): void {
    this.params.set(
      Math.max(0, state.distanceDensity),
      Math.max(0, state.heightDensity),
      1 / Math.max(1, state.heightThicknessM),
      state.heightBaseY,
    );
    this.haze.set(state.haze[0], state.haze[1], state.haze[2]);
    this.sunToward.set(-state.sunDirection.x, -state.sunDirection.y, -state.sunDirection.z);
    this.scatter.set(state.sunScatter[0], state.sunScatter[1], state.sunScatter[2], AERIAL_MIE_G);
  }

  private bind(effect: Effect): void {
    const depth = prePassDepth(this.scene);
    if (depth) effect.setTexture('depthSampler', depth);
    this.camera.getViewMatrix().invertToRef(this.invView);
    effect.setMatrix('invView', this.invView);
    setTanFov(this.tanFov, this.camera, this.scene);
    effect.setVector2('tanFov', this.tanFov);
    effect.setVector3('cameraPos', this.camera.globalPosition);
    effect.setVector4('fogParams', this.params);
    effect.setColor3('hazeColor', this.haze);
    effect.setVector3('sunToward', this.sunToward);
    effect.setVector4('sunScatter', this.scatter);
  }

  dispose(): void {
    this.postProcess.dispose(this.camera);
  }
}

/** Hauteur d'image de référence des rayons de flou (px à 1080 lignes). */
const DOF_REFERENCE_HEIGHT = 1080;

export class DistanceBlur {
  readonly postProcess: PostProcess;
  private readonly tanFov = new Vector2();
  private readonly texel = new Vector2();
  private readonly params = new Vector4();

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    dof: DofQuality,
  ) {
    scene.enablePrePassRenderer();
    this.postProcess = new PostProcess(
      'profondeur-de-champ',
      BLUR_SHADER,
      ['texelSize', 'dof', 'tanFov'],
      ['depthSampler'],
      1,
      camera,
      Texture.BILINEAR_SAMPLINGMODE,
      scene.getEngine(),
      false,
      null,
      Constants.TEXTURETYPE_HALF_FLOAT,
    );
    this.postProcess._prePassEffectConfiguration = depthOnly('profondeur-de-champ');
    this.params.set(dof.fromM, dof.fullM, dof.maxBlurPx, 0);
    this.postProcess.onApply = (effect: Effect) => {
      const depth = prePassDepth(this.scene);
      if (depth) effect.setTexture('depthSampler', depth);
      const height = Math.max(1, this.postProcess.height);
      this.texel.set(1 / Math.max(1, this.postProcess.width), 1 / height);
      effect.setVector2('texelSize', this.texel);
      this.params.z = dof.maxBlurPx * (height / DOF_REFERENCE_HEIGHT);
      effect.setVector4('dof', this.params);
      setTanFov(this.tanFov, this.camera, this.scene);
      effect.setVector2('tanFov', this.tanFov);
    };
  }

  dispose(): void {
    this.postProcess.dispose(this.camera);
  }
}
