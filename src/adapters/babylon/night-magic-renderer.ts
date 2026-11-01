// Magie de la nuit (render-data/night-magic) : lucioles autour du joueur (particules additives, le halo vient du bloom de
// l'étalonnage) et champignons qui luisent (leur image sert de lueur, dosée selon l'heure). Rien de visible de jour ; aucune
// allocation par image.
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { Lighting } from '../render-data/lighting';
import { FIREFLIES, FIREFLY_COLOR, fireflyCount, mushroomGlow } from '../render-data/night-magic';

/** Côté (px) de l'image d'une luciole : un point doux, généré ici. */
const SPRITE_PX = 32;
/** Durée de vie (s) d'une luciole : elle s'allume, clignote, s'éteint. */
const LIFE_MIN_S = 4, LIFE_MAX_S = 8;

/** Point lumineux doux : cœur blanc, halo qui s'efface (alpha et couleur décroissent ensemble). */
export function fireflySprite(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const core = Math.max(0, 1 - d);
      const v = Math.round(255 * Math.min(1, core * core * 1.6));
      data.set([v, v, v, v], (y * size + x) * 4);
    }
  }
  return data;
}

/** Matériaux qui luisent la nuit : ceux des champignons (par nom). */
export function glowingMaterials(materials: readonly Material[]): PBRMaterial[] {
  return materials.filter((m): m is PBRMaterial => m instanceof PBRMaterial && /mushroom/i.test(m.name));
}

export class NightMagicRenderer {
  private readonly fireflies: ParticleSystem;
  private readonly emitter = new Vector3();

  constructor(
    scene: Scene,
    private readonly glowing: readonly PBRMaterial[],
  ) {
    const p = new ParticleSystem('lucioles', FIREFLIES.count, scene);
    p.particleTexture = RawTexture.CreateRGBATexture(fireflySprite(SPRITE_PX), SPRITE_PX, SPRITE_PX, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    p.emitter = this.emitter;
    p.minEmitBox = new Vector3(-FIREFLIES.radiusM, FIREFLIES.minY, -FIREFLIES.radiusM);
    p.maxEmitBox = new Vector3(FIREFLIES.radiusM, FIREFLIES.maxY, FIREFLIES.radiusM);
    p.direction1 = new Vector3(-0.35, -0.12, -0.35);
    p.direction2 = new Vector3(0.35, 0.18, 0.35);
    p.minEmitPower = 0.2;
    p.maxEmitPower = 0.6;
    p.minLifeTime = LIFE_MIN_S;
    p.maxLifeTime = LIFE_MAX_S;
    p.minSize = 0.07;
    p.maxSize = 0.14;
    p.gravity = Vector3.Zero();
    p.blendMode = ParticleSystem.BLENDMODE_ADD;
    // Clignotement : s'allume, baisse, se rallume, s'éteint (pas de point qui surgit ni ne disparaît d'un coup).
    const [r, g, b] = FIREFLY_COLOR;
    p.addColorGradient(0, new Color4(r, g, b, 0));
    p.addColorGradient(0.15, new Color4(r, g, b, 1));
    p.addColorGradient(0.45, new Color4(r, g, b, 0.25));
    p.addColorGradient(0.7, new Color4(r, g, b, 1));
    p.addColorGradient(1, new Color4(r, g, b, 0));
    p.emitRate = 0;
    p.start();
    this.fireflies = p;
    for (const material of glowing) {
      material.emissiveTexture = material.albedoTexture;
      material.emissiveColor.set(0, 0, 0);
    }
  }

  /** À chaque image : les lucioles suivent le joueur (pieds en x, y, z) et leur nombre suit l'heure ; la lueur des champignons aussi. */
  update(l: Lighting, x: number, y: number, z: number): void {
    this.emitter.set(x, y, z);
    // Débit pour entretenir `count` lucioles vivantes : count / durée de vie moyenne.
    this.fireflies.emitRate = fireflyCount(l) / ((LIFE_MIN_S + LIFE_MAX_S) / 2);
    const [r, g, b] = mushroomGlow(l);
    for (const material of this.glowing) material.emissiveColor.set(r, g, b);
  }

  dispose(): void {
    this.fireflies.dispose();
  }
}
