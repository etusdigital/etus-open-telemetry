import { z } from 'zod';

// Envelope comum a todos os eventos. Ver docs/02-event-schema.md.

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

export const Envelope = z.object({
  schema_version: z.string().regex(SEMVER, 'must be semver'),
  event: z.string(), // o discriminator fica nos schemas específicos
  event_id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  product: z.object({
    name: z.string().min(1).max(64),
    version: z.string().regex(SEMVER, 'must be semver'),
  }),
  instance: z.object({
    id: z.string().min(16).max(128),
    first_seen_at: z.string().datetime({ offset: true }),
  }),
});

export type Envelope = z.infer<typeof Envelope>;
