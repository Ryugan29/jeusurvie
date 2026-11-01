import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFarTerrain, type FarTerrainRequest, type FarTerrainResult } from '../render-data/far-terrain';
import { FAR_TERRAIN_GROUP, FAR_WET_DARKEN, FarTerrainRenderer, type FarTerrainWorkerLike } from './far-terrain-renderer';
import { WET_ALBEDO_DARKEN } from '../render-data/ground-materials';

/** Faux worker : garde les demandes ; `answer` calcule et rend (comme le vrai, mais à la demande du test). */
function fakeWorker(): FarTerrainWorkerLike & { requests: FarTerrainRequest[]; answer(i?: number): void } {
  let handler: (r: FarTerrainResult) => void = () => undefined;
  const requests: FarTerrainRequest[] = [];
  return {
    requests,
    post: (r) => requests.push(r),
    onResult: (h) => {
      handler = h;
    },
    answer: (i = requests.length - 1) => {
      const r = requests[i]!;
      handler({ id: r.id, centerX: r.centerX, centerZ: r.centerZ, mesh: buildFarTerrain(r.seed, r.centerX, r.centerZ, r.options) });
    },
  };
}

describe('FarTerrainRenderer (relief lointain, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  const options = { halfSizeM: 400, stepM: 100, innerRadiusM: 300, recenterM: 500, sinkM: 3 };

  it('matériau physique comme le sol proche (même lumière, même ciel), mat, couleur des sommets', () => {
    const far = new FarTerrainRenderer(scene, 7, options, fakeWorker());
    expect(far.material.getClassName()).toBe('PBRMaterial');
    expect(far.material.metallic).toBe(0);
    expect(far.material.roughness).toBeGreaterThan(0.8);
  });

  it('setHaze : le bord de la grille se fond dans la couleur de l’horizon donnée', () => {
    const far = new FarTerrainRenderer(scene, 7, options, fakeWorker());
    far.setHaze([0.4, 0.5, 0.6]);
    expect((far.material.pluginManager?.getPlugin('FarTerrain') as unknown as { haze: number[] }).haze).toEqual([0.4, 0.5, 0.6]);
  });

  it('setWetness : le relief lointain fonce sous la pluie comme le sol proche (pas de frontière sec / mouillé)', () => {
    const far = new FarTerrainRenderer(scene, 7, options, fakeWorker());
    const plugin = far.material.pluginManager?.getPlugin('FarTerrain') as unknown as { albedoFactor: number; roughness: number };
    far.setWetness(0);
    expect(plugin.albedoFactor).toBeCloseTo(1, 6);
    const dryRoughness = plugin.roughness;
    far.setWetness(1);
    expect(plugin.albedoFactor).toBeCloseTo(1 - FAR_WET_DARKEN, 6);
    expect(plugin.roughness).toBeLessThan(dryRoughness); // l'eau lisse la matière
    expect(FAR_WET_DARKEN).toBeGreaterThanOrEqual(WET_ALBEDO_DARKEN * 0.5); // entre la pente (½ effet) et le plat (effet plein)
    expect(FAR_WET_DARKEN).toBeLessThanOrEqual(WET_ALBEDO_DARKEN);
  });
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('demande la grille centrée (aimantée) sur le joueur, puis l’affiche enfoncée de sinkM', () => {
    const worker = fakeWorker();
    const far = new FarTerrainRenderer(scene, 7, options, worker);
    far.update(740, -260);
    expect(worker.requests).toHaveLength(1);
    expect(worker.requests[0]).toMatchObject({ seed: 7, centerX: 500, centerZ: -500, options: { halfSizeM: 400, stepM: 100 } });
    expect(far.center).toBeUndefined();
    worker.answer();
    expect(far.center).toEqual({ x: 500, z: -500 });
    const mesh = scene.getMeshByName('relief-lointain')!;
    expect(mesh.position.asArray()).toEqual([500, -3, -500]);
    expect(mesh.material).toBe(far.material);
    // Dessiné après la scène, sur sa profondeur : ce qui est caché n'est pas calculé.
    expect(mesh.renderingGroupId).toBe(FAR_TERRAIN_GROUP);
    expect(FAR_TERRAIN_GROUP).toBeGreaterThan(0);
  });

  it('un seul calcul à la fois, et rien tant que le joueur reste près du centre', () => {
    const worker = fakeWorker();
    const far = new FarTerrainRenderer(scene, 7, options, worker);
    far.update(0, 0);
    far.update(2000, 0); // en cours : pas de nouvelle demande
    expect(worker.requests).toHaveLength(1);
    worker.answer();
    far.update(100, -200); // même centre aimanté
    expect(worker.requests).toHaveLength(1);
    far.update(900, 0); // nouveau centre
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]).toMatchObject({ centerX: 1000, centerZ: 0 });
  });

  it('remplace l’ancien maillage (un seul relief lointain dans la scène)', () => {
    const worker = fakeWorker();
    const far = new FarTerrainRenderer(scene, 7, options, worker);
    far.update(0, 0);
    worker.answer();
    far.update(1000, 0);
    worker.answer();
    expect(scene.meshes.filter((m) => m.name === 'relief-lointain')).toHaveLength(1);
    expect(far.center).toEqual({ x: 1000, z: 0 });
  });

  it('le shader jette ce qui est sous les chunks chargés et fond le bord dans la brume', () => {
    const far = new FarTerrainRenderer(scene, 7, options, fakeWorker());
    const plugin = far.material.pluginManager!.getPlugin('FarTerrain')!;
    const code = plugin.getCustomCode('fragment')!;
    expect(code['CUSTOM_FRAGMENT_MAIN_BEGIN']).toContain('discard');
    expect(code['CUSTOM_FRAGMENT_BEFORE_FOG']).toContain('farTerrainHaze'); // fond vers l'horizon donné, avec ou sans brume des matériaux
    expect(code['CUSTOM_FRAGMENT_BEFORE_FOG']).toContain('finalColor.rgb'); // couleur finale du matériau physique
    expect(code['CUSTOM_FRAGMENT_UPDATE_ALBEDO']).toContain('toLinearSpace(vColor.rgb)'); // palette sRGB → linéaire, comme le sol proche
  });
});
