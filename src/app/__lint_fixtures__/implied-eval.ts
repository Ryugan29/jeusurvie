// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
export function run(s: string, cb: () => void): unknown[] {
  return [
    setTimeout('alert(1)', 0), // ✗ no-implied-eval no-restricted-syntax
    setInterval(s, 10), // ✗ no-restricted-syntax
    setTimeout(cb, 10), // ✗ no-restricted-syntax
    window.setTimeout(s, 10), // ✗ no-restricted-syntax
    window.eval(s), // ✗ no-eval
    window.Function(s), // ✗ no-restricted-syntax
    Function(s), // ✗ no-new-func
    setTimeout(() => cb(), 0),
    setInterval(function tick() { cb(); }, 10),
  ];
}
