import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RAIN, RainRenderer, rainStreakSprite } from './rain-renderer';

describe('RainRenderer (pluie autour de la caméra, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const system = (): ParticleSystem => scene.particleSystems.find((p) => p.name === 'pluie') as ParticleSystem;

  it('des traits étirés dans le sens de la chute, au plus autant de gouttes que la qualité le permet', () => {
    new RainRenderer(scene, 3000);
    const p = system();
    expect(p.getCapacity()).toBe(3000);
    expect(p.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    // Pas de temps en vraies secondes (Babylon : 0,01 par défaut) : vitesse de chute et durée de vie tenues telles quelles.
    expect(p.updateSpeed).toBeCloseTo(1 / 60, 9);
  });

  it('sans pluie, aucune goutte ; à pleine pluie, de quoi entretenir toutes les gouttes', () => {
    const rain = new RainRenderer(scene, 3000);
    rain.update({ rain: 0, wind: 0, brightness: 1 }, 0, 0, 0);
    expect(system().emitRate).toBe(0);
    rain.update({ rain: 1, wind: 0, brightness: 1 }, 0, 0, 0);
    expect(system().emitRate).toBeCloseTo(3000 / RAIN.lifeS, 6);
    rain.update({ rain: 0.5, wind: 0, brightness: 1 }, 0, 0, 0);
    expect(system().emitRate).toBeCloseTo(1500 / RAIN.lifeS, 6);
  });

  it('la pluie suit la caméra et tombe en biais quand le vent souffle', () => {
    const rain = new RainRenderer(scene, 1000);
    rain.update({ rain: 1, wind: 0, brightness: 1 }, 12, 30, -7);
    const emitter = system().emitter as { x: number; y: number; z: number };
    expect([emitter.x, emitter.y, emitter.z]).toEqual([12, 30, -7]);
    expect(system().direction1.x).toBeCloseTo(0, 6);
    expect(system().direction1.y).toBeLessThan(0);
    rain.update({ rain: 1, wind: 1, brightness: 1 }, 12, 30, -7);
    expect(system().direction1.x).toBeGreaterThan(0.1);
  });

  it('gouttes discrètes la nuit (couleur suivant la lumière de la scène), jamais opaques', () => {
    const rain = new RainRenderer(scene, 1000);
    rain.update({ rain: 1, wind: 0, brightness: 1 }, 0, 0, 0);
    const day = system().color1.r;
    rain.update({ rain: 1, wind: 0, brightness: 0.2 }, 0, 0, 0);
    expect(system().color1.r).toBeLessThan(day);
    expect(system().color1.a).toBeLessThan(0.6);
  });

  it('aucune goutte quand la qualité coupe la pluie (?pluie=0)', () => {
    const rain = new RainRenderer(scene, 0);
    rain.update({ rain: 1, wind: 0, brightness: 1 }, 0, 0, 0);
    expect(scene.particleSystems).toHaveLength(0);
  });

  it('trait de goutte : opaque au centre, transparent sur les bords et aux extrémités', () => {
    const w = 4, h = 32, data = rainStreakSprite(w, h);
    const alpha = (x: number, y: number): number => data[(y * w + x) * 4 + 3]!;
    expect(alpha(1, h / 2)).toBeGreaterThan(150);
    expect(alpha(0, 0)).toBeLessThan(alpha(1, h / 2));
    expect(alpha(1, 0)).toBeLessThan(alpha(1, h / 2));
  });
});
