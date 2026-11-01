// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import { sibling } from '../../src/core/__lint_fixtures__/allowed-target'; // ✗ boundaries/dependencies
import { target } from '../../src/app/__lint_fixtures__/target'; // ✗ boundaries/dependencies
export const x = [sibling, target];
