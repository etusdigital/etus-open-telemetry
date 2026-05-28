// Persistência local do estado da instância (seed, install_uuid, opt-in).
//
// Arquivo: $XDG_CONFIG_HOME/etus-telemetry/<product>.json
//   ou em volume montado se rodando em container.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateSeed } from '@etus/telemetry-shared';

export interface InstanceState {
  version: 1;
  seed: string;
  install_uuid: string;
  first_seen_at: string;
  opted_in: boolean;
  opted_in_at: string | null;
}

function defaultConfigDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) return join(xdg, 'etus-telemetry');
  return join(homedir(), '.config', 'etus-telemetry');
}

export function stateFilePath(product: string, configDir?: string): string {
  return join(configDir ?? defaultConfigDir(), `${product}.json`);
}

export function loadState(
  product: string,
  configDir?: string,
): InstanceState | null {
  const path = stateFilePath(product, configDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as InstanceState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(
  product: string,
  state: InstanceState,
  configDir?: string,
): void {
  const path = stateFilePath(product, configDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function ensureState(
  product: string,
  optedIn: boolean,
  configDir?: string,
): InstanceState {
  const existing = loadState(product, configDir);
  if (existing) {
    if (optedIn && !existing.opted_in) {
      const updated: InstanceState = {
        ...existing,
        opted_in: true,
        opted_in_at: new Date().toISOString(),
      };
      saveState(product, updated, configDir);
      return updated;
    }
    return existing;
  }

  const now = new Date().toISOString();
  const fresh: InstanceState = {
    version: 1,
    seed: generateSeed(),
    install_uuid: randomUUID(),
    first_seen_at: now,
    opted_in: optedIn,
    opted_in_at: optedIn ? now : null,
  };
  saveState(product, fresh, configDir);
  return fresh;
}
