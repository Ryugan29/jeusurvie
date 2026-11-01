// Garde-fous d'architecture et de sécurité (docs/03-archi.md §1, ADR 0001).
// Règle d'or : on ne désactive JAMAIS une règle de frontière pour faire passer du code.
// La preuve que ces règles mordent : tests/lint/guardrails.test.ts (fixtures dans **/__lint_fixtures__/).
//
// Attention : `no-restricted-syntax`, `no-restricted-properties` et `no-restricted-globals` sont des règles
// uniques ; un bloc plus spécifique REMPLACE leurs options. Chaque bloc recompose donc la liste complète
// (XSS + cœur + monde…). Le test « configuration réelle » vérifie qu'aucun bloc n'en écrase un autre.
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

const rootPath = import.meta.dirname;

// --- Globaux navigateur déclarés (lecture seule) ----------------------------------------------
// Sans déclaration, no-eval / no-implied-eval ne reconnaissent pas window.eval, setTimeout('…')…
// Liste minimale volontaire (le paquet `globals` n'est pas une dépendance du projet).
const BROWSER_GLOBALS = Object.fromEntries(
  [
    'window', 'self', 'document', 'navigator', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'crypto', 'fetch', 'localStorage',
    'indexedDB', 'structuredClone', 'queueMicrotask',
  ].map((name) => [name, 'readonly']),
);

// --- Partout : XSS et exécution de code dynamique ---------------------------------------------
const HTML_SINKS = 'innerHTML|outerHTML|insertAdjacentHTML|srcdoc|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment';
const XSS = 'Interdit (XSS) : afficher du texte avec textContent.';
const TIMER = 'setTimeout|setInterval';
const XSS_SYNTAX = [
  { selector: `MemberExpression[property.name=/^(${HTML_SINKS})$/]`, message: XSS },
  { selector: `MemberExpression[computed=true][property.value=/^(${HTML_SINKS})$/]`, message: XSS },
  {
    selector: `MemberExpression[computed=true][property.type='TemplateLiteral'][property.quasis.0.value.cooked=/^(${HTML_SINKS})$/]`,
    message: XSS,
  },
  { selector: `ObjectPattern > Property[key.name=/^(${HTML_SINKS})$/]`, message: XSS },
  { selector: `ObjectPattern > Property[key.value=/^(${HTML_SINKS})$/]`, message: XSS },
  { selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(srcdoc|on)/i]", message: XSS },
  { selector: "CallExpression[callee.property.name='setAttributeNS'][arguments.1.value=/^(srcdoc|on)/i]", message: XSS },
  {
    selector: "MemberExpression[object.name=/^(window|self|globalThis)$/][property.name='Function']",
    message: 'Interdit : exécution de code construit à partir de texte.',
  },
  // Les minuteries ne reçoivent qu'une fonction écrite sur place : jamais une chaîne, même cachée dans une variable.
  {
    selector: `CallExpression:matches([callee.name=/^(${TIMER})$/], [callee.property.name=/^(${TIMER})$/])[arguments.0.type!='ArrowFunctionExpression'][arguments.0.type!='FunctionExpression']`,
    message: 'Minuterie : passer une fonction écrite sur place, ex. setTimeout(() => f(), ms).',
  },
];
const XSS_PROPERTIES = [
  { object: 'document', property: 'write', message: 'Interdit (XSS).' },
  { object: 'document', property: 'writeln', message: 'Interdit (XSS).' },
];

// --- Partout : le bruit est un détail interne de core/world (hors de world, on passe par terrain, chunk, params)
const WORLD_PRIVATE_SYNTAX = [
  {
    selector: ':matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression)[source.value=/world.noise$/]',
    message: 'core/world/noise est interne au générateur : utiliser heightAt, generateChunk ou TERRAIN_V1.',
  },
];

// --- src/core/** : cœur pur, déterministe, sans plateforme ------------------------------------
const PURE = 'Cœur pur : ni plateforme, ni horloge, ni aléatoire, ni réglages régionaux.';
const CORE_PROPERTIES = [
  { object: 'Math', property: 'random', message: 'Cœur pur : utiliser le PRNG de core/shared (graine injectée).' },
  { object: 'Date', property: 'now', message: "Cœur pur : le temps vient des ticks, pas de l'horloge." },
  { object: 'performance', property: 'now', message: "Cœur pur : le temps vient des ticks, pas de l'horloge." },
  ...['localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].map((property) => ({
    property,
    message: 'Cœur pur : résultat dépendant de la langue du système.',
  })),
];
const CORE_GLOBALS = [
  'Date', 'window', 'document', 'crypto', 'setTimeout', 'setInterval', 'structuredClone', 'performance',
  'globalThis', 'self', 'navigator', 'process', 'requestAnimationFrame', 'fetch', 'localStorage', 'indexedDB',
  'Intl', 'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics',
].map((name) => ({ name, message: PURE }));
const CORE_SYNTAX = [
  {
    selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
    message: 'Cœur pur : pas de import.meta.env (paramètres dans core/config/balance.ts).',
  },
];

// --- src/core/world/** et src/core/shared/** : calcul identique bit à bit sur tous les moteurs JS (ADR 0004)
// Math en liste blanche : opérations exactes (IEEE 754) uniquement. sqrt est exactement arrondie par la norme.
const MATH_ALLOWED = 'floor|ceil|trunc|round|abs|sign|min|max|imul|clz32|fround|sqrt';
const MATH = 'Math en liste blanche (ADR 0004) : seulement floor, ceil, trunc, round, abs, sign, min, max, imul, clz32, fround, sqrt.';
const EXACT_SYNTAX = [
  { selector: `MemberExpression[object.name='Math'][computed=false]:not([property.name=/^(${MATH_ALLOWED})$/])`, message: MATH },
  { selector: "MemberExpression[object.name='Math'][computed=true]", message: MATH },
  // Alias (`const M = Math`, `const { sin } = Math`) : Math ne s'utilise que sous la forme Math.xxx.
  { selector: "Identifier[name='Math']:not(MemberExpression > Identifier.object)", message: MATH },
  { selector: "BinaryExpression[operator='**']", message: '** interdit (ADR 0004).' },
  { selector: "AssignmentExpression[operator='**=']", message: '**= interdit (ADR 0004).' },
];

// --- Zones par chemin (boundaries) -------------------------------------------------------------
const el = (type) => ({ to: { element: { type } } });
const anyExternal = { to: { module: { origin: ['external', 'core'] } } };
const testFile = { file: { categories: 'test' } };
const testLibs = { to: { module: { origin: 'external', source: ['vitest', 'fast-check'] } } };

export default defineConfig([
  globalIgnores(['node_modules/', 'dist/', 'release/', '.tsbuild/', 'coverage/', '**/__lint_fixtures__/']),

  {
    files: ['**/*.{ts,js}'],
    extends: [tseslint.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { globals: BROWSER_GLOBALS },
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': rootPath,
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      // L'ordre compte : le premier descripteur qui correspond l'emporte.
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core/**', partialMatch: false },
        { type: 'app', pattern: 'src/app/**', partialMatch: false },
        // Avant « adapters » (le premier descripteur qui correspond l'emporte) : zone pure des adapters.
        { type: 'render-data', pattern: 'src/adapters/render-data/**', partialMatch: false },
        { type: 'adapters', pattern: 'src/adapters/**', partialMatch: false },
        { type: 'ui', pattern: 'src/ui/**', partialMatch: false },
        { type: 'spike', pattern: 'src/spike/**', partialMatch: false },
        // src/main.ts (racine de composition) : à classer quand il sera créé (étape 3 du spike) ;
        // boundaries v7 ne classe que des dossiers, il faudra un descripteur de fichier ('boundaries/files').
        { type: 'electron', pattern: 'electron/**', partialMatch: false },
        { type: 'test-support', pattern: 'tests/fakes/**', partialMatch: false },
        { type: 'test-support', pattern: 'tests/fixtures/**', partialMatch: false },
        { type: 'tests', pattern: 'tests/**', partialMatch: false },
        { type: 'bench', pattern: 'bench/**', partialMatch: false },
      ],
      'boundaries/files': [
        { category: 'test', pattern: '**/*.test.ts' },
        { category: 'lint-fixture', pattern: '**/__lint_fixtures__/**' },
        // Fichiers d'outillage à la racine (eslint.config.js, vitest.config.ts…).
        { category: 'tooling', pattern: '*.{js,ts}' },
        // Tout fichier porte au moins « source » : sinon un sélecteur `noneOf` ne s'applique pas à lui.
        { category: 'source', pattern: '**' },
      ],
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-restricted-syntax': ['error', ...XSS_SYNTAX, ...WORLD_PRIVATE_SYNTAX],
      'no-restricted-properties': ['error', ...XSS_PROPERTIES],
      // Les imports doivent se résoudre vers un fichier connu : sinon la frontière ne serait pas vérifiée.
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Vérifie aussi les paquets npm et modules Node (node:fs…) et les fichiers locaux hors zones.
          checkAllOrigins: true,
          checkUnknownLocals: true,
          // Vérifie aussi les imports à l'intérieur d'une même couche (ex. core → fixture de core).
          checkInternals: true,
          // `import type`, `export … from` et `import()` compris (prouvé par les fixtures).
          policies: [
            // core n'importe que core (+ valibot) ; ses tests ont droit à vitest, fast-check, tests/fakes, tests/fixtures.
            { from: { element: { type: 'core' } }, allow: el('core') },
            { from: { element: { type: 'core' } }, allow: { to: { module: { origin: 'external', source: 'valibot' } } } },
            { from: { element: { type: 'core' }, ...testFile }, allow: [testLibs, el('test-support')] },
            // app n'importe que core (et app).
            { from: { element: { type: 'app' } }, allow: [el('core'), el('app')] },
            // render-data : données de rendu PURES (worker compris) : le cœur et elle-même, aucun paquet.
            { from: { element: { type: 'render-data' } }, allow: [el('core'), el('render-data')] },
            // adapters et ui : core + app + eux-mêmes ; jamais l'un l'autre.
            { from: { element: { type: 'adapters' } }, allow: [el('core'), el('app'), el('adapters'), el('render-data'), anyExternal] },
            { from: { element: { type: 'ui' } }, allow: [el('core'), el('app'), el('ui')] },
            // Tests de app, adapters, ui : mêmes droits que les tests du cœur.
            {
              from: { element: { types: { anyOf: ['app', 'adapters', 'render-data', 'ui'] } }, ...testFile },
              allow: [testLibs, el('test-support')],
            },
            // electron/ n'importe pas src/.
            { from: { element: { type: 'electron' } }, allow: [el('electron'), anyExternal] },
            // tests/ et bench/ : tout sauf le spike.
            {
              from: { element: { types: { anyOf: ['tests', 'test-support', 'bench'] } } },
              allow: [el('core'), el('app'), el('adapters'), el('render-data'), el('ui'), el('tests'), el('test-support'), el('bench'), anyExternal],
            },
            // spike : code jetable, peut tout importer ; personne ne l'importe (rien n'autorise `to: spike`).
            {
              from: { element: { type: 'spike' } },
              allow: [el('core'), el('app'), el('adapters'), el('render-data'), el('ui'), el('spike'), anyExternal],
            },
            // tests/ peut vérifier l'outillage de la racine (ex. la CSP injectée par vite.config.ts).
            { from: { element: { type: 'tests' } }, allow: { to: { file: { categories: 'tooling' } } } },
            // Outillage à la racine : paquets npm seulement.
            { from: { file: { categories: 'tooling' } }, allow: anyExternal },
            // EN DERNIER (l'emporte) : une fixture de lint n'est importable que par une autre fixture.
            {
              from: { file: { categories: { noneOf: ['lint-fixture'] } } },
              disallow: { to: { file: { categories: 'lint-fixture' } } },
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...XSS_PROPERTIES, ...CORE_PROPERTIES],
      'no-restricted-globals': ['error', ...CORE_GLOBALS],
      'no-restricted-syntax': ['error', ...XSS_SYNTAX, ...WORLD_PRIVATE_SYNTAX, ...CORE_SYNTAX],
    },
  },

  {
    files: ['src/core/world/**/*.ts', 'src/core/shared/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...XSS_SYNTAX, ...WORLD_PRIVATE_SYNTAX, ...CORE_SYNTAX, ...EXACT_SYNTAX],
    },
  },
]);
