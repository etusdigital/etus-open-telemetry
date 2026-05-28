import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const here = dirname(fileURLToPath(import.meta.url));

// SDK publicado self-contained: os pacotes internos (@etus/telemetry-schema e
// -shared) e o zod são bundlados a partir do SOURCE. O pacote publicado não tem
// dependências `@etus/*` para o consumidor resolver — só os built-ins do Node.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  target: 'node20',
  platform: 'node',
  // Bundla os internos + zod (não ficam como deps externas).
  noExternal: [/^@etus\//, 'zod'],
  // Resolve os internos a partir do source — dispensa pré-build de schema/shared.
  esbuildOptions(options) {
    options.alias = {
      '@etus/telemetry-schema': resolve(here, '../schema/src/index.ts'),
      '@etus/telemetry-shared': resolve(here, '../shared/src/index.ts'),
    };
  },
});
