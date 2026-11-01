// FIXTURE DE LINT — volontairement fautive, lue seulement par tests/lint/guardrails.test.ts.
// Chaque ligne marquée « ✗ règle » doit porter exactement ces erreurs ; les autres lignes aucune.
export function xss(el: HTMLElement, range: Range, s: string): unknown[] {
  const { innerHTML } = el; // ✗ no-restricted-syntax
  const { ['outerHTML']: outer } = el; // ✗ no-restricted-syntax
  return [
    innerHTML,
    outer,
    el['innerHTML'], // ✗ no-restricted-syntax
    el[`insertAdjacentHTML`], // ✗ no-restricted-syntax
    (el as HTMLIFrameElement).srcdoc, // ✗ no-restricted-syntax
    el.setHTMLUnsafe(s), // ✗ no-restricted-syntax
    Document.parseHTMLUnsafe(s), // ✗ no-restricted-syntax
    range.createContextualFragment(s), // ✗ no-restricted-syntax
    document.writeln(s), // ✗ no-restricted-properties
    el.setAttribute('srcdoc', s), // ✗ no-restricted-syntax
    el.setAttribute('onclick', s), // ✗ no-restricted-syntax
    el.setAttribute('ONLOAD', s), // ✗ no-restricted-syntax
    el.setAttributeNS(null, 'onerror', s), // ✗ no-restricted-syntax
    el.setAttribute('title', s),
    (el.textContent = s),
  ];
}
