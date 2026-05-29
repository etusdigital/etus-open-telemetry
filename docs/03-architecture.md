# Arquitetura — MVP (Cloudflare)

> Stack confirmada em [ADR-0002](adr/0002-cloudflare-stack.md). Tudo roda na Cloudflare.
> Volume MVP é baixo → escolhas otimizadas para simplicidade, não para escala.

## Visão geral

```
┌─────────────────────────────────────────────────────────────────────┐
│                Instância self-hosted de OSS da ETUS                   │
│                                                                     │
│   App (etus-*) ──▶ @etus/telemetry-sdk                              │
│                    • opt-in check                                   │
│                    • monta payload                                  │
│                    • envia async                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS POST /v1/events
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Cloudflare                                    │
│                                                                     │
│  ┌────────────────────┐                                             │
│  │ Worker: ingestor   │  fetch handler                              │
│  │  • zod validate    │                                             │
│  │  • drop unknown    │                                             │
│  │  • enqueue         │                                             │
│  │  • 202 Accepted    │                                             │
│  └─────────┬──────────┘                                             │
│            ▼                                                        │
│   ┌────────────────────┐                                            │
│   │  Queue: events-raw │  batch 100, timeout 5s                     │
│   └─────────┬──────────┘                                            │
│             ▼                                                       │
│  ┌────────────────────┐                                             │
│  │ Worker: persistor  │  queue handler (mesmo worker, outro entry)  │
│  │  • batched insert  │                                             │
│  └─────────┬──────────┘                                             │
│            ▼                                                        │
│   ┌──────────────┐    ┌──────────────────────┐                      │
│   │  D1 (SQLite) │◀───│ Pages: dashboard     │ Next.js + Pages Fn   │
│   │  events +    │    │  • SSO via Access    │                      │
│   │  rollups     │    └──────────────────────┘                      │
│   └──────┬───────┘                                                  │
│          │                                                          │
│          ▼  (cron diário)                                           │
│  ┌────────────────────┐    ┌──────────────────────┐                 │
│  │ Worker: aggregator │───▶│ R2: public stats     │ JSON cacheado   │
│  │  (Cron Trigger)    │    │  /v1/<product>.json  │                 │
│  └────────────────────┘    └──────────────────────┘                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ Pages: site público (privacy policy + stats viewer)     │        │
│  └─────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. `@etus/telemetry-sdk` (cliente)

Sem mudança em relação ao desenho anterior (independente da stack do backend).

- TypeScript publicado em npm.
- Lê config (env vars + arquivo persistido).
- Gera `instance.id = SHA-256(seed || install_uuid || product_name)` na primeira execução com opt-in dado.
- Heartbeat diário com jitter, retry exponencial, falha silenciosa.
- POST para `${endpoint}/v1/events` com `Content-Type: application/json`. O endpoint vem de `ETUS_TELEMETRY_ENDPOINT` (ou `init({ endpoint })`) — **sem default**; sem endpoint o SDK não envia.

⚠️ Se a stack dos OSS da ETUS não for Node-friendly, esta decisão precisa ser revisitada (ADR-0001 decisão 4).

### 2. Worker `ingestor` (produtor)

- **Framework**: [Hono](https://hono.dev/) + [zod](https://zod.dev/).
- **Rota**: `POST /v1/events`.
- **Validação**: zod schema importado de `@etus/telemetry-schema`. Whitelist estrita; campos desconhecidos são **silenciosamente removidos** antes de enfileirar.
- **Rate limit**: Cloudflare WAF / Rate Limit Rules na borda (não na app).
- **Resposta**: `202 Accepted` sempre que o payload é válido. Nunca `500` para erro de DB — Queue absorve.

```ts
// pseudo:
app.post('/v1/events', async (c) => {
  const parsed = EventSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_schema' }, 400);
  await c.env.QUEUE.send(parsed.data);
  return c.json({ ok: true }, 202);
});
```

### 3. Cloudflare Queue `telemetry-events-raw`

- Producer: o worker `ingestor`.
- Consumer: o mesmo worker (queue handler).
- `max_batch_size`: 100. `max_batch_timeout`: 5s.
- Dead-letter queue: `telemetry-events-dlq` (após N retries — define no wrangler.toml).

### 4. Worker `persistor` (consumer da queue)

Mesmo Worker do ingestor, segundo entry point (`queue` handler do Workers).

- Recebe batches da queue.
- INSERT batched no D1 (parametrizado, transação por batch).
- Em falha (D1 indisponível), Cloudflare retenta automaticamente; após N tentativas, vai para DLQ para análise manual.

### 5. D1 (SQLite)

Tabela principal:

```sql
CREATE TABLE events (
  event_id        TEXT PRIMARY KEY,
  received_at     INTEGER NOT NULL,        -- epoch ms (server-side)
  emitted_at      INTEGER NOT NULL,        -- epoch ms (client-side)
  schema_version  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  product_version TEXT NOT NULL,
  instance_id     TEXT NOT NULL,
  payload         TEXT NOT NULL            -- JSON do envelope + corpo do evento
);

CREATE INDEX events_product_time  ON events(product_name, received_at);
CREATE INDEX events_type_time     ON events(event_type, received_at);
CREATE INDEX events_instance      ON events(instance_id);
```

Tabelas de rollup (materializadas pelo aggregator):

```sql
CREATE TABLE rollup_daily (
  day             TEXT NOT NULL,           -- 'YYYY-MM-DD'
  product_name    TEXT NOT NULL,
  product_version TEXT,
  os              TEXT,
  deployment      TEXT,
  feature         TEXT,
  metric          TEXT NOT NULL,           -- 'active_instances', 'feature_enabled_count', ...
  value           INTEGER NOT NULL,
  PRIMARY KEY (day, product_name, product_version, os, deployment, feature, metric)
);
```

Retenção: eventos brutos 365 dias (job de DELETE no aggregator). Rollups indefinidos.

### 6. Worker `aggregator` (Cron Trigger)

- Dispara via `crons` no `wrangler.toml` (`"0 3 * * *"` — 03:00 UTC diariamente).
- Lê D1 para o dia anterior, materializa `rollup_daily`.
- Gera JSON público para cada produto e faz `PUT` em R2 (`stats/v1/<product>.json`).
- Roda DELETE de eventos > 365 dias.

### 7. R2 (stats públicos + backups)

- Bucket `etus-telemetry-public`: JSONs cacheáveis, servidos diretamente via R2 custom domain ou via Worker rota `GET /v1/public/stats/<product>`.
- Bucket `etus-telemetry-backups`: export semanal do D1 em jsonl.gz (cron weekly).

### 8. Pages `dashboard` (interno)

- Next.js com Pages adapter.
- Pages Functions (Workers) para queries em D1 via binding.
- Auth: **Cloudflare Access** (recomendado — zero código de auth). Alternativa: NextAuth com SSO ETUS.
- Views MVP:
  - Active instances por produto
  - Distribuição por versão / OS / deployment / database engine
  - Adoção de features
  - Linha do tempo de installs/upgrades/uninstalls

### 9. Pages `site-publico` (privacy policy + stats viewer)

- Estático (Astro ou Next SSG; decisão de framework pode ser idêntica ao dashboard pra evitar duplicar stack).
- Conteúdo: política de privacidade PT-BR + EN, FAQ, schema documentado, link pro repo OSS.
- "Stats viewer" lê os JSONs de R2 e renderiza gráficos públicos (estilo Homebrew).

## Estrutura do Monorepo (revisada)

```
etus-open-telemetry/
├── docs/
│   ├── 01-research.md
│   ├── 02-event-schema.md
│   ├── 03-architecture.md          (este)
│   ├── 04-privacy-policy.md        (futuro — público)
│   └── adr/
│       ├── 0001-fundacao.md
│       └── 0002-cloudflare-stack.md
├── packages/
│   ├── schema/                      # zod schemas (source-of-truth)
│   ├── sdk/                         # @etus/telemetry-sdk (npm)
│   ├── worker/                      # ingestor + persistor + aggregator (Hono + Workers)
│   │   ├── src/
│   │   ├── migrations/              # D1 schema migrations
│   │   └── wrangler.toml
│   ├── dashboard/                   # Pages (Next.js, interno)
│   ├── site/                        # Pages (público — privacy + stats)
│   └── shared/                      # utils: hashing, buckets, env detection
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Note: os 3 Workers (ingestor, persistor, aggregator) ficam no mesmo package `worker/` no MVP. Podem ser divididos depois.

## Fluxo End-to-End (protótipo)

1. `wrangler dev` na raiz sobe ingestor + persistor + aggregator + D1 local (via Miniflare).
2. App dummy importa `@etus/telemetry-sdk` e chama `telemetry.init({ product, version })`.
3. Sem opt-in: SDK loga aviso e sai.
4. `ETUS_TELEMETRY=enabled` setado: SDK gera seed/id, persiste em `~/.config/etus-telemetry/<product>.json`, dispara primeiro heartbeat.
5. Worker `ingestor` recebe, valida com zod, enfileira na Queue.
6. Worker `persistor` consome batch, insere em D1 local.
7. `wrangler tail` mostra os eventos chegando.
8. `wrangler d1 execute etus-telemetry --command "SELECT count(*) FROM events"` confirma persistência.

## Dev local

```sh
# uma única vez:
pnpm install
pnpm wrangler d1 create etus-telemetry --local
pnpm wrangler d1 execute etus-telemetry --local --file packages/worker/migrations/0001_init.sql

# em uma aba:
pnpm --filter @etus/telemetry-worker dev

# em outra:
pnpm --filter @etus/telemetry-dashboard dev
```

Sem Docker. Sem Postgres. Sem fila externa.

## Deploy

- `pnpm wrangler deploy` no package `worker` → publica os 3 workers + bindings (D1, Queue, R2) num único deployment.
- `pnpm wrangler pages deploy` no package `dashboard` e `site`.
- DNS: `otw.etus.dev` aponta para o ingestor/worker (custom domain). Domínio do site público (Pages) a definir.

## Riscos & Decisões em aberto

- **Domínio**: `otw.etus.dev` para o ingestor/worker (definido). Domínio do site público (Pages) ainda a definir.
- **Auth do dashboard**: Cloudflare Access vs NextAuth. Cloudflare Access é mais simples; depende do plano da conta.
- **Framework do site público**: Next.js (mesmo do dashboard) ou Astro? Próxima sessão.
- **Stack do SDK ainda condicionada**: se OSS da ETUS não for Node-friendly, ADR-0001 #4 revisitado.

## Próximo doc

`04-privacy-policy.md` — política pública.
