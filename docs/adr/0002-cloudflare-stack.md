# ADR-0002 — Stack Cloudflare (Workers, Queues, D1, R2, Pages)

- **Status**: Aceito
- **Data**: 2026-05-27
- **Substitui**: parcialmente [ADR-0001](0001-fundacao.md) — decisão 4 (stack inicial)
- **Mantém**: decisões 1, 2, 3 e 5 do ADR-0001 (escopo, opt-in, build-from-scratch, hash+seed)

## Contexto

Após o ADR-0001 propor Fastify + Postgres + Next.js + pnpm como stack inicial, a equipe definiu que o projeto vai rodar na Cloudflare. Volume esperado é baixo (não tem requisito de escala próximo dos limites de Workers/D1).

## Decisão

Toda a infra-de-execução fica na Cloudflare, usando exclusivamente as primitivas listadas:

| Componente | Primitiva Cloudflare | Função |
|---|---|---|
| Ingestor HTTP | **Workers** | Recebe `POST /v1/events`, valida, enfileira |
| Buffer | **Queues** | Desacopla aceite de escrita; permite retry e DLQ |
| Persistor | **Workers** (queue consumer) | Lê batch da Queue, insere em D1 |
| Storage transacional | **D1** (SQLite) | Eventos brutos + tabelas agregadas |
| Storage cold/static | **R2** | JSON públicos agregados (estilo Homebrew), backups |
| Dashboard interno | **Pages** | Next.js + queries em D1 via Worker |
| Site público (privacy + stats) | **Pages** | Estático/SSG |
| Cron (agregações diárias) | **Workers** (Cron Triggers) | Materializa rollups; gera JSON para R2 |

### Stack de código

| Camada | Escolha | Substitui |
|---|---|---|
| Framework do Worker | **Hono** + zod | Fastify |
| Validação | **zod** | (igual) |
| Storage | **D1 (SQLite)** | Postgres |
| Frontend | **Next.js** (Pages adapter) ou **Astro** | Next.js (sem mudança no MVP) |
| Workspace | **pnpm workspaces** | (igual) |
| Local dev | **wrangler dev** (Miniflare) | docker-compose Postgres |

### Schema D1

SQLite não tem JSONB; payload vira `TEXT` (JSON) e usamos funções JSON1 (`json_extract`) para queries. Adicionamos índices nos campos quentes (product_name, event_type, received_at).

```sql
CREATE TABLE events (
  event_id     TEXT PRIMARY KEY,
  received_at  INTEGER NOT NULL,         -- epoch ms (server)
  emitted_at   INTEGER NOT NULL,         -- epoch ms (client)
  schema_version TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_version TEXT NOT NULL,
  instance_id  TEXT NOT NULL,
  payload      TEXT NOT NULL             -- JSON do resto
);

CREATE INDEX events_product_time ON events(product_name, received_at);
CREATE INDEX events_type_time    ON events(event_type, received_at);
CREATE INDEX events_instance     ON events(instance_id);
```

### Topologia: Workers únicos ou separados?

**MVP**: **um único Worker** para ingestor (`fetch` handler) + persistor (`queue` handler). Mesma codebase, dois entry points, bindings para D1 + Queue.

**Justificativa**: limites de Workers (CPU 30s, payload 100MB) ficam folgados; deploy simples; tipos compartilhados sem fricção.

**Quando dividir**: se o consumer da queue precisar de uma compatibility_date/perms diferente, ou se o volume crescer ao ponto de exigir scaling independente.

### Uso de R2

- **Stats públicos**: cron diário materializa agregados (instâncias por versão, OS, etc.) em JSON e publica em `https://stats.etus-telemetry.{...}/v1/<product>.json`. Estilo Homebrew. Static, cacheável, sem leitura no D1 da parte pública.
- **Backups**: export periódico do D1 para R2 (parquet ou jsonl.gz).

### Dashboard interno

Next.js em Pages. Queries em D1 via Worker function (Pages Functions). Auth: SSO ETUS via Cloudflare Access (preferível) ou NextAuth.

**Alternativa considerada**: Astro para o público + SvelteKit para o interno. Rejeitado por adicionar uma stack de frontend a mais sem ganho claro no MVP.

## Consequências

**Positivas**
- Custo operacional baixo até volume real surgir; nada de gerenciar Postgres.
- `wrangler dev` é mais simples do que docker-compose para onboarding.
- Cron Triggers nativos para agregações (sem cron-job-do-mes externo).
- Pages + Workers + D1 + Queues compartilham um único `wrangler.toml` ecosystem.

**Negativas / Riscos**
- **Vendor lock-in real**. Mudar de Cloudflare depois exigirá refactor não-trivial. Aceito.
- **D1 ainda evolui**. Mudanças de comportamento podem nos afetar (raro mas possível).
- **Limites de Workers**: payload máximo 100MB (irrelevante — payloads são <2KB), CPU 30s (irrelevante), 50ms wall-time em free plan (usar paid plan).
- **D1 size limit** atual de 10GB por DB. Confortável dado o volume esperado, mas anotar como ponto de revisão.
- **JSONB de Postgres → JSON1 do SQLite**: queries ad-hoc ficam um pouco mais verbosas, mas funções `json_extract` resolvem.

## Revisitar quando

- Volume passar de ~10M eventos/mês (revisar limites de D1, talvez Durable Objects ou ClickHouse externo).
- Houver requisito multi-region forte que Cloudflare global não cubra.
- Cloudflare mudar materialmente preço/limites de qualquer das primitivas usadas.

## Migração desde ADR-0001

Esta é uma mudança "pré-implementação" — só atualiza decisões, sem código pra migrar ainda. Ações:

- [ ] Remover `infra/docker-compose.yml` (sem mais Postgres local)
- [ ] Adicionar `wrangler.toml` no ingestor
- [ ] Atualizar deps dos packages (`hono`, `@cloudflare/workers-types`, etc.)
- [ ] Reescrever `docs/03-architecture.md` com o desenho Cloudflare
- [ ] Atualizar README com o novo perfil de deploy
