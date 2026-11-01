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
export declare function neighbourPreset(ids: readonly string[], current: string, key: string): string | undefined;
export declare class GraphicsSettingsPanel {
    private readonly doc;
    private readonly options;
    readonly element: HTMLElement;
    private readonly buttons;
    private readonly summary;
    private readonly details;
    private readonly status;
    private readonly previewTitle;
    private active;
    private returnFocus;
    constructor(doc: Document, options: GraphicsSettingsPanelOptions);
    get isOpen(): boolean;
    open(): void;
    close(): void;
    /** Le profil actif (surligné, coché) et une ligne d'état (« appliqué et enregistré », « application… »). */
    setActive(id: string, status: string): void;
    setStatus(text: string): void;
    private choose;
    /** Décrit un profil (survolé, sous le focus, ou l'actif). */
    private preview;
}
