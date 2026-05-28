import { z } from 'zod';
import { Envelope } from './envelope.js';

export const OsEnum = z.enum(['linux', 'macos', 'windows', 'unknown']);
export const ArchEnum = z.enum(['x86_64', 'arm64', 'unknown']);
export const DeploymentEnum = z.enum([
  'docker',
  'kubernetes',
  'native',
  'unknown',
]);

export const Environment = z.object({
  os: OsEnum,
  arch: ArchEnum,
  runtime: z.string().max(32),
  runtime_version: z.string().max(32),
  deployment: DeploymentEnum,
  is_containerized: z.boolean(),
});

export const Database = z.object({
  engine: z.string().max(32),
  version_major: z.string().max(16),
});

// Mapa dinâmico de métricas por-produto. Ver ADR-0004.
// - Chaves: snake_case, identificadores (não texto livre) — privacidade + json_extract seguro.
// - Valores: inteiro não-negativo (ADR-0003).
// - Máx 50 métricas por heartbeat.
const METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const Usage = z
  .record(z.string().regex(METRIC_KEY), z.number().int().nonnegative())
  .refine((m) => Object.keys(m).length <= 50, {
    message: 'too many metrics (max 50)',
  });

export const Features = z.object({
  enabled: z.array(z.string().max(64)).max(64),
  integrations: z.array(z.string().max(64)).max(64),
});

export const HeartbeatEvent = Envelope.extend({
  event: z.literal('instance.heartbeat'),
  environment: Environment.optional(),
  database: Database.optional(),
  usage: Usage.optional(),
  features: Features.optional(),
});

export type HeartbeatEvent = z.infer<typeof HeartbeatEvent>;
