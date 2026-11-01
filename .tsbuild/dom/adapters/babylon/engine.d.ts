import { Engine } from '@babylonjs/core/Engines/engine';
/**
 * @param maxPixelRatio plafond de densité de pixels (render-data/quality → image) : sur un écran à 125 % ou 150 %, l'image est
 *   calculée en vrais pixels jusqu'à ce plafond. En pixels CSS, elle était étirée : floue, et l'herbe paraissait pixelisée.
 */
export declare function createEngine(canvas: HTMLCanvasElement, maxPixelRatio?: number): Engine;
