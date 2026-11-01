// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import { fbm2 } from '../../core/world/noise'; // ✗ no-restricted-syntax
export { gradientNoise2 } from '../../core/world/noise'; // ✗ no-restricted-syntax
import { TERRAIN_V1 } from '../../core/world/params';
import { generateChunk } from '../../core/world/chunk';
export const x = [fbm2, TERRAIN_V1, generateChunk, () => import('../../core/world/noise')]; // ✗ no-restricted-syntax
