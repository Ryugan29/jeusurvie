import { type Resource, type ResourceKind } from './placement';
/**
 * Les VARIANT_COUNT variantes de chaque type, dans l'ordre : le hasard de la case (Resource.variant) en désigne une.
 * Un modèle présent 3 fois sur 16 pousse 3 fois plus souvent qu'un modèle présent une fois. Arbres morts : rares.
 * Pas de TwistedTree ni de CommonTree_1 : plus de 6 000 triangles, au-dessus du plafond des assets (tests/assets).
 */
export declare const VEGETATION_VARIANTS: Readonly<Record<ResourceKind, readonly string[]>>;
export declare const VEGETATION_MODELS: Readonly<Record<ResourceKind, readonly string[]>>;
/** Modèle d'une ressource : sa variante choisit parmi les variantes de son type (reboucle hors plage). */
export declare function modelKeyFor(r: Resource): string;
