// Bindings injetados pelo wrangler.toml.

import type { TelemetryEvent } from '@etus/telemetry-schema';

export interface QueueMessage {
  event: TelemetryEvent;
  received_at: number;
}

export interface Env {
  DB: D1Database;
  QUEUE: Queue<QueueMessage>;
  R2_PUBLIC: R2Bucket;
  R2_BACKUPS: R2Bucket;
  SCHEMA_MIN_VERSION: string;
  EVENT_RETENTION_DAYS: string;
  INACTIVITY_THRESHOLD_DAYS: string;
}
