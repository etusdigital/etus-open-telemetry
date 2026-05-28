# ADR-0004 — `usage` como mapa dinâmico de métricas

- **Status**: Aceito
- **Data**: 2026-05-28
- **Refina**: [ADR-0003](0003-usage-integers.md) — mantém "valores são inteiros não-negativos", muda a **forma** de `usage` (campos fixos → mapa aberto)

## Contexto

`usage` nasceu com três campos fixos e obrigatórios (quando presente): `users`, `storage_bytes`, `uptime_days`. Mas métricas de uso são **intrinsecamente por-produto**:

- um produto de mensageria mede `messages_sent`
- um CRM mede `contacts`
- um gerenciador de docs mede `documents`

Forçar todo produto a `users`/`storage_bytes`/`uptime_days` não cobre esses casos e infla o payload com campos sem sentido. A equipe pediu que `usage` seja flexível — qualquer produto adiciona quantas métricas quiser.

## Decisão

`usage` passa a ser um **mapa aberto** de `metric_name → inteiro não-negativo`:

```ts
const METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const Usage = z
  .record(z.string().regex(METRIC_KEY), z.number().int().nonnegative())
  .refine((m) => Object.keys(m).length <= 50, 'max 50 metrics');
```

Regras:
- **Chaves**: `snake_case`, começando com letra, ≤ 64 chars. **Não** são texto livre — são identificadores. `users`, `messages_sent`, `active_contacts` ✅; `"User Email"`, `"a.b"`, `"João"` ❌.
- **Valores**: inteiro `≥ 0` (preserva [ADR-0003](0003-usage-integers.md)).
- **Máx 50 métricas** por heartbeat (anti-abuso).
- **Nenhuma chave é obrigatória** — `usage` pode ser omitido ou vir `{}`.

## Por que chaves restritas (e não texto livre)

Texto livre nas chaves violaria o princípio "sem dado livre" do schema — alguém poderia vazar PII numa chave (`usage["count_for_john@x.com"]`). Restringir a `snake_case`:

1. **Preserva privacidade**: chave é identificador técnico, não conteúdo.
2. **Garante o pipeline**: o dashboard usa `json_extract(payload, '$.usage.' || key)`. Chaves com `.`/espaço/aspas quebrariam o path. `[a-z0-9_]` é seguro de interpolar.
3. **Mantém comparabilidade**: métricas viram colunas/séries estáveis, coordenadas por produto (mesma disciplina das features — ver [guia de integração §8](../05-integration-guide.md#8-mudanças-no-schema--como-coordenar)).

## Convenção de unidade

O dashboard infere formatação pelo **sufixo da chave**:
- termina em `_bytes` → formata como bytes (KB/MB/GB/TB)
- senão → inteiro puro

Então prefira `storage_bytes` (não `storage_mb`), `bandwidth_bytes`, etc.

## Consequências

**Código afetado:**
- [x] `packages/schema/src/heartbeat.ts` — `Usage` vira record
- [x] `packages/schema/tests/heartbeat.test.ts` — testa chaves dinâmicas + rejeição de chave inválida
- [x] `packages/sdk` — tipo `HeartbeatStats['usage']` infere `Record<string, number>` automaticamente
- [x] `packages/dashboard` — `discoverUsageMetrics()` + `sumMetricPerDay()`; OverviewTab renderiza 1 chart por métrica descoberta
- [x] `examples/seeder` + `examples/dummy-app` — métricas variadas por produto

**Versão do schema:** continua `1.0.0`. O schema ainda é **pré-MVP, não congelado** — mesma postura do ADR-0003 (que mudou buckets→inteiros sem bump). Será congelado em `1.0.0` no primeiro release real; mudanças após isso seguem semver estrito.

**Perdas:**
- Não dá mais para o ingestor garantir que todo heartbeat tenha `users`/`storage`/`uptime` — agora é responsabilidade do produto enviar métricas consistentes ao longo do tempo. Documentado no guia de integração.

## Revisitar quando

- Se aparecer necessidade de métricas **não-inteiras** (ex: ratios, percentuais) → estender o tipo de valor (cuidado: floats exatos têm o mesmo problema de re-identificação dos inteiros).
- Se precisarmos de unidades além de `_bytes` → formalizar um sufixo-convention maior (`_ms`, `_count`, etc.) ou um campo de metadados.
