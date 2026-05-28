-- D1 schema inicial para etus-open-telemetry.
-- Espelha docs/02-event-schema.md e docs/03-architecture.md.

-- ============================================================
-- events: tabela append-only de eventos crus
-- ============================================================
CREATE TABLE events (
  event_id        TEXT PRIMARY KEY,
  received_at     INTEGER NOT NULL,   -- epoch ms, carimbado pelo Worker no recebimento
  emitted_at      INTEGER NOT NULL,   -- epoch ms, vindo do cliente
  schema_version  TEXT NOT NULL,
  event_type      TEXT NOT NULL,      -- 'instance.heartbeat' | 'instance.lifecycle'
  product_name    TEXT NOT NULL,
  product_version TEXT NOT NULL,
  instance_id     TEXT NOT NULL,      -- hashed na origem, opaco para nós
  payload         TEXT NOT NULL       -- JSON (corpo do evento, sem o envelope duplicado)
);

CREATE INDEX events_product_time ON events(product_name, received_at);
CREATE INDEX events_type_time    ON events(event_type, received_at);
CREATE INDEX events_instance     ON events(instance_id);

-- ============================================================
-- rollup_daily: agregados diários materializados pelo cron
-- ============================================================
CREATE TABLE rollup_daily (
  day             TEXT NOT NULL,     -- 'YYYY-MM-DD' UTC
  product_name    TEXT NOT NULL,
  product_version TEXT,              -- NULL = todas as versões agregadas
  os              TEXT,
  deployment      TEXT,
  feature         TEXT,
  metric          TEXT NOT NULL,     -- 'active_instances' | 'feature_enabled' | ...
  value           INTEGER NOT NULL,
  PRIMARY KEY (day, product_name, product_version, os, deployment, feature, metric)
);

CREATE INDEX rollup_daily_product ON rollup_daily(product_name, day);
