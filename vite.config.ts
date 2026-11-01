import { defineConfig, type Plugin } from 'vite';

/**
 * Politique de sécurité du contenu, injectée en <meta> dans les pages du BUILD seulement (en dev, le serveur Vite
 * a besoin de scripts et de connexions que cette politique interdirait : rechargement à chaud).
 * - worker-src 'self' : les workers sont des fichiers du site (pas de blob: nécessaire, vérifié au preview).
 * - style-src 'self' : aucun style en ligne (styles dans des fichiers .css).
 * - img-src data: blob: : textures générées ou décodées en mémoire par le moteur 3D.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function cspInBuild(): Plugin {
  return {
    name: 'csp-in-build',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
        ],
      };
    },
  };
}

/** En dev seulement : l'adresse nue (http://localhost:5173) ouvre la démo au lieu d'une erreur « page introuvable ». */
function rootToSpike(): Plugin {
  return {
    name: 'root-to-spike',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/' || url.pathname === '/index.html') {
          res.statusCode = 302;
          res.setHeader('Location', `/spike.html${url.search || '?heure=midi'}`); // garde les réglages de l'adresse
          res.end();
        } else next();
      });
    },
  };
}

// Configuration minimale : workers en modules ES ; pour l'instant, une seule page : la démo du spike.
export default defineConfig({
  plugins: [cspInBuild(), rootToSpike()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: { input: { spike: 'spike.html' } },
  },
});
