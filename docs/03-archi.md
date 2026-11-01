# Architecture — v1

> Validée par José le 2026-10-30. Équipe : concepteur technique, concepteur de données (round 1),
> relecteur d'architecture, auditeur sécurité (round 2), confrontation sans objection bloquante.
> Décisions structurantes : `docs/adr/0001` à `0009`. Ce document dit **comment** ; les ADR disent **pourquoi**.

## En une phrase
Le cœur du jeu est une fonction pure `step(état, entrées) → (nouvel état, événements)` qui ignore tout du moteur 3D,
du navigateur et du stockage ; tout le reste (rendu Babylon, HUD DOM, sauvegarde, Electron) l'entoure et ne contient
aucune règle.

## 1. Couches et règle de dépendance
```
ui ─────┐
        ├──► app ──► core          core n'importe RIEN hors de core (sauf valibot)
adapters┘                          app n'importe que core
main.ts (racine de composition) connaît tout le monde
electron/ n'importe pas src/       src/spike/ n'est importé par personne et disparaît avant S1
```
Garde-fous automatiques dès le premier commit (ADR 0001) :
- ESLint par zones de chemin (`import/no-restricted-paths` ou `eslint-plugin-boundaries`, y compris `import type`).
- Dans `src/core/**` : `no-restricted-properties` sur `Math.random`, `Date.now`, `performance.now` ; `no-restricted-globals`
  sur `Date`, `window`, `document`, `crypto`, `setTimeout`, `setInterval`, `structuredClone` ; interdiction de `import.meta.env`.
- Dans `src/core/world/**` et `src/core/shared/**` (le générateur en dépend) : `Math` en **liste blanche** (floor, ceil,
  trunc, round, abs, sign, min, max, imul, clz32, fround, sqrt), accès calculé `Math[...]` et `**` interdits (monde
  identique entre moteurs JS). Dans tout le cœur : `Intl`, `WeakRef`, `FinalizationRegistry`, `SharedArrayBuffer`,
  `Atomics` et les méthodes `toLocale*` / `localeCompare` interdits.
- Globaux navigateur déclarés pour que `no-eval` / `no-implied-eval` agissent partout ; formes XSS étendues (accès calculé,
  déstructuration, `srcdoc`, `setHTMLUnsafe`, `createContextualFragment`, `setAttribute('on…')`).
- Les fixtures de lint (`**/__lint_fixtures__/**`) ne sont importables par personne ; un test vérifie que la configuration
  réelle applique bien les règles du cœur.
- Partout : `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` interdits.
- TypeScript en *project references* : `tsconfig.core.json` avec `lib: ["ES2022"]`, `types: []` (ni DOM ni Node dans le cœur).
- Un test « import interdit volontaire » vérifie que `npm run lint` échoue bien.

## 2. Arborescence
```
src/
  core/                       pur, testé en Vitest (environnement node)
    shared/                   vec, Result<T,E>, ids, hash.ts (hash2 entier), rng.ts (PRNG pur)
    config/balance.ts         TOUS les paramètres d'équilibrage, durées en secondes (converties par un seul helper)
    content/                  registre figé : objets, recettes, posables, créatures, biomes (ids jamais renommés)
    world/                    params.ts (paramètres du générateur, figés par version : TERRAIN_V1, WORLD_RADIUS_M…),
                              noise, terrain (heightAt), biome, chunk (generateChunk), placement (ressources, lieux),
                              spawn-point, danger-rings, bounds (bord du monde)
    physics/                  ground (même triangulation que le maillage), colliders, spatial-hash, move-and-slide, raycast
    survival/                 time-of-day, needs (faim), warmth, health
    inventory/                inventory, transfer, crafting, recipe-visibility
    building/                 placement-rules, structures (PV), repair, hearth (Foyer)
    combat/                   attack, damage, stamina
    creatures/                brain (machine à états), spawner, steering (« tout droit, frapper l'obstacle »), assault
    death/                    death (cause), grave (tombes), respawn
    exploration/              explored-cells, landmarks, journal (carnet), pin
    guidance/                 hints, objectives
    game/                     state (GameState), commands, events, step, new-game, loaded-world (simulation chaude)
    save/                     encode, decode/load, schema-v1 (valibot), migrations/, version
    selectors/                hud, bag, crafting, container, compass, map, placement, death, pause, render-frame
    ports.ts                  interfaces seulement
  app/                        orchestration, testée en Vitest avec des faux
    loop/                     fixed-step (accumulateur pur), game-session
    modes/input-mode.ts       machine à états des modes (pure)
    input/                    keymap (code physique → action, conflits), intent
    camera/camera-rig.ts      orbite + perche raccourcie par le raycast du cœur
    chunks/streamer.ts        chunks voulus / lâchés (pur, plafond)
    audio/cues.ts             événements → sons (pur)
    save/save-service.ts      autosave, rotation, import/export, saveId, horodatage (Clock)
    store.ts                  abonnements par sélecteur, notification seulement au changement
  adapters/
    babylon/                  engine, terrain-renderer, vegetation-instances, entity-views, animation,
                              lighting (jour/crépuscule/nuit, brume, post-traitement), ghost-preview, fps-meter
    render-data/mesh-data.ts  ChunkData → tampons de sommets (PUR, n'importe pas Babylon)
    worker/                   chunk.worker, map.worker, worker-chunk-source
    input/                    dom-input-device (KeyboardEvent.code, souris, molette, capture, libellés de touches)
    audio/                    web-audio, null-audio
    storage/                  indexeddb-save-repo, electron-save-repo (relais vers window.saves), local-settings
    platform/                 browser-clock, raf-scheduler, file-transfer-web, visibility, storage-persist
  ui/                         DOM sans framework, aucune règle
    dom/                      h.ts (création), set-if-changed.ts
    components/               Jauge, CaseObjet, BarreRapide, … RenduCarte, TransfertDeuxGrilles, Carnet (cf. maquette)
    screens/                  title, new-world, load, loading, hud, bag, container, map, placement, pause, death, settings, error
    text/fr.ts                codes de refus / d'erreur → phrases
    styles/                   variables CSS, --ui-scale
  main.ts                     racine de composition web
  main.e2e-hooks.ts           window.__game (lecture d'état, injection d'intentions) — build e2e UNIQUEMENT
electron/
  main.ts                     fenêtre durcie, protocole app://, IPC, dialogues, instance unique, fuses
  preload.ts                  window.saves = { list, read, write, remove, exportFile, importFile }
  file-store.ts               Node pur : écriture atomique, rotation, confinement de chemin (testé en Vitest)
assets/                       modèles glTF, textures, sons (CC0), CREDITS.md
tests/ fakes/ contracts/ e2e/ fixtures/
bench/                        scène de mesure « beau et fluide » (?bench=1)
```

## 3. Boucle de jeu (ADR 0002)
- **Pas fixe** : `SIM_HZ = 30` (une seule constante ; 60 possible après le spike sans rien casser, toutes les durées
  étant en secondes). Accumulateur pur `advance(acc, frameMs, stepMs, maxSteps=5)`, image plafonnée à 250 ms.
- **Caméra et souris à chaque image**, hors tick : le regard n'a aucune latence ; le lacet est transmis au cœur dans l'intention.
- À chaque image : entrées → machine des modes → N ticks `step(state, loaded, {intent, commands, chunks})` →
  `view.render(prev, curr, alpha, camera)` → `store.notify()` → audio → autosave.
- **Commandes** (fabriquer, transférer, poser, manger, réparer, épingler, réapparaître…) mises en file, appliquées au tick suivant.
- **Événements** (`Harvested`, `Crafted`, `PlacementRejected{reason}`, `DamageTaken{fromDir}`, `PhaseChanged`…) → toasts, effets, sons.
  Le moteur n'en déduit aucune règle ; l'animation suit le cœur.
- **État** : `GameState` (ce qui se sauvegarde : joueur, changements du monde, horloge, carnet) est immuable par convention
  (partage structurel, sélecteurs mémoïsés). `LoadedWorld` (chunks chargés, colliders, créatures, hachage spatial) est la
  simulation chaude, **mutable dans `step`**, jamais sauvegardée.
- **Temps** : ticks entiers en mémoire ; secondes dans la sauvegarde (`ticks = round(s × SIM_HZ)`).
- **Aléatoire** : PRNG pur dans la simulation, ni sauvegardé ni dans `GameState`, réinitialisé au chargement par
  `hash2(seed, ticks, …)`. La génération du monde n'utilise que `hash2(seed, x, z, sel)`.
- Assertion de finitude des grandeurs du joueur en sortie de `step` (dev et test).

## 4. Physique (ADR 0003)
Pas de Havok en v1. Collisions **cinématiques dans le cœur**, en 2,5D : plan XZ + hauteur du sol + vitesse verticale (saut).
- `groundHeight(loaded, x, z)` interpole les hauteurs **float32 du chunk** (`ChunkData.heights`), jamais `heightAt`,
  sur **la même triangulation** que le maillage rendu (module partagé, test d'égalité).
- `moveAndSlide(corps, voulu, colliders, sol, penteMax)` ; obstacles = cercles (troncs, rochers, créatures) et rectangles orientés
  (palissade, abri, coffre…) ; hachage spatial par chunk ; `raycast` terrain + colliders (caméra, ciblage, pose).
- **Saut** : petit saut (hauteur < hauteur de palissade, test), gravité, atterrissage sur le sol uniquement : on ne monte pas sur les objets.
- Sans chunk chargé sous les pieds : déplacement bloqué, chunk prioritaire. Créatures : jamais sur un chunk absent.
- Bord du monde : `bounds.clamp` pour joueur et créatures (cf. §5).

## 5. Génération du monde (ADR 0004)
- Bruit maison (hash entier `Math.imul`, gradient 2D, interpolation quintique, fBm), opérations de base seulement.
- `genVersion = 1`, figé par des **valeurs d'or** (hauteurs, biomes, ids pour plusieurs graines dont 0) — tests de
  caractérisation, exception écrite au TDD. Les paramètres du générateur (relief, rayon du monde…) vivent dans
  `world/params.ts`, pas dans `balance.ts` : ils changent le monde.
- **Scellement** : `genVersion 1` est scellé à la première version distribuée à quelqu'un d'autre que José (tag git +
  ligne au journal). Avant : valeurs d'or vertes à chaque commit ; recapture seulement dans un commit dédié au changement
  voulu du générateur, raison au journal, jamais dans un refactor. Après : on ne modifie jamais un générateur scellé, on
  ajoute v2 à côté. Politique pour les anciennes parties : à trancher avant la première sortie.
- Graine : `uint32` dans le cœur ; la conversion texte → graine fait partie de `genVersion 1` (avec ses valeurs d'or) ;
  validation des entrées à la frontière (nouvelle partie, `load()`), pas dans la boucle.
- **Chunks** de 64 m, un sommet tous les 2 m (taille confirmée au spike) ; hauteur d'un sommet = `heightAt(seed, x, z)` en
  coordonnées monde → bords identiques par construction.
- **Biomes** : bruits très basse fréquence température/humidité → forêt tempérée, biome froid ; mélange des paramètres près
  des frontières ; les deux biomes garantis dans le rayon de départ.
- **Point de départ** : recherche en spirale déterministe d'un lieu « forêt, plat, libre ».
- **Ressources** : grille globale ; id `r:{gx}:{gz}` ; type selon le biome ; **repousse** : bois et plantes oui
  (`regrowTime` ≈ 1-2 jours de jeu, dans `balance`), roches et givrite non (`Infinity`).
- **Lieux** (pierres-veilleuses, ruines) : grille de 2-3 chunks, K essais déterministes pour une pente acceptable ; id `p:{gx}:{gz}` ;
  contenu d'une ruine tiré de `hash(seed, placeId)`, stocké seulement une fois fouillée. Les ids dépendent de la grille, donc de `genVersion`.
- **Anneaux de danger** : fonction pure de la distance au départ.
- **Bord du monde** : rayon `R ≈ 8 km` (`world/params.ts`, décidé dès genVersion 1) ; entre `R − 300 m` et `R` le relief monte en
  montagnes infranchissables ; rien n'y apparaît ; brouillard ; streamer limité. Pas d'origine flottante (vérifié au spike
  par une téléportation à 8 km).
- **Web Worker** : `chunk.worker` appelle la même fonction pure `generateChunk` et renvoie, en transférables, `ChunkData`
  (cœur) et tampons de maillage + matrices d'instances (rendu). Le filtrage des ressources récoltées est fait par le cœur.
  `map.worker` calcule les images de carte depuis la graine (jamais sauvegardées).

## 6. Créatures
- Machine à états : errer, fuir, se défendre, poursuivre, attaquer, bloqué → frapper l'obstacle. Pas de calcul de chemin.
- Rayon de simulation < rayon de chargement ; rayon de disparition = simulation + marge (pas d'apparition/disparition en boucle).
  Hors de ce rayon ou chunk déchargé : la créature disparaît. **Créatures non sauvegardées** : recréées par les règles au chargement.
- Apparition selon jour/nuit, biome, anneau de danger ; plafond global (≈15, fixé par le spike).
- Butin : directement dans le sac en v1 (pas de butin au sol à sauvegarder).
- **Nuit d'assaut** : toutes les 5 nuits ; si le joueur est près de son Foyer, les monstres visent le Foyer et ses défenses ;
  **sinon ils traquent le joueur là où il est** (on n'échappe pas à l'assaut en partant loin). Le camp n'est jamais
  attaqué en l'absence du joueur.

## 7. Ports (ADR 0006)
```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type StorageError = { kind: 'not-found' } | { kind: 'quota' } | { kind: 'unavailable'; detail: string } | { kind: 'io'; detail: string };

interface SaveRepository {             // stockage « bête » de texte ; encodage, validation, migration dans core/save
  list(): Promise<Result<readonly SaveListEntry[], StorageError>>;
  read(saveId: SaveId): Promise<Result<{ text: string; source: 'current' | 'previous' }, StorageError>>;
  write(saveId: SaveId, text: string, expectedRevision: number): Promise<Result<void, StorageError | { kind: 'conflict' }>>;
  remove(saveId: SaveId): Promise<Result<void, StorageError>>;
}
interface SaveFileTransfer { exportFile(saveId: SaveId, suggestedName: string, text: string): Promise<Result<void, StorageError>>;
                             importFile(): Promise<Result<string | null, StorageError>> }   // null = annulé ; aucun chemin
interface SettingsStore { load(): unknown; save(s: Settings): void }                         // localStorage des deux côtés
interface Clock { monotonicMs(): number; wallClockMs(): number }                            // app uniquement
interface FrameScheduler { start(onFrame: (ms: number) => void): () => void }
interface ChunkSource { request(cx: number, cz: number, prio: number): void; cancel(cx: number, cz: number): void;
                        drainReady(): readonly ChunkData[] }                                  // trié → déterministe
interface InputDevice { sample(): RawInput; requestPointerLock(): void; releasePointerLock(): void;
                        labelFor(code: string): Promise<string> }
interface WorldView { chunksLoaded(k: readonly ChunkKey[]): void; chunksUnloaded(k: readonly ChunkKey[]): void;
                      render(prev: RenderFrame, curr: RenderFrame, alpha: number, cam: CameraPose): void;
                      events(e: readonly GameEvent[]): void }
interface AudioOutput { play(cue: SoundCue, at?: Vec3): void; setListener(p: CameraPose): void;
                        setAmbience(a: Ambience): void; setVolumes(v: Volumes): void }
```
Faux pour les tests : `MemorySaveRepo`, `SyncChunkSource`, `FakeClock`, `ScriptedInput`, `RecordingView`, `NullAudio`.

## 8. Modèle de données — sauvegarde (ADR 0005)
Un monde = un document JSON. On ne stocke que ce qui ne se recalcule pas depuis la graine.
```ts
interface SaveFile { format: 'jeu-survie.save'; formatVersion: 1; gameVersion: string; body: SaveBodyV1 }
interface SaveBodyV1 {
  meta: { name: string /*1..40*/; day: number; playTimeSeconds: number; deaths: number;
          createdAt: IsoDate; savedAt: IsoDate /*fournis par app/save-service*/; revision: number /*garde d'écriture*/ };
  world: { seedText: string /*≤64*/; worldGenVersion: number };
  clock: { elapsedSeconds: number; day: number /*continue après une mort*/; dayFraction: number /*[0,1)*/; nextAssaultDay: number };
  player: { pos: Vec3; yaw: number; hp: number; hunger: number; warmth: number;
            bag: Slot[] /*taille fixe ; 0..7 = barre rapide*/; hotbarSelected: number; equipment: { body: Slot }; pendingRespawn: boolean };
  changes: { nextObjectId: number;
             harvested: Record<ResourceId, number /*secondes ; purgé une fois repoussé*/>;
             objects: PlacedObject[] /*feu(level)/coffre(contents)/abri/couchette/palissade/torche, avec pos, rotY, hp*/;
             foyerId: ObjectId | null; bedId: ObjectId | null;
             ruins: Record<PlaceId, Slot[]> /*présente = fouillée*/;
             activatedStones: { place: PlaceId; day: number }[];
             tombs: { id: ObjectId; pos: Vec3; day: number; cause: DeathCause; contents: Slot[] }[];
             explored: { cellSize: 16; regionSize: 32; regions: Record<RegionKey, string /*base64, 128 o*/> };
             pin: Vec2 | null };
  journal: { biomes: ContentId[]; creatures: ContentId[]; places: Record<PlaceId, { day: number }>; bestDays: number };
  progress: { itemsEverObtained: ContentId[]; objectivesDone: string[]; hintsShown: string[] };
}
```
- **Non sauvegardé** : terrain, biomes, ressources non récoltées, contenu des ruines non fouillées, créatures, endurance,
  assaut en cours, images de carte, index de recherche (reconstruits au chargement), PRNG.
- **À la mort** : tout le sac (barre rapide comprise) et la cape vont dans la tombe ; le compteur de jours continue ;
  `deaths` +1 ; faim et chaleur remontées à 50 % minimum à la réapparition (couchette > dernière pierre activée > départ).
- **Réglages** séparés (`SettingsV1`, localStorage), non exportés.
- **Ids** : `saveId` `/^[a-z0-9]{12}$/` aléatoire (app), clé de stockage, jamais dérivé du nom ; objets posés et tombes = compteur.
- Taille attendue ≈ 150-250 Ko après 10 h.

### Chargement : `load(raw) → Result<{save, report}, LoadError>`, jamais d'exception
Taille contrôlée **avant lecture** (≤ 5 Mo) → `JSON.parse` (RangeError attrapée) → enveloppe (`formatVersion` trop récent →
refus sans toucher au fichier) → migrations n→n+1 pures, appliquées seulement à des données validées par le schéma
d'origine → schéma valibot strict qui **reconstruit** des objets neufs (`Map` pour les clés d'ids validées par regex,
refus de `__proto__`/`constructor`/`prototype`, aucune fusion profonde) → plafonds (objets ≤ 20 000, récoltes ≤ 100 000,
tombes ≤ 1 000, régions explorées ≤ 20 000) → bornes (nombres finis, positions dans le monde, quantités) → références
(foyer, couchette, ids de contenu). v1 : valeurs hors bornes ramenées dans les bornes ; sinon refus et proposition de la
sauvegarde précédente. Même `load()` pour un import, IndexedDB et un fichier : **tout stockage est non fiable**.
Avant la première publication : rétablir les copies « avant migration » et une sauvegarde de référence par version.

## 9. Stockage (ADR 0006)
- **Navigateur** : IndexedDB, base préfixée, magasins `meta`, `bodies` (clé `[saveId, 'current'|'previous']`, texte) ;
  écriture = une transaction qui relit `revision` (refus « partie modifiée ailleurs » si elle diffère), copie current → previous,
  écrit le nouveau. `navigator.storage.persist()` après la première sauvegarde réussie.
- **Electron** : `userData/saves/<saveId>/world.json` + `world.prev.json` ; écriture `.tmp` → fsync → renommages, nouvelles
  tentatives sur EPERM/EBUSY (~2 s) ; au chargement, repli `.tmp` puis `.prev`. Pas de `meta.json` (la liste lit l'en-tête ;
  mesure au spike, meta rétablie si > 300 ms pour 10 mondes). Instance unique.
- **Autosave** : toutes les 60 s de jeu, à l'aube, à la mort, à la fermeture d'un coffre, à une pose coûteuse, en manuel ;
  navigateur : `visibilitychange → hidden` (pause + une écriture) puis `pagehide` ; .exe : à la fermeture (attente ≤ 2 s).
  Une écriture à la fois (la plus récente gagne).
- **Échec** : quota → état en mémoire, état « échec de sauvegarde » de la maquette, proposition d'export ; jamais de suppression de `current`.
- **Export/import** : fichier `SaveFile` ; l'import crée toujours un nouveau `saveId` ; nom d'export nettoyé ; le nom du
  monde ne sert jamais à construire un chemin.

## 10. Interface (ADR 0008)
- Sélecteurs purs → **modèles de vue** sérialisables (valeurs arrondies, codes de raison) ; `store.subscribe(sel, onChange)`
  n'appelle que si le modèle a changé. Sélecteurs sur la simulation chaude : comparaison du modèle en sortie.
- Composants `mount/update/destroy` + `setIfChanged` ; `textContent` uniquement ; HUD mis à jour au changement ;
  mini-carte en `<canvas>` ≤ 10 Hz ; jauges en `transform: scaleX`.
- L'UI appelle `session.dispatch(cmd)` ; actions d'interface pure (onglet, case choisie) en état local.
- **Modes** : Menu, Loading, Playing, Placing, Overlay(bag | map | container), Paused, ResumePrompt, Dead, Error.
  Pause déclenchée par la **perte de capture souris** ; Tab/M referment et reprennent la capture ; Échap → Pause ;
  ResumePrompt quand le navigateur refuse la reprise. Overlay : monde actif, personnage arrêté.
- Échelle `--ui-scale = min(l/1280, h/720) × réglage` (peut descendre sous 1) ; résolution 3D réglée à part.
- Touches lues par `KeyboardEvent.code` ; libellés selon le clavier quand le navigateur le permet ; `preventDefault` ciblé
  (Tab, F5, Espace, clic droit, Ctrl+molette) ; menu Electron supprimé.

## 11. Rendu et direction artistique (ADR 0009)
- Style **stylisé coloré « fantasy »**, univers original. Modèles **CC0 d'abord** (packs cohérents, squelette d'animation
  commun), pack payant seulement si le test de beauté le justifie. Assets validés (`gltf-validator`, pas d'URI externe,
  textures ≤ 2048), crédités dans `assets/CREDITS.md`, jamais chargés depuis une sauvegarde.
- La beauté passe d'abord par la **lumière** : cycle jour/crépuscule/nuit, brume, lueurs, palette par biome, post-traitement léger.
- Terrain en couleurs de sommets ; végétation en *thin instances* ; ombres en option ; technique d'animation des créatures
  (squelettes clonés vs textures d'animation) et budget d'appels de dessin / LOD : **ADR à écrire en sortie de spike**.
- Décodeurs Babylon (Draco, KTX2) auto-hébergés ou non utilisés ; écran de chargement Babylon par défaut désactivé.

## 12. Sécurité (ADR 0007)
Electron : `contextIsolation`, `sandbox` (+ `app.enableSandbox()`), `nodeIntegration: false`, `webSecurity`, pas de webview ;
chargement par `protocol.handle('app')` (schéma privilégié standard + secure) avec **confinement de chemin** ; navigation,
redirections, nouvelles fenêtres et webviews bloquées ; permissions refusées sauf capture souris et plein écran ; pas de
`shell.openExternal` hors liste blanche ; CSP stricte (`default-src 'self'` …, `object-src 'none'`, Trusted Types) en en-tête
et en `<meta>` ; IPC : expéditeur vérifié (cadre principal, `app://game/`), types, `saveId` par regex, taille, JSON valide ;
preload à 6 fonctions sans chemin ; fuses verrouillés (RunAsNode, NODE_OPTIONS, inspect, privilèges file:// désactivés ;
intégrité asar et chargement depuis asar seulement) ; pas de mise à jour automatique en v1 ; Electron sur une version
supportée, monté à chaque sortie.
Web / itch.io : origine possiblement partagée → revalidation à chaque lecture, export mis en avant ; CSP en `<meta>`.
Données : aucun chemin absolu ni nom d'utilisateur stocké, affiché ou exporté ; aucune télémétrie ; pas de secret dans
le repo (certificat de signature hors repo). `window.__game` absent du build de production (test sur `dist/`).
Chaîne d'approvisionnement : lockfile commité, `npm ci`, versions exactes, `npm audit` **complet** (Electron compris).

### Règles d'accès et leurs tests
| # | Règle | Test |
|---|---|---|
| R1 | Pas de Node dans le rendu ; preload = exactement 6 fonctions | e2e Electron : `typeof require/process` undefined ; clés de `window.saves` |
| R2 | `saveId` validé, chemin confiné sous `userData/saves` | unitaire file-store : `..\x`, `a/b`, `CON`, vide, 200 caractères refusés |
| R3 | Chemins d'export/import uniquement via le dialogue du main | unitaire : arguments de chemin ignorés |
| R4 | Taille plafonnée (5 Mo) avant lecture/écriture, JSON valide côté main | unitaire : 6 Mo refusé, JSON invalide refusé |
| R5 | IPC accepté seulement depuis le cadre de l'app | unitaire : `senderFrame` étranger rejeté |
| R6 | Aucune navigation, fenêtre, webview, contenu distant | e2e : `window.open`, `location=` sans effet ; CSP bloque une requête externe |
| R7 | Handler `app://` confiné | unitaire : `..`, `%2e%2e`, `\`, chemin absolu → 404 |
| R8 | Permissions refusées sauf capture souris / plein écran | unitaire sur le handler |
| R9 | Fuses verrouillés | `npx @electron/fuses read` sur le .exe produit |
| R10 | Aucun HTML injecté (`textContent` seul) | ESLint + en-tête CSP vérifié |
| R11 | Toute donnée lue passe par `load()` ; une entrée hostile ne plante jamais | fuzzing fast-check (exécutions bornées) |
| R12 | Une sauvegarde plus récente n'est jamais écrasée ; un import n'écrase jamais | unitaire : fichier inchangé à l'octet près ; nouvel id |
| R13 | Un seul écrivain par monde (garde `revision`, instance unique) | contrat SaveRepository : écriture concurrente → `conflict` |
| R14 | Aucune ressource réseau (CDN, télémétrie) | e2e : aucune requête hors origine |
| R15 | Pas de chemin absolu dans sauvegarde, export, message d'erreur | unitaire sur encode et sur le formatage d'erreur |

## 13. Gestion d'erreurs
- Refus métier (hors portée, ingrédients manquants, pose invalide, sac plein) : événements / `Result` avec code de raison ;
  l'état n'est jamais modifié par un refus (testé).
- Ports : `Result`, aucune exception au-delà d'un adapter.
- Bug dans `step` : arrêt de la simulation, mode Error (« Le jeu a rencontré un problème »), rapport copiable nettoyé ;
  la dernière autosave et la précédente restent intactes.
- Worker planté : recréé, demandes relancées. Perte du contexte WebGL : pause + message. Electron : `render-process-gone` → relance.

## 14. Stratégie de test
| Couche | Outil | Contenu |
|---|---|---|
| core | Vitest + fast-check | toutes les règles ; propriétés (déterminisme, bords communs, conservation des quantités, aller-retour encode/load) ; valeurs d'or ; sélecteurs |
| app | Vitest + faux | pas fixe, modes, keymap, streamer, camera-rig, autosave, audio cues, scénario de session (nouveau → ticks → sauvegarde → rechargement) |
| adapters | Vitest | contrat `SaveRepository` sur Memory, fake-indexeddb, file-store ; mesh-data = groundHeight ; worker = appel direct |
| ui | Vitest + happy-dom | modèle de vue → DOM ; 2e update identique n'écrit rien ; clic → bonne commande |
| e2e | Playwright | (1) nouveau monde → avancer (via `window.__game`) ; (2) récolter → fabriquer → sauvegarder → recharger ; valeurs d'or lues dans le navigateur ; (3) .exe : sauvegarder → fermer → rouvrir + règles R1/R6 |
| beauté et fluidité | `bench/` manuel | parcours scripté 60 s sur la machine de référence : moyenne et 1 % low consignés dans `docs/` |

**Premier test qui doit échouer** — `src/core/world/chunk.test.ts` :
```ts
it('deux chunks voisins ont exactement les mêmes hauteurs sur leur bord commun', () => {
  const a = generateChunk(12345, 0, 0), b = generateChunk(12345, 1, 0);
  const N = CHUNK_VERTS - 1;
  for (let i = 0; i <= N; i++) expect(b.heights[i * (N + 1)]).toBe(a.heights[i * (N + 1) + N]);
});
```
Puis : même graine ⇒ chunk identique ; graines différentes ⇒ ≥ 90 % de hauteurs différentes ; valeurs d'or ; `advance()`.

## 15. Ordre de construction
**Spike « beau et fluide » (1-2 semaines, branche `spike/beau-et-fluide`)**
- Gardé, en TDD : `core/world` (bruit, heightAt, generateChunk, biomes), `core/physics/ground` + `moveAndSlide` minimal + saut,
  `app/loop`, `app/chunks/streamer`, `render-data/mesh-data`, chunk worker, `dom-input-device` + modes minimaux
  (Playing / Paused / ResumePrompt), éclairage jour/crépuscule/nuit, `fps-meter`, squelette Electron durci (app://, preload vide,
  fuses), `bench/`, règles ESLint et tsconfig par couche.
- Jetable, sans TDD (exception écrite), dans `src/spike/` jamais importé et supprimé avant S1 : perso et créatures CC0
  animés, comparaison squelettes vs textures d'animation, réglages visuels (ombres, distance, brume, densité), post-traitement.
- **Sortie** : validation du look par José ; plafond de créatures ; taille de chunk et distance de vue ; technique d'animation ;
  machine de référence ; verdict Firefox ; origine flottante ou non ; 30 ou 60 Hz ; temps de liste de 10 mondes ;
  Trusted Types / CSP compatibles avec Babylon ; stockage sur itch.io (upload brouillon). ADR « rendu et animation ».

**Stories** : S1 → S2 (l'encode/load du cœur commence ici, test d'aller-retour qui grandit à chaque story) → S3 → S4 → S5
→ S6 → S9 → S7 → S8.

## 16. Dépendances
Exécution : `@babylonjs/core` (imports profonds), `@babylonjs/loaders`, `valibot`.
Développement : `typescript`, `vite`, `vitest`, `fast-check`, `happy-dom`, `fake-indexeddb`, `@playwright/test`, `electron`,
`electron-builder`, `eslint`, `typescript-eslint`, `eslint-plugin-boundaries` (ou `eslint-plugin-import`), `@types/node`.
Pas de framework d'UI, pas de bibliothèque de bruit, pas de Havok, pas de wrapper IndexedDB. Toute nouvelle dépendance
est signalée et justifiée.

## 17. Questions ouvertes (techniques, tranchées par le spike ou avant la sortie)
Machine de référence · Firefox dans la cible · origine et stockage sur itch.io · politique `genVersion` après publication ·
signature du .exe (SmartScreen accepté en v1 ; décision de José à la phase déploiement).
