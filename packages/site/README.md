# @etus/telemetry-site

Site público em Cloudflare Pages (Next.js 15 App Router). Três rotas:

| Rota | Render | Conteúdo |
|---|---|---|
| `/` | static | Landing — explica o projeto, links principais |
| `/privacy` | static (`force-static`) | Renderiza `docs/04-privacy-policy.md` via react-markdown (lido em build time, com seção interna removida) |
| `/stats` | edge (revalidate 5min) | Lista produtos a partir de `R2_PUBLIC.list({ prefix: 'stats/v1/' })` |
| `/stats/[product]` | edge (revalidate 5min) | Lê `stats/v1/<product>.json` do R2 e renderiza tabelas por janela (30/90/365d) |

## Dev local

```sh
# Em outra aba — opcional, para popular o R2:
pnpm --filter @etus/telemetry-worker dev
# (e dispare o aggregator manualmente — ver doc 03)

pnpm --filter @etus/telemetry-site dev
# abra http://localhost:3001
```

Bindings (ver `wrangler.toml`):
- `R2_PUBLIC` — bucket público compartilhado com o worker, que publica `stats/v1/<product>.json`

## Deploy

```sh
pnpm build:pages
pnpm deploy
```
