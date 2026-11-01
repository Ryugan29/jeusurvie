import '@babylonjs/core/Animations/animatable';
import { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FADE_SECONDS } from '../render-data/character-motion';
import { LocomotionAnimator } from './locomotion-animator';

describe('LocomotionAnimator (vrai moteur Babylon sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function loop(name: string): AnimationGroup {
    const group = new AnimationGroup(name, scene);
    const animation = new Animation(name, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    animation.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
    group.addTargetedAnimation(animation, new TransformNode(name, scene));
    return group;
  }
  function setup() {
    const groups = { Idle: loop('Idle'), Walk: loop('Walk'), Run: loop('Run') };
    return { groups, animator: new LocomotionAnimator(groups) };
  }
  const weightsOf = (g: Record<'Idle' | 'Walk' | 'Run', AnimationGroup>) => [g.Idle.weight, g.Walk.weight, g.Run.weight];

  it('au départ : les trois animations tournent en boucle, seule Idle compte', () => {
    const { groups } = setup();
    for (const group of Object.values(groups)) {
      expect(group.isPlaying).toBe(true);
      expect(group.loopAnimation).toBe(true);
    }
    expect(weightsOf(groups)).toEqual([1, 0, 0]);
  });

  it('en course, Run prend la place d’Idle en un fondu court : à mi-chemin moitié-moitié, puis Run seule', () => {
    const { groups, animator } = setup();
    animator.update(FADE_SECONDS / 2, 5);
    expect(weightsOf(groups)[0]).toBeCloseTo(0.5, 9);
    expect(weightsOf(groups)[2]).toBeCloseTo(0.5, 9);
    animator.update(FADE_SECONDS / 2, 5);
    expect(weightsOf(groups)).toEqual([0, 0, 1]);
  });

  it('à pas lent, c’est Walk ; à l’arrêt, retour à Idle', () => {
    const { groups, animator } = setup();
    animator.update(1, 1.5);
    expect(weightsOf(groups)).toEqual([0, 1, 0]);
    animator.update(1, 0);
    expect(weightsOf(groups)).toEqual([1, 0, 0]);
  });

  it('le poids total reste 1 en plein fondu (sinon le squelette retombe en pose neutre)', () => {
    const { groups, animator } = setup();
    animator.update(0.06, 5);
    animator.update(0.04, 1.5);
    expect(weightsOf(groups).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});
