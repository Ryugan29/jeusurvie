// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
export function leaks(d: { toLocaleDateString(): string; toLocaleTimeString(): string }): unknown[] {
  return [
    Intl, // ✗ no-restricted-globals
    WeakRef, // ✗ no-restricted-globals
    FinalizationRegistry, // ✗ no-restricted-globals
    SharedArrayBuffer, // ✗ no-restricted-globals
    Atomics, // ✗ no-restricted-globals
    globalThis, // ✗ no-restricted-globals
    process, // ✗ no-restricted-globals
    fetch, // ✗ no-restricted-globals
    indexedDB, // ✗ no-restricted-globals
    localStorage, // ✗ no-restricted-globals
    requestAnimationFrame, // ✗ no-restricted-globals
    self, // ✗ no-restricted-globals
    navigator, // ✗ no-restricted-globals
    'a'.localeCompare('b'), // ✗ no-restricted-properties
    (1).toLocaleString(), // ✗ no-restricted-properties
    d.toLocaleDateString(), // ✗ no-restricted-properties
    d.toLocaleTimeString(), // ✗ no-restricted-properties
  ];
}
