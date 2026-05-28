import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConsent } from '../src/consent.js';

const ENV_KEYS = [
  'DO_NOT_TRACK',
  'CI',
  'CONTINUOUS_INTEGRATION',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'BUILDKITE',
  'CIRCLECI',
  'JENKINS_URL',
  'ETUS_TELEMETRY',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('resolveConsent', () => {
  it('default is off when nothing is set', () => {
    expect(resolveConsent()).toEqual({
      enabled: false,
      reason: 'default_off',
    });
  });

  it('DO_NOT_TRACK=1 wins over everything', () => {
    process.env['DO_NOT_TRACK'] = '1';
    process.env['ETUS_TELEMETRY'] = 'enabled';
    expect(resolveConsent({ configEnabled: true })).toEqual({
      enabled: false,
      reason: 'do_not_track',
    });
  });

  it('DO_NOT_TRACK=true also wins', () => {
    process.env['DO_NOT_TRACK'] = 'true';
    expect(resolveConsent({ configEnabled: true })).toEqual({
      enabled: false,
      reason: 'do_not_track',
    });
  });

  it('CI=true disables telemetry even with config_enabled', () => {
    process.env['CI'] = 'true';
    expect(resolveConsent({ configEnabled: true })).toEqual({
      enabled: false,
      reason: 'ci_detected',
    });
  });

  it.each([
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'BUILDKITE',
    'CIRCLECI',
    'JENKINS_URL',
  ])('CI signal %s also disables', (key) => {
    process.env[key] = '1';
    expect(resolveConsent({ configEnabled: true }).enabled).toBe(false);
    expect(resolveConsent({ configEnabled: true }).reason).toBe('ci_detected');
  });

  it.each(['enabled', '1', 'true'])(
    'ETUS_TELEMETRY=%s enables',
    (val) => {
      process.env['ETUS_TELEMETRY'] = val;
      expect(resolveConsent()).toEqual({
        enabled: true,
        reason: 'env_enabled',
      });
    },
  );

  it.each(['disabled', '0', 'false'])(
    'ETUS_TELEMETRY=%s disables (even if configEnabled is true)',
    (val) => {
      process.env['ETUS_TELEMETRY'] = val;
      expect(resolveConsent({ configEnabled: true })).toEqual({
        enabled: false,
        reason: 'env_disabled',
      });
    },
  );

  it('configEnabled=true enables when no env signal', () => {
    expect(resolveConsent({ configEnabled: true })).toEqual({
      enabled: true,
      reason: 'config_enabled',
    });
  });

  it('configEnabled=false disables', () => {
    expect(resolveConsent({ configEnabled: false })).toEqual({
      enabled: false,
      reason: 'config_disabled',
    });
  });

  it('env beats config (ETUS_TELEMETRY=enabled wins over configEnabled=false)', () => {
    process.env['ETUS_TELEMETRY'] = 'enabled';
    expect(resolveConsent({ configEnabled: false })).toEqual({
      enabled: true,
      reason: 'env_enabled',
    });
  });
});
