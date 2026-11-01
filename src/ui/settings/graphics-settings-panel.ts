// Réglages → Graphismes (maquette v1, écran « Réglages », état « Graphismes ») : choix du profil graphique LOW, MEDIUM, HIGH ou
// ULTRA, avec ce que chaque profil apporte, le profil actif, l'application immédiate, l'enregistrement et « Rétablir par défaut ».
// Présentation seulement : ce composant ne connaît ni le moteur 3D ni le stockage — il reçoit les profils à afficher et signale
// les choix (onSelect, onReset, onClose) ; la racine de composition applique et enregistre, puis rappelle setActive / setStatus.
// Accessibilité : fenêtre modale nommée, profils en groupe de boutons radio (flèches gauche/droite, Début/Fin), Échap ferme, le
// focus revient où il était. Texte écrit avec textContent seulement (jamais de HTML : règle anti-XSS du projet).

export interface PresetChoice {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly details: readonly string[];
}

export interface GraphicsSettingsPanelOptions {
  readonly presets: readonly PresetChoice[];
  /** Le joueur choisit un profil (clic, Entrée, Espace, flèches). */
  readonly onSelect: (id: string) => void;
  /** « Rétablir par défaut ». */
  readonly onReset: () => void;
  /** « Retour » ou Échap. */
  readonly onClose: () => void;
}

/** Profil voisin dans la liste selon la touche (flèches, Début, Fin) ; undefined si la touche ne déplace pas. Ne boucle pas. */
export function neighbourPreset(ids: readonly string[], current: string, key: string): string | undefined {
  const i = ids.indexOf(current);
  if (i < 0 || ids.length === 0) return undefined;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return ids[Math.min(ids.length - 1, i + 1)];
    case 'ArrowLeft':
    case 'ArrowUp':
      return ids[Math.max(0, i - 1)];
    case 'Home':
      return ids[0];
    case 'End':
      return ids[ids.length - 1];
    default:
      return undefined;
  }
}

export class GraphicsSettingsPanel {
  readonly element: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly summary: HTMLParagraphElement;
  private readonly details: HTMLUListElement;
  private readonly status: HTMLParagraphElement;
  private readonly previewTitle: HTMLHeadingElement;
  private active: string;
  private returnFocus: Element | null = null;

  constructor(
    private readonly doc: Document,
    private readonly options: GraphicsSettingsPanelOptions,
  ) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    this.active = options.presets[0]?.id ?? '';

    const root = el('div', 'reglages-voile');
    root.id = 'reglages';
    root.hidden = true;
    const dialog = el('section', 'reglages-fenetre');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'reglages-titre');

    const nav = el('nav', 'reglages-nav');
    const title = el('h2', 'reglages-titre', 'Réglages');
    title.id = 'reglages-titre';
    const tab = el('button', 'reglages-onglet actif', 'Graphismes');
    tab.type = 'button';
    tab.setAttribute('aria-current', 'page');
    const navFoot = el('div', 'reglages-nav-pied');
    const reset = el('button', 'reglages-lien', 'Rétablir par défaut');
    reset.type = 'button';
    reset.addEventListener('click', () => options.onReset());
    const back = el('button', 'reglages-bouton', '← Retour');
    back.type = 'button';
    back.addEventListener('click', () => options.onClose());
    const hint = el('p', 'reglages-aide');
    const key = el('span', 'reglages-touche', 'Échap');
    hint.append(key, doc.createTextNode(' retour'));
    navFoot.append(reset, back, hint);
    nav.append(title, tab, navFoot);

    const content = el('div', 'reglages-contenu');
    const row = el('div', 'reglages-ligne');
    const label = el('span', 'reglages-libelle', 'Qualité graphique');
    label.id = 'reglages-qualite';
    const group = el('div', 'reglages-selecteur');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'reglages-qualite');
    for (const preset of options.presets) {
      const button = el('button', 'reglages-choix', preset.label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset['preset'] = preset.id;
      button.addEventListener('click', () => this.choose(preset.id));
      button.addEventListener('focus', () => this.preview(preset.id));
      button.addEventListener('mouseenter', () => this.preview(preset.id));
      button.addEventListener('mouseleave', () => this.preview(this.active));
      this.buttons.set(preset.id, button);
      group.append(button);
    }
    group.addEventListener('keydown', (e) => {
      const target = neighbourPreset(
        options.presets.map((p) => p.id),
        (e.target as HTMLElement).dataset['preset'] ?? this.active,
        e.key,
      );
      if (target === undefined) return;
      e.preventDefault();
      this.buttons.get(target)?.focus();
      this.choose(target);
    });
    row.append(label, group);

    const card = el('div', 'reglages-carte');
    this.previewTitle = el('h3', 'reglages-carte-titre');
    this.summary = el('p', 'reglages-resume');
    this.details = el('ul', 'reglages-details');
    card.append(this.previewTitle, this.summary, this.details);

    this.status = el('p', 'reglages-etat');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    content.append(row, card, this.status);
    dialog.append(nav, content);
    root.append(dialog);
    // Échap ferme ; rien ne traverse la fenêtre vers le jeu (clics, molette, touches).
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        options.onClose();
      }
    });
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === root) options.onClose();
    });
    root.addEventListener('wheel', (e) => e.stopPropagation());
    this.element = root;
    this.setActive(this.active, '');
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.returnFocus = this.doc.activeElement;
    this.element.hidden = false;
    this.preview(this.active);
    this.buttons.get(this.active)?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    if (this.returnFocus instanceof HTMLElement) this.returnFocus.focus();
    this.returnFocus = null;
  }

  /** Le profil actif (surligné, coché) et une ligne d'état (« appliqué et enregistré », « application… »). */
  setActive(id: string, status: string): void {
    this.active = id;
    for (const [presetId, button] of this.buttons) {
      const on = presetId === id;
      button.classList.toggle('actif', on);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1; // un seul arrêt de tabulation dans le groupe : les flèches font le reste
    }
    this.preview(id);
    this.setStatus(status);
  }

  setStatus(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  private choose(id: string): void {
    if (id !== this.active) this.options.onSelect(id);
  }

  /** Décrit un profil (survolé, sous le focus, ou l'actif). */
  private preview(id: string): void {
    const preset = this.options.presets.find((p) => p.id === id);
    if (!preset) return;
    this.previewTitle.textContent = id === this.active ? `${preset.label} — profil actif` : preset.label;
    this.summary.textContent = preset.summary;
    this.details.replaceChildren(
      ...preset.details.map((line) => {
        const item = this.doc.createElement('li');
        item.textContent = line;
        return item;
      }),
    );
  }
}
