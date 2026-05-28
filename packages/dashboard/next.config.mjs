// Setup das bindings em dev (D1, KV, etc.) usando o wrangler.toml local.
// Necessário para que `getRequestContext()` funcione em `next dev`.
//
// O `persist.path` aponta para o mesmo dir que o worker usa via
// `wrangler dev --persist-to`, para que ambos compartilhem o D1 local.
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sharedPersistPath = resolve(here, '../../.wrangler/state/v3');

if (process.env.NODE_ENV === 'development') {
  await setupDevPlatform({ persist: { path: sharedPersistPath } });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
