import type {} from '@cloudflare/workers-types';

declare global {
  interface CloudflareEnv {
    R2_PUBLIC: R2Bucket;
  }
}

export {};
