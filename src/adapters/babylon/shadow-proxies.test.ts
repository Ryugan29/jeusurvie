import '@babylonjs/core/Meshes/thinInstanceMesh';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShadowProxies, type NearInstances } from './shadow-proxies';

/** n instances alignées sur x = 0, 1, 2… (la translation est aux éléments 12 et 14). */
function line(n: number): Float32Array {
  const m = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i, 0, 0, 1], i * 16);
  return m;
}

describe('ShadowProxies (les ombres ne viennent que des arbres proches : un double par morceau de modèle, avec les instances proches)', () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera;
  let trunk: Mesh, crown: Mesh;
  let source: NearInstances & { revision: number };
  let near: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera('camera', new Vector3(0, 1, 0), scene);
    trunk = CreateBox('tronc', {}, scene);
    crown = CreateBox('feuillage', {}, scene);
    trunk.material = new StandardMaterial('ecorce', scene);
    near = vi.fn((model: string) => (model === 'Arbre' ? line(3) : new Float32Array(0)));
    source = { revision: 0, nearInstances: near as unknown as NearInstances['nearInstances'] };
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const library = { partsOf: (key: string): readonly Mesh[] => (key === 'Arbre' ? [trunk, crown] : []) };
  const OPTIONS = { radiusM: 150, stepM: 8 } as const;

  it('un double par morceau, présenté aux projeteurs d’ombre ; jamais les originaux', () => {
    const given: Mesh[] = [];
    const proxies = new ShadowProxies(library, source, ['Arbre', 'Absent'], OPTIONS, (m) => given.push(m));
    expect(given).toHaveLength(2);
    expect(given).not.toContain(trunk);
    expect(given).not.toContain(crown);
    expect(given.every((m) => proxies.isProxy(m))).toBe(true);
    expect(proxies.isProxy(trunk)).toBe(false);
  });

  it('les doubles sont invisibles pour la caméra (couche à part), partagent le matériau et ne se pointent pas', () => {
    const given: Mesh[] = [];
    new ShadowProxies(library, source, ['Arbre'], OPTIONS, (m) => given.push(m));
    for (const proxy of given) {
      expect(proxy.layerMask & camera.layerMask).toBe(0);
      expect(proxy.isPickable).toBe(false);
      expect(proxy.receiveShadows).toBe(false);
    }
    expect(given[0]!.material).toBe(trunk.material);
  });

  it('update : chaque double reçoit les instances proches du joueur, dans le rayon demandé', () => {
    const given: Mesh[] = [];
    const proxies = new ShadowProxies(library, source, ['Arbre'], OPTIONS, (m) => given.push(m));
    proxies.update(10, 20);
    expect(near).toHaveBeenCalledWith('Arbre', 10, 20, 150);
    for (const proxy of given) {
      expect(proxy.thinInstanceCount).toBe(3);
      expect(proxy.isEnabled()).toBe(true);
    }
  });

  it('aucune instance proche : le double est éteint (sinon Babylon redessinerait le modèle seul à l’origine)', () => {
    const given: Mesh[] = [];
    const proxies = new ShadowProxies(library, source, ['Arbre'], OPTIONS, (m) => given.push(m));
    proxies.update(0, 0);
    near.mockImplementation(() => new Float32Array(0));
    source.revision++;
    proxies.update(0, 0);
    for (const proxy of given) expect(proxy.isEnabled()).toBe(false);
  });

  it('ne recalcule ni quand le joueur reste dans le pas, ni tant que les chunks sont les mêmes ; recalcule dans les deux autres cas', () => {
    const proxies = new ShadowProxies(library, source, ['Arbre'], OPTIONS, () => undefined);
    proxies.update(0, 0);
    expect(near).toHaveBeenCalledTimes(1);
    proxies.update(3, 4); // 5 m : sous le pas de 8 m
    expect(near).toHaveBeenCalledTimes(1);
    proxies.update(6, 6); // 8,5 m du dernier calcul
    expect(near).toHaveBeenCalledTimes(2);
    proxies.update(6, 6);
    expect(near).toHaveBeenCalledTimes(2);
    source.revision++; // un chunk est arrivé
    proxies.update(6, 6);
    expect(near).toHaveBeenCalledTimes(3);
  });

  it('un modèle absent de la bibliothèque est ignoré sans erreur', () => {
    const proxies = new ShadowProxies(library, source, ['Absent'], OPTIONS, () => undefined);
    expect(() => proxies.update(0, 0)).not.toThrow();
    expect(near).not.toHaveBeenCalled();
  });
});
