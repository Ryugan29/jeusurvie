import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
export declare const LENS_DROPS_FRAGMENT = "\nprecision highp float;\nvarying vec2 vUV;\nuniform sampler2D textureSampler;\nuniform vec4 lens; // x : densit\u00E9 (0 \u00E0 1), y : temps (s), z : largeur / hauteur de l'image\n\nfloat hash12(vec2 p) {\n  vec3 p3 = fract(vec3(p.xyx) * 0.1031);\n  p3 += dot(p3, p3.yzx + 33.33);\n  return fract((p3.x + p3.y) * p3.z);\n}\n\n// Une couche de gouttes : au plus une goutte par case de la grille. Elle appara\u00EEt, parfois glisse vers le bas en laissant un\n// filet d'eau, puis s'\u00E9vapore ; une autre na\u00EEt au cycle suivant. Plus il pleut, plus de cases sont occup\u00E9es.\n// Rend (position dans la goutte / rayon, pr\u00E9sence).\nvec3 dropLayer(vec2 uv, float t, float cells, float density) {\n  vec2 p = uv * vec2(lens.z, 1.0) * cells;\n  vec2 id = floor(p);\n  vec2 f = fract(p) - 0.5;\n  float cycle = 3.0 + floor(4.0 * hash12(id + 4.7)); // 3 \u00E0 6 s : divisent la boucle du temps (600 s), pas de saut\n  float life = fract(t / cycle + hash12(id + 9.1));\n  float alive = step(hash12(id), density);\n  float slides = step(0.55, hash12(id + 2.3));\n  // Centre gard\u00E9 \u00E0 distance du bord de la case (rayon vertical jusqu'\u00E0 0,27) : la goutte n'est jamais coup\u00E9e ; une goutte\n  // qui glisse descend jusqu'au bas de sa case, pas plus loin.\n  vec2 c = (vec2(hash12(id + 1.7), hash12(id + 6.1)) - 0.5) * vec2(0.45, 0.2);\n  c.y = mix(c.y + 0.12, -0.23, slides * smoothstep(0.2, 1.0, life));\n  float r = (0.12 + 0.11 * hash12(id + 3.3)) * smoothstep(0.0, 0.06, life);\n  vec2 d = (f - c) * vec2(1.0, 0.85 + 0.3 * slides);\n  float drop = smoothstep(r, r * 0.55, length(d));\n  float above = f.y - c.y;\n  float trail = slides * smoothstep(0.05, 0.0, abs(f.x - c.x)) * smoothstep(0.0, 0.05, above) * smoothstep(0.5 * life, 0.0, above) * 0.5;\n  float m = max(drop, trail) * smoothstep(1.0, 0.75, life) * alive;\n  return vec3(d / max(r, 0.001) * drop, m);\n}\n\nvoid main() {\n  vec3 big = dropLayer(vUV, lens.y, 5.0, lens.x * 0.55);\n  vec3 small = dropLayer(vUV + vec2(0.37, 0.11), lens.y * 1.3, 11.0, lens.x * 0.75);\n  float mask = max(big.z, small.z);\n  vec2 offset = -(big.xy * big.z * 0.045 + small.xy * small.z * 0.025);\n  vec3 col = texture2D(textureSampler, vUV + offset).rgb;\n  // Bord un peu plus sombre et petit reflet clair en haut \u00E0 gauche : la goutte se lit sans masquer l'image.\n  float edge = max(smoothstep(0.55, 1.0, length(big.xy)) * big.z, smoothstep(0.55, 1.0, length(small.xy)) * small.z);\n  float glint = max(smoothstep(0.45, 0.1, length(big.xy - vec2(-0.35, 0.4))) * big.z,\n                    smoothstep(0.45, 0.1, length(small.xy - vec2(-0.35, 0.4))) * small.z);\n  col = col * (1.0 - edge * 0.3) + glint * 0.18 + mask * 0.02;\n  gl_FragColor = vec4(col, 1.0);\n}\n";
export declare class LensDrops {
    private readonly camera;
    private readonly post;
    private density;
    private timeS;
    private attached;
    private readonly rebuilt;
    private readonly pipeline;
    /**
     * @param pipeline l'étalonnage : quand il se reconstruit, il raccroche ses passes à la caméra (après les gouttes) ; les
     * gouttes se raccrochent alors derrière lui, pour toujours déformer l'image finale.
     */
    constructor(scene: Scene, camera: Camera, pipeline?: DefaultRenderingPipeline);
    /** Densité de gouttes actuelle (0 à 1). */
    get amount(): number;
    /** À chaque image : densité de gouttes (0 à 1) et horloge réelle (s). */
    update(amount: number, timeS: number): void;
    /** Raccroche la passe en dernière position (si elle est accrochée). */
    private moveToEnd;
    dispose(): void;
}
