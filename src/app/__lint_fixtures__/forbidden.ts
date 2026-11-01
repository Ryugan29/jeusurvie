// FIXTURE DE LINT — volontairement fautive. Lue uniquement par tests/lint/guardrails.test.ts.
// Ignorée par `npm run lint` et par les tsconfig. Ne jamais importer ni "corriger" ce fichier.
import { adapter } from '../../adapters/__lint_fixtures__/target';
import { spike } from '../../spike/__lint_fixtures__/target';

export const x = [adapter, spike];
export function xss(el: { innerHTML: string; outerHTML: string; insertAdjacentHTML(p: string, h: string): void }): unknown {
  el.innerHTML = '<b>';
  el.outerHTML = '<b>';
  el.insertAdjacentHTML('beforeend', '<b>');
  document.write('<b>');
  eval('1');
  return new Function('return 1');
}
