import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  // Os pacotes internos não são deps do SDK (são bundlados no build via alias).
  // O vitest precisa do mesmo alias para resolvê-los a partir do source nos testes.
  resolve: {
    alias: {
      '@etus/telemetry-schema': resolve(here, '../schema/src/index.ts'),
      '@etus/telemetry-shared': resolve(here, '../shared/src/index.ts'),
    },
  },
});
