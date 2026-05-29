import { describe, expect, it } from 'vitest';
import type { TelemetryEvent } from '@etus/telemetry-schema';
import { __test__, persistBatch } from '../src/persistor.js';

const { buildRow } = __test__;

const baseEnvelope = {
  schema_version: '1.0.0',
  event_id: '11111111-1111-4111-8111-111111111111',
  timestamp: '2026-05-27T17:00:00.000Z',
  product: { name: 'etus-foo', version: '1.2.3' },
  instance: {
    id: 'heapvqcsszbfbydugt7v4b7qru',
    first_seen_at: '2026-01-10T00:00:00.000Z',
  },
};

describe('buildRow', () => {
  it('promotes envelope fields to columns', () => {
    const event: TelemetryEvent = {
      ...baseEnvelope,
      event: 'instance.heartbeat',
    };
    const row = buildRow({ event, received_at: 1_700_000_000_000 });

    expect(row.event_id).toBe(event.event_id);
    expect(row.received_at).toBe(1_700_000_000_000);
    expect(row.emitted_at).toBe(Date.parse(event.timestamp));
    expect(row.schema_version).toBe('1.0.0');
    expect(row.event_type).toBe('instance.heartbeat');
    expect(row.product_name).toBe('etus-foo');
    expect(row.product_version).toBe('1.2.3');
    expect(row.instance_id).toBe('heapvqcsszbfbydugt7v4b7qru');
  });

  it('keeps only non-envelope fields in payload JSON', () => {
    const event: TelemetryEvent = {
      ...baseEnvelope,
      event: 'instance.heartbeat',
      environment: {
        os: 'linux',
        arch: 'arm64',
        runtime: 'node',
        runtime_version: '20',
        deployment: 'docker',
        is_containerized: true,
      },
      usage: { users: 47, storage_bytes: 100, uptime_days: 7 },
    };
    const row = buildRow({ event, received_at: 1_700_000_000_000 });
    const payload = JSON.parse(row.payload);

    expect(payload.environment).toBeDefined();
    expect(payload.usage).toEqual({
      users: 47,
      storage_bytes: 100,
      uptime_days: 7,
    });
    expect(payload.product).toBeUndefined();
    expect(payload.instance).toBeUndefined();
    expect(payload.event).toBeUndefined();
    expect(payload.event_id).toBeUndefined();
    expect(payload.schema_version).toBeUndefined();
    expect(payload.timestamp).toBeUndefined();
  });

  it('handles lifecycle events', () => {
    const event: TelemetryEvent = {
      ...baseEnvelope,
      event: 'instance.lifecycle',
      lifecycle: {
        type: 'install',
        from_version: null,
        to_version: '1.0.0',
        feature: null,
      },
    };
    const row = buildRow({ event, received_at: 1_700_000_000_000 });
    const payload = JSON.parse(row.payload);

    expect(row.event_type).toBe('instance.lifecycle');
    expect(payload.lifecycle.type).toBe('install');
  });

  it('produces deterministic JSON for identical events', () => {
    const event: TelemetryEvent = {
      ...baseEnvelope,
      event: 'instance.heartbeat',
      usage: { users: 1, storage_bytes: 1, uptime_days: 1 },
    };
    const a = buildRow({ event, received_at: 1 });
    const b = buildRow({ event, received_at: 1 });
    expect(a).toEqual(b);
  });
});

describe('persistBatch product registry (ADR-0005)', () => {
  // Mock de D1: prepare(sql) carrega o sql; bind(...args) preserva ambos;
  // batch(stmts) captura os statements pra inspeção.
  function makeEnv() {
    const captured: Array<{ sql: string; args: unknown[] }> = [];
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => ({ sql, args }),
        }),
        batch: async (stmts: Array<{ sql: string; args: unknown[] }>) => {
          captured.push(...stmts);
          return [];
        },
      },
    } as unknown as Parameters<typeof persistBatch>[1];
    return { env, captured };
  }

  function msg(slug: string, received_at: number) {
    return {
      body: {
        event: { ...baseEnvelope, event: 'instance.heartbeat', product: { name: slug, version: '1.2.3' } },
        received_at,
      },
    };
  }

  it('upserts one pending product per distinct slug, with earliest first_seen', async () => {
    const { env, captured } = makeEnv();
    const batch = {
      messages: [msg('etus-foo', 100), msg('etus-foo', 50), msg('etus-bar', 200)],
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as Parameters<typeof persistBatch>[0];

    await persistBatch(batch, env);

    const productStmts = captured.filter((s) => s.sql.includes('INTO products'));
    expect(productStmts).toHaveLength(2); // foo + bar, deduplicado
    expect(productStmts.every((s) => s.sql.includes("'pending'"))).toBe(true);

    const foo = productStmts.find((s) => s.args[0] === 'etus-foo');
    expect(foo?.args[1]).toBe(50); // menor received_at vira first_seen_at
  });
});
