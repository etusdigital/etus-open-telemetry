// Constrói payloads de heartbeat e lifecycle conforme @etus/telemetry-schema.

import { randomUUID } from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  type HeartbeatEvent,
  type LifecycleEvent,
} from '@etus/telemetry-schema';
import {
  buildInstanceId,
  detectArch,
  detectDeployment,
  detectOs,
  isContainerized,
} from '@etus/telemetry-shared';
import type { InstanceState } from './state.js';

export interface HeartbeatStats {
  runtime?: string;
  runtime_version?: string;
  database?: { engine: string; version_major: string };
  usage?: HeartbeatEvent['usage'];
  features?: HeartbeatEvent['features'];
}

export interface ProductInfo {
  name: string;
  version: string;
}

async function buildEnvelope<E extends 'instance.heartbeat' | 'instance.lifecycle'>(
  product: ProductInfo,
  state: InstanceState,
  eventName: E,
): Promise<{
  schema_version: string;
  event: E;
  event_id: string;
  timestamp: string;
  product: ProductInfo;
  instance: { id: string; first_seen_at: string };
}> {
  const id = await buildInstanceId(state.seed, state.install_uuid, product.name);
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    event: eventName,
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    product,
    instance: { id, first_seen_at: state.first_seen_at },
  };
}

export async function buildHeartbeat(
  product: ProductInfo,
  state: InstanceState,
  stats: HeartbeatStats = {},
): Promise<HeartbeatEvent> {
  const env = await buildEnvelope(product, state, 'instance.heartbeat');
  const hb: HeartbeatEvent = {
    ...env,
    environment: {
      os: detectOs(),
      arch: detectArch(),
      runtime: stats.runtime ?? 'node',
      runtime_version: stats.runtime_version ?? process.versions.node,
      deployment: detectDeployment(),
      is_containerized: isContainerized(),
    },
  };
  if (stats.database) hb.database = stats.database;
  if (stats.usage) hb.usage = stats.usage;
  if (stats.features) hb.features = stats.features;
  return hb;
}

export async function buildLifecycle(
  product: ProductInfo,
  state: InstanceState,
  lifecycle: LifecycleEvent['lifecycle'],
): Promise<LifecycleEvent> {
  const env = await buildEnvelope(product, state, 'instance.lifecycle');
  return { ...env, lifecycle };
}
