import { z } from 'zod';
import { HeartbeatEvent } from './heartbeat.js';
import { LifecycleEvent } from './lifecycle.js';

export * from './envelope.js';
export * from './heartbeat.js';
export * from './lifecycle.js';

// Discriminated union — qualquer evento aceito pelo ingestor.
export const TelemetryEvent = z.discriminatedUnion('event', [
  HeartbeatEvent,
  LifecycleEvent,
]);

export type TelemetryEvent = z.infer<typeof TelemetryEvent>;

// Versão atual do schema. Bump aqui = breaking change.
export const CURRENT_SCHEMA_VERSION = '1.0.0';

// Versões mínimas aceitas pelo ingestor.
export const MIN_ACCEPTED_SCHEMA_VERSION = '1.0.0';
