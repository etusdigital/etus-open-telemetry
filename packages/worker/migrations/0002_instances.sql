-- Estado persistente por instância. Difere do "active in window" temporal
-- usado pelos charts: aqui há transição de estado active ↔ inactive baseada
-- no último evento recebido vs INACTIVITY_THRESHOLD_DAYS.

CREATE TABLE instances (
  instance_id       TEXT PRIMARY KEY,
  product_name      TEXT NOT NULL,
  first_seen_at     INTEGER NOT NULL,  -- epoch ms, primeiro received_at
  last_seen_at      INTEGER NOT NULL,  -- epoch ms, max received_at
  status            TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'inactive'
  status_changed_at INTEGER NOT NULL
);

CREATE INDEX instances_product_status ON instances(product_name, status);
CREATE INDEX instances_last_seen      ON instances(last_seen_at);

-- Backfill a partir do que já está no events.
-- INSERT OR IGNORE garante idempotência caso a migration rode em base
-- que já tenha algumas linhas (não é o caso hoje, mas custa zero).
INSERT OR IGNORE INTO instances (
  instance_id, product_name, first_seen_at, last_seen_at, status, status_changed_at
)
SELECT
  instance_id,
  MAX(product_name)  AS product_name,
  MIN(received_at)   AS first_seen_at,
  MAX(received_at)   AS last_seen_at,
  'active'           AS status,
  MAX(received_at)   AS status_changed_at
FROM events
GROUP BY instance_id;
