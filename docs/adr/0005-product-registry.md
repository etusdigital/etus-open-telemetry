# ADR-0005 — Registro de produtos: quarentena, aprovação e purge (v2)

- **Status**: Aceito (implementado e testado local em 2026-05-28)
- **Data**: 2026-05-28
- **Contexto v2**: primeira feature de governança pós-MVP
- **Relaciona**: [ADR-0001](0001-fundacao.md) (opt-in/anônimo), [arquitetura](../03-architecture.md), [política de privacidade](../04-privacy-policy.md) (DSR)

## Contexto

No MVP **não existe portão de produto**. O ingestor aceita qualquer evento que passe no schema zod e o aggregator publica `SELECT DISTINCT product_name FROM rollup_daily`. Consequência: **todo `product_name` que mandar um heartbeat válido vira stat público** (`stats/v1/<product>.json` no R2) em até um ciclo do cron.

Isso abre três problemas:

1. **Lixo/typo público**: `etus-fooo` (typo de `etus-foo`) ou um produto de teste aparece publicamente sem ninguém aprovar.
2. **Sem operação de remoção**: apagar dados de um produto recebido por engano é SQL na unha hoje (feito manualmente no self-test).
3. **Sem ownership/auditoria**: ninguém "dono" de um produto, nenhuma trilha de quem aprovou/removeu o quê.

O endpoint de ingestão é aberto (telemetria opt-in anônima não tem API key) — então o gate de governança natural é **server-side, por produto**.

## Decisão

Introduzir um **registro de produtos** com **máquina de estados** e uma **operação de purge** de primeira classe. Política central: **aceitar sempre, publicar só se aprovado** (quarentena, não rejeição-na-borda) — não se perde dado e o público nunca vê lixo.

### 1. Tabela `products` (registro)

```sql
CREATE TABLE products (
  slug            TEXT PRIMARY KEY,          -- = product_name do evento
  display_name    TEXT,                      -- rótulo humano (dashboard); default = slug
  status          TEXT NOT NULL DEFAULT 'pending',  -- ver máquina de estados
  owner           TEXT,                      -- e-mail/responsável (preenchido na aprovação)
  notes           TEXT,                      -- contexto da decisão
  first_seen_at   INTEGER NOT NULL,          -- epoch ms, primeiro evento recebido
  status_changed_at INTEGER NOT NULL,
  status_changed_by TEXT                     -- identidade (do Cloudflare Access) que mudou
);

CREATE INDEX products_status ON products(status);
```

**Padronizar o slug** (sub-decisão necessária): hoje há inconsistência — o schema do ingestor aceita `product.name` como `z.string().min(1).max(64)` (**sem regex**, então `"My Product!"` passa), mas `public.ts` só serve slugs que casam `/^[a-z0-9][a-z0-9._-]{0,63}$/i`. Um produto fora desse regex é ingerido mas tem URL pública quebrada. O registro deve **apertar `product.name` no schema** pra um slug limpo (proposta: `^[a-z][a-z0-9-]{1,63}$` — mais restrito que o do `public.ts`, sem `.`/`_` pra evitar ambiguidade em paths/keys do R2) e o `slug` do registro herda essa regra. Não há cadastro manual prévio: a linha nasce sozinha (`pending`) no primeiro evento.

### 2. Máquina de estados

```
            (1º evento de slug desconhecido)
                      │
                      ▼
                  ┌─────────┐   approve    ┌──────────┐
                  │ pending │ ───────────▶ │ approved │ ◀─┐
                  └─────────┘              └──────────┘   │ enable
                      │  │                      │ disable  │
              reject  │  │                      ▼          │
                      ▼  │                 ┌──────────┐    │
                  ┌─────────┐              │ disabled │ ───┘
                  │ rejected│              └──────────┘
                  └─────────┘

  purge = ação destrutiva ortogonal (não é status) → ver §4
```

| Status | Aceita evento? | Persiste? | Publica (R2/stats)? | No dashboard? |
|---|---|---|---|---|
| `pending` | sim | sim | **não** | sim (fila de revisão) |
| `approved` | sim | sim | **sim** | sim |
| `disabled` | sim | sim | **não** (R2 purgado) | sim (histórico) |
| `rejected` | **202 e descarta** | não | não | sim (flag) |

Transições (todas manuais via dashboard, exceto a criação automática):

- `∅ → pending`: automática, no persistor, ao ver um slug sem linha.
- `pending → approved` / `pending → rejected`: admin.
- `approved → disabled`: aposenta produto (para de publicar, mantém histórico).
- `disabled → approved`: reativa.
- `rejected → pending`: reconsiderar.

**`rejected` responde `202` e descarta** (não enfileira): para um spammer/typo recorrente, devolver `202` é mais discreto que `403` (não sinaliza que está bloqueado) e estanca o acúmulo. É um "tombstone" — impede que o slug volte a virar `pending` sozinho no próximo evento perdido.

### 3. Mudanças no pipeline

- **Persistor** (`persistor.ts`): no batch, `INSERT OR IGNORE INTO products (slug, status='pending', first_seen_at=...)` antes de gravar eventos. Custo: 1 upsert por batch.
- **Ingestor** (`ingestor.ts`): consulta o status do slug (cache curto em memória/KV). Se `rejected` → `202` sem enfileirar. Demais → enfileira normal.
- **Aggregator** (`aggregator.ts`): trocar `SELECT DISTINCT product_name FROM rollup_daily` por **só `status='approved'`**. Ao detectar produto que saiu de `approved` (virou `disabled`/`rejected`/purgado), **deletar o objeto R2** `stats/v1/<slug>.json` (o índice público em `public.ts` é derivado do `list()` do R2, então some sozinho).

### 4. Delete / purge (operação destrutiva)

Purge é **ação explícita**, separada da máquina de estados (evita apagar tudo num clique errado de "reject"). Remove o produto dos **4 lugares**:

```
1. DELETE FROM events       WHERE product_name = ?
2. DELETE FROM instances    WHERE product_name = ?
3. DELETE FROM rollup_daily WHERE product_name = ?
4. R2.delete('stats/v1/<slug>.json')
```

Variantes:
- **Purge por produto**: o acima. Mantém a linha em `products` como tombstone (`status='rejected'` ou um `purged_at`) pra não reabrir como `pending`.
- **Purge por instância** (DSR LGPD/GDPR): mesmo, mas `WHERE instance_id = ?` em `events`/`instances`. Atende a promessa da [política de privacidade](../04-privacy-policy.md) de delete por `instance.id` — hoje é manual por e-mail; vira operação no dashboard.

Toda purge grava uma linha em **`audit_log`** (`action, target, actor, at`) — trilha mínima de quem apagou o quê.

### 5. Onde vivem as mutações (auth)

As ações de aprovar/rejeitar/disable/purge rodam como **Pages Functions do dashboard**, que já está **atrás do Cloudflare Access** (ADR-0005 não inventa auth nova). O dashboard já tem binding `DB` (D1 compartilhado com o worker) — basta **adicionar binding `R2_PUBLIC`** ao `dashboard/wrangler.toml` pra purgar o JSON. A identidade do ator vem do header `Cf-Access-Authenticated-User-Email` que o Access injeta.

- Leitura do status (ingestor/aggregator) e escrita do `pending` (persistor) ficam no **worker** (mesmo D1).
- Mutações humanas ficam no **dashboard** (Access).

## Consequências

**Migrations:**
- [x] `0004_products.sql` — tabela `products` + índice; **backfill**: `INSERT ... SELECT DISTINCT product_name, 'approved', ...` dos eventos existentes (grandfather — nada quebra).
- [x] `0005_audit_log.sql` — tabela de auditoria.

**Código afetado:**
- [x] `packages/worker/src/persistor.ts` — upsert `pending` por batch (1 por slug distinto, menor received_at).
- [x] `packages/worker/src/ingestor.ts` — checar status; `rejected` → 202+drop (cache em memória, TTL 60s).
- [x] `packages/worker/src/aggregator.ts` — `publishPublicStats` só `approved` (JOIN products); `reconcilePublicStats` purga R2 de quem não está `approved`.
- [x] `packages/dashboard` — Route Handlers (`/api/products`, `/api/products/[slug]`, `/api/instances/[id]`) + página `/registry` com botões approve/reject/disable/enable/purge (confirmação no purge).
- [x] `packages/dashboard/wrangler.toml` — binding `R2_PUBLIC`.
- [x] `packages/schema/src/envelope.ts` — `product.name` agora slug `^[a-z][a-z0-9-]{1,63}$` (+ testes). Schema ainda pré-MVP, não congelado (mesma postura de [ADR-0004](0004-usage-dynamic-metrics.md)).
- [x] `docs/04-privacy-policy.md` — DSR de delete documentado como purge por instância via dashboard (PT + EN).

> **Validação local (2026-05-28):** migrations aplicadas no D1 local; via SDK→worker confirmado produto novo nasce `pending` e **não** publica; `approved`→cron publica JSON; `disabled`→reconcile purga R2 (404). No dashboard: enable/purge via API alteram D1+R2 e gravam `audit_log`. 15/15 typecheck+test verdes.

**Sem mudança:**
- **API do SDK** — `init`/`heartbeat`/`lifecycle` iguais; o registro é server-side e o cliente não sabe que existe. (O único reflexo no cliente é que um `product` com nome malformado passa a tomar `400` no ingest — produtos `etus-*` bem-comportados não sentem.)
- API pública (`public.ts`) — continua igual, só passa a ver o conjunto filtrado por `approved`.

**Perdas / atrito:**
- Onboardar produto novo agora exige um **passo de aprovação** humano antes de aparecer publicamente (intencional). Mitigar com notificação de "novo produto pending".

## Revisitar quando

- Se o volume de produtos crescer a ponto da fila de aprovação virar gargalo → auto-approve para slugs com prefixo confiável (`etus-*`) e quarentena só pro resto.
- Se precisarmos de purge **assíncrono** (produtos com milhões de eventos) → mover o DELETE pra um job/queue em vez de inline na request.
