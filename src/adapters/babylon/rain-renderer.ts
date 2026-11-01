// Pluie (render-data/atmosphere → rain, wind) : des traits fins qui tombent dans une boîte autour de la caméra, étirés dans
// le sens de la chute et penchés par le vent. Un seul système de particules ; leur nombre au plus suit la qualité
// (render-data/quality → rainDrops, ?pluie=0 : aucune). Aucune allocation par image.
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';

export const RAIN = {
  /** Demi-largeur (m) de la boîte de pluie autour de la caméra. */
  radiusM: 14,
  /** Hauteur (m) de la boîte, au-dessus et au-dessous de la caméra. */
  aboveM: 16,
  belowM: 4,
  /** Vitesse de chute (m/s) et durée de vie d'une goutte (s) : elle traverse la boîte. */
  speedMps: 18,
  lifeS: 1.1,
  /** Inclinaison par vent plein (part de la vitesse de chute), sur x et z. */
  slantX: 0.45,
  slantZ: 0.22,
  /** Largeur et longueur (m) du trait. */
  widthM: 0.025,
  lengthM: 0.7,
  /** Teinte des gouttes en pleine lumière, et leur opacité. */
  color: [0.78, 0.82, 0.9] as const,
  alpha: 0.4,
} as const;

/** Trait de goutte (RGBA, w × h) : blanc, opaque au centre, fondu sur les bords et aux deux extrémités. */
export function rainStreakSprite(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const along = Math.sin((Math.PI * (y + 0.5)) / h);
    for (let x = 0; x < w; x++) {
      const across = 1 - Math.abs((x + 0.5) / w - 0.5) * 2;
      data.set([255, 255, 255, Math.round(255 * along * Math.min(1, across * 1.6))], (y * w + x) * 4);
    }
  }
  return data;
}

export interface RainState {
  /** Force de la pluie (0 à 1). */
  readonly rain: number;
  /** Force du vent (0 à 1). */
  readonly wind: number;
  /** Lumière de la scène (≈ 1 de jour, faible la nuit) : les gouttes ne brillent pas dans le noir. */
  readonly brightness: number;
}

const SPRITE_W = 4, SPRITE_H = 32;

export class RainRenderer {
  private readonly drops: ParticleSystem | undefined;
  private readonly emitter = new Vector3();
  private readonly fall = new Vector3(0, -1, 0);
  private readonly color = new Color4(1, 1, 1, RAIN.alpha);
  private readonly capacity: number;

  constructor(scene: Scene, capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
    if (this.capacity === 0) return;
    const p = new ParticleSystem('pluie', this.capacity, scene);
    p.particleTexture = RawTexture.CreateRGBATexture(rainStreakSprite(SPRITE_W, SPRITE_H), SPRITE_W, SPRITE_H, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    p.emitter = this.emitter;
    p.minEmitBox = new Vector3(-RAIN.radiusM, -RAIN.belowM, -RAIN.radiusM);
    p.maxEmitBox = new Vector3(RAIN.radiusM, RAIN.aboveM, RAIN.radiusM);
    p.direction1 = this.fall;
    p.direction2 = this.fall;
    p.minEmitPower = p.maxEmitPower = RAIN.speedMps;
    p.minLifeTime = p.maxLifeTime = RAIN.lifeS;
    p.minSize = p.maxSize = 1;
    p.minScaleX = p.maxScaleX = RAIN.widthM;
    p.minScaleY = p.maxScaleY = RAIN.lengthM;
    p.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    p.gravity = Vector3.Zero();
    // Pas de temps en vraies secondes (Babylon : 0,01 par défaut, soit 0,6 s par seconde à 60 images/s) : la vitesse de chute et
    // la durée de vie de RAIN sont tenues telles quelles.
    p.updateSpeed = 1 / 60;
    p.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    p.color1 = this.color;
    p.color2 = this.color;
    p.colorDead = new Color4(0, 0, 0, 0);
    p.emitRate = 0;
    p.start();
    this.drops = p;
  }

  /** À chaque image : force de la pluie et du vent, lumière de la scène, position de la caméra. */
  update(state: RainState, x: number, y: number, z: number): void {
    const p = this.drops;
    if (!p) return;
    this.emitter.set(x, y, z);
    // Débit pour entretenir capacity × rain gouttes vivantes.
    p.emitRate = (this.capacity * Math.min(1, Math.max(0, state.rain))) / RAIN.lifeS;
    const w = Math.min(1, Math.max(0, state.wind));
    this.fall.set(RAIN.slantX * w, -1, RAIN.slantZ * w).normalize();
    const b = Math.min(1, Math.max(0, state.brightness));
    this.color.set(RAIN.color[0] * b, RAIN.color[1] * b, RAIN.color[2] * b, RAIN.alpha);
  }

  dispose(): void {
    this.drops?.dispose();
  }
}
