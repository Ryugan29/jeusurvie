// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import { ui } from '../../ui/__lint_fixtures__/target'; // ✗ boundaries/dependencies
import { adapter } from './target';
export const x = [adapter, ui];
