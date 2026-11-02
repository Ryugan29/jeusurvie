import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// Root = the original Babylon.js project (three levels up).
export default defineConfig({ root: fileURLToPath(new URL('../../..', import.meta.url)), test: { environment: 'node', include: ['JeuSurvieUnity/Tools~/parity/*.test.ts'], testTimeout: 120000 } });
