/**
 * Politique de sécurité du contenu, injectée en <meta> dans les pages du BUILD seulement (en dev, le serveur Vite
 * a besoin de scripts et de connexions que cette politique interdirait : rechargement à chaud).
 * - worker-src 'self' : les workers sont des fichiers du site (pas de blob: nécessaire, vérifié au preview).
 * - style-src 'self' : aucun style en ligne (styles dans des fichiers .css).
 * - img-src data: blob: : textures générées ou décodées en mémoire par le moteur 3D.
 */
export declare const CONTENT_SECURITY_POLICY: string;
declare const _default: import("vite").UserConfig;
export default _default;
