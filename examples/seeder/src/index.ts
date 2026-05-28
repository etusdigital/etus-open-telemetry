// Seeder: envia heartbeats variados via HTTP para o worker local e em seguida
// alinha `received_at` ao `emitted_at` para que o dashboard veja a série
// temporal distribuída na janela.
//
// USO TÍPICO:
//   pnpm --filter @etus/telemetry-worker dev          # uma aba
//   pnpm --filter @etus/seeder seed                   # outra aba
//
// Variáveis:
//   ETUS_ENDPOINT    — endpoint do worker. Default: http://localhost:8787
//   ETUS_DAYS_BACK   — quantos dias atrás cobrir. Default: 365
//
// O script:
//   1. WIPE — apaga eventos existentes no D1 local
//   2. Para cada fixture, gera instance.id estável e envia heartbeats
//      respeitando `joined_days_ago` (instância não emite antes de existir)
//   3. Aguarda a Queue drenar
//   4. UPDATE events SET received_at = emitted_at

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  CURRENT_SCHEMA_VERSION,
  type HeartbeatEvent,
  type LifecycleEvent,
  type TelemetryEvent,
} from '@etus/telemetry-schema';
import { buildInstanceId } from '@etus/telemetry-shared';
import { FIXTURES, type Fixture } from './fixtures.js';

const ENDPOINT = process.env['ETUS_ENDPOINT'] ?? 'http://localhost:8787';
const DAYS_BACK = Number(process.env['ETUS_DAYS_BACK'] ?? '365');
const DAY_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 50; // fetches em paralelo

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Quantos heartbeats cada fixture vai gerar (limitado pelo joined_days_ago)
const plannedHeartbeats = FIXTURES.reduce(
  (a, f) => a + Math.min(DAYS_BACK, f.joined_days_ago + 1),
  0,
);
// 1 install + N upgrades + 1 lifecycle por feature + 1 por integration
const plannedLifecycle = FIXTURES.reduce((a, f) => {
  const upgrades = Math.max(0, (f.version_history?.length ?? 1) - 1);
  return a + 1 + upgrades + f.features.length + f.integrations.length;
}, 0);
const totalPlanned = plannedHeartbeats + plannedLifecycle;

console.log('================================================================');
console.log(' SEEDER — wipe + populate D1 local with synthetic events');
console.log('================================================================');
console.log(`  endpoint:    ${ENDPOINT}`);
console.log(`  fixtures:    ${FIXTURES.length}`);
console.log(`  days back:   ${DAYS_BACK}`);
console.log(`  concurrency: ${CONCURRENCY}`);
console.log(`  heartbeats:  ${plannedHeartbeats}`);
console.log(`  lifecycle:   ${plannedLifecycle}`);
console.log(`  total:       ${totalPlanned} events`);
console.log('');

// -------------------------------------------
// 1. wipe
// -------------------------------------------
console.log('[1/4] wiping existing events...');
runWrangler([
  'd1', 'execute', 'etus-telemetry', '--local',
  '--command', 'DELETE FROM events; DELETE FROM rollup_daily; DELETE FROM instances',
]);

// -------------------------------------------
// 2. build all events, send in concurrent batches
// -------------------------------------------
console.log('[2/4] building events...');
const events: TelemetryEvent[] = [];
for (const [idx, fixture] of FIXTURES.entries()) {
  const instanceId = await idFor(fixture, idx);
  const firstSeenAt = new Date(
    Date.now() - fixture.joined_days_ago * DAY_MS,
  ).toISOString();

  // Heartbeats — offset=0 é hoje, offset=joined_days_ago é o dia da instalação.
  // Versão do product no envelope vem do version_history (se houver) por offset.
  const lifespan = Math.min(DAYS_BACK, fixture.joined_days_ago + 1);
  for (let offset = 0; offset < lifespan; offset++) {
    const ts = Date.now() - offset * DAY_MS;
    const versionThen = versionAt(fixture, offset);
    events.push(buildHeartbeat(fixture, instanceId, firstSeenAt, ts, offset, versionThen));
  }

  // Lifecycle: install no dia da instalação
  const installVersion = fixture.version_history?.[0]?.version ?? fixture.version;
  const installTs = Date.now() - fixture.joined_days_ago * DAY_MS;
  events.push(
    buildLifecycle(fixture, instanceId, firstSeenAt, installTs, installVersion, {
      type: 'install',
      from_version: null,
      to_version: installVersion,
      feature: null,
    }),
  );

  // Lifecycle: upgrade events — uma transição entre versões consecutivas no histórico
  if (fixture.version_history && fixture.version_history.length > 1) {
    for (let i = 1; i < fixture.version_history.length; i++) {
      const prev = fixture.version_history[i - 1]!;
      const curr = fixture.version_history[i]!;
      const ts = Date.now() - curr.from_days_ago * DAY_MS;
      events.push(
        buildLifecycle(fixture, instanceId, firstSeenAt, ts, curr.version, {
          type: 'upgrade',
          from_version: prev.version,
          to_version: curr.version,
          feature: null,
        }),
      );
    }
  }

  // Lifecycle: cada feature/integration "ativada" num dia determinístico
  // após install. enabledMax = vida da instância (em dias). Se for 0/1, força ≥1.
  const enabledMax = Math.max(1, fixture.joined_days_ago);
  for (const feature of fixture.features) {
    const offset = deterministicHash(`${idx}-feature-${feature}`) % enabledMax;
    const ts = Date.now() - offset * DAY_MS;
    events.push(
      buildLifecycle(fixture, instanceId, firstSeenAt, ts, versionAt(fixture, offset), {
        type: 'feature_enabled',
        from_version: null,
        to_version: null,
        feature,
      }),
    );
  }
  for (const integration of fixture.integrations) {
    const offset =
      deterministicHash(`${idx}-integration-${integration}`) % enabledMax;
    const ts = Date.now() - offset * DAY_MS;
    events.push(
      buildLifecycle(fixture, instanceId, firstSeenAt, ts, versionAt(fixture, offset), {
        type: 'feature_enabled',
        from_version: null,
        to_version: null,
        feature: integration,
      }),
    );
  }
}
console.log(`  ${events.length} events queued for send`);

console.log('[2/4] sending in concurrent batches...');
let sent = 0;
let failed = 0;
const t0 = Date.now();
for (let i = 0; i < events.length; i += CONCURRENCY) {
  const chunk = events.slice(i, i + CONCURRENCY);
  const results = await Promise.all(chunk.map(postEvent));
  sent += results.filter(Boolean).length;
  failed += results.filter((r) => !r).length;
  const pct = Math.floor((100 * (i + chunk.length)) / events.length);
  process.stdout.write(`  ${pct}% · sent=${sent} failed=${failed}\r`);
}
const t1 = Date.now();
console.log(`\n  done in ${((t1 - t0) / 1000).toFixed(1)}s`);

// -------------------------------------------
// 3. wait for queue to drain
// -------------------------------------------
const drainSec = Math.max(8, Math.ceil(events.length / 200)); // ~200 events/s drain rate
console.log(`[3/4] waiting ${drainSec}s for queue to drain...`);
await sleep(drainSec * 1000);

// -------------------------------------------
// 4. align received_at to emitted_at
// -------------------------------------------
console.log('[4/4] aligning received_at = emitted_at...');
runWrangler([
  'd1', 'execute', 'etus-telemetry', '--local',
  '--command', 'UPDATE events SET received_at = emitted_at',
]);

console.log('');
console.log('✅ done. abra o dashboard:');
console.log('   pnpm --filter @etus/telemetry-dashboard dev');
console.log('');

// =================================================================

async function idFor(fixture: Fixture, idx: number): Promise<string> {
  const seed = `seeder-seed-${idx}-${fixture.product}-${fixture.version}-${fixture.os}-${fixture.arch}-${fixture.deployment}`;
  const uuid = `seeder-uuid-${idx}-${fixture.product}`;
  return buildInstanceId(seed, uuid, fixture.product);
}

function buildHeartbeat(
  fixture: Fixture,
  instanceId: string,
  firstSeenAt: string,
  ts: number,
  offset: number,
  version: string,
): HeartbeatEvent {
  // Crescimento linear leve do "novo" → "atual".
  // lifeProgress=1 quando a instância acabou de nascer (offset = joined_days_ago)
  // lifeProgress=0 hoje (offset = 0) — escala chega ao máximo
  const life = fixture.joined_days_ago + 1;
  const lifeProgress = 1 - offset / life; // 0..1, cresce com o tempo
  const scale = 0.6 + 0.4 * lifeProgress;

  // usage dinâmico (ADR-0004): aplica crescimento às métricas do fixture.
  // `uptime_days` é especial — decai conforme volta no tempo.
  const usage: Record<string, number> = {};
  for (const [key, base] of Object.entries(fixture.metrics)) {
    usage[key] =
      key === 'uptime_days'
        ? Math.max(0, base - offset)
        : Math.max(0, Math.round(base * scale));
  }

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    event: 'instance.heartbeat',
    event_id: randomUUID(),
    timestamp: new Date(ts).toISOString(),
    product: { name: fixture.product, version },
    instance: { id: instanceId, first_seen_at: firstSeenAt },
    environment: {
      os: fixture.os,
      arch: fixture.arch,
      runtime: fixture.runtime,
      runtime_version: fixture.runtime_version,
      deployment: fixture.deployment,
      is_containerized: fixture.is_containerized,
    },
    database: {
      engine: fixture.db_engine,
      version_major: fixture.db_major,
    },
    usage,
    features: {
      enabled: fixture.features,
      integrations: fixture.integrations,
    },
  };
}

function buildLifecycle(
  fixture: Fixture,
  instanceId: string,
  firstSeenAt: string,
  ts: number,
  version: string,
  lifecycle: LifecycleEvent['lifecycle'],
): LifecycleEvent {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    event: 'instance.lifecycle',
    event_id: randomUUID(),
    timestamp: new Date(ts).toISOString(),
    product: { name: fixture.product, version },
    instance: { id: instanceId, first_seen_at: firstSeenAt },
    lifecycle,
  };
}

/**
 * Versão do produto na instância no offset `offset` (dias atrás).
 * Sem version_history → sempre fixture.version.
 * Com history → entrada com from_days_ago >= offset cujo valor é o menor.
 */
function versionAt(fixture: Fixture, offset: number): string {
  const h = fixture.version_history;
  if (!h || h.length === 0) return fixture.version;
  let best = h[0]!;
  for (const entry of h) {
    if (entry.from_days_ago >= offset && entry.from_days_ago < best.from_days_ago) {
      best = entry;
    }
  }
  // Se nenhum entry tem from_days_ago >= offset, retorna o mais antigo
  // (caso só possível se offset > maior from_days_ago, ou seja, antes do install)
  const anyEligible = h.some((e) => e.from_days_ago >= offset);
  if (!anyEligible) {
    return h.reduce((a, b) => (a.from_days_ago > b.from_days_ago ? a : b)).version;
  }
  return best.version;
}

// Hash determinístico (FNV-ish) para escolher dia do feature_enabled sem
// PRNG real — re-rodadas do seeder produzem os mesmos timestamps.
function deterministicHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

async function postEvent(event: TelemetryEvent): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`\n  ! ${res.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('\n  ! fetch failed:', err);
    return false;
  }
}

function runWrangler(args: string[]): void {
  execFileSync(
    'pnpm',
    [
      '--filter', '@etus/telemetry-worker', 'exec', 'wrangler',
      ...args,
      '--persist-to', '../../.wrangler/state',
    ],
    { stdio: ['inherit', 'pipe', 'pipe'], cwd: ROOT },
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
