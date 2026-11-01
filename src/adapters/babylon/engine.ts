// Création du moteur Babylon : WebGL, sans son, sans écran de chargement Babylon, aucune ressource réseau.
import { Engine } from '@babylonjs/core/Engines/engine';
import { pixelRatioFor } from '../render-data/quality';

const NO_LOADING_SCREEN = {
  displayLoadingUI: (): void => undefined,
  hideLoadingUI: (): void => undefined,
  loadingUIBackgroundColor: '',
  loadingUIText: '',
};

/**
 * @param maxPixelRatio plafond de densité de pixels (render-data/quality → image) : sur un écran à 125 % ou 150 %, l'image est
 *   calculée en vrais pixels jusqu'à ce plafond. En pixels CSS, elle était étirée : floue, et l'herbe paraissait pixelisée.
 */
export function createEngine(canvas: HTMLCanvasElement, maxPixelRatio = 1): Engine {
  const engine = new Engine(
    canvas,
    // Pas d'anticrénelage sur l'image finale : la scène est dessinée dans une image MSAA (post-processing → enableMsaa).
    false,
    // Toile opaque : les feuilles et les brins écrivent leur couverture dans l'alpha (alpha-to-coverage, foliage-plugin) ; la page ne doit
    // jamais transparaître au bord d'une feuille.
    { audioEngine: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', alpha: false },
    true,
  );
  engine.setHardwareScalingLevel(1 / pixelRatioFor(window.devicePixelRatio, maxPixelRatio));
  engine.loadingScreen = NO_LOADING_SCREEN;
  // La page peut s'ouvrir cachée (onglet en arrière-plan) : la toile n'a alors pas sa taille, et l'image restait en 300 × 150,
  // étirée, jusqu'au premier redimensionnement de la fenêtre. On suit la taille de la toile elle-même.
  new ResizeObserver(() => engine.resize()).observe(canvas);
  return engine;
}
