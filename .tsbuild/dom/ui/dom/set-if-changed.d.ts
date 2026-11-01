/** Écrit `text` dans `el.textContent` s'il diffère ; rend true si une écriture a eu lieu. */
export declare function setTextIfChanged(el: {
    textContent: string | null;
}, text: string): boolean;
