// FIXTURE DE LINT — témoin propre : un fichier du cœur qui respecte toutes les règles.
// Lue uniquement par tests/lint/guardrails.test.ts. Ignorée par `npm run lint` et les tsconfig.
import { sibling } from './allowed-target';

export const clean = Math.floor(sibling * 2) + Math.abs(-1) + Math.imul(3, 5);
