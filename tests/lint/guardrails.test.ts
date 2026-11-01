// Prouve que les garde-fous d'architecture et de sécurité (ADR 0001) mordent vraiment :
// on lance ESLint, avec la vraie configuration du projet, sur des fichiers volontairement fautifs
// placés aux vrais chemins (**/__lint_fixtures__/). Ces fixtures sont ignorées par `npm run lint`.
//
// Fixtures « à marqueurs » : chaque ligne terminée par `// ✗ règle [règle…]` doit porter exactement ces
// erreurs, et toute autre ligne aucune — ni règle oubliée, ni faux positif.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TIMEOUT = 60_000;

function eslint(): ESLint {
  return new ESLint({ cwd: root, ignore: false });
}

function assertNoFatal(result: ESLint.LintResult | undefined, label: string): Linter.LintMessage[] {
  if (result === undefined) throw new Error(`aucun résultat pour ${label}`);
  const fatal = result.messages.filter((m) => m.fatal === true);
  if (fatal.length > 0) throw new Error(`erreur d'analyse : ${fatal.map((m) => m.message).join(' | ')}`);
  return result.messages;
}

async function lint(relativePath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint().lintFiles([relativePath]);
  return assertNoFatal(result, relativePath);
}

/** Lint d'un code « virtuel » comme s'il était au chemin donné (sert aux sondes hors des dossiers de fixtures). */
async function lintAt(relativePath: string, code: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint().lintText(code, { filePath: join(root, relativePath) });
  return assertNoFatal(result, relativePath);
}

function lines(messages: Linter.LintMessage[], ruleId: string): number[] {
  return messages.filter((m) => m.ruleId === ruleId && m.severity === 2).map((m) => m.line);
}

function countRule(messages: Linter.LintMessage[], ruleId: string): number {
  return lines(messages, ruleId).length;
}

type RulesByLine = Record<number, string[]>;

function markedRules(relativePath: string): RulesByLine {
  const expected: RulesByLine = {};
  readFileSync(join(root, relativePath), 'utf8')
    .split(/\r?\n/)
    .forEach((text, index) => {
      const marker = /\/\/ ✗ (.+)$/.exec(text);
      if (marker?.[1] !== undefined) expected[index + 1] = marker[1].trim().split(/\s+/).sort();
    });
  return expected;
}

function actualRules(messages: Linter.LintMessage[]): RulesByLine {
  const actual: Record<number, Set<string>> = {};
  for (const m of messages) {
    if (m.severity !== 2) continue;
    (actual[m.line] ??= new Set()).add(m.ruleId ?? '(sans règle)');
  }
  return Object.fromEntries(Object.entries(actual).map(([line, rules]) => [line, [...rules].sort()]));
}

async function expectMarked(relativePath: string): Promise<void> {
  const expected = markedRules(relativePath);
  expect(Object.keys(expected).length).toBeGreaterThan(0);
  expect(actualRules(await lint(relativePath))).toEqual(expected);
}

describe('garde-fous ESLint (ADR 0001)', () => {
  describe('src/core : le cœur pur', () => {
    let messages: Linter.LintMessage[];
    beforeAll(async () => {
      messages = await lint('src/core/__lint_fixtures__/forbidden.ts');
    }, TIMEOUT);

    it("refuse un import relatif vers app et un import d'un module externe (node:fs)", () => {
      expect(lines(messages, 'boundaries/dependencies')).toEqual(expect.arrayContaining([3, 4]));
    });

    it('refuse aussi un `import type` vers app', () => {
      expect(lines(messages, 'boundaries/dependencies')).toContain(21);
    });

    it('refuse Math.random, Date.now, performance.now', () => {
      const text = messages.filter((m) => m.ruleId === 'no-restricted-properties').map((m) => m.message).join('\n');
      expect(text).toContain('Math.random');
      expect(text).toContain('Date.now');
      expect(text).toContain('performance.now');
    });

    it('refuse les globaux Date, window, document, crypto, setTimeout, setInterval, structuredClone', () => {
      const text = messages.filter((m) => m.ruleId === 'no-restricted-globals').map((m) => m.message).join('\n');
      for (const g of ['Date', 'window', 'document', 'crypto', 'setTimeout', 'setInterval', 'structuredClone']) {
        expect(text).toContain(`'${g}'`);
      }
    });

    it('refuse import.meta.env', () => {
      expect(lines(messages, 'no-restricted-syntax')).toContain(19);
    });

    it('refuse Intl, WeakRef, FinalizationRegistry, SharedArrayBuffer, Atomics, les globaux de plateforme et les méthodes locale', async () => {
      await expectMarked('src/core/__lint_fixtures__/forbidden-globals.ts');
    }, TIMEOUT);

    it('refuse un paquet npm externe, `export … from` et `import()` dynamique vers app', async () => {
      await expectMarked('src/core/__lint_fixtures__/forbidden-imports.ts');
    }, TIMEOUT);

    it('les tests du cœur peuvent importer tests/fakes et tests/fixtures…', async () => {
      expect(await lint('src/core/__lint_fixtures__/support.test.ts')).toEqual([]);
    }, TIMEOUT);

    it('… mais pas le code de production du cœur', async () => {
      await expectMarked('src/core/__lint_fixtures__/support-in-prod.ts');
    }, TIMEOUT);
  });

  it('accepte un fichier du cœur propre (témoin : les règles ne refusent pas tout)', async () => {
    const messages = await lint('src/core/__lint_fixtures__/allowed.ts');
    expect(messages).toEqual([]);
  }, TIMEOUT);

  it('src/core/world : refuse sin/cos/tan/pow/exp/log/atan2/hypot et **', async () => {
    const messages = await lint('src/core/world/__lint_fixtures__/forbidden-math.ts');
    // 8 fonctions hors liste blanche + `y **= 2` et `x ** 2`
    expect(countRule(messages, 'no-restricted-syntax')).toBe(10);
  }, TIMEOUT);

  it.each(['src/core/world', 'src/core/shared'])(
    '%s : Math en liste blanche (floor…sqrt seulement), accès calculé et alias interdits',
    async (dir) => {
      await expectMarked(`${dir}/__lint_fixtures__/math-allowlist.ts`);
    },
    TIMEOUT,
  );

  describe('src/app et partout', () => {
    let messages: Linter.LintMessage[];
    beforeAll(async () => {
      messages = await lint('src/app/__lint_fixtures__/forbidden.ts');
    }, TIMEOUT);

    it('refuse app → adapters et tout import de src/spike', () => {
      expect(lines(messages, 'boundaries/dependencies')).toEqual(expect.arrayContaining([3, 4]));
    });

    it('refuse innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function', () => {
      const restricted = [
        ...lines(messages, 'no-restricted-syntax'),
        ...lines(messages, 'no-restricted-properties'),
        ...lines(messages, 'no-eval'),
        ...lines(messages, 'no-new-func'),
      ];
      // lignes 8 à 13 : une interdiction par ligne
      for (let line = 8; line <= 13; line++) expect(restricted).toContain(line);
    });

    it('hors du cœur : setTimeout/setInterval avec une chaîne ou une fonction non écrite sur place, window.eval, window.Function, Function', async () => {
      await expectMarked('src/app/__lint_fixtures__/implied-eval.ts');
    }, TIMEOUT);

    it('XSS : accès calculé, déstructuration, srcdoc, setHTMLUnsafe, parseHTMLUnsafe, createContextualFragment, writeln, setAttribute', async () => {
      await expectMarked('src/ui/__lint_fixtures__/xss.ts');
    }, TIMEOUT);
  });

  it('le bruit est interne à core/world : seuls params (TERRAIN_V1…), terrain et chunk sont exposés', async () => {
    await expectMarked('src/app/__lint_fixtures__/world-internals.ts');
  }, TIMEOUT);

  it('render-data est pur : seulement le cœur et render-data, aucun paquet (ni Babylon), ni app, ni le reste des adapters', async () => {
    await expectMarked('src/adapters/render-data/__lint_fixtures__/forbidden.ts');
  }, TIMEOUT);

  describe('frontières entre couches', () => {
    it.each([
      ['ui → adapters', 'src/ui/__lint_fixtures__/forbidden.ts'],
      ['adapters → ui', 'src/adapters/__lint_fixtures__/forbidden.ts'],
      ['electron → src', 'electron/__lint_fixtures__/forbidden.ts'],
      ['tests → spike', 'tests/__lint_fixtures__/forbidden.ts'],
    ])('refuse %s', async (_label, file) => {
      await expectMarked(file);
    }, TIMEOUT);

    it.each([
      ['src/core/world/probe.ts', "import { sibling } from '../__lint_fixtures__/allowed-target';\nexport const y = sibling;\n"],
      ['tests/probe.ts', "import { target } from '../src/app/__lint_fixtures__/target';\nexport const y = target;\n"],
    ])("les fixtures de lint ne sont importables par personne (%s)", async (file, code) => {
      expect(lines(await lintAt(file, code), 'boundaries/dependencies')).toEqual([1]);
    }, TIMEOUT);
  });

  describe('la configuration réelle garde ses règles actives (aucun bloc ultérieur ne les écrase)', () => {
    it.each(['src/core/world/terrain.ts', 'src/core/shared/hash.ts'])('%s', async (file) => {
      const config = (await eslint().calculateConfigForFile(join(root, file))) as Linter.Config;
      const rules = config.rules ?? {};
      const json = (name: string): string => JSON.stringify(rules[name]);
      expect(json('no-restricted-syntax')).toContain('Math en liste blanche');
      expect(json('no-restricted-syntax')).toContain('import.meta.env');
      expect(json('no-restricted-syntax')).toContain('XSS');
      for (const g of ['Date', 'Intl', 'window', 'setTimeout', 'globalThis']) expect(json('no-restricted-globals')).toContain(`"${g}"`);
      for (const p of ['random', 'now', 'localeCompare', 'write']) expect(json('no-restricted-properties')).toContain(`"${p}"`);
      for (const r of ['no-eval', 'no-new-func', 'no-implied-eval', 'boundaries/dependencies']) {
        expect(JSON.stringify(rules[r])).toMatch(/^\[?(2|"error")/);
      }
    }, TIMEOUT);
  });
});
