import type { TelemetryEvent } from '@etus/telemetry-schema';
import type { Env, QueueMessage } from './env.js';

const ENVELOPE_KEYS = new Set([
  'event_id',
  'schema_version',
  'event',
  'timestamp',
  'product',
  'instance',
]);

interface Row {
  event_id: string;
  received_at: number;
  emitted_at: number;
  schema_version: string;
  event_type: string;
  product_name: string;
  product_version: string;
  instance_id: string;
  payload: string;
}

function buildRow(msg: QueueMessage): Row {
  const e = msg.event;
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (!ENVELOPE_KEYS.has(k)) payload[k] = v;
  }
  return {
    event_id: e.event_id,
    received_at: msg.received_at,
    emitted_at: Date.parse(e.timestamp),
    schema_version: e.schema_version,
    event_type: e.event,
    product_name: e.product.name,
    product_version: e.product.version,
    instance_id: e.instance.id,
    payload: JSON.stringify(payload),
  };
}

export async function persistBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  if (batch.messages.length === 0) return;

  const eventStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO events
       (event_id, received_at, emitted_at, schema_version,
        event_type, product_name, product_version, instance_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // UPSERT na tabela de estado por instância. Atualiza last_seen_at (com MAX),
  // e se a instância estava `inactive`, reativa — também stampando o
  // status_changed_at do momento da reativação.
  //
  // `operator_install_at` (relógio do operador, do envelope) usa COALESCE no
  // CONFLICT: nunca sobrescreve um valor já gravado, mas backfilla quando o
  // valor é NULL (linhas vindas da migration 0002 antes de receberem qualquer
  // heartbeat com a coluna).
  const instanceStmt = env.DB.prepare(
    `INSERT INTO instances
       (instance_id, product_name, first_seen_at, last_seen_at,
        status, status_changed_at, operator_install_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(instance_id) DO UPDATE SET
       last_seen_at = MAX(last_seen_at, excluded.last_seen_at),
       status = CASE WHEN status = 'inactive' THEN 'active' ELSE status END,
       status_changed_at = CASE
         WHEN status = 'inactive' THEN excluded.status_changed_at
         ELSE status_changed_at
       END,
       operator_install_at = COALESCE(operator_install_at, excluded.operator_install_at)`,
  );

  const eventStmts = batch.messages.map((msg) => {
    const r = buildRow(msg.body);
    return eventStmt.bind(
      r.event_id,
      r.received_at,
      r.emitted_at,
      r.schema_version,
      r.event_type,
      r.product_name,
      r.product_version,
      r.instance_id,
      r.payload,
    );
  });

  const instanceStmts = batch.messages.map((msg) => {
    const e = msg.body.event;
    const ts = msg.body.received_at;
    // Date.parse retorna NaN para entradas inválidas — guarda contra envelopes
    // mal-formados (zod já rejeitou, mas defesa em profundidade).
    const operatorInstallAt = Date.parse(e.instance.first_seen_at);
    return instanceStmt.bind(
      e.instance.id,
      e.product.name,
      ts, // first_seen_at — só usado se nova linha; ON CONFLICT preserva original
      ts,
      ts,
      Number.isFinite(operatorInstallAt) ? operatorInstallAt : null,
    );
  });

  // Registro de produtos (ADR-0005): garante uma linha 'pending' por produto
  // desconhecido. INSERT OR IGNORE preserva produtos já aprovados/etc. Uma
  // linha por produto distinto no batch, com o menor received_at como first_seen.
  const productFirstSeen = new Map<string, number>();
  for (const msg of batch.messages) {
    const slug = msg.body.event.product.name;
    const ts = msg.body.received_at;
    const cur = productFirstSeen.get(slug);
    if (cur === undefined || ts < cur) productFirstSeen.set(slug, ts);
  }
  const productStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO products
       (slug, status, first_seen_at, status_changed_at, status_changed_by)
     VALUES (?, 'pending', ?, ?, 'auto')`,
  );
  const productStmts = [...productFirstSeen].map(([slug, ts]) =>
    productStmt.bind(slug, ts, ts),
  );

  try {
    // Mesma chamada batch — D1 executa em ordem, no mesmo connection.
    await env.DB.batch([...productStmts, ...eventStmts, ...instanceStmts]);
    batch.ackAll();
  } catch (err) {
    // Falha de DB → retentar batch inteiro. Após max_retries vai pra DLQ.
    console.error('persist failed', err);
    batch.retryAll();
  }
}

// Helper exportado para testes:
export const __test__ = { buildRow };
export type { TelemetryEvent };
