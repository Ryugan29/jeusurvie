// N'écrit dans le DOM que si la valeur change (docs/03-archi.md §10) : pas de travail de mise en page inutile.

/** Écrit `text` dans `el.textContent` s'il diffère ; rend true si une écriture a eu lieu. */
export function setTextIfChanged(el: { textContent: string | null }, text: string): boolean {
  if (el.textContent === text) return false;
  el.textContent = text;
  return true;
}
