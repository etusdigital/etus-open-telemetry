// Resolve consentimento. Opt-in **explícito**: precisa de sinal positivo
// para qualquer envio acontecer. CI e DO_NOT_TRACK desligam tudo.

import { isCi, isDoNotTrack } from '@etus/telemetry-shared';

export type ConsentReason =
  | 'do_not_track'
  | 'ci_detected'
  | 'env_disabled'
  | 'env_enabled'
  | 'config_disabled'
  | 'config_enabled'
  | 'default_off';

export interface ConsentResolution {
  enabled: boolean;
  reason: ConsentReason;
}

export function resolveConsent(opts?: {
  configEnabled?: boolean | null;
}): ConsentResolution {
  if (isDoNotTrack()) return { enabled: false, reason: 'do_not_track' };
  if (isCi()) return { enabled: false, reason: 'ci_detected' };

  const envVal = process.env['ETUS_TELEMETRY'];
  if (envVal === 'enabled' || envVal === '1' || envVal === 'true') {
    return { enabled: true, reason: 'env_enabled' };
  }
  if (envVal === 'disabled' || envVal === '0' || envVal === 'false') {
    return { enabled: false, reason: 'env_disabled' };
  }

  if (opts?.configEnabled === true) {
    return { enabled: true, reason: 'config_enabled' };
  }
  if (opts?.configEnabled === false) {
    return { enabled: false, reason: 'config_disabled' };
  }

  return { enabled: false, reason: 'default_off' };
}
