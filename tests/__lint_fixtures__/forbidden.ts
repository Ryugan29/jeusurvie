// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import { spike } from '../../src/spike/__lint_fixtures__/target'; // ✗ boundaries/dependencies
import { sibling } from '../../src/core/__lint_fixtures__/allowed-target';
export const x = [spike, sibling];
