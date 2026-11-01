import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAnimatedModel, loadAnimationSource, retargetAnimations } from './animated-model';

// --- Modèle glTF minimal fabriqué ici (aucun fichier, aucune texture) : un squelette root > pelvis > head, une plaque de
// 2 m de haut dont le bas est à 0,2 m de l'origine (comme un modèle dont l'origine n'est pas aux pieds), un repère « nez »
// devant (glTF : +Z) et, au choix, une animation Walk et un os « tail » en plus. ----------------------------------------
const FLOAT = 5126, USHORT = 5123, UBYTE = 5121;

class GltfBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  readonly bufferViews: object[] = [];
  readonly accessors: object[] = [];

  add(data: Float32Array | Uint16Array | Uint8Array, componentType: number, type: string): number {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padding = (4 - (bytes.length % 4)) % 4;
    this.bufferViews.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.length });
    this.chunks.push(bytes, Buffer.alloc(padding));
    this.size += bytes.length + padding;
    const count = data.length / { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type]!;
    this.accessors.push({ bufferView: this.bufferViews.length - 1, componentType, count, type });
    return this.accessors.length - 1;
  }

  uri(): string {
    return `data:application/octet-stream;base64,${Buffer.concat(this.chunks).toString('base64')}`;
  }
  get byteLength(): number {
    return this.size;
  }
}

interface RigOptions {
  /** Hauteur du bassin au repos (m) : change d'un squelette à l'autre (proportions). */
  readonly pelvisY: number;
  /** Ajoute une animation « Walk » (bassin, tête, os « tail » si demandé). */
  readonly walk?: boolean;
  /** Ajoute un os « tail » sous le bassin (que l'autre squelette n'a pas). */
  readonly tail?: boolean;
}

function riggedGltf({ pelvisY, walk = false, tail = false }: RigOptions): string {
  const b = new GltfBuffer();
  const position = b.add(new Float32Array([-0.3, 0.2, 0, 0.3, 0.2, 0, 0.3, 2.2, 0, -0.3, 2.2, 0]), FLOAT, 'VEC3');
  const normal = b.add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), FLOAT, 'VEC3');
  const joints = b.add(new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), UBYTE, 'VEC4'); // 1 = pelvis
  const weights = b.add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), FLOAT, 'VEC4');
  const color = b.add(new Float32Array(16).fill(1), FLOAT, 'VEC4'); // couleurs de sommets blanches (comme les héros)
  const indices = b.add(new Uint16Array([0, 1, 2, 0, 2, 3]), USHORT, 'SCALAR');
  const identity = (y: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -y, 0, 1];
  const inverseBind = b.add(new Float32Array([...identity(0), ...identity(pelvisY), ...identity(pelvisY + 0.8)]), FLOAT, 'MAT4');

  const nodes: object[] = [
    { name: 'Armature', children: [1, 4, 5] },
    { name: 'root', children: [2] },
    { name: 'pelvis', translation: [0, pelvisY, 0], children: tail ? [3, 6] : [3] },
    { name: 'head', translation: [0, 0.8, 0] },
    { name: 'body', mesh: 0, skin: 0 },
    { name: 'nose', translation: [0, 1.7, 1] },
  ];
  if (tail) nodes.push({ name: 'tail', translation: [0, -0.2, -0.3] });

  const animations: object[] = [];
  if (walk) {
    const times = b.add(new Float32Array([0, 1]), FLOAT, 'SCALAR');
    const samplers = [
      { input: times, output: b.add(new Float32Array([0, 0, 0, 1, Math.SQRT1_2, 0, 0, Math.SQRT1_2]), FLOAT, 'VEC4') },
      { input: times, output: b.add(new Float32Array([0, pelvisY, 0, 0, pelvisY + 0.1, 0]), FLOAT, 'VEC3') },
      { input: times, output: b.add(new Float32Array([0, 0.8, 0, 0, 0.9, 0]), FLOAT, 'VEC3') },
      { input: times, output: b.add(new Float32Array([1, 1, 1, 2, 2, 2]), FLOAT, 'VEC3') },
    ];
    const channels = [
      { sampler: 0, target: { node: 2, path: 'rotation' } },
      { sampler: 1, target: { node: 2, path: 'translation' } },
      { sampler: 2, target: { node: 3, path: 'translation' } },
      { sampler: 3, target: { node: 3, path: 'scale' } },
    ];
    if (tail) {
      samplers.push({ input: times, output: b.add(new Float32Array([0, 0, 0, 1, Math.SQRT1_2, 0, 0, Math.SQRT1_2]), FLOAT, 'VEC4') });
      channels.push({ sampler: 4, target: { node: 6, path: 'rotation' } });
    }
    animations.push({ name: 'Walk', samplers, channels });
  }

  return `data:${JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    skins: [{ joints: [1, 2, 3], inverseBindMatrices: inverseBind }],
    meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joints, WEIGHTS_0: weights, COLOR_0: color }, indices, material: 0 }] }],
    materials: [{ name: 'peau', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.5, 0.4, 1], metallicFactor: 0 } }],
    animations,
    buffers: [{ byteLength: b.byteLength, uri: b.uri() }],
    bufferViews: b.bufferViews,
    accessors: b.accessors,
  })}`;
}

describe('animated-model (vrai moteur Babylon sans carte graphique, modèles glTF fabriqués sur place)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  describe('loadAnimatedModel', () => {
    it('rend les maillages à dessiner, les nœuds et animations par nom ; les animations attendent qu’on les lance', async () => {
      const model = await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1, walk: true }), { heightM: 1.7 });
      expect(model.meshes.map((m) => m.name)).toEqual(['body']);
      expect(model.nodes.get('pelvis')).toBeDefined();
      expect([...model.animations.keys()]).toEqual(['Walk']);
      expect(model.animations.get('Walk')!.isStarted).toBe(false);
    });

    it('met le modèle à la taille demandée, pieds sur l’origine du pivot, où qu’il soit', async () => {
      const model = await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7 });
      model.pivot.position.set(10, 5, -3);
      const body = model.meshes[0]!;
      body.computeWorldMatrix(true);
      const box = body.getBoundingInfo().boundingBox;
      expect(box.maximumWorld.y - box.minimumWorld.y).toBeCloseTo(1.7, 5);
      expect(box.minimumWorld.y).toBeCloseTo(5, 5);
      expect((box.minimumWorld.x + box.maximumWorld.x) / 2).toBeCloseTo(10, 5);
    });

    it('regarde vers +Z quand le pivot n’est pas tourné ; son lacet suit la convention de la caméra (π/2 = vers +X)', async () => {
      const model = await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7 });
      const nose = model.nodes.get('nose')!;
      const forward = (): Vector3 => {
        model.pivot.computeWorldMatrix(true);
        nose.computeWorldMatrix(true);
        return nose.getAbsolutePosition().subtract(model.pivot.position).normalize();
      };
      const horizontal = (v: Vector3): Vector3 => new Vector3(v.x, 0, v.z).normalize();
      expect(horizontal(forward()).x).toBeCloseTo(0, 5);
      expect(horizontal(forward()).z).toBeCloseTo(1, 5);
      model.pivot.rotation.y = Math.PI / 2;
      expect(horizontal(forward()).x).toBeCloseTo(1, 5);
      expect(horizontal(forward()).z).toBeCloseTo(0, 5);
    });

    it('peau opaque en PBR (diélectrique satiné), jamais choisie à la souris, jamais écartée de l’image quand elle s’anime', async () => {
      const model = await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7 });
      const body = model.meshes[0]!;
      expect(body.material).toBeInstanceOf(PBRMaterial);
      const pbr = body.material as PBRMaterial;
      expect(pbr.metallic).toBe(0);
      expect(pbr.roughness).toBeGreaterThan(0.3);
      expect(body.material!.needAlphaBlendingForMesh(body)).toBe(false);
      expect(body.isPickable).toBe(false);
      expect(body.alwaysSelectAsActiveMesh).toBe(true);
    });

    it('une teinte donnée à un matériau par son nom colore son albédo ; les autres matériaux sont intacts', async () => {
      const plain = (await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7 })).meshes[0]!.material as PBRMaterial;
      const tinted = (await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7, tints: { peau: new Color3(0.5, 1, 0) } })).meshes[0]!.material as PBRMaterial;
      const other = (await loadAnimatedModel(scene, riggedGltf({ pelvisY: 1 }), { heightM: 1.7, tints: { cheveux: new Color3(0.5, 1, 0) } })).meshes[0]!.material as PBRMaterial;
      expect(tinted.albedoColor.r).toBeCloseTo(plain.albedoColor.r * 0.5, 6);
      expect(tinted.albedoColor.g).toBeCloseTo(plain.albedoColor.g, 6);
      expect(tinted.albedoColor.b).toBeCloseTo(0, 6);
      expect(other.albedoColor.r).toBeCloseTo(plain.albedoColor.r, 6);
    });

    it('un fichier illisible fait échouer le chargement (la scène de démo garde alors sa capsule)', async () => {
      await expect(loadAnimatedModel(scene, 'data:{"pas":"du glTF"}', { heightM: 1.7 })).rejects.toBeDefined();
    });
  });

  describe('retargetAnimations (animations d’un squelette rejouées sur un autre, os appariés par nom)', () => {
    async function setup(options: { sourceTail?: boolean } = {}) {
      const source = await loadAnimationSource(scene, riggedGltf({ pelvisY: 1, walk: true, tail: options.sourceTail ?? false }));
      const target = await loadAnimatedModel(scene, riggedGltf({ pelvisY: 0.9 }), { heightM: 1.7 });
      return { source, target };
    }
    function playToEnd(group: { start: (loop: boolean) => unknown; to: number; goToFrame: (frame: number) => void }): void {
      group.start(false);
      group.goToFrame(group.to);
    }

    it('les rotations des os sont rejouées sur l’os de même nom du modèle cible', async () => {
      const { source, target } = await setup();
      const { groups } = retargetAnimations(source, target, ['Walk'], { moveBones: ['pelvis'] });
      playToEnd(groups.get('Walk')!);
      const q = target.nodes.get('pelvis')!.rotationQuaternion!;
      expect(q.x).toBeCloseTo(Math.SQRT1_2, 5);
      expect(q.w).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('le bassin garde son déplacement, décalé de la différence de hauteur au repos entre les deux squelettes', async () => {
      const { source, target } = await setup();
      const { groups } = retargetAnimations(source, target, ['Walk'], { moveBones: ['pelvis'] });
      playToEnd(groups.get('Walk')!);
      // source : 1,0 → 1,1 ; cible au repos 0,9 au lieu de 1,0 : le bassin finit à 1,1 − 0,1 = 1,0
      expect(target.nodes.get('pelvis')!.position.y).toBeCloseTo(1.0, 5);
    });

    it('les autres os gardent leurs propres proportions : ni déplacement, ni échelle venus de l’autre squelette', async () => {
      const { source, target } = await setup();
      const { groups } = retargetAnimations(source, target, ['Walk'], { moveBones: ['pelvis'] });
      playToEnd(groups.get('Walk')!);
      const head = target.nodes.get('head')!;
      expect(head.position.y).toBeCloseTo(0.8, 5);
      expect(head.scaling.y).toBeCloseTo(1, 5);
    });

    it('un os que le modèle cible n’a pas est ignoré et signalé, sans faire échouer le reste', async () => {
      const { source, target } = await setup({ sourceTail: true });
      const { groups, missingBones } = retargetAnimations(source, target, ['Walk'], { moveBones: ['pelvis'] });
      expect(missingBones).toEqual(['tail']);
      playToEnd(groups.get('Walk')!);
      expect(target.nodes.get('pelvis')!.rotationQuaternion!.x).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('une animation absente de la source est une erreur nette (pas un personnage figé en silence)', async () => {
      const { source, target } = await setup();
      expect(() => retargetAnimations(source, target, ['Walk', 'Fly'], { moveBones: [] })).toThrow(/Fly/);
    });

    it('la source peut être libérée : les animations reciblées jouent toujours', async () => {
      const { source, target } = await setup();
      const { groups } = retargetAnimations(source, target, ['Walk'], { moveBones: ['pelvis'] });
      source.dispose();
      playToEnd(groups.get('Walk')!);
      expect(target.nodes.get('pelvis')!.rotationQuaternion!.x).toBeCloseTo(Math.SQRT1_2, 5);
      expect(scene.animationGroups.map((g) => g.name)).toEqual(['Walk']); // la source n'a laissé aucune animation dans la scène
    });
  });
});
