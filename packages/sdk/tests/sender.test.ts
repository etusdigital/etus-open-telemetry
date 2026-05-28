import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryEvent } from '@etus/telemetry-schema';
import { send } from '../src/sender.js';

const ENDPOINT = 'http://t';

const event: TelemetryEvent = {
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

function resp(status: number, body = '') {
  return new Response(body, { status });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('send — happy path', () => {
  it('returns ok=true on 200 in first attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(200)));
    const result = await send(ENDPOINT, event);
    expect(result).toEqual({ ok: true, status: 200, attempt: 1 });
  });

  it('returns ok=true on 202 in first attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp(202)));
    const result = await send(ENDPOINT, event);
    expect(result).toEqual({ ok: true, status: 202, attempt: 1 });
  });

  it('posts to {endpoint}/v1/events with JSON body and content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(202));
    vi.stubGlobal('fetch', fetchMock);
    await send(ENDPOINT, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://t/v1/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
  });
});

describe('send — 4xx does not retry', () => {
  it.each([400, 401, 403, 404, 422, 429])(
    'returns ok=false on %i and does not retry',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(resp(status, 'bad'));
      vi.stubGlobal('fetch', fetchMock);
      const result = await send(ENDPOINT, event);
      expect(result).toEqual({ ok: false, status, attempt: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

describe('send — 5xx retries up to MAX_ATTEMPTS', () => {
  it('retries 500 three times and gives up', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(500, 'err'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = send(ENDPOINT, event);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.attempt).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('succeeds on retry after transient 503', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(503))
      .mockResolvedValueOnce(resp(202));
    vi.stubGlobal('fetch', fetchMock);
    const promise = send(ENDPOINT, event);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ ok: true, status: 202, attempt: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('send — network errors retry', () => {
  it('retries on rejected fetch up to MAX_ATTEMPTS', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = send(ENDPOINT, event);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ ok: false, attempt: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('recovers when network error precedes a 202', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(resp(202));
    vi.stubGlobal('fetch', fetchMock);
    const promise = send(ENDPOINT, event);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ ok: true, status: 202, attempt: 2 });
  });
});

describe('send — AbortSignal pass-through', () => {
  it('passes signal to fetch when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(202));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await send(ENDPOINT, event, controller.signal);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('omits signal from init when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(202));
    vi.stubGlobal('fetch', fetchMock);
    await send(ENDPOINT, event);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });
});
