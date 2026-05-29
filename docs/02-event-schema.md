# Schema de Eventos — MVP

> Documento de referência. Toda mudança aqui é **breaking change** e exige bump de `schema_version`.
> Espelha 1:1 o que vai estar na política pública de privacidade.

## Princípios

1. **Tudo o que não está listado aqui, não é coletado.** Whitelist estrita.
2. **Nenhum dado de end-user da instância self-hosted.** Coletamos sobre a instância, não sobre quem a usa.
3. **Nenhum dado livre.** Strings só em campos `enum`. Chaves de métrica em `usage` são **identificadores** (`snake_case`), não texto livre (ver ADR-0004). Números: inteiros não-negativos (ver ADR-0003 sobre o trade-off de não usar buckets).
4. **Hashed/seeded onde dá.** IDs e hostnames quando precisarem existir são hashed com seed local.
5. **Schema versionado.** Cada payload carrega `schema_version`. Mudança = breaking = nova versão.

---

## Tipos de Evento

O MVP tem **dois tipos** de evento. Mais podem ser adicionados depois sem breaking change, desde que sigam os princípios acima.

| Evento | Quando dispara | Cadência |
|---|---|---|
| `instance.heartbeat` | A cada 24h, se a instância estiver up | Diária |
| `instance.lifecycle` | Mudanças significativas: install, upgrade, feature toggle | Eventual |

Heartbeat é o evento principal e carrega o estado atual da instância. Lifecycle marca transições.

---

## Schema Comum (todos os eventos)

Todo payload, qualquer que seja o evento, tem este envelope:

```jsonc
{
  "schema_version": "1.0.0",        // semver — bumpa em mudança breaking
  "event": "instance.heartbeat",    // enum dos eventos suportados
  "event_id": "uuid-v4",            // dedup no ingestor
  "timestamp": "2026-05-27T14:32:00Z", // ISO 8601 UTC, gerado pelo cliente
  "product": {
    "name": "etus-foo",             // enum — quais OSS da ETUS são reconhecidos
    "version": "2.4.1"              // semver da release instalada
  },
  "instance": {
    "id": "hash(seed + install_uuid)", // SHA-256, seed local, não reversível por nós
    "first_seen_at": "2026-01-10T00:00:00Z" // quando o opt-in foi ativado
  }
}
```

### Justificativa dos campos do envelope

| Campo | Por quê |
|---|---|
| `schema_version` | Permite evoluir sem quebrar pipelines de ingestão. |
| `event_id` | Dedup quando há retry/network blip. |
| `timestamp` | Latência de envio + jobs em batch. Cliente carimba. |
| `product.name` | Vamos ter múltiplos OSS — precisa segregar. |
| `product.version` | Métrica de adoção por versão é fundamental. |
| `instance.id` | Distinguir instâncias para evitar dupla contagem; **não** correlacionável entre produtos (cada produto tem seed própria). |
| `instance.first_seen_at` | Coorte de retenção (instâncias ativas há quanto tempo). |

---

## `instance.heartbeat` — payload

Estado atual da instância. Tudo opcional individualmente (instância pode optar por enviar só parte), mas o conjunto é fechado.

```jsonc
{
  // ...envelope acima...
  "event": "instance.heartbeat",
  "environment": {
    "os": "linux",                  // enum: linux | macos | windows | unknown
    "arch": "x86_64",               // enum: x86_64 | arm64 | unknown
    "runtime": "node",              // enum por produto (node/python/go/...)
    "runtime_version": "20.11.1",   // semver
    "deployment": "docker",         // enum: docker | kubernetes | native | unknown
    "is_containerized": true
  },
  "database": {
    "engine": "postgres",           // enum por produto
    "version_major": "16"           // só major.minor, nada além
  },
  "usage": {                        // mapa dinâmico de métricas (ver ADR-0004)
    "active_users": 47,             // chave: snake_case; valor: inteiro ≥ 0
    "messages_sent": 12034,         // métricas variam por produto
    "storage_bytes": 2341823413     // sufixo _bytes → formatado como bytes no dashboard
  },
  "features": {
    "enabled": ["sso", "audit_log", "webhooks"], // whitelist por produto
    "integrations": ["slack", "github"]          // whitelist por produto
  }
}
```

### `usage` é um mapa dinâmico de métricas

Decisão em [ADR-0004](adr/0004-usage-dynamic-metrics.md): `usage` é um mapa aberto `metric_name → inteiro ≥ 0`, não campos fixos. Cada produto envia as métricas que fizerem sentido (mensageria → `messages_sent`, CRM → `active_contacts`, etc.).

Regras:
- **Chaves**: `^[a-z][a-z0-9_]{0,63}$` (snake_case, identificador — não texto livre). Máx 50 métricas.
- **Valores**: inteiro `≥ 0` (ver [ADR-0003](adr/0003-usage-integers.md) sobre não usar buckets).
- **Convenção de unidade**: sufixo `_bytes` → dashboard formata como bytes; senão inteiro puro.

### Por que valores exatos (e não buckets)?

[ADR-0003](adr/0003-usage-integers.md). Trade-off: um conjunto de métricas exatas é quase-único e pode re-identificar a instância; tolerável dado opt-in + baixo volume + ausência de outros identificadores. Mitigação: o aggregator **nunca** publica linhas brutas em R2 — só agregados.

---

## `instance.lifecycle` — payload

Transições. Curto, pontual.

```jsonc
{
  // ...envelope...
  "event": "instance.lifecycle",
  "lifecycle": {
    "type": "install",              // enum: install | upgrade | feature_enabled | feature_disabled | uninstall
    "from_version": null,           // semver | null
    "to_version": "2.4.1",          // semver | null
    "feature": null                 // string (whitelisted) | null — só em feature_enabled/disabled
  }
}
```

`uninstall` é "best-effort" — uma instância sendo desligada pode não conseguir enviar. Aceita-se a perda.

---

## O que **NÃO** é coletado (explícito)

Lista pública, parte da política de privacidade:

- ❌ Endereços IP do servidor (só usados na borda do ingestor para região aproximada se quisermos isso no futuro; nunca persistidos)
- ❌ Hostnames, FQDNs, URLs
- ❌ Nomes de organização, projeto, usuário, email — nada da camada de aplicação
- ❌ Conteúdo do banco da instância (linhas, registros, campos custom)
- ❌ Logs, stack traces, mensagens de erro
- ❌ Variáveis de ambiente, paths de arquivo
- ❌ Git remote info, repo URLs
- ❌ Identificadores de licença ou contrato comercial
- ❌ Números exatos onde buckets servem

---

## Pseudo-anonimização do `instance.id`

```
seed     = random 256-bit, gerado uma vez por (instância, produto), salvo localmente
input    = seed || install_uuid || product.name
id       = SHA-256(input) → primeiros 16 bytes em base32
```

A ETUS **nunca** vê a seed. Mesmo se o banco da ETUS vazar, não dá pra correlacionar o `instance.id` de volta a uma instância específica sem acesso ao disco da instância.

Cada produto tem seed própria → mesma instância rodando dois produtos da ETUS aparece como dois IDs não-correlacionáveis.

---

## Cadência e Retry

- Heartbeat dispara a cada 24h (jitter ±1h pra suavizar pico).
- Falha de rede: retry exponencial até 3 tentativas, depois aborta silenciosamente. Próximo heartbeat tenta de novo.
- Lifecycle: tenta imediatamente, se falhar, anexa ao próximo heartbeat como `pending_lifecycle[]` (até definir; pode ficar fora do MVP).
- Envio sempre assíncrono — **nunca** bloqueia request do operador.

---

## Versionamento

- Mudança de tipo / remoção de campo / mudança de semântica → **MAJOR** (`2.0.0`).
- Novo campo opcional ou novo `event` → **MINOR** (`1.1.0`).
- Correção de typo em enum, ajuste de bucket → **PATCH** (`1.0.1`).

O ingestor deve aceitar todas as versões `>= 1.0.0` que tenha visto. Versões antigas continuam funcionando indefinidamente — o cliente é o software dos outros, não nosso.

---

## Aberto para próxima rodada de decisão

Coisas que deixei propositalmente fora do MVP para discutir:

- Região geográfica aproximada (continente? país? nada?) — gera complicação LGPD/GDPR
- Eventos de "feature usado" granular (qual % das instâncias clicou em X) — pode virar `instance.feature_used` no v1.1
- Coleta de erros agregados (sem stack trace, só "houve N erros" por categoria)
- Métricas de performance (p50/p95 de tempo de resposta) — útil mas pode ser overkill no MVP
- Detecção de fork (instância rodando código modificado da ETUS) — relevante? só ETUS oficial?

Próximo doc: `03-architecture.md` — estrutura do monorepo, stack técnica de cada componente, fluxo end-to-end.
