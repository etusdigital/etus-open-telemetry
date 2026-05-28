// Dummy app — valida o caminho ponta-a-ponta:
//   SDK → Worker (HTTP) → Queue → Persistor → D1.
//
// Pré-requisitos para rodar:
//   - `wrangler dev` rodando em packages/worker (localhost:8787)
//   - migrations aplicadas em D1 local
//
// Uso:
//   pnpm --filter @etus/dummy-app send

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { telemetry } from '@etus/telemetry-sdk';

// Estado da instância vai num tmp dir efêmero — não polui o $HOME do dev.
const configDir = mkdtempSync(join(tmpdir(), 'etus-dummy-'));

const init = telemetry.init({
  product: 'etus-dummy',
  version: '0.1.0',
  endpoint: process.env['ETUS_ENDPOINT'] ?? 'http://localhost:8787',
  optedIn: true, // simula operador habilitando opt-in
  configDir,
});

console.log('[dummy] consent:', init);

if (!init.enabled) {
  console.error('[dummy] consent not granted — bailing out.');
  process.exit(2);
}

console.log('[dummy] sending heartbeat...');
const res = await telemetry.heartbeat({
  database: { engine: 'postgres', version_major: '16' },
  usage: {
    // usage é um mapa dinâmico (ADR-0004): use as métricas que fizerem sentido
    // para o seu produto. Aqui um mix de "padrão" + custom.
    active_users: 47,
    messages_sent: 12_034,
    storage_bytes: 2_341_823_413,
    uptime_days: 47,
  },
  features: {
    enabled: ['sso', 'audit_log'],
    integrations: ['slack', 'github'],
  },
});

console.log('[dummy] result:', res);
process.exit(res?.ok ? 0 : 1);
