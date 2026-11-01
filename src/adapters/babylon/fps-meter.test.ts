import { describe, expect, it } from 'vitest';
import { FpsMeter } from './fps-meter';

describe('FpsMeter (images/s moyennes et « 1 % low »)', () => {
  it('sans mesure : 0', () => {
    expect(new FpsMeter(100).stats()).toEqual({ fps: 0, low1: 0, frames: 0 });
  });

  it('images régulières de 1000/60 ms : 60 images/s, 1 % low à 60', () => {
    const m = new FpsMeter(300);
    for (let i = 0; i < 300; i++) m.record(1000 / 60);
    expect(m.stats().fps).toBeCloseTo(60, 6);
    expect(m.stats().low1).toBeCloseTo(60, 6);
  });

  it('1 % low = images/s moyennes du 1 % d’images les plus lentes', () => {
    const m = new FpsMeter(1000);
    for (let i = 0; i < 990; i++) m.record(10);
    for (let i = 0; i < 10; i++) m.record(50);
    expect(m.stats().low1).toBeCloseTo(20, 6);
    expect(m.stats().fps).toBeCloseTo(1000 / 10.4, 6);
  });

  it('ne garde que les N dernières images ; ignore les durées non valides', () => {
    const m = new FpsMeter(10);
    for (let i = 0; i < 10; i++) m.record(100);
    for (let i = 0; i < 10; i++) m.record(20);
    m.record(Number.NaN);
    m.record(-5);
    expect(m.stats()).toEqual({ fps: 50, low1: 50, frames: 10 });
  });
});
