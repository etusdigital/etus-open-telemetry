// Detecção de ambiente do lado do SDK. Roda em Node ≥20.
//
// Conservadora: prefere 'unknown' a chutar errado.

import { existsSync } from 'node:fs';
import { platform, arch } from 'node:os';
import { env } from 'node:process';

export type Os = 'linux' | 'macos' | 'windows' | 'unknown';
export type Arch = 'x86_64' | 'arm64' | 'unknown';
export type Deployment = 'docker' | 'kubernetes' | 'native' | 'unknown';

export function detectOs(): Os {
  switch (platform()) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

export function detectArch(): Arch {
  switch (arch()) {
    case 'x64':
      return 'x86_64';
    case 'arm64':
      return 'arm64';
    default:
      return 'unknown';
  }
}

export function detectDeployment(): Deployment {
  if (env['KUBERNETES_SERVICE_HOST']) return 'kubernetes';
  if (
    existsSync('/.dockerenv') ||
    existsSync('/run/.containerenv') // podman
  ) {
    return 'docker';
  }
  if (platform() === 'linux' || platform() === 'darwin' || platform() === 'win32') {
    return 'native';
  }
  return 'unknown';
}

export function isContainerized(): boolean {
  const d = detectDeployment();
  return d === 'docker' || d === 'kubernetes';
}

// "CI" universal — uma das envs comuns. Usado para decidir se nem perguntar opt-in.
export function isCi(): boolean {
  return Boolean(
    env['CI'] ||
      env['CONTINUOUS_INTEGRATION'] ||
      env['GITHUB_ACTIONS'] ||
      env['GITLAB_CI'] ||
      env['BUILDKITE'] ||
      env['CIRCLECI'] ||
      env['JENKINS_URL'],
  );
}

// DO_NOT_TRACK universal — respeitar sempre.
export function isDoNotTrack(): boolean {
  return env['DO_NOT_TRACK'] === '1' || env['DO_NOT_TRACK'] === 'true';
}
