// Ombres des seuls arbres proches. Les arbres, rochers et buissons lointains (jusqu'à 600 m) sont dessinés d'un seul bloc
// (« thin instances ») : si ce bloc était projeteur d'ombre, CHAQUE cascade en redessinerait TOUS les exemplaires, loin ou
// près — des millions de sommets pour des ombres qu'on ne voit qu'à 100 m. Ici, chaque morceau de modèle projeteur a un
// « double » qui ne porte que les instances à moins de `radiusM` du joueur ; ce sont les doubles, et eux seuls, qui projettent.
// Les doubles sont rangés dans une couche que la caméra ne dessine pas : ils ne servent que dans les cartes d'ombre et dans la carte
// de profondeur des rayons de soleil (qui n'a pas besoin des arbres lointains non plus).
// Rayon = distance d'ombre + marge (un arbre juste hors portée peut encore jeter son ombre jusque dans la portée).
// Les instances sont refaites quand le joueur s'est déplacé d'un pas, ou quand un chunk arrive ou part — jamais à chaque image.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ModelParts } from './vegetation-renderer';

/** Ce que les doubles demandent à la végétation (VegetationRenderer, ou un faux pour les tests). */
export interface NearInstances {
  /** Change quand un chunk est ajouté ou retiré. */
  readonly revision: number;
  nearInstances(model: string, x: number, z: number, radiusM: number): Float32Array;
}

export interface ShadowProxiesOptions {
  /** Rayon (m) autour du joueur des instances qui projettent. */
  readonly radiusM: number;
  /** Déplacement (m) du joueur qui déclenche une mise à jour. */
  readonly stepM: number;
}

/** Couche des doubles : aucune caméra ne la dessine (le masque par défaut des caméras est 0x0FFFFFFF). */
const SHADOW_ONLY_LAYER = 0x10000000;

interface Proxy {
  readonly model: string;
  readonly mesh: Mesh;
}

export class ShadowProxies {
  private readonly proxies: Proxy[] = [];
  private readonly meshes = new Set<Mesh>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastRevision = -1;
  private radiusM: number;

  /** @param onProxy appelé une fois pour chaque double : c'est là qu'on l'ajoute aux projeteurs d'ombre. */
  constructor(
    library: ModelParts,
    private readonly source: NearInstances,
    models: readonly string[],
    private readonly options: ShadowProxiesOptions,
    onProxy: (proxy: Mesh) => void,
  ) {
    this.radiusM = options.radiusM;
    for (const model of models) {
      for (const part of library.partsOf(model)) {
        const mesh = part.clone(`ombre ${part.name}`, null, true);
        mesh.layerMask = SHADOW_ONLY_LAYER;
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.setEnabled(false);
        this.proxies.push({ model, mesh });
        this.meshes.add(mesh);
        onProxy(mesh);
      }
    }
  }

  /** Nouveau rayon (m) des doubles (portée des ombres du profil graphique) : refaits à la prochaine mise à jour. */
  setRadius(radiusM: number): void {
    if (!(Number.isFinite(radiusM) && radiusM > 0) || radiusM === this.radiusM) return;
    this.radiusM = radiusM;
    this.lastRevision = -1;
  }

  isProxy(mesh: unknown): boolean {
    return this.meshes.has(mesh as Mesh);
  }

  /** À appeler à chaque image avec la position du joueur : ne refait les instances que si c'est nécessaire. */
  update(playerX: number, playerZ: number): void {
    const moved = Math.hypot(playerX - this.lastX, playerZ - this.lastZ); // NaN avant le premier calcul : « déplacé »
    if (this.source.revision === this.lastRevision && !(moved >= this.options.stepM) && !Number.isNaN(moved)) return;
    this.lastX = playerX;
    this.lastZ = playerZ;
    this.lastRevision = this.source.revision;
    const byModel = new Map<string, Float32Array>();
    for (const { model, mesh } of this.proxies) {
      let instances = byModel.get(model);
      if (instances === undefined) {
        instances = this.source.nearInstances(model, playerX, playerZ, this.radiusM);
        byModel.set(model, instances);
      }
      if (instances.length === 0) {
        // Sans instance, Babylon redessinerait le modèle seul à l'origine : on l'éteint.
        mesh.setEnabled(false);
        continue;
      }
      mesh.thinInstanceSetBuffer('matrix', instances, 16, true);
      mesh.thinInstanceRefreshBoundingInfo(true);
      mesh.setEnabled(true);
    }
  }
}
