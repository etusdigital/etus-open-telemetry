import { z } from 'zod';

// Envelope comum a todos os eventos. Ver docs/02-event-schema.md.

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

// Slug do produto (ADR-0005): começa com letra minúscula, depois minúsculas,
// dígitos ou hífen. Sem `.`/`_`/maiúsculas/espaço — seguro como chave de R2,
// path de URL pública e PK do registro `products`. 2 a 64 chars.
const PRODUCT_SLUG = /^[a-z][a-z0-9-]{1,63}$/;

export const Envelope = z.object({
  schema_version: z.string().regex(SEMVER, 'must be semver'),
  event: z.string(), // o discriminator fica nos schemas específicos
  event_id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  product: z.object({
    name: z.string().regex(PRODUCT_SLUG, 'must be a slug: ^[a-z][a-z0-9-]{1,63}$'),
    version: z.string().regex(SEMVER, 'must be semver'),
  }),
  instance: z.object({
    id: z.string().min(16).max(128),
    first_seen_at: z.string().datetime({ offset: true }),
  }),
});

export type Envelope = z.infer<typeof Envelope>;
