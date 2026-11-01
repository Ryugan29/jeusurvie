// Quels modèles de végétation projettent une ombre (PUR). Le décor — arbres, pins, buissons, rochers — oui ; l'herbe et les
// fleurs, jamais : des dizaines de milliers de brins coûteraient cher dans chaque carte d'ombre pour une ombre invisible
// (le sol les reçoit, c'est tout). Le couvre-sol (herbe, trèfles, fougères, champignons, cailloux) ne projette pas non plus.
import type { ResourceKind } from '../../core/world/placement';
import { VEGETATION_MODELS } from './vegetation-instances';

/** Types de ressources dont les modèles projettent une ombre. */
export const SHADOW_CASTER_KINDS: readonly ResourceKind[] = ['tree', 'pine', 'bush', 'rock'];

/** Les modèles (clés de assets/models/nature) qui projettent une ombre, sans doublon. */
export const SHADOW_CASTER_MODELS: readonly string[] = [...new Set(SHADOW_CASTER_KINDS.flatMap((kind) => VEGETATION_MODELS[kind]))];

const CASTERS: ReadonlySet<string> = new Set(SHADOW_CASTER_MODELS);

/** Le modèle (clé de assets/models/nature) projette-t-il une ombre ? */
export function castsShadow(modelKey: string): boolean {
  return CASTERS.has(modelKey);
}
