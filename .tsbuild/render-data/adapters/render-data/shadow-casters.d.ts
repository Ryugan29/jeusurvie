import type { ResourceKind } from '../../core/world/placement';
/** Types de ressources dont les modèles projettent une ombre. */
export declare const SHADOW_CASTER_KINDS: readonly ResourceKind[];
/** Les modèles (clés de assets/models/nature) qui projettent une ombre, sans doublon. */
export declare const SHADOW_CASTER_MODELS: readonly string[];
/** Le modèle (clé de assets/models/nature) projette-t-il une ombre ? */
export declare function castsShadow(modelKey: string): boolean;
