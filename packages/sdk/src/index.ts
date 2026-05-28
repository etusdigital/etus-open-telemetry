// Public API do @etus/telemetry-sdk.
//
// Uso típico:
//
//   import { telemetry } from '@etus/telemetry-sdk';
//
//   telemetry.init({ product: 'etus-foo', version: '2.4.1' });
//   await telemetry.heartbeat({
//     usage: { users_bucket: '10-100', storage_bucket: '1-10GB', uptime_days_bucket: '7-30' },
//     features: { enabled: ['sso'], integrations: ['slack'] },
//   });

import type { LifecycleEvent } from '@etus/telemetry-schema';
import { resolveConsent, type ConsentResolution } from './consent.js';
import { ensureState, type InstanceState } from './state.js';
import { buildHeartbeat, buildLifecycle, type HeartbeatStats } from './payload.js';
import { send, type SendResult } from './sender.js';

export interface TelemetryConfig {
  product: string;
  version: string;
  endpoint?: string;
  configDir?: string;
  /** Override explícito de opt-in feito pelo app hospedeiro (vindo do config do operador). */
  optedIn?: boolean | null;
}

const DEFAULT_ENDPOINT = 'https://telemetry.etus.com.br';

interface InternalState {
  config: Required<Omit<TelemetryConfig, 'configDir' | 'optedIn'>> & {
    configDir: string | undefined;
    optedIn: boolean | null;
  };
  consent: ConsentResolution;
  instance: InstanceState | null;
}

let internal: InternalState | null = null;

function ensureInit(): InternalState {
  if (!internal) throw new Error('telemetry.init() must be called first');
  return internal;
}

export const telemetry = {
  init(config: TelemetryConfig): { enabled: boolean; reason: string } {
    const consent = resolveConsent({ configEnabled: config.optedIn ?? null });
    const instance = consent.enabled
      ? ensureState(config.product, true, config.configDir)
      : null;

    internal = {
      config: {
        product: config.product,
        version: config.version,
        endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
        configDir: config.configDir,
        optedIn: config.optedIn ?? null,
      },
      consent,
      instance,
    };

    return { enabled: consent.enabled, reason: consent.reason };
  },

  isEnabled(): boolean {
    return internal?.consent.enabled === true;
  },

  async heartbeat(stats: HeartbeatStats = {}): Promise<SendResult | null> {
    const s = ensureInit();
    if (!s.consent.enabled || !s.instance) return null;
    try {
      const event = await buildHeartbeat(
        { name: s.config.product, version: s.config.version },
        s.instance,
        stats,
      );
      return await send(s.config.endpoint, event);
    } catch {
      // Telemetria nunca pode quebrar o app hospedeiro.
      return { ok: false, attempt: 0 };
    }
  },

  async lifecycle(
    lifecycle: LifecycleEvent['lifecycle'],
  ): Promise<SendResult | null> {
    const s = ensureInit();
    if (!s.consent.enabled || !s.instance) return null;
    try {
      const event = await buildLifecycle(
        { name: s.config.product, version: s.config.version },
        s.instance,
        lifecycle,
      );
      return await send(s.config.endpoint, event);
    } catch {
      return { ok: false, attempt: 0 };
    }
  },

  /** Inspeção: retorna o que seria enviado num heartbeat agora, sem enviar. */
  async inspect(stats: HeartbeatStats = {}): Promise<unknown> {
    const s = ensureInit();
    if (!s.instance) return { consent: s.consent, would_send: null };
    const event = await buildHeartbeat(
      { name: s.config.product, version: s.config.version },
      s.instance,
      stats,
    );
    return { consent: s.consent, would_send: event };
  },

  /** Reset (use com cuidado — útil em testes). */
  __reset(): void {
    internal = null;
  },
};

export type { HeartbeatStats } from './payload.js';
export type { ConsentResolution } from './consent.js';
export type { SendResult } from './sender.js';
