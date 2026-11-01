// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
// Le code de production du cœur, lui, n'a pas ce droit.
import { fake } from '../../../tests/fakes/__lint_fixtures__/target'; // ✗ boundaries/dependencies
import { data } from '../../../tests/fixtures/__lint_fixtures__/target'; // ✗ boundaries/dependencies
export const x = [fake, data];
