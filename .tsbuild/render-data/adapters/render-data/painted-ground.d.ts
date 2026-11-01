export type GroundLayer = 'grass' | 'soil' | 'rock' | 'snow';
export declare const GROUND_LAYERS: readonly GroundLayer[];
/** Côté (m) du motif de chaque couche dans le monde. */
export declare const LAYER_TILE_M: Readonly<Record<GroundLayer, number>>;
export declare const PAINT_MIN = 0.45;
export declare const PAINT_MAX = 1.5;
/** Couleur diffuse (gris) du matériau du sol : l'octet 255 de la texture vaut alors PAINT_MAX. */
export declare const PAINT_GAIN = 1.5;
/** Facteurs RGB (size × size × 3, ligne par ligne) dans [PAINT_MIN, PAINT_MAX], de moyenne 1 par canal. */
export declare function paintedLayerFactors(layer: GroundLayer, size: number): Float32Array;
/** Octets RGBA 8 bits de la texture (opaque) : octet = facteur / PAINT_GAIN × 255. */
export declare function paintedLayerRgba(layer: GroundLayer, size: number): Uint8Array;
