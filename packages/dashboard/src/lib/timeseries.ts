// Queries de séries temporais por produto. Granularidade do bucket
// (`day`/`week`/`month`) é derivada da janela — ver `windowBucket()` em db.ts.

import {
  bucketExpr,
  db,
  DEFAULT_WINDOW,
  windowBucket,
  windowStartMs,
  type WindowOption,
} from './db';

const HEARTBEAT = 'instance.heartbeat';

export interface DayValue {
  day: string; // 'YYYY-MM-DD' UTC — início do bucket (day/week/month)
  value: number;
}

export interface DaySeriesValue {
  day: string;
  series: string;
  value: number;
}

// ============================================================
// Scalars — uma série por chart
// ============================================================

export async function activeInstancesPerDay(
  product: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<DayValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('received_at', windowBucket(window));
  const r = await db()
    .prepare(
      `SELECT ${day} AS day,
              COUNT(DISTINCT instance_id) AS value
       FROM events
       WHERE event_type = ? AND product_name = ? AND received_at >= ?
       GROUP BY day
       ORDER BY day ASC`,
    )
    .bind(HEARTBEAT, product, start)
    .all<DayValue>();
  return r.results;
}

/**
 * Pega o último heartbeat de cada instância em cada bucket, depois soma.
 * Evita dupla contagem se uma instância enviar múltiplos heartbeats no
 * mesmo bucket.
 */
async function sumLatestPerInstanceBucket(
  product: string,
  jsonPath: string,
  window: WindowOption,
): Promise<DayValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('received_at', windowBucket(window));
  const r = await db()
    .prepare(
      `WITH latest_per_bucket AS (
         SELECT instance_id,
                ${day} AS day,
                MAX(received_at) AS last_at
         FROM events
         WHERE event_type = ? AND product_name = ? AND received_at >= ?
         GROUP BY instance_id, day
       )
       SELECT l.day AS day,
              SUM(CAST(json_extract(e.payload, ?) AS INTEGER)) AS value
       FROM latest_per_bucket l
       JOIN events e
         ON e.instance_id = l.instance_id AND e.received_at = l.last_at
       WHERE json_extract(e.payload, ?) IS NOT NULL
       GROUP BY l.day
       ORDER BY l.day ASC`,
    )
    .bind(HEARTBEAT, product, start, jsonPath, jsonPath)
    .all<DayValue>();
  return r.results;
}

// Métricas de usage são dinâmicas por produto (ADR-0004). Descobrimos as
// chaves presentes e somamos cada uma genericamente.

const METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/;

/** Chaves de `usage.*` presentes nos heartbeats do produto na janela. */
export async function discoverUsageMetrics(
  product: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<string[]> {
  const start = windowStartMs(window);
  const r = await db()
    .prepare(
      `SELECT DISTINCT je.key AS metric
       FROM events, json_each(json_extract(events.payload, '$.usage')) je
       WHERE events.event_type = ?
         AND events.product_name = ?
         AND events.received_at >= ?
         AND json_extract(events.payload, '$.usage') IS NOT NULL
       ORDER BY metric ASC`,
    )
    .bind(HEARTBEAT, product, start)
    .all<{ metric: string }>();
  return r.results.map((x) => x.metric).filter((k) => METRIC_KEY.test(k));
}

/** Soma de uma métrica dinâmica por bucket (último heartbeat por instância). */
export function sumMetricPerDay(
  product: string,
  metric: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<DayValue[]> {
  // Guard: só interpola chaves validadas (defesa contra injeção no json path).
  if (!METRIC_KEY.test(metric)) return Promise.resolve([]);
  return sumLatestPerInstanceBucket(product, `$.usage.${metric}`, window);
}

// ============================================================
// Categorical — uma série por valor da dimensão
// ============================================================

async function activeInstancesPerBucketByColumn(
  product: string,
  columnOrPath: string,
  window: WindowOption,
): Promise<DaySeriesValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('received_at', windowBucket(window));
  const seriesExpr =
    columnOrPath === 'product_version'
      ? 'product_version'
      : `json_extract(payload, '${columnOrPath}')`;
  const r = await db()
    .prepare(
      `SELECT ${day} AS day,
              ${seriesExpr} AS series,
              COUNT(DISTINCT instance_id) AS value
       FROM events
       WHERE event_type = ? AND product_name = ? AND received_at >= ?
         AND ${seriesExpr} IS NOT NULL
       GROUP BY day, series
       ORDER BY day ASC, series ASC`,
    )
    .bind(HEARTBEAT, product, start)
    .all<DaySeriesValue>();
  return r.results;
}

export const activeByVersionPerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketByColumn(p, 'product_version', w);

export const activeByOsPerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketByColumn(p, '$.environment.os', w);

export const activeByDeploymentPerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketByColumn(p, '$.environment.deployment', w);

export const activeByDbEnginePerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketByColumn(p, '$.database.engine', w);

// ============================================================
// Set membership — uma série por elemento do array
// ============================================================

async function activeInstancesPerBucketBySetMember(
  product: string,
  jsonArrayPath: string,
  window: WindowOption,
): Promise<DaySeriesValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('events.received_at', windowBucket(window));
  const r = await db()
    .prepare(
      `SELECT ${day} AS day,
              je.value AS series,
              COUNT(DISTINCT events.instance_id) AS value
       FROM events,
            json_each(json_extract(events.payload, ?)) je
       WHERE events.event_type = ?
         AND events.product_name = ?
         AND events.received_at >= ?
       GROUP BY day, series
       ORDER BY day ASC, series ASC`,
    )
    .bind(jsonArrayPath, HEARTBEAT, product, start)
    .all<DaySeriesValue>();
  return r.results;
}

export const featuresAdoptionPerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketBySetMember(p, '$.features.enabled', w);

export const integrationsAdoptionPerDay = (
  p: string,
  w: WindowOption = DEFAULT_WINDOW,
) => activeInstancesPerBucketBySetMember(p, '$.features.integrations', w);

// ============================================================
// Lifecycle — eventos de transição (install/upgrade/feature_*)
// ============================================================

const LIFECYCLE = 'instance.lifecycle';

/** Count de installs por bucket. */
export async function installsPerDay(
  product: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<DayValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('received_at', windowBucket(window));
  const r = await db()
    .prepare(
      `SELECT ${day} AS day, COUNT(*) AS value
       FROM events
       WHERE event_type = ? AND product_name = ? AND received_at >= ?
         AND json_extract(payload, '$.lifecycle.type') = 'install'
       GROUP BY day
       ORDER BY day ASC`,
    )
    .bind(LIFECYCLE, product, start)
    .all<DayValue>();
  return r.results;
}

/** Count de feature_enabled por (bucket, feature). */
export async function featuresEnabledPerDay(
  product: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<DaySeriesValue[]> {
  const start = windowStartMs(window);
  const day = bucketExpr('received_at', windowBucket(window));
  const r = await db()
    .prepare(
      `SELECT ${day} AS day,
              json_extract(payload, '$.lifecycle.feature') AS series,
              COUNT(*) AS value
       FROM events
       WHERE event_type = ? AND product_name = ? AND received_at >= ?
         AND json_extract(payload, '$.lifecycle.type') = 'feature_enabled'
       GROUP BY day, series
       ORDER BY day ASC, series ASC`,
    )
    .bind(LIFECYCLE, product, start)
    .all<DaySeriesValue>();
  return r.results;
}

export interface LifecycleRow {
  event_id: string;
  emitted_at: number;
  product_version: string;
  lifecycle_type: string;
  from_version: string | null;
  to_version: string | null;
  feature: string | null;
}

/** Últimos N eventos lifecycle para a timeline (descendente por data). */
export async function recentLifecycle(
  product: string,
  window: WindowOption = DEFAULT_WINDOW,
  limit = 50,
): Promise<LifecycleRow[]> {
  const start = windowStartMs(window);
  const r = await db()
    .prepare(
      `SELECT event_id,
              emitted_at,
              product_version,
              json_extract(payload, '$.lifecycle.type') AS lifecycle_type,
              json_extract(payload, '$.lifecycle.from_version') AS from_version,
              json_extract(payload, '$.lifecycle.to_version') AS to_version,
              json_extract(payload, '$.lifecycle.feature') AS feature
       FROM events
       WHERE event_type = ? AND product_name = ? AND received_at >= ?
       ORDER BY emitted_at DESC
       LIMIT ?`,
    )
    .bind(LIFECYCLE, product, start, limit)
    .all<LifecycleRow>();
  return r.results;
}

// ============================================================
// Helpers de shape
// ============================================================

/**
 * Pivot de `{day, series, value}[]` para `{day, [series]: value}[]`.
 * Preenche dias ausentes com 0 nas séries existentes para o chart desenhar
 * contínuo.
 */
export function pivotWide(
  rows: DaySeriesValue[],
): { data: Array<Record<string, string | number>>; seriesNames: string[] } {
  const seriesSet = new Set<string>();
  const byDay = new Map<string, Record<string, number>>();

  for (const r of rows) {
    seriesSet.add(r.series);
    if (!byDay.has(r.day)) byDay.set(r.day, {});
    byDay.get(r.day)![r.series] = r.value;
  }

  const seriesNames = Array.from(seriesSet).sort();
  const data: Array<Record<string, string | number>> = [];

  const days = Array.from(byDay.keys()).sort();
  for (const day of days) {
    const point: Record<string, string | number> = { day };
    const rowMap = byDay.get(day)!;
    for (const s of seriesNames) point[s] = rowMap[s] ?? 0;
    data.push(point);
  }
  return { data, seriesNames };
}
