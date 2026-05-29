-- Registro de produtos (ADR-0005). Governa quais produtos são publicados.
-- Política: aceitar sempre, publicar só se 'approved'. A linha nasce em
-- 'pending' no primeiro evento (persistor faz INSERT OR IGNORE).
--
--   status: 'pending' | 'approved' | 'disabled' | 'rejected'
--     pending  → aceita+persiste, NÃO publica, aparece na fila de revisão
--     approved → aceita+persiste, PUBLICA (R2/stats)
--     disabled → aceita+persiste, NÃO publica (R2 purgado), mantém histórico
--     rejected → ingestor descarta (202 sem enfileirar); tombstone anti-reabertura

CREATE TABLE products (
  slug              TEXT PRIMARY KEY,                 -- = product_name do evento
  display_name      TEXT,                             -- rótulo humano; default = slug no app
  status            TEXT NOT NULL DEFAULT 'pending',
  owner             TEXT,                             -- responsável (preenchido na aprovação)
  notes             TEXT,                             -- contexto da decisão
  first_seen_at     INTEGER NOT NULL,                 -- epoch ms, primeiro evento
  status_changed_at INTEGER NOT NULL,
  status_changed_by TEXT                              -- identidade (Cloudflare Access) que mudou
);

CREATE INDEX products_status ON products(status);

-- Backfill: todo produto que já mandou evento é grandfathered como 'approved'
-- (já estava sendo publicado no MVP — não quebrar nada).
INSERT OR IGNORE INTO products (
  slug, status, first_seen_at, status_changed_at, status_changed_by
)
SELECT
  product_name,
  'approved',
  MIN(received_at),
  MIN(received_at),
  'migration:0004'
FROM events
GROUP BY product_name;
