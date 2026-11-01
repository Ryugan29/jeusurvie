// La politique de sécurité du contenu (CSP) est injectée dans la page au BUILD seulement (pas en dev, pour garder
// le rechargement à chaud). On vérifie le plugin de la vraie configuration Vite.
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import config from '../../vite.config';

function cspPlugin(): Plugin {
  const plugins = (config.plugins ?? []).flat() as Plugin[];
  const plugin = plugins.find((p) => p?.name === 'csp-in-build');
  if (plugin === undefined) throw new Error('plugin csp-in-build absent de vite.config.ts');
  return plugin;
}

function injectedCsp(): string {
  const hook = cspPlugin().transformIndexHtml as unknown as (html: string) => { tags: { attrs: Record<string, string> }[] };
  const { tags } = (typeof hook === 'function' ? hook : (hook as unknown as { handler: typeof hook }).handler)('<html></html>');
  const meta = tags.find((t) => t.attrs['http-equiv'] === 'Content-Security-Policy');
  if (meta === undefined) throw new Error('aucune balise meta CSP');
  return meta.attrs['content']!;
}

const directive = (csp: string, name: string): string =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

describe('CSP du build', () => {
  it('ne s’applique qu’au build', () => {
    expect(cspPlugin().apply).toBe('build');
  });

  it('tout vient du site lui-même ; ni eval, ni script en ligne, ni plugin, ni <base> détourné', () => {
    const csp = injectedCsp();
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'script-src')).toBe("script-src 'self'");
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self'");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(csp, 'style-src')).toBe("style-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
  });
});
