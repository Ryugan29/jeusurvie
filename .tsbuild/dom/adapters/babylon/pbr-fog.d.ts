import '@babylonjs/core/Shaders/ShadersInclude/fogFragment';
/**
 * Texte EXACT de l'include dans Babylon 9.33 (vérifié par le test de pbr-fog.test.ts contre le fichier livré). Il n'est remplacé que
 * s'il est reconnu à l'octet près.
 */
export declare const BABYLON_FOG_FRAGMENT = "#ifdef FOG\nfloat fog=CalcFogFactor();\n#ifdef PBR\nfog=toLinearSpace(fog);\n#endif\ncolor.rgb=mix(vFogColor,color.rgb,fog);\n#endif\n";
/**
 * Remplaçant : seule la branche PBR change ; la ligne standard (`color.rgb=mix(vFogColor,color.rgb,fog);`) est celle de Babylon, mot
 * pour mot, et ne s'exécute plus que hors PBR.
 * Attention : Babylon appelle cet include avec `(color,finalColor)` pour le PBR, ce qui remplace TOUT « color » en minuscules par
 * « finalColor » — d'où l'absence de ce mot ailleurs que dans `color.rgb` (« vFogColor », avec une majuscule, n'est pas touché).
 */
export declare const PBR_FOG_FRAGMENT = "#ifdef FOG\nfloat fog=CalcFogFactor();\n#ifdef PBR\ncolor.rgb=toLinearSpace(mix(vFogColor,toGammaSpace(color.rgb),fog));\n#else\ncolor.rgb=mix(vFogColor,color.rgb,fog);\n#endif\n#endif\n";
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
export declare function installPbrFog(store?: Record<string, string>, warn?: (message: string) => void): PbrFogInstallResult;
