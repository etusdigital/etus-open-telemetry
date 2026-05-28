import type { Env } from './env.js';

// Roda diariamente via Cron Trigger. Quatro tarefas:
//   1. Sweep de inatividade — marca como `inactive` instâncias sem evento recente
//   2. Materializar rollup_daily para o dia anterior
//   3. Publicar JSON público em R2 por produto
//   4. Limpar eventos brutos além da retenção

export async function runAggregator(env: Env): Promise<void> {
  const { day, startMs, endMs } = previousUtcDay();

  await sweepInactiveInstances(env);
  await materializeRollups(env, day, startMs, endMs);
  await publishPublicStats(env, day);
  await cleanupOldEvents(env);
}

async function sweepInactiveInstances(env: Env): Promise<void> {
  const days = Number(env.INACTIVITY_THRESHOLD_DAYS);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 86_400_000;
  await env.DB.prepare(
    `UPDATE instances
     SET status = 'inactive', status_changed_at = ?
     WHERE status = 'active' AND last_seen_at < ?`,
  )
    .bind(Date.now(), cutoff)
    .run();
}

function previousUtcDay(): { day: string; startMs: number; endMs: number } {
  const now = new Date();
  const y = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const day = y.toISOString().slice(0, 10);
  const startMs = y.getTime();
  return { day, startMs, endMs: startMs + 86_400_000 };
}

async function materializeRollups(
  env: Env,
  day: string,
  startMs: number,
  endMs: number,
): Promise<void> {
  // active_instances por (product, version)
  await env.DB.prepare(
    `INSERT OR REPLACE INTO rollup_daily
       (day, product_name, product_version, os, deployment, feature, metric, value)
     SELECT ?, product_name, product_version, NULL, NULL, NULL,
            'active_instances', COUNT(DISTINCT instance_id)
     FROM events
     WHERE event_type = 'instance.heartbeat'
       AND received_at >= ? AND received_at < ?
     GROUP BY product_name, product_version`,
  )
    .bind(day, startMs, endMs)
    .run();

  // active_instances por (product, os) — agregando todas as versões
  await env.DB.prepare(
    `INSERT OR REPLACE INTO rollup_daily
       (day, product_name, product_version, os, deployment, feature, metric, value)
     SELECT ?, product_name, NULL, json_extract(payload, '$.environment.os'),
            NULL, NULL, 'active_instances', COUNT(DISTINCT instance_id)
     FROM events
     WHERE event_type = 'instance.heartbeat'
       AND received_at >= ? AND received_at < ?
       AND json_extract(payload, '$.environment.os') IS NOT NULL
     GROUP BY product_name, json_extract(payload, '$.environment.os')`,
  )
    .bind(day, startMs, endMs)
    .run();

  // active_instances por (product, deployment)
  await env.DB.prepare(
    `INSERT OR REPLACE INTO rollup_daily
       (day, product_name, product_version, os, deployment, feature, metric, value)
     SELECT ?, product_name, NULL, NULL,
            json_extract(payload, '$.environment.deployment'),
            NULL, 'active_instances', COUNT(DISTINCT instance_id)
     FROM events
     WHERE event_type = 'instance.heartbeat'
       AND received_at >= ? AND received_at < ?
       AND json_extract(payload, '$.environment.deployment') IS NOT NULL
     GROUP BY product_name, json_extract(payload, '$.environment.deployment')`,
  )
    .bind(day, startMs, endMs)
    .run();
}

async function publishPublicStats(env: Env, day: string): Promise<void> {
  // Para cada produto com dados no dia, gera um JSON agregado dos últimos 30/90/365 dias
  // e publica em R2 — estilo Homebrew.
  const products = await env.DB.prepare(
    'SELECT DISTINCT product_name FROM rollup_daily WHERE day = ?',
  )
    .bind(day)
    .all<{ product_name: string }>();

  for (const { product_name } of products.results) {
    const stats = await buildProductStats(env, product_name, day);
    await env.R2_PUBLIC.put(
      `stats/v1/${product_name}.json`,
      JSON.stringify(stats, null, 2),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    );
  }
}

async function buildProductStats(
  env: Env,
  product: string,
  day: string,
): Promise<unknown> {
  const ranges: Array<{ key: string; days: number }> = [
    { key: '30d', days: 30 },
    { key: '90d', days: 90 },
    { key: '365d', days: 365 },
  ];

  const out: Record<string, unknown> = {
    product,
    generated_at: new Date().toISOString(),
    day,
    schema: 'public-stats/v1',
  };

  for (const r of ranges) {
    const cutoff = isoDayDelta(day, -r.days);
    const byVersion = await env.DB.prepare(
      `SELECT product_version AS version, MAX(value) AS active_instances
       FROM rollup_daily
       WHERE product_name = ?
         AND day >= ?
         AND product_version IS NOT NULL
         AND os IS NULL AND deployment IS NULL AND feature IS NULL
         AND metric = 'active_instances'
       GROUP BY product_version
       ORDER BY active_instances DESC`,
    )
      .bind(product, cutoff)
      .all();

    out[r.key] = { by_version: byVersion.results };
  }

  return out;
}

function isoDayDelta(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

async function cleanupOldEvents(env: Env): Promise<void> {
  const days = Number(env.EVENT_RETENTION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 86_400_000;
  await env.DB.prepare('DELETE FROM events WHERE received_at < ?')
    .bind(cutoff)
    .run();
}
