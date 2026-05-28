// Envia o payload ao ingestor. Falha silenciosa.
// Retry exponencial até 3 tentativas; depois aborta.

import type { TelemetryEvent } from '@etus/telemetry-schema';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export interface SendResult {
  ok: boolean;
  status?: number;
  attempt: number;
}

export async function send(
  endpoint: string,
  event: TelemetryEvent,
  signal?: AbortSignal,
): Promise<SendResult> {
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      };
      if (signal) init.signal = signal;
      const res = await fetch(`${endpoint}/v1/events`, init);
      if (res.ok) return { ok: true, status: res.status, attempt };
      // 4xx é dado inválido pelo cliente — não retenta
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, attempt };
      }
    } catch {
      // network error — retenta
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** (attempt - 1)));
    }
  }
  return { ok: false, attempt };
}
