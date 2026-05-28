# @etus/telemetry-dashboard

Painel **interno** (Next.js 15 App Router em Cloudflare Pages) com métricas de adoção dos projetos OSS da Etus. Queries em D1 via Server Components com `getRequestContext()`.

Auth (produção): **Cloudflare Access**. Local: sem auth.

## Dev local

```sh
# Suba o worker primeiro — ele cria/popula o D1 local:
pnpm --filter @etus/telemetry-worker dev

# Em outra aba:
pnpm --filter @etus/dummy-app send       # popula o banco

# Em uma terceira aba:
pnpm --filter @etus/telemetry-dashboard dev
# abra http://localhost:3000
```

`next.config.mjs` chama `setupDevPlatform()` do `@cloudflare/next-on-pages`, que lê o `wrangler.toml` local e expõe o binding `DB` em `getRequestContext().env`. Como o `database_name` é o mesmo do worker (`etus-telemetry`), os dois apontam para o mesmo SQLite local em `.wrangler/state/v3/d1`.

## Views (MVP)

- **Instâncias ativas (30d)**: `distinct(instance_id)` na janela
- **Por produto**: agregado por `product_name`
- **Por versão**: agregado por `(product_name, product_version)`
- **Por OS / deployment**: `json_extract` no `payload`

Tudo agrega. Linhas brutas nunca aparecem.

## Build/deploy

```sh
pnpm build:pages                          # next build + next-on-pages
pnpm preview                              # wrangler pages dev local
pnpm deploy                               # wrangler pages deploy
```
