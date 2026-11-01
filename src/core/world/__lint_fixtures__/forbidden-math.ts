// FIXTURE DE LINT — volontairement fautive. Lue uniquement par tests/lint/guardrails.test.ts.
// Ignorée par `npm run lint` et par les tsconfig. Ne jamais importer ni "corriger" ce fichier.
export function trig(x: number): number[] {
  let y = x;
  y **= 2;
  return [Math.sin(x), Math.cos(x), Math.tan(x), Math.pow(x, 2), Math.exp(x), Math.log(x), Math.atan2(x, 1), Math.hypot(x, 1), x ** 2, y];
}
