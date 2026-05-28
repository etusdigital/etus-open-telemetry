// Public API do @etus/telemetry-sdk.
//
// Uso típico:
//
//   import { telemetry } from '@etus/telemetry-sdk';
//
//   telemetry.init({ product: 'etus-foo', version: '2.4.1' });
//   await telemetry.heartbeat({
//     usage: { active_users: 47, messages_sent: 12_034 },
//     features: { enabled: ['sso'], integrations: ['slack'] },
//   });
//
// O endpoint NÃO tem default: vem de `config.endpoint` ou da env var
// `ETUS_TELEMETRY_ENDPOINT`. Sem endpoint, o SDK não envia (no-op) e o
// `init()` retorna `reason: 'no_endpoint'`.

import type { LifecycleEvent } from '@etus/telemetry-schema';
import { resolveConsent, type ConsentResolution } from './consent.js';
import { ensureState, type InstanceState } from './state.js';
import { buildHeartbeat, buildLifecycle, type HeartbeatStats } from './payload.js';
import { send, type SendResult } from './sender.js';

export interface TelemetryConfig {
  product: string;
  version: string;
  /** Override explícito do endpoint. Se omitido, usa `ETUS_TELEMETRY_ENDPOINT`. */
  endpoint?: string;
  configDir?: string;
  /** Override explícito de opt-in feito pelo app hospedeiro (vindo do config do operador). */
  optedIn?: boolean | null;
}

/** Resolve o endpoint: config explícito → env var → null (sem default). */
function resolveEndpoint(configEndpoint?: string): string | null {
  if (configEndpoint) return configEndpoint;
  const fromEnv = process.env['ETUS_TELEMETRY_ENDPOINT'];
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

interface InternalState {
  product: string;
  version: string;
  endpoint: string | null;
  configDir: string | undefined;
  consent: ConsentResolution;
  /** Consentimento dado E endpoint resolvido — só então envia. */
  canSend: boolean;
  reason: string;
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
    const endpoint = resolveEndpoint(config.endpoint);

    // Instância é criada quando há consentimento (mesmo sem endpoint),
    // para que `inspect()` consiga montar o preview.
    const instance = consent.enabled
      ? ensureState(config.product, true, config.configDir)
      : null;

    const canSend = consent.enabled && endpoint !== null;
    // Opt-in dado mas sem endpoint → não envia, e o motivo deixa isso claro.
    const reason =
      consent.enabled && endpoint === null ? 'no_endpoint' : consent.reason;

    internal = {
      product: config.product,
      version: config.version,
      endpoint,
      configDir: config.configDir,
      consent,
      canSend,
      reason,
      instance,
    };

    return { enabled: canSend, reason };
  },

  isEnabled(): boolean {
    return internal?.canSend === true;
  },

  async heartbeat(stats: HeartbeatStats = {}): Promise<SendResult | null> {
    const s = ensureInit();
    if (!s.canSend || !s.instance || !s.endpoint) return null;
    try {
      const event = await buildHeartbeat(
        { name: s.product, version: s.version },
        s.instance,
        stats,
      );
      return await send(s.endpoint, event);
    } catch {
      // Telemetria nunca pode quebrar o app hospedeiro.
      return { ok: false, attempt: 0 };
    }
  },

  async lifecycle(
    lifecycle: LifecycleEvent['lifecycle'],
  ): Promise<SendResult | null> {
    const s = ensureInit();
    if (!s.canSend || !s.instance || !s.endpoint) return null;
    try {
      const event = await buildLifecycle(
        { name: s.product, version: s.version },
        s.instance,
        lifecycle,
      );
      return await send(s.endpoint, event);
    } catch {
      return { ok: false, attempt: 0 };
    }
  },

  /**
   * Inspeção: retorna o que seria enviado num heartbeat agora, sem enviar.
   * Funciona com consentimento dado mesmo que o endpoint não esteja
   * configurado (útil para o operador pré-visualizar o payload).
   */
  async inspect(stats: HeartbeatStats = {}): Promise<unknown> {
    const s = ensureInit();
    if (!s.instance) {
      return { reason: s.reason, endpoint: s.endpoint, would_send: null };
    }
    const event = await buildHeartbeat(
      { name: s.product, version: s.version },
      s.instance,
      stats,
    );
    return { reason: s.reason, endpoint: s.endpoint, would_send: event };
  },

  /** Reset (use com cuidado — útil em testes). */
  __reset(): void {
    internal = null;
  },
};

export type { HeartbeatStats } from './payload.js';
export type { ConsentResolution } from './consent.js';
export type { SendResult } from './sender.js';
