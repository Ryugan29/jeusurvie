import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le cœur ne connaît ni DOM ni navigateur : on le teste dans Node pur.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Les fixtures de lint ne sont pas des tests (elles sont seulement lues par ESLint).
    exclude: ['**/node_modules/**', '**/__lint_fixtures__/**'],
    setupFiles: ['tests/setup/fast-check.ts'],
    globalSetup: ['tests/setup/fast-check-seed.global.ts'],
    // Les tests statistiques du monde (sentiers, couvre-sol) prennent 1 à 3 s seuls, davantage en suite complète chargée.
    testTimeout: 15000,
  },
});
