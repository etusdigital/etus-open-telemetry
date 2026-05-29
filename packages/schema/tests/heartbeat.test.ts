import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  HeartbeatEvent,
  LifecycleEvent,
  TelemetryEvent,
} from '../src/index.js';

const baseEnvelope = {
  schema_version: CURRENT_SCHEMA_VERSION,
  event_id: '11111111-1111-4111-8111-111111111111',
  timestamp: '2026-05-27T17:00:00.000Z',
  product: { name: 'etus-foo', version: '1.2.3' },
  instance: {
    id: 'heapvqcsszbfbydugt7v4b7qru',
    first_seen_at: '2026-01-10T00:00:00.000Z',
  },
};

describe('HeartbeatEvent', () => {
  it('accepts a minimal heartbeat (envelope only)', () => {
    const parsed = HeartbeatEvent.parse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
    });
    expect(parsed.event).toBe('instance.heartbeat');
  });

  it('accepts a fully populated heartbeat with integer usage', () => {
    const parsed = HeartbeatEvent.parse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      environment: {
        os: 'linux',
        arch: 'arm64',
        runtime: 'node',
        runtime_version: '20.12.2',
        deployment: 'docker',
        is_containerized: true,
      },
      database: { engine: 'postgres', version_major: '16' },
      usage: { users: 47, storage_bytes: 2_341_823_413, uptime_days: 47 },
      features: { enabled: ['sso'], integrations: ['slack'] },
    });
    expect(parsed.usage?.['users']).toBe(47);
    expect(parsed.usage?.['storage_bytes']).toBe(2_341_823_413);
  });

  it('accepts dynamic/product-specific usage metrics (ADR-0004)', () => {
    const parsed = HeartbeatEvent.parse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage: { messages_sent: 1200, active_contacts: 47, documents: 8 },
    });
    expect(parsed.usage?.['messages_sent']).toBe(1200);
    expect(parsed.usage?.['active_contacts']).toBe(47);
  });

  it('accepts an empty usage map', () => {
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects fractional usage values (must be integer)', () => {
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage: { users: 4.5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative usage values', () => {
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage: { users: -1 },
    });
    expect(result.success).toBe(false);
  });

  it.each(['Bad-Key', 'has space', 'a.b', 'João', '1leading_digit', ''])(
    'rejects invalid metric key %j',
    (key) => {
      const result = HeartbeatEvent.safeParse({
        ...baseEnvelope,
        event: 'instance.heartbeat',
        usage: { [key]: 1 },
      });
      expect(result.success).toBe(false);
    },
  );

  it('rejects more than 50 metrics', () => {
    const usage: Record<string, number> = {};
    for (let i = 0; i < 51; i++) usage[`metric_${i}`] = i;
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown os enum value', () => {
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      environment: {
        os: 'aix',
        arch: 'arm64',
        runtime: 'node',
        runtime_version: '20',
        deployment: 'native',
        is_containerized: false,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-semver product version', () => {
    const result = HeartbeatEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
      product: { name: 'etus-foo', version: 'v1' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid product slugs (ADR-0005)', () => {
    for (const name of ['etus-foo', 'a1', 'etus-open-telemetry']) {
      const result = HeartbeatEvent.safeParse({
        ...baseEnvelope,
        event: 'instance.heartbeat',
        product: { name, version: '1.2.3' },
      });
      expect(result.success, name).toBe(true);
    }
  });

  it('rejects malformed product slugs (ADR-0005)', () => {
    for (const name of ['My Product', 'Etus', 'etus_foo', 'a.b', '1foo', 'x', '']) {
      const result = HeartbeatEvent.safeParse({
        ...baseEnvelope,
        event: 'instance.heartbeat',
        product: { name, version: '1.2.3' },
      });
      expect(result.success, name).toBe(false);
    }
  });
});

describe('LifecycleEvent', () => {
  it('accepts an install lifecycle', () => {
    const parsed = LifecycleEvent.parse({
      ...baseEnvelope,
      event: 'instance.lifecycle',
      lifecycle: {
        type: 'install',
        from_version: null,
        to_version: '1.0.0',
        feature: null,
      },
    });
    expect(parsed.lifecycle.type).toBe('install');
  });

  it('rejects unknown lifecycle type', () => {
    const result = LifecycleEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.lifecycle',
      lifecycle: {
        type: 'restart',
        from_version: null,
        to_version: null,
        feature: null,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('TelemetryEvent discriminated union', () => {
  it('routes heartbeat shape to HeartbeatEvent variant', () => {
    const parsed = TelemetryEvent.parse({
      ...baseEnvelope,
      event: 'instance.heartbeat',
    });
    expect(parsed.event).toBe('instance.heartbeat');
  });

  it('routes lifecycle shape to LifecycleEvent variant', () => {
    const parsed = TelemetryEvent.parse({
      ...baseEnvelope,
      event: 'instance.lifecycle',
      lifecycle: {
        type: 'upgrade',
        from_version: '1.0.0',
        to_version: '1.1.0',
        feature: null,
      },
    });
    expect(parsed.event).toBe('instance.lifecycle');
  });

  it('rejects unknown event discriminator', () => {
    const result = TelemetryEvent.safeParse({
      ...baseEnvelope,
      event: 'instance.mystery',
    });
    expect(result.success).toBe(false);
  });
});
