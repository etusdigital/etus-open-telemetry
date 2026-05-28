// Queries D1 do dashboard. Tudo agrega — nunca expõe linhas brutas.

import { db, DEFAULT_WINDOW, windowStartMs, type WindowOption } from './db';

export interface ProductCount {
  product_name: string;
  instances: number;
}

export interface VersionCount {
  product_name: string;
  product_version: string;
  instances: number;
}

export interface DimensionCount {
  product_name: string;
  value: string;
  instances: number;
}

const HEARTBEAT = 'instance.heartbeat';

export async function totalActiveInstances(
  window: WindowOption = DEFAULT_WINDOW,
): Promise<number> {
  const start = windowStartMs(window);
  const row = await db()
    .prepare(
      `SELECT COUNT(DISTINCT instance_id) AS n
       FROM events
       WHERE event_type = ? AND received_at >= ?`,
    )
    .bind(HEARTBEAT, start)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function activeByProduct(
  window: WindowOption = DEFAULT_WINDOW,
): Promise<ProductCount[]> {
  const start = windowStartMs(window);
  const result = await db()
    .prepare(
      `SELECT product_name, COUNT(DISTINCT instance_id) AS instances
       FROM events
       WHERE event_type = ? AND received_at >= ?
       GROUP BY product_name
       ORDER BY instances DESC`,
    )
    .bind(HEARTBEAT, start)
    .all<ProductCount>();
  return result.results;
}

export async function activeByVersion(
  window: WindowOption = DEFAULT_WINDOW,
): Promise<VersionCount[]> {
  const start = windowStartMs(window);
  const result = await db()
    .prepare(
      `SELECT product_name, product_version, COUNT(DISTINCT instance_id) AS instances
       FROM events
       WHERE event_type = ? AND received_at >= ?
       GROUP BY product_name, product_version
       ORDER BY product_name ASC, instances DESC`,
    )
    .bind(HEARTBEAT, start)
    .all<VersionCount>();
  return result.results;
}

export async function activeByDimension(
  jsonPath: string,
  window: WindowOption = DEFAULT_WINDOW,
): Promise<DimensionCount[]> {
  const start = windowStartMs(window);
  const result = await db()
    .prepare(
      `SELECT product_name,
              json_extract(payload, ?) AS value,
              COUNT(DISTINCT instance_id) AS instances
       FROM events
       WHERE event_type = ?
         AND received_at >= ?
         AND json_extract(payload, ?) IS NOT NULL
       GROUP BY product_name, value
       ORDER BY instances DESC`,
    )
    .bind(jsonPath, HEARTBEAT, start, jsonPath)
    .all<DimensionCount>();
  return result.results;
}

// ============================================================
// Estado persistente das instâncias (tabela `instances`)
// — independente de janela; reflete o resultado do sweep diário.
// ============================================================

export interface ProductStatusBreakdown {
  product_name: string;
  active: number;
  inactive: number;
}

export async function instanceStatusByProduct(): Promise<ProductStatusBreakdown[]> {
  const result = await db()
    .prepare(
      `SELECT product_name, status, COUNT(*) AS n
       FROM instances
       GROUP BY product_name, status`,
    )
    .all<{ product_name: string; status: string; n: number }>();

  const map = new Map<string, ProductStatusBreakdown>();
  for (const r of result.results) {
    let entry = map.get(r.product_name);
    if (!entry) {
      entry = { product_name: r.product_name, active: 0, inactive: 0 };
      map.set(r.product_name, entry);
    }
    if (r.status === 'active') entry.active = r.n;
    else if (r.status === 'inactive') entry.inactive = r.n;
  }
  return Array.from(map.values()).sort(
    (a, b) => b.active + b.inactive - (a.active + a.inactive),
  );
}

export interface StatusTotals {
  active: number;
  inactive: number;
}

export async function totalInstanceStatus(): Promise<StatusTotals> {
  const result = await db()
    .prepare(`SELECT status, COUNT(*) AS n FROM instances GROUP BY status`)
    .all<{ status: string; n: number }>();
  const out: StatusTotals = { active: 0, inactive: 0 };
  for (const r of result.results) {
    if (r.status === 'active') out.active = r.n;
    else if (r.status === 'inactive') out.inactive = r.n;
  }
  return out;
}

export async function statusForProduct(product: string): Promise<StatusTotals> {
  const result = await db()
    .prepare(
      `SELECT status, COUNT(*) AS n FROM instances WHERE product_name = ? GROUP BY status`,
    )
    .bind(product)
    .all<{ status: string; n: number }>();
  const out: StatusTotals = { active: 0, inactive: 0 };
  for (const r of result.results) {
    if (r.status === 'active') out.active = r.n;
    else if (r.status === 'inactive') out.inactive = r.n;
  }
  return out;
}

export interface ProductCohort {
  /** Instância mais antiga segundo o relógio do operador (envelope). */
  oldest_install_at: number | null;
  /** Instância mais nova segundo o relógio do operador (envelope). */
  newest_install_at: number | null;
  /** Quantas instâncias têm operator_install_at preenchido. */
  with_operator_install: number;
  total: number;
}

export async function cohortForProduct(product: string): Promise<ProductCohort> {
  const row = await db()
    .prepare(
      `SELECT MIN(operator_install_at) AS oldest,
              MAX(operator_install_at) AS newest,
              SUM(CASE WHEN operator_install_at IS NOT NULL THEN 1 ELSE 0 END) AS with_op,
              COUNT(*) AS total
       FROM instances
       WHERE product_name = ?`,
    )
    .bind(product)
    .first<{
      oldest: number | null;
      newest: number | null;
      with_op: number;
      total: number;
    }>();
  return {
    oldest_install_at: row?.oldest ?? null,
    newest_install_at: row?.newest ?? null,
    with_operator_install: row?.with_op ?? 0,
    total: row?.total ?? 0,
  };
}
