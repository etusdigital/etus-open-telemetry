-- Trilha mínima de auditoria das ações administrativas (ADR-0005):
-- transições de status e purges. Append-only; nunca atualizada.

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,   -- epoch ms
  actor     TEXT NOT NULL,      -- e-mail do Cloudflare Access (ou 'local' em dev)
  action    TEXT NOT NULL,      -- 'approve' | 'reject' | 'disable' | 'enable' | 'purge_product' | 'purge_instance'
  target    TEXT NOT NULL,      -- slug do produto ou instance_id
  detail    TEXT                -- JSON opcional (ex: contagem de linhas removidas)
);

CREATE INDEX audit_log_at     ON audit_log(at);
CREATE INDEX audit_log_target ON audit_log(target);
