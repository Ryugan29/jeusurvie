// Brume des matériaux PBR (sol, relief lointain, héroïne, démon, roches, écorces…) alignée sur celle des matériaux standard
// (végétation) — profil LOW, où la brume est calculée dans les matériaux (les autres profils : passe d'image, atmosphere-pass).
// Le défaut : dans l'include « fogFragment » de Babylon, la branche `#ifdef PBR` élève la visibilité à la puissance 2,2 : le PBR est
// bien plus embrumé que le standard à la même distance (en brouillard, des silhouettes blanc-lavande devant une herbe qui garde ses
// couleurs). Depuis l'ADR 0012 tout est en lumière linéaire (végétation comprise) : la formule corrigée est simplement celle du
// standard (render-data/fog-blend.ts, testée là-bas) :
//   color.rgb = mix(vFogColor, color.rgb, fog)     avec `fog` NON converti, brume linéaire comme l'horizon du ciel.
//
// Pourquoi remplacer l'include et pas un plugin de matériau (comme foliage-plugin ou terrain-surface-plugin) ?
// - Le PBR n'offre qu'un point d'injection autour de la brume, CUSTOM_FRAGMENT_BEFORE_FOG, placé AVANT le calcul et suivi d'un
//   max(couleur, 0) : un plugin ne peut ni neutraliser ni remplacer la brume de Babylon, seulement tricher en amont (précompenser
//   la couleur pour que le mélange d'origine donne le bon résultat), ce qui diverge quand la visibilité tend vers 0.
// - Remplacer l'include une fois au démarrage couvre d'un coup tous les matériaux PBR, présents et futurs (chargeur glTF compris).
// Fragilité assumée, donc gardée : si le texte de l'include n'est plus EXACTEMENT celui de BABYLON_FOG_FRAGMENT (mise à jour de
// Babylon), on ne remplace rien et on le dit dans la console ; le test « sentinelle » de pbr-fog.test.ts échoue dans le même cas.
// Limite : texte GLSL seulement (moteur WebGL `Engine`). WebGPU (WGSL, ShaderStore.IncludesShadersStoreWGSL) aurait le même défaut.
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
// Charge l'include d'origine (il s'enregistre lui-même dans le magasin au chargement, sans jamais écraser une valeur déjà présente) :
// sans cet import, rien ne garantit qu'il soit là avant le remplacement, et Babylon le chargerait plus tard par-dessus le nôtre.
import '@babylonjs/core/Shaders/ShadersInclude/fogFragment';

/** Nom de l'include de Babylon dans ShaderStore.IncludesShadersStore. */
const INCLUDE_NAME = 'fogFragment';

/**
 * Texte EXACT de l'include dans Babylon 9.33 (vérifié par le test de pbr-fog.test.ts contre le fichier livré). Il n'est remplacé que
 * s'il est reconnu à l'octet près.
 */
export const BABYLON_FOG_FRAGMENT = `#ifdef FOG
float fog=CalcFogFactor();
#ifdef PBR
fog=toLinearSpace(fog);
#endif
color.rgb=mix(vFogColor,color.rgb,fog);
#endif
`;

/**
 * Remplaçant (ADR 0012 : tout est linéaire) : le PBR prend la ligne du standard, mot pour mot — brume linéaire, visibilité non
 * convertie. La conversion `toLinearSpace(fog)` de Babylon (brume bien plus épaisse sur le PBR) disparaît.
 * Attention : Babylon appelle cet include avec `(color,finalColor)` pour le PBR, ce qui remplace TOUT « color » en minuscules par
 * « finalColor » — d'où l'absence de ce mot ailleurs que dans `color.rgb` (« vFogColor », avec une majuscule, n'est pas touché).
 */
export const PBR_FOG_FRAGMENT = `#ifdef FOG
float fog=CalcFogFactor();
color.rgb=mix(vFogColor,color.rgb,fog);
#endif
`;

/**
 * - patched : include reconnu et remplacé ;
 * - already-patched : déjà remplacé (rechargement à chaud du code en développement, deuxième appel) ;
 * - unexpected-source : texte absent ou différent (Babylon a changé) : rien n'est touché.
 */
export type PbrFogInstallResult = 'patched' | 'already-patched' | 'unexpected-source';

/**
 * À appeler UNE fois au démarrage, AVANT la compilation du premier matériau (Babylon lit l'include à la compilation du shader).
 * @param store magasin d'includes GLSL de Babylon (paramétrable pour les tests).
 * @param warn avertissement émis si le texte de Babylon n'est pas reconnu.
 */
export function installPbrFog(
  store: Record<string, string> = ShaderStore.IncludesShadersStore,
  warn: (message: string) => void = (message) => console.warn(message),
): PbrFogInstallResult {
  const current = store[INCLUDE_NAME];
  if (current === PBR_FOG_FRAGMENT) return 'already-patched';
  if (current === BABYLON_FOG_FRAGMENT) {
    store[INCLUDE_NAME] = PBR_FOG_FRAGMENT;
    return 'patched';
  }
  warn(
    `[pbr-fog] Include « ${INCLUDE_NAME} » de Babylon ${current === undefined ? 'absent' : 'différent de celui attendu'} (mise à jour de Babylon ?) : ` +
      'la brume des matériaux PBR (personnages, roches) reste celle de Babylon, plus claire et plus épaisse que sur le sol. ' +
      'À reprendre dans adapters/babylon/pbr-fog.ts (BABYLON_FOG_FRAGMENT et PBR_FOG_FRAGMENT).',
  );
  return 'unexpected-source';
}
