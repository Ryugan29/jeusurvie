// VALEURS D'OR du générateur genVersion 1 — test de CARACTÉRISATION.
// Exception écrite au TDD (CLAUDE.md, ADR 0004) : ces valeurs ne sont pas prédites, elles sont RELEVÉES sur
// l'implémentation puis figées. Elles garantissent que la même graine donne exactement le même monde partout
// (navigateur, .exe) et dans le temps.
//
// RÈGLE DE SCELLEMENT
// genVersion 1 est scellé à la première version distribuée à quelqu'un d'autre que José (tag git + ligne au journal).
// - Avant scellement : valeurs d'or obligatoires et vertes à chaque commit ; recapture seulement dans un commit dédié
//   qui ne contient que le changement voulu du générateur, avec sa raison au journal ; jamais dans un refactor.
// - Après scellement : ADR 0004 (un générateur scellé ne se modifie jamais ; on ajoute v2 à côté).
//
// Le point (-7999.75, 3.125) est dans la future bande du bord (montagnes) : il sera recapturé quand le bord sera fait.
// Relevé : 2026-10-30, branche spike/beau-et-fluide.
import { describe, expect, it } from 'vitest';
import { generateChunk } from './chunk';
import { heightAt } from './terrain';

const POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [10, 20],
  [-1234.5, 777.25],
  [5000, -6000],
  [-7999.75, 3.125],
  [3961, 2711], // sommet (≈ 250 m) de la graine 12345 : fige aussi le code des montagnes
];
/** Sommets du chunk (3, -2) : premier, milieu, dernier. */
const CHUNK_SAMPLES = [0, 544, 1088] as const;

const GOLDEN: Record<number, { heights: number[]; chunk3m2: number[] }> = {
  0: {
    heights: [-7.089770546816561, -4.472260853513685, 0.38529909957669384, 9.462717425926446, -15.043161117065214, -0.23850733309575656],
    chunk3m2: [0.16633982956409454, -1.324257731437683, -4.867537975311279],
  },
  1: {
    heights: [-3.5195856704796444, -4.965818244809317, -5.666144307348208, -9.128015757871069, -8.680048656550014, 71.29448890353167],
    chunk3m2: [1.2445087432861328, -2.62094783782959, -2.6459624767303467],
  },
  12345: {
    heights: [-12.051923931045327, -9.234180239007442, 14.993175426057595, 3.23839730201535, 3.754101219158828, 249.77565363458513],
    chunk3m2: [-9.606366157531738, -8.029662132263184, -8.961307525634766],
  },
  3735928559: {
    heights: [-5.940550941688452, -5.8012885353859485, 0.46785671966876086, -15.38920729207813, -2.1845842508881983, -1.2604914395109028],
    chunk3m2: [2.214306354522705, 7.682145595550537, 12.299897193908691],
  },
};

describe("valeurs d'or — genVersion 1", () => {
  for (const [seedText, golden] of Object.entries(GOLDEN)) {
    const seed = Number(seedText);
    it(`graine ${seed} : hauteurs figées`, () => {
      const chunk = generateChunk(seed, 3, -2);
      expect({
        heights: POINTS.map(([x, z]) => heightAt(seed, x, z)),
        chunk3m2: CHUNK_SAMPLES.map((i) => chunk.heights[i]),
      }).toStrictEqual(golden);
    });
  }
});
