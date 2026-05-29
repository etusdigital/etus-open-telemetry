import { beforeEach, describe, expect, it } from 'vitest';
import { ingestorApp, __test__ } from '../src/ingestor.js';

const validEvent = {
  schema_version: '1.0.0',
  event: 'instance.heartbeat',
  event_id: '11111111-1111-4111-8111-111111111111',
  timestamp: '2026-05-27T17:00:00.000Z',
  product: { name: 'etus-foo', version: '1.2.3' },
  instance: {
    id: 'heapvqcsszbfbydugt7v4b7qru',
    first_seen_at: '2026-01-10T00:00:00.000Z',
  },
};

// Env mínimo: DB.prepare().bind().first() devolve o status configurado;
// QUEUE.send incrementa um contador.
function makeEnv(status: string | null) {
  const sent: unknown[] = [];
  const env = {
    SCHEMA_MIN_VERSION: '1.0.0',
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => (status === null ? null : { status }),
        }),
      }),
    },
    QUEUE: { send: async (m: unknown) => void sent.push(m) },
  } as unknown as Parameters<typeof ingestorApp.fetch>[1];
  return { env, sent };
}

function postEvent(body: unknown): Request {
  return new Request('http://t/v1/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ingestor product gate (ADR-0005)', () => {
  beforeEach(() => __test__.statusCache.clear());

  it('drops rejected product: 202 and no enqueue', async () => {
    const { env, sent } = makeEnv('rejected');
    const res = await ingestorApp.fetch(postEvent(validEvent), env);
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
  });

  it('enqueues approved product', async () => {
    const { env, sent } = makeEnv('approved');
    const res = await ingestorApp.fetch(postEvent(validEvent), env);
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
  });

  it('enqueues unknown product (no registry row yet)', async () => {
    const { env, sent } = makeEnv(null);
    const res = await ingestorApp.fetch(postEvent(validEvent), env);
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
  });

  it('still rejects malformed slug at the schema (400, no gate query)', async () => {
    const { env, sent } = makeEnv('approved');
    const res = await ingestorApp.fetch(
      postEvent({ ...validEvent, product: { name: 'Bad Name', version: '1.2.3' } }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
