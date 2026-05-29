-- Adiciona o relógio do operador (instance.first_seen_at do envelope) à tabela
-- de estado. Já temos `first_seen_at` (relógio do servidor — primeiro
-- received_at), mas o envelope carrega QUANDO O OPT-IN FOI ATIVADO segundo o
-- relógio da própria instância. Útil para responder "há quanto tempo essa
-- instância existe?" sem depender de quando a ETUS começou a receber.
--
-- Nullable: instâncias migradas do banco antigo ficam NULL até o próximo
-- heartbeat preencher via COALESCE no ON CONFLICT.

ALTER TABLE instances ADD COLUMN operator_install_at INTEGER;
