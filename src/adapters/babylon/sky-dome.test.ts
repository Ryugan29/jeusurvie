import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { hazeColor } from '../render-data/fog';
import { lightingFor, skyColorAt, type Lighting } from '../render-data/lighting';
import { SKY_FRAGMENT, SKY_SUN_DISC_HDR, SkyDome } from './sky-dome';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (fraction: number): Lighting => lightingFor(timeOfDay(fraction * CYCLE_S));
const RADIUS = 600;

describe('SkyDome (dôme de ciel peint, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function colorsOf(dome: SkyDome): { top: number[]; horizon: number[] } {
    const positions = dome.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors = dome.mesh.getVerticesData(VertexBuffer.ColorKind)!;
    let top = 0, low = 0;
    for (let i = 0; i < positions.length / 3; i++) {
      if (positions[i * 3 + 1]! > positions[top * 3 + 1]!) top = i;
      if (Math.abs(positions[i * 3 + 1]!) < Math.abs(positions[low * 3 + 1]!)) low = i;
    }
    return { top: Array.from(colors.slice(top * 4, top * 4 + 3)), horizon: Array.from(colors.slice(low * 4, low * 4 + 3)) };
  }

  it('un dôme qui suit la caméra, invisible au clic, dessiné de l’intérieur avec son propre shader (nuages, halo, étoiles)', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    expect(dome.mesh.infiniteDistance).toBe(true);
    expect(dome.mesh.isPickable).toBe(false);
    expect(dome.mesh.applyFog).toBe(false);
    expect(dome.mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(dome.mesh.material!.backFaceCulling).toBe(false);
  });

  it('le zénith prend la couleur du zénith, le bord du dôme celle de la brume (le bord du monde chargé ne se voit pas)', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    const l = at(0.3);
    const haze = hazeColor(l);
    dome.update(l, haze, 0);
    const { top, horizon } = colorsOf(dome);
    const zenith = skyColorAt(l, 1);
    for (let k = 0; k < 3; k++) {
      expect(top[k]).toBeCloseTo(zenith[k]!, 5);
      expect(horizon[k]).toBeCloseTo(haze[k]!, 5);
    }
  });

  it('les couleurs suivent l’heure : zénith plus sombre la nuit que le jour', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    dome.update(at(0.3), hazeColor(at(0.3)), 0);
    const day = colorsOf(dome).top;
    dome.update(at(0.85), hazeColor(at(0.85)), 0);
    const night = colorsOf(dome).top;
    expect(night[2]!).toBeLessThan(day[2]! / 2);
  });

  it('brouillard : la brume monte dans le ciel (à mi-hauteur, le ciel se rapproche nettement de la couleur de brume)', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    const l = at(0.3), haze = hazeColor(l);
    const positions = dome.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    let mid = 0;
    for (let i = 0; i < positions.length / 3; i++) {
      if (Math.abs(positions[i * 3 + 1]! / RADIUS - 0.3) < Math.abs(positions[mid * 3 + 1]! / RADIUS - 0.3)) mid = i;
    }
    const gap = (): number => {
      const c = dome.mesh.getVerticesData(VertexBuffer.ColorKind)!;
      return Math.hypot(c[mid * 4]! - haze[0], c[mid * 4 + 1]! - haze[1], c[mid * 4 + 2]! - haze[2]);
    };
    dome.update(l, haze, 0, { cloudCover: 0.15, flash: 0, fog: 0 });
    const clear = gap();
    dome.update(l, haze, 0, { cloudCover: 0.5, flash: 0, fog: 1 });
    expect(gap()).toBeLessThan(clear * 0.5);
  });

  it('la pluie passe au shader (couche basse de nuages sombres qui filent avec le vent)', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    dome.update(at(0.3), hazeColor(at(0.3)), 0, { cloudCover: 0.92, flash: 0, fog: 0.15, rain: 0.75 });
    const sent = (dome.mesh.material as unknown as { _vectors4: Record<string, { w: number }> })._vectors4['weather']!;
    expect(sent.w).toBeCloseTo(0.75, 6);
    dome.update(at(0.3), hazeColor(at(0.3)), 0);
    expect((dome.mesh.material as unknown as { _vectors4: Record<string, { w: number }> })._vectors4['weather']!.w).toBe(0);
  });

  it('le shader reçoit la météo (couverture nuageuse, éclair) et dessine un disque d’astre plus lumineux que 1 (halo HDR)', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    const material = dome.mesh.material as ShaderMaterial;
    expect(material.options.uniforms).toContain('weather');
    expect(SKY_SUN_DISC_HDR).toBeGreaterThan(4);
  });

  it('voûte céleste : la rotation des étoiles et de la planète, et la force des aurores, passent au shader', () => {
    const dome = new SkyDome(scene, { radiusM: RADIUS, segments: 16 });
    const sent = (): { x: number; y: number } => (dome.mesh.material as unknown as { _vectors4: Record<string, { x: number; y: number }> })._vectors4['cosmos']!;
    dome.update(at(0.85), hazeColor(at(0.85)), 0, undefined, { rotation: 1.2, aurora: 0.8 });
    expect(sent().x).toBeCloseTo(1.2, 6);
    expect(sent().y).toBeCloseTo(0.8, 6);
    dome.update(at(0.85), hazeColor(at(0.85)), 0);
    expect(sent().x).toBe(0);
    expect((dome.mesh.material as ShaderMaterial).options.uniforms).toContain('cosmos');
  });

  it('ciel de nuit complet : étoiles en plusieurs couches, voie lactée, étoiles filantes, lune à cratères, planète géante, aurores', () => {
    for (const part of ['starLayer(', 'milkyWay(', 'shootingStar(', 'planet(', 'aurora(', 'toCelestial(', 'moonDisc']) expect(SKY_FRAGMENT).toContain(part);
    expect(SKY_FRAGMENT.match(/starLayer\(/g)!.length).toBeGreaterThanOrEqual(4); // définition + au moins trois couches
  });

  it('nuages réglables : actifs par défaut, coupés par l’option (qualité basse, ?nuages=0)', () => {
    expect(new SkyDome(scene, { radiusM: RADIUS, segments: 16 }).cloudsEnabled).toBe(true);
    expect(new SkyDome(scene, { radiusM: RADIUS, segments: 16, clouds: false }).cloudsEnabled).toBe(false);
  });
});
