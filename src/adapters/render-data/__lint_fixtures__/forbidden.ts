// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
import { Color3 } from '@babylonjs/core/Maths/math.color'; // ✗ boundaries/dependencies
import { createEngine } from '../../babylon/engine'; // ✗ boundaries/dependencies
import { advance } from '../../../app/loop/fixed-step'; // ✗ boundaries/dependencies
import { heightAt } from '../../../core/world/terrain';
import { terrainColor } from '../palette';
export const x = [Color3, createEngine, advance, heightAt, terrainColor];
