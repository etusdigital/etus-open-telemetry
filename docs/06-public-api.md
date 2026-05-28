# API Pública de Estatísticas

Endpoint HTTP legível por máquina com os agregados de adoção dos OSS da Etus — estilo Homebrew (`formulae.brew.sh/api/...`). Dados **públicos**, sem autenticação, CORS aberto, cacheáveis.

> Serve exatamente os mesmos agregados que o aggregator publica em R2 diariamente. **Nunca** expõe linhas brutas, `instance.id`, nem qualquer dado individual de instância — só contagens por dimensão.

- **Base URL (prod)**: `https://otw.etus.dev`
- **Base URL (dev)**: `http://localhost:8787`
- **Atualização**: diária, ~03:00 UTC (cron do aggregator)
- **Cache**: `Cache-Control: public, max-age=3600`

---

## `GET /v1/public/stats`

Índice dos produtos com estatísticas publicadas.

**Resposta `200`:**

```json
{
  "schema": "public-stats-index/v1",
  "generated_at": "2026-05-28T13:38:34.327Z",
  "products": [
    {
      "product": "etus-foo",
      "url": "/v1/public/stats/etus-foo",
      "updated_at": "2026-05-28T13:38:23.396Z",
      "size_bytes": 926
    }
  ]
}
```

---

## `GET /v1/public/stats/:product`

Agregados de um produto, em janelas de 30/90/365 dias.

**Resposta `200`:**

```json
{
  "product": "etus-foo",
  "generated_at": "2026-05-28T13:38:23.395Z",
  "day": "2026-05-27",
  "schema": "public-stats/v1",
  "30d": {
    "by_version": [
      { "version": "1.5.0", "active_instances": 2 },
      { "version": "1.4.2", "active_instances": 2 },
      { "version": "1.3.0", "active_instances": 1 }
    ]
  },
  "90d": { "by_version": [ ... ] },
  "365d": { "by_version": [ ... ] }
}
```

**Erros:**

| Código | Corpo | Quando |
|---|---|---|
| `400` | `{"error":"invalid_product"}` | Nome fora de `^[a-z0-9][a-z0-9._-]{0,63}$` (ex: path traversal) |
| `404` | `{"error":"not_found"}` | Produto sem stats publicados |

---

## Garantias

- **Sem PII** — só agregados. Mesmo contrato da [política de privacidade](04-privacy-policy.md).
- **Nome de produto sanitizado** — regex estrita impede path traversal no acesso ao R2.
- **CORS aberto** (`Access-Control-Allow-Origin: *`) — pode ser consumido de qualquer browser/dashboard.
- **Estável e versionado** — o campo `schema` (`public-stats/v1`) muda só em breaking change.

## Como consumir

```sh
# listar produtos
curl https://otw.etus.dev/v1/public/stats

# stats de um produto
curl https://otw.etus.dev/v1/public/stats/etus-foo
```

```ts
const res = await fetch('https://otw.etus.dev/v1/public/stats/etus-foo');
const stats = await res.json();
console.log(stats['30d'].by_version);
```

## Implementação

- Código: `packages/worker/src/public.ts` (Hono sub-app montado em `/v1/public`)
- Fonte dos dados: bucket R2 `etus-telemetry-public`, chaves `stats/v1/<product>.json`
- Publicação: `packages/worker/src/aggregator.ts` (cron diário)
