import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  fadeWeights,
  headingOf,
  horizontalSpeed,
  locomotionFor,
  turnToward,
  type LocomotionWeights,
} from './character-motion';

describe('locomotionFor (quelle animation selon la vitesse réelle)', () => {
  it('à l’arrêt : Idle ; à pas lent : Walk ; à la vitesse de course du jeu (5 m/s) : Run', () => {
    expect(locomotionFor(0)).toBe('Idle');
    expect(locomotionFor(0.1)).toBe('Idle');
    expect(locomotionFor(1.5)).toBe('Walk');
    expect(locomotionFor(5)).toBe('Run');
  });

  it('plus on va vite, plus l’animation monte : jamais Run puis Walk quand la vitesse augmente', () => {
    const rank = { Idle: 0, Walk: 1, Run: 2 } as const;
    fc.assert(
      fc.property(fc.double({ min: 0, max: 20, noNaN: true }), fc.double({ min: 0, max: 20, noNaN: true }), (a, b) => {
        const [slow, fast] = a <= b ? [a, b] : [b, a];
        expect(rank[locomotionFor(slow)]).toBeLessThanOrEqual(rank[locomotionFor(fast)]);
      }),
    );
  });
});

describe('horizontalSpeed (vitesse au sol entre deux ticks)', () => {
  it('ne compte que le plan horizontal : monter une pente n’accélère pas la course', () => {
    expect(horizontalSpeed({ x: 0, y: 0, z: 0 }, { x: 3, y: 50, z: 4 }, 1)).toBe(5);
  });

  it('se rapporte à la durée du tick', () => {
    expect(horizontalSpeed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 / 6 }, 1 / 30)).toBeCloseTo(5, 9);
  });
});

describe('fadeWeights (fondu enchaîné entre animations)', () => {
  const idle: LocomotionWeights = { Idle: 1, Walk: 0, Run: 0 };
  const sum = (w: LocomotionWeights): number => w.Idle + w.Walk + w.Run;

  it('une animation qui prend la place de l’autre monte à vitesse constante : la moitié du fondu, la moitié du poids', () => {
    const w = fadeWeights(idle, 'Run', 0.1, 0.2);
    expect(w.Run).toBeCloseTo(0.5, 9);
    expect(w.Idle).toBeCloseTo(0.5, 9);
    expect(w.Walk).toBe(0);
  });

  it('au bout du fondu, la cible pèse 1 et les autres 0', () => {
    expect(fadeWeights(idle, 'Walk', 0.2, 0.2)).toEqual({ Idle: 0, Walk: 1, Run: 0 });
    expect(fadeWeights(idle, 'Walk', 5, 0.2)).toEqual({ Idle: 0, Walk: 1, Run: 0 });
  });

  it('la cible déjà pleine ne bouge plus', () => {
    expect(fadeWeights(idle, 'Idle', 0.016, 0.2)).toEqual(idle);
  });

  it('un fondu interrompu garde la somme à 1 (sinon le squelette retombe à moitié en pose neutre) et ne recule jamais', () => {
    const midway = fadeWeights(idle, 'Run', 0.1, 0.2); // Idle 0,5 · Run 0,5
    const changed = fadeWeights(midway, 'Walk', 0.05, 0.2);
    expect(sum(changed)).toBeCloseTo(1, 9);
    expect(changed.Walk).toBeCloseTo(0.25, 9);
    expect(changed.Run).toBeLessThan(midway.Run);
    expect(changed.Idle).toBeLessThan(midway.Idle);
  });

  it('propriété : somme à 1, poids dans [0, 1], et la cible ne perd jamais de poids', () => {
    const target = fc.constantFrom(...(['Idle', 'Walk', 'Run'] as const));
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 3, maxLength: 3 }).filter((a) => a[0]! + a[1]! + a[2]! > 0.01),
        target,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (raw, to, dt) => {
          const total = raw[0]! + raw[1]! + raw[2]!;
          const before: LocomotionWeights = { Idle: raw[0]! / total, Walk: raw[1]! / total, Run: raw[2]! / total };
          const after = fadeWeights(before, to, dt, 0.2);
          expect(sum(after)).toBeCloseTo(1, 9);
          for (const w of [after.Idle, after.Walk, after.Run]) {
            expect(w).toBeGreaterThanOrEqual(0);
            expect(w).toBeLessThanOrEqual(1 + 1e-12);
          }
          expect(after[to]).toBeGreaterThanOrEqual(before[to] - 1e-12);
        },
      ),
    );
  });
});

describe('headingOf (cap d’un déplacement) et turnToward (demi-tour par le plus court)', () => {
  it('même convention que la caméra : 0 = vers +Z, π/2 = vers +X ; immobile = pas de cap', () => {
    expect(headingOf(0, 1)).toBeCloseTo(0, 9);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(headingOf(0, -1)).toBeCloseTo(Math.PI, 9);
    expect(headingOf(0, 0)).toBeUndefined();
  });

  it('tourne vers la cible sans la dépasser', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25, 9);
    expect(turnToward(0, 1, 5)).toBeCloseTo(1, 9);
  });

  it('prend le chemin le plus court à travers ±π (pas un tour complet)', () => {
    const next = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(next).toBeCloseTo(Math.PI - 0.05, 9);
  });

  it('propriété : l’écart à la cible ne grandit jamais et chaque pas reste borné', () => {
    const angle = fc.double({ min: -10, max: 10, noNaN: true });
    const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
    fc.assert(
      fc.property(angle, angle, fc.double({ min: 0, max: 1, noNaN: true }), (from, to, step) => {
        const next = turnToward(from, to, step);
        expect(Math.abs(wrap(to - next))).toBeLessThanOrEqual(Math.abs(wrap(to - from)) + 1e-9);
        expect(Math.abs(wrap(next - from))).toBeLessThanOrEqual(step + 1e-9);
      }),
    );
  });
});
