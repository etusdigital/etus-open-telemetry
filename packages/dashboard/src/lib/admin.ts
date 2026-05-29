// Operações administrativas do registro de produtos (ADR-0005).
// Rodam em Route Handlers do dashboard — que em produção ficam atrás do
// Cloudflare Access. O ator vem do header que o Access injeta.

import { getRequestContext } from '@cloudflare/next-on-pages';

function env() {
  return getRequestContext().env as {
    DB: D1Database;
    R2_PUBLIC: R2Bucket;
  };
}

const r2Key = (slug: string) => `stats/v1/${slug}.json`;

/** Identidade do operador: e-mail do Cloudflare Access, ou 'local' em dev. */
export function actorFromHeaders(h: Headers): string {
  return h.get('cf-access-authenticated-user-email') ?? 'local';
}

export type ProductAction = 'approve' | 'reject' | 'disable' | 'enable' | 'purge';

const STATUS_FOR: Record<Exclude<ProductAction, 'purge'>, string> = {
  approve: 'approved',
  enable: 'approved',
  reject: 'rejected',
  disable: 'disabled',
};

export interface ProductRow {
  slug: string;
  display_name: string | null;
  status: string;
  owner: string | null;
  notes: string | null;
  first_seen_at: number;
  status_changed_at: number;
  status_changed_by: string | null;
}

export async function listProducts(): Promise<ProductRow[]> {
  const { DB } = env();
  const res = await DB.prepare(
    `SELECT slug, display_name, status, owner, notes,
            first_seen_at, status_changed_at, status_changed_by
     FROM products
     ORDER BY CASE status
                WHEN 'pending'  THEN 0
                WHEN 'approved' THEN 1
                WHEN 'disabled' THEN 2
                ELSE 3
              END,
              first_seen_at DESC`,
  ).all<ProductRow>();
  return res.results;
}

async function audit(
  action: string,
  target: string,
  actor: string,
  detail?: unknown,
): Promise<void> {
  const { DB } = env();
  await DB.prepare(
    `INSERT INTO audit_log (at, actor, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(Date.now(), actor, action, target, detail ? JSON.stringify(detail) : null)
    .run();
}

/** Transição de status (approve/reject/disable/enable). Retorna linhas afetadas. */
export async function transitionProduct(
  slug: string,
  action: Exclude<ProductAction, 'purge'>,
  actor: string,
  opts: { owner?: string; notes?: string } = {},
): Promise<number> {
  const { DB, R2_PUBLIC } = env();
  const status = STATUS_FOR[action];
  const res = await DB.prepare(
    `UPDATE products
     SET status = ?, status_changed_at = ?, status_changed_by = ?,
         owner = COALESCE(?, owner), notes = COALESCE(?, notes)
     WHERE slug = ?`,
  )
    .bind(status, Date.now(), actor, opts.owner ?? null, opts.notes ?? null, slug)
    .run();

  // Qualquer status != approved remove o JSON público na hora (não espera o cron).
  if (status !== 'approved') {
    await R2_PUBLIC.delete(r2Key(slug));
  }
  await audit(action, slug, actor);
  return res.meta?.changes ?? 0;
}

/** Purge destrutivo: events + instances + rollup_daily + R2. Tombstone em 'rejected'. */
export async function purgeProduct(
  slug: string,
  actor: string,
): Promise<{ events: number; instances: number; rollups: number }> {
  const { DB, R2_PUBLIC } = env();
  const e = await DB.prepare('DELETE FROM events WHERE product_name = ?').bind(slug).run();
  const i = await DB.prepare('DELETE FROM instances WHERE product_name = ?').bind(slug).run();
  const r = await DB.prepare('DELETE FROM rollup_daily WHERE product_name = ?').bind(slug).run();
  await R2_PUBLIC.delete(r2Key(slug));
  // Mantém a linha como tombstone 'rejected' — não reabre como pending no
  // próximo evento perdido e nunca volta a publicar.
  await DB.prepare(
    `UPDATE products SET status = 'rejected', status_changed_at = ?, status_changed_by = ? WHERE slug = ?`,
  )
    .bind(Date.now(), actor, slug)
    .run();
  const detail = {
    events: e.meta?.changes ?? 0,
    instances: i.meta?.changes ?? 0,
    rollups: r.meta?.changes ?? 0,
  };
  await audit('purge_product', slug, actor, detail);
  return detail;
}

/** Purge por instância (DSR LGPD/GDPR): events + instances. */
export async function purgeInstance(
  instanceId: string,
  actor: string,
): Promise<{ events: number; instances: number }> {
  const { DB } = env();
  const e = await DB.prepare('DELETE FROM events WHERE instance_id = ?').bind(instanceId).run();
  const i = await DB.prepare('DELETE FROM instances WHERE instance_id = ?').bind(instanceId).run();
  const detail = { events: e.meta?.changes ?? 0, instances: i.meta?.changes ?? 0 };
  await audit('purge_instance', instanceId, actor, detail);
  return detail;
}
