// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import ts from 'typescript'; // ✗ boundaries/dependencies
export { target } from '../../app/__lint_fixtures__/target'; // ✗ boundaries/dependencies
export const later = () => import('../../app/__lint_fixtures__/target'); // ✗ boundaries/dependencies
export const tsVersion = ts.version;
