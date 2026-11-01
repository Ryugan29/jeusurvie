// FIXTURE DE LINT — volontairement fautive. Lue uniquement par tests/lint/guardrails.test.ts.
// Ignorée par `npm run lint` et par les tsconfig. Ne jamais importer ni "corriger" ce fichier.
import { target } from '../../app/__lint_fixtures__/target';
import { readFileSync } from 'node:fs';

export const leaks = [
  target,
  readFileSync,
  Math.random(),
  Date.now(),
  new Date(),
  performance.now(),
  window,
  document,
  crypto,
  setTimeout,
  setInterval,
  structuredClone,
  import.meta.env,
];
import type { target as TargetType } from '../../app/__lint_fixtures__/target';
export type Leak = typeof TargetType;
