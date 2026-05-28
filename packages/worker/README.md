# @etus/telemetry-worker

Worker Cloudflare único, três entry points:

| Entry point | Trigger | Responsabilidade |
|---|---|---|
| `fetch` | HTTP `POST /v1/events` | Ingestor — valida com zod, enfileira na Queue |
| `queue` | Queue `events-raw` | Persistor — INSERT batched no D1 |
| `scheduled` | Cron `0 3 * * *` | Aggregator — rollups diários, publica em R2 |

## Bindings (ver `wrangler.toml`)

- `DB` → D1 `etus-telemetry`
- `QUEUE` → Cloudflare Queue `events-raw` (producer)
- `R2_PUBLIC`, `R2_BACKUPS` → R2 buckets

## Dev local

```sh
# Criar D1 local + aplicar migrations
pnpm wrangler d1 create etus-telemetry      # primeira vez (gera database_id — colar no wrangler.toml)
pnpm db:migrate:local

# Rodar worker local (com Queues e D1 mockados pelo Miniflare)
pnpm dev
```

## Deploy

```sh
pnpm db:migrate:remote
pnpm deploy
```

Estrutura completa em [`../../docs/03-architecture.md`](../../docs/03-architecture.md).
