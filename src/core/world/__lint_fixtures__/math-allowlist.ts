// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
export function f(x: number): number[] {
  return [
    Math.floor(x), Math.ceil(x), Math.trunc(x), Math.round(x), Math.abs(x), Math.sign(x),
    Math.min(x, 1), Math.max(x, 1), Math.imul(x, 3), Math.clz32(x), Math.fround(x), Math.sqrt(x),
    Math.tanh(x), // ✗ no-restricted-syntax
    Math.cbrt(x), // ✗ no-restricted-syntax
    Math['sin'](x), // ✗ no-restricted-syntax
    Math[`floor`](x), // ✗ no-restricted-syntax
    Math.PI, // ✗ no-restricted-syntax
  ];
}
const M = Math; // ✗ no-restricted-syntax
const { sin } = Math; // ✗ no-restricted-syntax
export const aliases = [M, sin];
