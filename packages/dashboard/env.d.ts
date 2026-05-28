// Bindings disponíveis em `getRequestContext().env`.
// Espelha os blocos do wrangler.toml.

import type {} from '@cloudflare/workers-types';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export {};
