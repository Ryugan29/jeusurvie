// Rayons de soleil à l'écran (« god rays ») : quand on regarde vers le soleil, la lumière qui passe entre les feuillages et les
// rochers s'étire en rais clairs depuis lui. Calcul à l'écran, léger :
//   1. une carte de profondeur à demi-résolution des SEULS obstacles (arbres, rochers, buissons, terrain, personnages : pas
//      l'herbe, pas le ciel) — le ciel y reste « infiniment loin » ;
//   2. un post-traitement qui, pour chaque pixel, marche vers le soleil et compte la part de ciel ouvert rencontrée.
// Doit être créé AVANT le pipeline d'étalonnage (la tonalité vient ensuite) et après l'occlusion ambiante.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import type { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import type { Effect } from '@babylonjs/core/Materials/effect';
import type { Scene } from '@babylonjs/core/scene';
import type { Lighting } from '../render-data/lighting';
import type { RaysQuality } from '../render-data/quality';
import { sunRayIntensity, sunScreenUv, type CameraBasis } from '../render-data/sun-rays';

const SHADER_NAME = 'sunRays';

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 sunUv;
uniform vec3 shaftColor;
uniform vec2 params;       // x : force (0 = rien), y : largeur / hauteur de l'image

void main(void) {
  vec4 base = texture2D(textureSampler, vUV);
  if (params.x <= 0.001) {
    gl_FragColor = base;
    return;
  }
  vec2 toSun = sunUv - vUV;
  float dist = length(vec2(toSun.x * params.y, toSun.y));
  vec2 stride = toSun * 0.85 / float(SAMPLES);
  // Décalage du point de départ propre à chaque pixel : sans lui, les rais se découpent en bandes.
  float jitter = fract(sin(dot(vUV, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 uv = vUV + stride * jitter;
  float open = 0.0;
  float weight = 1.0;
  float total = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    uv += stride;
    bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
    float sky = outside ? 1.0 : step(0.9995, texture2D(depthSampler, uv).r);
    open += sky * weight;
    total += weight;
    weight *= 0.97;
  }
  open /= total;
  float near = exp(-dist * 2.2);      // les rais se perdent loin du soleil
  vec3 shafts = shaftColor * open * near * params.x * 0.55;
  gl_FragColor = vec4(base.rgb + shafts, base.a);
}
`;

(ShaderStore.ShadersStore as Record<string, string>)[`${SHADER_NAME}FragmentShader`] = FRAGMENT;

export class SunRays {
  /** Carte de profondeur des obstacles (à demi-résolution). */
  readonly depthMap: RenderTargetTexture;
  private readonly depthRenderer: DepthRenderer;
  private readonly post: PostProcess;
  private readonly sunUv = { u: 0.5, v: 0.5 };
  private readonly shaftColor = new Color3();
  private readonly toSun = new Vector3();
  private readonly center = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private strength = 0;

  /**
   * @param isOccluder dit quels maillages cachent le soleil : le ciel et l'herbe n'en sont pas.
   */
  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    quality: RaysQuality,
    isOccluder: (mesh: AbstractMesh) => boolean,
  ) {
    const rtt = new RenderTargetTexture('rayons-profondeur', { ratio: quality.ratio }, scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Texture.NEAREST_SAMPLINGMODE);
    this.depthRenderer = scene.enableDepthRenderer(camera, false, false, Texture.NEAREST_SAMPLINGMODE, false, rtt);
    this.depthRenderer.enabled = false; // allumée par update() seulement quand les rayons se voient
    this.depthMap = this.depthRenderer.getDepthMap();
    this.depthMap.renderListPredicate = (mesh) => isOccluder(mesh) && this.withinRange(mesh, quality.occluderRangeM);

    this.post = new PostProcess(
      'rayons',
      SHADER_NAME,
      ['sunUv', 'shaftColor', 'params'],
      ['depthSampler'],
      1,
      camera,
      Texture.BILINEAR_SAMPLINGMODE,
      scene.getEngine(),
      false,
      `#define SAMPLES ${quality.samples}`,
    );
    this.post.onApply = (effect: Effect): void => {
      effect.setTexture('depthSampler', this.depthMap);
      effect.setFloat2('sunUv', this.sunUv.u, this.sunUv.v);
      effect.setColor3('shaftColor', this.shaftColor);
      effect.setFloat2('params', this.strength, this.scene.getEngine().getAspectRatio(this.camera));
    };
  }

  /** Force actuelle des rayons (0 à 1) : nulle dos au soleil, de nuit. */
  get intensity(): number {
    return this.strength;
  }

  /** Le bord du maillage le plus proche est-il à portée de la caméra ? (Terrain lointain : trop d'appels de dessin pour des rais qu'on ne voit pas.) */
  private withinRange(mesh: AbstractMesh, rangeM: number): boolean {
    const world = mesh.computeWorldMatrix(true); // maillages figés (terrain) : rend la matrice en cache, sans calcul
    const sphere = mesh.getBoundingInfo().boundingSphere;
    Vector3.TransformCoordinatesToRef(sphere.center, world, this.center);
    const scale = Math.max(mesh.absoluteScaling.x, mesh.absoluteScaling.y, mesh.absoluteScaling.z);
    return Vector3.Distance(this.center, this.camera.position) - sphere.radius * scale <= rangeM;
  }

  /** La carte de profondeur est-elle dessinée cette image ? Seulement quand les rayons se voient : sinon, aucun coût. */
  get depthPassActive(): boolean {
    return this.depthRenderer.enabled;
  }

  /** À chaque image, après le placement de la caméra : où est le soleil à l'écran, et quelle force a-t-il ? */
  update(l: Lighting): void {
    this.updateStrength(l);
    this.depthRenderer.enabled = this.strength > 0;
  }

  private updateStrength(l: Lighting): void {
    const cam = this.camera;
    this.toSun.set(-l.sunDirection.x, -l.sunDirection.y, -l.sunDirection.z);
    cam.getDirectionToRef(Vector3.Forward(), this.forward);
    cam.getDirectionToRef(Vector3.Right(), this.right);
    cam.getDirectionToRef(Vector3.Up(), this.up);
    const basis: CameraBasis = {
      forward: this.forward,
      right: this.right,
      up: this.up,
      tanHalfFovY: Math.tan(cam.fov / 2),
      aspect: this.scene.getEngine().getAspectRatio(cam),
    };
    const sun = sunScreenUv(this.toSun, basis);
    if (sun === undefined) {
      this.strength = 0;
      return;
    }
    this.sunUv.u = sun.u;
    this.sunUv.v = sun.v;
    this.strength = sunRayIntensity(l.rayStrength, sun.facing);
    this.shaftColor.set(l.sunColor[0], l.sunColor[1], l.sunColor[2]);
  }

  dispose(): void {
    this.post.dispose(this.camera);
    this.scene.disableDepthRenderer(this.camera);
  }
}
