# etus-open-telemetry

Telemetria opt-in para os projetos open source da Etus.

> ⚠️ **Não confundir com OpenTelemetry (CNCF).** Este projeto é sobre coletar métricas
> agregadas de **adoção** dos OSS da Etus — não sobre tracing/logs/métricas internas
> de aplicações.

## O que é

Cada instância self-hosted de um OSS da Etus (ex: `etus-foo`, `etus-bar`) pode embutir
o SDK `@etus/telemetry-sdk`. Se o operador da instância der opt-in explícito, o SDK
envia heartbeats diários **anônimos** com informações agregadas sobre o uso da instância:
versão, SO, features ativas, etc. — **nunca** dados dos usuários finais daquela instância.

Modelo de referência: o `telemetry.umami.is` do Umami e o phone-home opt-in do Plausible CE.

## Princípios

1. **Opt-in explícito.** Telemetria desligada por padrão. Operador habilita ativamente.
2. **Whitelist estrita.** Só campos listados em [`docs/02-event-schema.md`](docs/02-event-schema.md) são coletados.
3. **Sem PII, sem conteúdo de aplicação.** Coletamos sobre a instância, não sobre quem a usa.
4. **Buckets em vez de números exatos.** Reduz risco de re-identificação.
5. **IDs hashed+seeded.** Não correlacionáveis entre produtos diferentes.
6. **Política pública versionada.** Schema = contrato com a comunidade.

## Stack

Toda a infra roda em **Cloudflare** ([ADR-0002](docs/adr/0002-cloudflare-stack.md)):

| Componente | Cloudflare |
|---|---|
| Ingestor HTTP + Persistor + Aggregator | **Workers** (3 entry points num único worker) |
| Buffer entre aceite e escrita | **Queues** |
| Storage transacional | **D1** (SQLite) |
| Stats públicos + backups | **R2** |
| Dashboard interno + site público | **Pages** |

SDK em TypeScript, framework do Worker é Hono + zod.

## Documentos

| Doc | Conteúdo |
|---|---|
| [`docs/01-research.md`](docs/01-research.md) | Pesquisa de telemetria em OSS de referência |
| [`docs/02-event-schema.md`](docs/02-event-schema.md) | Schema dos eventos coletados (MVP) |
| [`docs/03-architecture.md`](docs/03-architecture.md) | Stack Cloudflare, monorepo, fluxo end-to-end |
| [`docs/04-privacy-policy.md`](docs/04-privacy-policy.md) | Política pública PT-BR + EN (v1.0.0) |
| [`docs/05-integration-guide.md`](docs/05-integration-guide.md) | Guia interno para times de produto integrarem o SDK |
| [`docs/06-public-api.md`](docs/06-public-api.md) | API pública de estatísticas (estilo Homebrew) |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |

## Estrutura

```
packages/
  schema/       Tipos canônicos do payload (zod)
  sdk/          @etus/telemetry-sdk — embarcado nas instâncias
  worker/       Cloudflare Worker: ingestor + persistor + aggregator
  dashboard/    Painel interno (Next.js em Pages)
  site/         Site público (privacy + stats viewer, Pages)
  shared/       Utils (hashing, buckets, env detection)

docs/           Documentação + ADRs
```

## Dev local

Monorepo gerenciado com **pnpm workspaces + Turborepo**.

```sh
pnpm install
pnpm turbo run typecheck                           # valida tipos em todos os packages (com cache)
pnpm wrangler d1 create etus-telemetry             # primeira vez — colar o database_id em packages/worker/wrangler.toml
pnpm --filter @etus/telemetry-worker db:migrate:local
pnpm --filter @etus/telemetry-worker dev
```

Scripts úteis:

| Comando | O que faz |
|---|---|
| `pnpm turbo run build` | Build de todos os packages, respeitando dependências |
| `pnpm turbo run typecheck` | tsc --noEmit em todos os packages com `typecheck` |
| `pnpm turbo run test` | Testes em todos os packages |
| `pnpm turbo run dev` | Dev paralelo (Worker + dashboard + site quando existirem) |
| `pnpm clean` | Remove dists, .turbo, node_modules |
| `pnpm dev:reset` | Mata dev servers órfãos (next-server/workerd/miniflare) e limpa `.next` corrompido |

Sem Docker. D1 e Queues rodam locais via Miniflare.

> **Erros tipo `ENOENT .next/server/app/page.js` ou `ChunkLoadError`?** São cache stale do Next + processos órfãos de dev servers anteriores. Rode `pnpm dev:reset` e suba de novo. Causa: `next dev` deixa processos filhos (`next-server`) órfãos quando o wrapper é morto; múltiplos escrevendo no mesmo `.next` corrompem o build.

## Status

🚧 **Pré-MVP — em definição.** Pesquisa, schema e stack consolidados. Próximo passo:
prototipar o caminho ponta-a-ponta (SDK → ingestor → Queue → persistor → D1) com instância dummy.

Decisões em aberto: ver "Riscos & Decisões em aberto" em [`docs/03-architecture.md`](docs/03-architecture.md).
