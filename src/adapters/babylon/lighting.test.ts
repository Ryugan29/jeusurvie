import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { fogAmount, hazeColor } from '../render-data/fog';
import { WEATHER_PRESETS, type WeatherKind } from '../../core/world/weather';
import { atmosphereFor, distanceFogDensity } from '../render-data/atmosphere';
import { cosmosFor } from '../render-data/cosmos';
import { lightingFor } from '../render-data/lighting';
import { SceneLighting } from './lighting';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const weather = (kind: WeatherKind) => ({ ...WEATHER_PRESETS[kind], wetness: 0 });
const OPTIONS = { viewRadiusM: 512, fogDistanceFraction: 1, heightFogBaseY: -6, domeSegments: 16 } as const;

describe('SceneLighting (ambiance appliquée à la scène, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('apply : le soleil, l’ambiance et la brume prennent les valeurs de l’atmosphère (heure + météo)', () => {
    const lighting = new SceneLighting(scene, OPTIONS);
    const time = timeOfDay(0.3 * CYCLE_S);
    const l = atmosphereFor(lightingFor(time), weather('clair'), 0).light;
    lighting.apply(atmosphereFor(lightingFor(time), weather('clair'), 0), time, 0.016);
    expect(lighting.sun.intensity).toBeCloseTo(l.sunIntensity, 6);
    expect(lighting.sun.diffuse.r).toBeCloseTo(l.sunColor[0], 6);
    expect(lighting.sun.direction.y).toBeCloseTo(l.sunDirection.y, 6);
    const haze = hazeColor(l);
    expect(scene.fogColor.b).toBeCloseTo(haze[2], 6);
    expect(scene.clearColor.g).toBeCloseTo(haze[1], 6);
    expect(scene.fogDensity).toBeGreaterThan(0);
  });

  it('le brouillard épaissit la brume de la scène (même heure, densité bien plus forte), comme le calcule distanceFogDensity', () => {
    const lighting = new SceneLighting(scene, OPTIONS);
    const time = timeOfDay(0.3 * CYCLE_S);
    lighting.apply(atmosphereFor(lightingFor(time), weather('clair'), 0), time, 0.016);
    const clear = scene.fogDensity;
    const fog = atmosphereFor(lightingFor(time), weather('brouillard'), 0);
    lighting.apply(fog, time, 0.016);
    expect(scene.fogDensity).toBeGreaterThan(clear * 10);
    expect(scene.fogDensity).toBeCloseTo(distanceFogDensity(fog, clear), 12);
  });

  it('en brouillard plein, avec le relief lointain (brume réglée sur 4000 m), le proche garde sa couleur et le loin se noie', () => {
    const lighting = new SceneLighting(scene, { ...OPTIONS, fogDistanceM: 4000 });
    const time = timeOfDay(0.06 * CYCLE_S);
    lighting.apply(atmosphereFor(lightingFor(time), weather('brouillard'), 0), time, 0.016);
    expect(scene.fogMode).toBe(Scene.FOGMODE_EXP);
    expect(fogAmount(6, scene.fogDensity)).toBeLessThanOrEqual(0.25); // le démon à 6 m
    expect(fogAmount(60, scene.fogDensity)).toBeGreaterThanOrEqual(0.85);
  });

  it('apply : la voûte céleste suit l’heure (rotation des étoiles et de la planète, aurores de la nuit)', () => {
    const lighting = new SceneLighting(scene, OPTIONS);
    const time = timeOfDay(0.85 * CYCLE_S + 3 * CYCLE_S);
    lighting.apply(atmosphereFor(lightingFor(time), weather('clair'), 0), time, 0.016);
    const sent = (lighting.sky.mesh.material as unknown as { _vectors4: Record<string, { x: number; y: number }> })._vectors4['cosmos']!;
    expect(sent.x).toBeCloseTo(cosmosFor(time).rotation, 6);
    expect(sent.y).toBeCloseTo(cosmosFor(time).aurora, 6);
  });

  it('le ciel est un dôme peint (nuages actifs par défaut) ; l’option les coupe', () => {
    expect(new SceneLighting(scene, OPTIONS).sky.cloudsEnabled).toBe(true);
    expect(new SceneLighting(scene, { ...OPTIONS, clouds: false }).sky.cloudsEnabled).toBe(false);
  });
});
