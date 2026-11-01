// Gouttes sur l'objectif quand il pleut (render-data/lens-drops → densité) : une dernière passe d'image, après l'étalonnage,
// dessine des gouttes qui apparaissent, glissent en laissant un filet d'eau et s'évaporent. Chaque goutte est une petite
// lentille : l'image derrière elle est retournée et grossie. Par temps sec, la passe est décrochée de la caméra (aucun coût).
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import type { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import type { Scene } from '@babylonjs/core/scene';

const SHADER_NAME = 'gouttesObjectif';

export const LENS_DROPS_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec4 lens; // x : densité (0 à 1), y : temps (s), z : largeur / hauteur de l'image

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Une couche de gouttes : au plus une goutte par case de la grille. Elle apparaît, parfois glisse vers le bas en laissant un
// filet d'eau, puis s'évapore ; une autre naît au cycle suivant. Plus il pleut, plus de cases sont occupées.
// Rend (position dans la goutte / rayon, présence).
vec3 dropLayer(vec2 uv, float t, float cells, float density) {
  vec2 p = uv * vec2(lens.z, 1.0) * cells;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float cycle = 3.0 + floor(4.0 * hash12(id + 4.7)); // 3 à 6 s : divisent la boucle du temps (600 s), pas de saut
  float life = fract(t / cycle + hash12(id + 9.1));
  float alive = step(hash12(id), density);
  float slides = step(0.55, hash12(id + 2.3));
  // Centre gardé à distance du bord de la case (rayon vertical jusqu'à 0,27) : la goutte n'est jamais coupée ; une goutte
  // qui glisse descend jusqu'au bas de sa case, pas plus loin.
  vec2 c = (vec2(hash12(id + 1.7), hash12(id + 6.1)) - 0.5) * vec2(0.45, 0.2);
  c.y = mix(c.y + 0.12, -0.23, slides * smoothstep(0.2, 1.0, life));
  float r = (0.12 + 0.11 * hash12(id + 3.3)) * smoothstep(0.0, 0.06, life);
  vec2 d = (f - c) * vec2(1.0, 0.85 + 0.3 * slides);
  float drop = smoothstep(r, r * 0.55, length(d));
  float above = f.y - c.y;
  float trail = slides * smoothstep(0.05, 0.0, abs(f.x - c.x)) * smoothstep(0.0, 0.05, above) * smoothstep(0.5 * life, 0.0, above) * 0.5;
  float m = max(drop, trail) * smoothstep(1.0, 0.75, life) * alive;
  return vec3(d / max(r, 0.001) * drop, m);
}

void main() {
  vec3 big = dropLayer(vUV, lens.y, 5.0, lens.x * 0.55);
  vec3 small = dropLayer(vUV + vec2(0.37, 0.11), lens.y * 1.3, 11.0, lens.x * 0.75);
  float mask = max(big.z, small.z);
  vec2 offset = -(big.xy * big.z * 0.045 + small.xy * small.z * 0.025);
  vec3 col = texture2D(textureSampler, vUV + offset).rgb;
  // Bord un peu plus sombre et petit reflet clair en haut à gauche : la goutte se lit sans masquer l'image.
  float edge = max(smoothstep(0.55, 1.0, length(big.xy)) * big.z, smoothstep(0.55, 1.0, length(small.xy)) * small.z);
  float glint = max(smoothstep(0.45, 0.1, length(big.xy - vec2(-0.35, 0.4))) * big.z,
                    smoothstep(0.45, 0.1, length(small.xy - vec2(-0.35, 0.4))) * small.z);
  col = col * (1.0 - edge * 0.3) + glint * 0.18 + mask * 0.02;
  gl_FragColor = vec4(col, 1.0);
}
`;

(ShaderStore.ShadersStore as Record<string, string>)[`${SHADER_NAME}FragmentShader`] = LENS_DROPS_FRAGMENT;

/** En dessous de cette densité, la passe est décrochée : plus aucune goutte ne se voit. */
const MIN_VISIBLE = 0.01;
/** Le temps du shader reboucle (s) : les sinus et hachages gardent leur précision. */
const TIME_WRAP_S = 600;

export class LensDrops {
  private readonly post: PostProcess;
  private density = 0;
  private timeS = 0;
  private attached = false;
  private readonly rebuilt: Observer<DefaultRenderingPipeline> | null;
  private readonly pipeline: DefaultRenderingPipeline | undefined;

  /**
   * @param pipeline l'étalonnage : quand il se reconstruit, il raccroche ses passes à la caméra (après les gouttes) ; les
   * gouttes se raccrochent alors derrière lui, pour toujours déformer l'image finale.
   */
  constructor(
    scene: Scene,
    private readonly camera: Camera,
    pipeline?: DefaultRenderingPipeline,
  ) {
    this.pipeline = pipeline;
    this.rebuilt = pipeline?.onBuildObservable.add(() => this.moveToEnd()) ?? null;
    // Créée sans caméra : elle n'est accrochée (en dernière passe) que quand il y a des gouttes.
    this.post = new PostProcess('gouttes', SHADER_NAME, ['lens'], null, 1, null, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine(), false);
    this.post.onApply = (effect: Effect): void => {
      effect.setFloat4('lens', this.density, this.timeS % TIME_WRAP_S, scene.getEngine().getAspectRatio(this.camera), 0);
    };
  }

  /** Densité de gouttes actuelle (0 à 1). */
  get amount(): number {
    return this.density;
  }

  /** À chaque image : densité de gouttes (0 à 1) et horloge réelle (s). */
  update(amount: number, timeS: number): void {
    this.density = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    this.timeS = timeS;
    const wanted = this.density > MIN_VISIBLE;
    if (wanted === this.attached) return;
    if (wanted) this.camera.attachPostProcess(this.post);
    else this.camera.detachPostProcess(this.post);
    this.attached = wanted;
  }

  /** Raccroche la passe en dernière position (si elle est accrochée). */
  private moveToEnd(): void {
    if (!this.attached) return;
    this.camera.detachPostProcess(this.post);
    this.camera.attachPostProcess(this.post);
  }

  dispose(): void {
    if (this.rebuilt) this.pipeline?.onBuildObservable.remove(this.rebuilt);
    if (this.attached) this.camera.detachPostProcess(this.post);
    this.post.dispose();
  }
}
