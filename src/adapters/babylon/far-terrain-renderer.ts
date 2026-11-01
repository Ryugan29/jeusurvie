// Relief lointain : un seul maillage grossier du vrai terrain sur plusieurs kilomètres (render-data/far-terrain), calculé dans un
// worker et recentré quand le joueur s'est éloigné. Il ne se dessine qu'AU-DELÀ des chunks chargés (le shader jette ce qui est en
// deçà du rayon intérieur, autour du joueur) et se fond dans la brume à son bord (pas de bord carré à l'horizon).
// Brume de distance (Babylon) et brume de hauteur (lighting.addHeightFog) s'y appliquent : les chaînes pâlissent avec la distance,
// les vallées lointaines se remplissent de brume — la perspective atmosphérique qui manquait.
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { farCenterFor, type FarTerrainOptions, type FarTerrainRequest, type FarTerrainResult } from '../render-data/far-terrain';
import { WET_DARKEN } from './painted-ground-plugin';

/** Ce que le rendu attend du worker (un vrai Web Worker, ou un faux dans les tests). */
export interface FarTerrainWorkerLike {
  post(request: FarTerrainRequest): void;
  onResult(handler: (result: FarTerrainResult) => void): void;
}

export interface FarTerrainRendererOptions extends FarTerrainOptions {
  /** Rayon (m) autour du joueur où les chunks chargés sont dessinés : le relief lointain n'y est pas dessiné. */
  readonly innerRadiusM: number;
  /** Distance (m) du joueur au centre de la grille au-delà de laquelle elle est recalculée (aimantée sur ce pas). */
  readonly recenterM: number;
  /** Enfoncement (m) : dans la bande où chunks et relief lointain se recouvrent, le relief grossier reste dessous. */
  readonly sinkM: number;
}

/** Groupe de rendu du relief lointain : après la scène (groupe 0). */
export const FAR_TERRAIN_GROUP = 1;

/** Part du demi-côté où commence le fondu dans la brume (bord de la grille). */
const EDGE_FADE_FROM = 0.75;

const FRAGMENT_DEFINITIONS = '#ifdef FARTERRAIN\nuniform vec4 farTerrain;\nuniform vec4 farTerrainCenter;\n#endif\n';

const FRAGMENT_MAIN_BEGIN = `
#ifdef FARTERRAIN
  if (length(vPositionW.xz - farTerrain.xy) < farTerrain.z) discard;
#endif
`;

const FRAGMENT_BEFORE_FOG = `
#if defined(FARTERRAIN) && defined(FOG)
  vec2 ftFromCenter = abs(vPositionW.xz - farTerrainCenter.xy);
  color.rgb = mix(color.rgb, vFogColor, smoothstep(${EDGE_FADE_FROM.toFixed(2)} * farTerrain.w, farTerrain.w, max(ftFromCenter.x, ftFromCenter.y)));
#endif
`;

/** Jette ce qui est sous les chunks chargés, fond le bord de la grille dans la brume. */
export class FarTerrainPlugin extends MaterialPluginBase {
  private playerX = 0;
  private playerZ = 0;
  private centerX = 0;
  private centerZ = 0;

  constructor(
    material: Material,
    private readonly innerRadiusM: number,
    private readonly halfSizeM: number,
  ) {
    super(material, 'FarTerrain', 180, { FARTERRAIN: false }, true, true);
  }

  setPlayer(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  setCenter(x: number, z: number): void {
    this.centerX = x;
    this.centerZ = z;
  }

  override getClassName(): string {
    return 'FarTerrainPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['FARTERRAIN'] = true;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'farTerrain', size: 4, type: 'vec4' },
        { name: 'farTerrainCenter', size: 4, type: 'vec4' },
      ],
      fragment: FRAGMENT_DEFINITIONS,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4('farTerrain', this.playerX, this.playerZ, this.innerRadiusM, this.halfSizeM);
    uniformBuffer.updateFloat4('farTerrainCenter', this.centerX, this.centerZ, 0, 0);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    return shaderType === 'fragment' ? { CUSTOM_FRAGMENT_MAIN_BEGIN: FRAGMENT_MAIN_BEGIN, CUSTOM_FRAGMENT_BEFORE_FOG: FRAGMENT_BEFORE_FOG } : null;
  }
}

/** Assombrissement du relief lointain détrempé : celui du sol proche (WET_DARKEN), moyenné entre pentes et plats. */
export const FAR_WET_DARKEN = WET_DARKEN * 0.75;

export class FarTerrainRenderer {
  /** Matériau du relief lointain (la brume de hauteur s'y branche). */
  readonly material: StandardMaterial;
  private readonly plugin: FarTerrainPlugin;
  private mesh: Mesh | undefined;
  private shownCenter: { x: number; z: number } | undefined;
  private pendingId = -1;
  private nextId = 0;

  constructor(
    private readonly scene: Scene,
    private readonly seed: number,
    private readonly options: FarTerrainRendererOptions,
    private readonly worker: FarTerrainWorkerLike,
  ) {
    this.material = new StandardMaterial('relief-lointain', scene);
    // Rendu mat, comme le sol proche ; la couleur vient des sommets (palette, canopée).
    this.material.specularColor = Color3.Black();
    this.plugin = new FarTerrainPlugin(this.material, options.innerRadiusM, options.halfSizeM);
    // Le groupe du relief lointain garde la profondeur du groupe 0 (sinon il passerait devant tout).
    scene.setRenderingAutoClearDepthStencil(FAR_TERRAIN_GROUP, false, false, false);
    worker.onResult((result) => this.show(result));
  }

  /** Sol mouillé par la météo (0 = sec, 1 = détrempé) : le relief lointain fonce comme le sol proche. */
  setWetness(wetness: number): void {
    const k = 1 - FAR_WET_DARKEN * Math.min(1, Math.max(0, wetness));
    this.material.diffuseColor.set(k, k, k);
  }

  /** Centre de la grille affichée (undefined tant que le premier calcul n'est pas arrivé). */
  get center(): { x: number; z: number } | undefined {
    return this.shownCenter;
  }

  /** À chaque image : position du joueur pour le shader ; demande un recentrage quand il s'est éloigné (un seul calcul à la fois). */
  update(playerX: number, playerZ: number): void {
    this.plugin.setPlayer(playerX, playerZ);
    if (this.pendingId >= 0) return;
    const wanted = farCenterFor(playerX, playerZ, this.options.recenterM);
    if (this.shownCenter && this.shownCenter.x === wanted.x && this.shownCenter.z === wanted.z) return;
    this.pendingId = this.nextId++;
    const { halfSizeM, stepM } = this.options;
    this.worker.post({ id: this.pendingId, seed: this.seed, centerX: wanted.x, centerZ: wanted.z, options: { halfSizeM, stepM } });
  }

  private show(result: FarTerrainResult): void {
    if (result.id !== this.pendingId) return; // réponse périmée
    this.pendingId = -1;
    this.mesh?.dispose(false, false);
    const mesh = new Mesh('relief-lointain', this.scene);
    const data = new VertexData();
    data.positions = result.mesh.positions;
    data.normals = result.mesh.normals;
    data.colors = result.mesh.colors;
    data.indices = result.mesh.indices;
    data.applyToMesh(mesh, false);
    mesh.position.set(result.centerX, -this.options.sinkM, result.centerZ);
    mesh.material = this.material;
    mesh.isPickable = false;
    // Dessiné APRÈS le reste (groupe suivant, profondeur gardée) : là où les chunks, les arbres ou le perso sont devant, ses pixels
    // sont rejetés par le test de profondeur au lieu d'être calculés puis recouverts. Son centre étant au joueur, le tri « du plus
    // proche au plus lointain » le dessinait en premier, sur tout l'écran — le pixel jeté (discard) n'y change rien.
    mesh.renderingGroupId = FAR_TERRAIN_GROUP;
    mesh.freezeWorldMatrix();
    this.mesh = mesh;
    this.shownCenter = { x: result.centerX, z: result.centerZ };
    this.plugin.setCenter(result.centerX, result.centerZ);
  }

  dispose(): void {
    this.mesh?.dispose(false, false);
    this.material.dispose();
  }
}

/** Le vrai Web Worker du relief lointain (module ES, servi par Vite). */
export function createFarTerrainWorker(): FarTerrainWorkerLike {
  const worker = new Worker(new URL('../worker/far-terrain.worker.ts', import.meta.url), { type: 'module', name: 'relief-lointain' });
  return {
    post: (request) => worker.postMessage(request),
    onResult: (handler) => {
      worker.onmessage = (event: MessageEvent<FarTerrainResult>) => handler(event.data);
    },
  };
}
