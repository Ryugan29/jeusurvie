// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
// Un test du cœur a le droit d'importer tests/fakes et tests/fixtures.
import { fake } from '../../../tests/fakes/__lint_fixtures__/target';
import { data } from '../../../tests/fixtures/__lint_fixtures__/target';
export const x = [fake, data];
