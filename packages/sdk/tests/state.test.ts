import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureState,
  loadState,
  saveState,
  stateFilePath,
  type InstanceState,
} from '../src/state.js';

let configDir: string;
let savedXdg: string | undefined;

const valid: InstanceState = {
  version: 1,
  seed: 'abcdefghij',
  install_uuid: '11111111-1111-4111-8111-111111111111',
  first_seen_at: '2026-01-10T00:00:00.000Z',
  opted_in: true,
  opted_in_at: '2026-01-10T00:00:00.000Z',
};

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'etus-state-test-'));
  savedXdg = process.env['XDG_CONFIG_HOME'];
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (savedXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
  else process.env['XDG_CONFIG_HOME'] = savedXdg;
});

describe('stateFilePath', () => {
  it('uses configDir when provided', () => {
    expect(stateFilePath('etus-foo', '/custom')).toBe(
      '/custom/etus-foo.json',
    );
  });

  it('uses $XDG_CONFIG_HOME when set and configDir is not', () => {
    process.env['XDG_CONFIG_HOME'] = '/tmp/xdg';
    expect(stateFilePath('etus-foo')).toBe(
      '/tmp/xdg/etus-telemetry/etus-foo.json',
    );
  });

  it('falls back to ~/.config/etus-telemetry when $XDG not set', () => {
    delete process.env['XDG_CONFIG_HOME'];
    expect(stateFilePath('etus-foo')).toMatch(
      /\/\.config\/etus-telemetry\/etus-foo\.json$/,
    );
  });
});

describe('loadState', () => {
  it('returns null when file does not exist', () => {
    expect(loadState('etus-foo', configDir)).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    writeFileSync(join(configDir, 'etus-foo.json'), '{not json');
    expect(loadState('etus-foo', configDir)).toBeNull();
  });

  it('returns null when version is unknown', () => {
    writeFileSync(
      join(configDir, 'etus-foo.json'),
      JSON.stringify({ ...valid, version: 999 }),
    );
    expect(loadState('etus-foo', configDir)).toBeNull();
  });

  it('roundtrips a saved state', () => {
    saveState('etus-foo', valid, configDir);
    expect(loadState('etus-foo', configDir)).toEqual(valid);
  });

  it('isolates state per product', () => {
    saveState('etus-foo', valid, configDir);
    expect(loadState('etus-bar', configDir)).toBeNull();
  });
});

describe('saveState', () => {
  it('creates parent dirs when missing', () => {
    const deep = join(configDir, 'a', 'b', 'c');
    saveState('etus-foo', valid, deep);
    expect(existsSync(join(deep, 'etus-foo.json'))).toBe(true);
  });

  it('writes the file with mode 0o600 (owner read/write only)', () => {
    saveState('etus-foo', valid, configDir);
    const mode = statSync(join(configDir, 'etus-foo.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('writes valid JSON readable by node:fs', () => {
    saveState('etus-foo', valid, configDir);
    const raw = readFileSync(join(configDir, 'etus-foo.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(valid);
  });

  it('overwrites an existing state', () => {
    saveState('etus-foo', valid, configDir);
    const updated: InstanceState = { ...valid, seed: 'zzz' };
    saveState('etus-foo', updated, configDir);
    expect(loadState('etus-foo', configDir)?.seed).toBe('zzz');
  });
});

describe('ensureState — fresh', () => {
  it('creates a fresh state with opted_in=true', () => {
    const s = ensureState('etus-foo', true, configDir);
    expect(s.version).toBe(1);
    expect(s.opted_in).toBe(true);
    expect(s.opted_in_at).not.toBeNull();
    expect(s.seed.length).toBeGreaterThan(0);
    expect(s.install_uuid.length).toBeGreaterThan(0);
    expect(s.first_seen_at).not.toBeNull();
  });

  it('creates a fresh state with opted_in=false', () => {
    const s = ensureState('etus-foo', false, configDir);
    expect(s.opted_in).toBe(false);
    expect(s.opted_in_at).toBeNull();
  });

  it('persists the fresh state to disk', () => {
    const fresh = ensureState('etus-foo', true, configDir);
    expect(loadState('etus-foo', configDir)).toEqual(fresh);
  });

  it('generates a unique seed per fresh state', () => {
    const a = ensureState('etus-foo', true, configDir);
    const b = ensureState('etus-bar', true, configDir);
    expect(a.seed).not.toBe(b.seed);
    expect(a.install_uuid).not.toBe(b.install_uuid);
  });
});

describe('ensureState — transitions', () => {
  it('returns existing unchanged when opted_in already true', () => {
    const first = ensureState('etus-foo', true, configDir);
    const second = ensureState('etus-foo', true, configDir);
    expect(second).toEqual(first);
  });

  it('upgrades opted_in from false to true and stamps opted_in_at', () => {
    const first = ensureState('etus-foo', false, configDir);
    expect(first.opted_in_at).toBeNull();

    const second = ensureState('etus-foo', true, configDir);
    expect(second.opted_in).toBe(true);
    expect(second.opted_in_at).not.toBeNull();
    // identidade da instância preservada
    expect(second.seed).toBe(first.seed);
    expect(second.install_uuid).toBe(first.install_uuid);
    expect(second.first_seen_at).toBe(first.first_seen_at);
  });

  it('does not downgrade opted_in from true to false', () => {
    const first = ensureState('etus-foo', true, configDir);
    const second = ensureState('etus-foo', false, configDir);
    // opt-out via ensureState NÃO desliga — só env/config no consent.ts faz isso
    expect(second).toEqual(first);
  });

  it('keeps opted_in=false through multiple calls', () => {
    const first = ensureState('etus-foo', false, configDir);
    const second = ensureState('etus-foo', false, configDir);
    expect(second).toEqual(first);
  });
});
