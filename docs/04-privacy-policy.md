# Política de Privacidade — ETUS Open Telemetry

- **Versão**: 1.0.0
- **Vigência**: a partir de 2026-05-27
- **Próxima revisão**: ao mudar o schema (ADR-0001 prevê bump em qualquer alteração de campo coletado)
- **Endpoint de coleta**: `https://otw.etus.dev/v1/events`

> Este documento é o **contrato público** com operadores que rodam software open source da ETUS. Ele espelha 1:1 o schema técnico em [`02-event-schema.md`](02-event-schema.md). Toda mudança de campo coletado é **breaking change**, exige bump de `schema_version` e atualização desta política.

> **PT-BR primeiro. English version below.** Both versions are equally authoritative.

---

## 🇧🇷 Português

### TL;DR

A telemetria do ETUS Open Telemetry está **desligada por padrão**. Se você ativar opt-in explícito, sua instância envia um pequeno heartbeat anônimo uma vez por dia, contendo apenas dados **sobre a instância** (versão do produto, sistema operacional, número de usuários ativos, etc.) — **nunca** dados sobre as pessoas que usam a sua instância. Você pode inspecionar, desativar e pedir exclusão a qualquer momento.

### 1. Quem somos

A telemetria é operada por **ETUS**, identificada como controladora dos dados nos termos da LGPD (Lei nº 13.709/2018). Contato: `privacy@etus.com.br` (placeholder — confirmar antes de produção).

### 2. O que coletamos

A coleta acontece via SDK embarcado nos OSS da ETUS que você hospeda. Há **dois tipos** de evento:

#### 2.1 `instance.heartbeat` — uma vez a cada 24h

Campo | Tipo | Descrição
---|---|---
`schema_version` | semver | Versão do schema desta política
`event_id` | UUID v4 | Identificador único do evento (dedup)
`timestamp` | ISO 8601 UTC | Quando o evento foi emitido
`product.name` | string (enum) | Qual OSS da ETUS emitiu (ex: `etus-foo`)
`product.version` | semver | Versão da instalação
`instance.id` | hash | Identificador opaco da instância (ver §4)
`instance.first_seen_at` | ISO 8601 UTC | Quando o opt-in foi ativado nessa instância
`environment.os` | enum | `linux` \| `macos` \| `windows` \| `unknown`
`environment.arch` | enum | `x86_64` \| `arm64` \| `unknown`
`environment.runtime` | enum | `node` (e outros que vierem)
`environment.runtime_version` | semver | Versão do runtime
`environment.deployment` | enum | `docker` \| `kubernetes` \| `native` \| `unknown`
`environment.is_containerized` | boolean |
`database.engine` | enum por produto | Ex: `postgres`, `mysql`
`database.version_major` | string | Apenas major.minor
`usage.users` | inteiro ≥ 0 | Contagem de usuários ativos da instância
`usage.storage_bytes` | inteiro ≥ 0 | Storage usado em bytes
`usage.uptime_days` | inteiro ≥ 0 | Dias desde o último start
`features.enabled[]` | array de enums | Quais features estão ativas (whitelist por produto)
`features.integrations[]` | array de enums | Quais integrações estão configuradas

#### 2.2 `instance.lifecycle` — eventual (transições)

Mesmo envelope acima, mais:

Campo | Tipo | Descrição
---|---|---
`lifecycle.type` | enum | `install` \| `upgrade` \| `feature_enabled` \| `feature_disabled` \| `uninstall`
`lifecycle.from_version` | semver \| null |
`lifecycle.to_version` | semver \| null |
`lifecycle.feature` | string (whitelisted) \| null |

> Veja [ADR-0003](adr/0003-usage-integers.md) para a discussão sobre `usage.*` ser inteiro exato em vez de bucket.

### 3. O que NÃO coletamos

Nada fora do schema acima. Especificamente, nunca enviamos:

- ❌ Endereços IP (o ingestor lê para rate-limit em memória e descarta)
- ❌ Hostnames, FQDNs ou URLs
- ❌ Nomes de organização, projeto, usuário ou email — nada da camada de aplicação
- ❌ Conteúdo do banco da sua instância (linhas, registros, campos custom)
- ❌ Logs, stack traces, mensagens de erro
- ❌ Variáveis de ambiente, paths de arquivo, conteúdos de arquivo
- ❌ Informações de git remote ou repo
- ❌ Identificadores comerciais (licença, contrato)

### 4. Sobre o `instance.id` — não-correlacionável

O `instance.id` enviado é uma **função hash criptográfica** dos seguintes valores, **mantidos no disco da sua instância**:

```
seed         = 32 bytes aleatórios, gerados na 1ª execução com opt-in
install_uuid = UUIDv4 gerado na 1ª execução
instance.id  = SHA-256(seed || install_uuid || product_name) → primeiros 16 bytes em base32
```

Conseqüências:

- A **ETUS nunca vê a seed**. Mesmo em caso de vazamento total do banco da ETUS, **não é possível** correlacionar o `instance.id` de volta à sua instância sem acesso ao disco da instância.
- Cada produto tem **sua própria seed**. Se você roda dois OSS da ETUS na mesma máquina, eles aparecem como dois IDs **não-correlacionáveis** no banco da ETUS.
- O arquivo de estado fica em `$XDG_CONFIG_HOME/etus-telemetry/<product>.json` (ou `~/.config/etus-telemetry/<product>.json`), com permissão `0600`.

### 5. Por que coletamos

- **Decisões de priorização** baseadas em dados (qual versão otimizar, qual SO testar primeiro, qual integração tem demanda).
- **Manutenção responsável**: saber quem ainda usa uma versão antes de descontinuá-la.
- **Métricas públicas agregadas** (estilo Homebrew) que a comunidade pode consultar.

A ETUS **não vende** dados de telemetria. Nunca repassa a terceiros (exceto Cloudflare, processador de dados conforme §8).

### 6. Como **ativar** (opt-in)

Telemetria é desligada por padrão. Para ativar, escolha **uma** das opções abaixo:

**Variável de ambiente** (preferível):
```sh
export ETUS_TELEMETRY=enabled
```

**Config do app hospedeiro** (varia por produto — veja o README do OSS específico). Em código:
```ts
telemetry.init({
  product: 'etus-foo',
  version: '1.0.0',
  optedIn: true,
});
```

Na primeira execução com opt-in ativo, o SDK gera a seed e o install_uuid localmente e envia o primeiro heartbeat.

### 7. Como **inspecionar** antes de enviar

O SDK expõe um modo de inspeção que mostra exatamente o payload que seria enviado, **sem enviar**:

```ts
const preview = await telemetry.inspect();
console.log(preview);
```

Ou via o arquivo de estado direto: `cat ~/.config/etus-telemetry/<product>.json`.

### 8. Onde os dados ficam

Toda a infra roda na **Cloudflare**:

- Ingestão e processamento: Cloudflare Workers + Queues (edge global)
- Storage: Cloudflare D1 (SQLite) na região da Cloudflare
- Backups e agregados públicos: Cloudflare R2

A Cloudflare atua como **operadora de dados** (processadora) nos termos da LGPD. Não há outros sub-processadores.

### 9. Como **desativar**

Qualquer uma destas opções desliga a coleta imediatamente:

**Variável de ambiente:**
```sh
export ETUS_TELEMETRY=disabled
# ou o sinal universal:
export DO_NOT_TRACK=1
```

**Config do app:**
```ts
telemetry.init({ product: '...', version: '...', optedIn: false });
```

**Comando direto** (se o app hospedeiro expuser):
```sh
<seu-app> telemetry disable
```

A ETUS **também não coleta em ambientes de CI** — qualquer um dos sinais `CI=true`, `GITHUB_ACTIONS`, `GITLAB_CI`, `BUILDKITE`, `CIRCLECI`, `JENKINS_URL`, `CONTINUOUS_INTEGRATION` desliga automaticamente.

### 10. Retenção

- **Eventos brutos**: 365 dias. Depois disso são apagados pelo job diário.
- **Agregados (`rollup_daily`)**: mantidos indefinidamente. Não contêm `instance.id`, apenas contagens.
- **JSONs públicos em R2**: agregados, atualizados diariamente, sem dados de instância individual.

### 11. Como pedir **exclusão** (Direito do titular — LGPD art. 18)

Como o `instance.id` é opaco para a ETUS, o pedido de exclusão precisa ser iniciado por você:

1. Localize seu `instance.id` em `~/.config/etus-telemetry/<product>.json` — campo derivado da seed (ou rode `telemetry.inspect()` para obtê-lo).
2. Envie e-mail para `privacy@etus.com.br` com o assunto `[etus-telemetry] DSR — delete` e o `instance.id` no corpo.
3. Nossa equipe executa a exclusão pelo painel interno (*purge* por instância), removendo **todos os eventos brutos e o registro de estado** (`instances`) desse `instance.id` em até **15 dias úteis**. A ação fica registrada em log de auditoria interno.
4. **Agregações já materializadas não são retroativamente recalculadas** — elas são contagens, não armazenam o ID.

Você também pode parar de enviar dados novos a qualquer momento via §9.

### 12. Mudanças nesta política

Toda mudança que afete campos coletados:

- Sobe `schema_version` (MAJOR para remoções/semântica; MINOR para campos novos opcionais; PATCH para correções)
- É anunciada no changelog do repo OSS `etus-open-telemetry`
- O SDK rejeita silenciosamente versões `< MIN_ACCEPTED_SCHEMA_VERSION`

**Histórico:**

- **1.0.0 — 2026-05-27** — versão inicial.

### 13. Contato

- E-mail privacidade: `privacy@etus.com.br` _(placeholder — confirmar)_
- Repositório: `github.com/etus/etus-open-telemetry`
- Issues sobre a política: abrir no repo com label `privacy`

---

## 🇺🇸 English

### TL;DR

ETUS Open Telemetry is **off by default**. If you explicitly opt in, your instance sends a small anonymous heartbeat once a day with data **about the instance** (product version, OS, active user count, etc.) — **never** data about the people using your instance. You can inspect, disable and request deletion at any time.

### 1. Who we are

Telemetry is operated by **ETUS**, identified as the data controller under GDPR. Contact: `privacy@etus.com.br` (placeholder — to confirm before production).

### 2. What we collect

Collection happens through an SDK embedded in the ETUS OSS products you host. There are **two event types**:

#### 2.1 `instance.heartbeat` — once every 24h

Field | Type | Description
---|---|---
`schema_version` | semver | Version of the schema covered by this policy
`event_id` | UUID v4 | Unique event identifier (dedup)
`timestamp` | ISO 8601 UTC | When emitted
`product.name` | string (enum) | Which ETUS OSS emitted it (e.g. `etus-foo`)
`product.version` | semver | Installation version
`instance.id` | hash | Opaque instance identifier (see §4)
`instance.first_seen_at` | ISO 8601 UTC | When opt-in was enabled on this instance
`environment.os` | enum | `linux` \| `macos` \| `windows` \| `unknown`
`environment.arch` | enum | `x86_64` \| `arm64` \| `unknown`
`environment.runtime` | enum | `node` (plus future ones)
`environment.runtime_version` | semver | Runtime version
`environment.deployment` | enum | `docker` \| `kubernetes` \| `native` \| `unknown`
`environment.is_containerized` | boolean |
`database.engine` | enum per product | e.g. `postgres`, `mysql`
`database.version_major` | string | Major.minor only
`usage.users` | integer ≥ 0 | Active user count on the instance
`usage.storage_bytes` | integer ≥ 0 | Storage used, in bytes
`usage.uptime_days` | integer ≥ 0 | Days since last start
`features.enabled[]` | array of enums | Active features (whitelist per product)
`features.integrations[]` | array of enums | Configured integrations

#### 2.2 `instance.lifecycle` — eventual (transitions)

Same envelope as above, plus:

Field | Type | Description
---|---|---
`lifecycle.type` | enum | `install` \| `upgrade` \| `feature_enabled` \| `feature_disabled` \| `uninstall`
`lifecycle.from_version` | semver \| null |
`lifecycle.to_version` | semver \| null |
`lifecycle.feature` | string (whitelisted) \| null |

> See [ADR-0003](adr/0003-usage-integers.md) for the discussion of why `usage.*` are exact integers rather than buckets.

### 3. What we do NOT collect

Nothing outside the schema above. Specifically, we never send:

- ❌ IP addresses (the ingestor reads them in memory for rate limiting, then drops them)
- ❌ Hostnames, FQDNs or URLs
- ❌ Organization, project, user or email names — nothing from the application layer
- ❌ Database content of your instance (rows, records, custom fields)
- ❌ Logs, stack traces, error messages
- ❌ Environment variables, file paths, file contents
- ❌ Git remote info or repo data
- ❌ Commercial identifiers (license, contract)

### 4. About `instance.id` — non-correlatable

The `instance.id` we receive is a **cryptographic hash** of these values, **kept on your instance's disk**:

```
seed         = 32 random bytes, generated on first opt-in run
install_uuid = UUIDv4 generated on first run
instance.id  = SHA-256(seed || install_uuid || product_name) → first 16 bytes in base32
```

Implications:

- **ETUS never sees the seed.** Even in case of a total breach of our database, the `instance.id` **cannot** be correlated back to your specific instance without disk access to the instance.
- Each product has **its own seed**. If you run two ETUS OSS products on the same machine, they appear as two **non-correlatable** IDs in our database.
- The state file lives at `$XDG_CONFIG_HOME/etus-telemetry/<product>.json` (or `~/.config/etus-telemetry/<product>.json`), with permissions `0600`.

### 5. Why we collect

- **Data-driven prioritization** (which version to optimize, which OS to test first, which integration has demand).
- **Responsible maintenance**: knowing who still uses a version before deprecating it.
- **Public aggregated metrics** (Homebrew-style) the community can consult.

ETUS does **not sell** telemetry data. We do not share with third parties, except Cloudflare as data processor per §8.

### 6. How to **enable** (opt-in)

Telemetry is off by default. To enable, pick **one** option below:

**Environment variable** (preferred):
```sh
export ETUS_TELEMETRY=enabled
```

**Host app config** (varies per product — see the specific OSS README). In code:
```ts
telemetry.init({
  product: 'etus-foo',
  version: '1.0.0',
  optedIn: true,
});
```

On the first opt-in run, the SDK generates the seed and install_uuid locally and sends the first heartbeat.

### 7. How to **inspect** before sending

The SDK exposes an inspect mode that shows exactly the payload that would be sent, **without sending it**:

```ts
const preview = await telemetry.inspect();
console.log(preview);
```

Or read the state file directly: `cat ~/.config/etus-telemetry/<product>.json`.

### 8. Where the data lives

Everything runs on **Cloudflare**:

- Ingestion + processing: Cloudflare Workers + Queues (global edge)
- Storage: Cloudflare D1 (SQLite) in Cloudflare's region
- Backups + public aggregates: Cloudflare R2

Cloudflare acts as **data processor** under GDPR. There are no other sub-processors.

### 9. How to **disable**

Any of these options stops collection immediately:

**Environment variable:**
```sh
export ETUS_TELEMETRY=disabled
# or the universal signal:
export DO_NOT_TRACK=1
```

**App config:**
```ts
telemetry.init({ product: '...', version: '...', optedIn: false });
```

**Direct command** (if the host app exposes one):
```sh
<your-app> telemetry disable
```

ETUS **also does not collect in CI environments** — any of `CI=true`, `GITHUB_ACTIONS`, `GITLAB_CI`, `BUILDKITE`, `CIRCLECI`, `JENKINS_URL`, `CONTINUOUS_INTEGRATION` automatically disables telemetry.

### 10. Retention

- **Raw events**: 365 days. Then deleted by the daily job.
- **Aggregates (`rollup_daily`)**: kept indefinitely. They don't contain `instance.id`, only counts.
- **Public JSONs in R2**: aggregates, updated daily, no individual-instance data.

### 11. How to request **deletion** (data subject right — GDPR art. 17)

Since `instance.id` is opaque to ETUS, the deletion request needs to be initiated by you:

1. Find your `instance.id` in `~/.config/etus-telemetry/<product>.json` — derived from the seed (or run `telemetry.inspect()` to get it).
2. Email `privacy@etus.com.br` with the subject `[etus-telemetry] DSR — delete` and the `instance.id` in the body.
3. Our team runs the deletion from the internal dashboard (per-instance *purge*), removing **all raw events and the state record** (`instances`) for that `instance.id` within **15 business days**. The action is recorded in an internal audit log.
4. **Already-materialized aggregations are not retroactively recomputed** — they are counts, they do not store the ID.

You can also stop sending new data at any time via §9.

### 12. Changes to this policy

Any change that affects collected fields:

- Bumps `schema_version` (MAJOR for removals/semantic changes; MINOR for new optional fields; PATCH for fixes)
- Is announced in the changelog of the OSS repo `etus-open-telemetry`
- The SDK silently rejects versions `< MIN_ACCEPTED_SCHEMA_VERSION`

**History:**

- **1.0.0 — 2026-05-27** — initial version.

### 13. Contact

- Privacy email: `privacy@etus.com.br` _(placeholder — to confirm)_
- Repository: `github.com/etus/etus-open-telemetry`
- Issues about this policy: open in the repo with label `privacy`

---

## Pontos a confirmar antes de publicar

> Esta seção é **interna** e não vai para o site público — vai ser removida ao publicar.

- [ ] Endereço de e-mail definitivo (`privacy@etus.com.br` é placeholder)
- [x] URL final do endpoint: `otw.etus.dev`
- [x] URL final do site público: `telemetry.etus.dev` (esta política vive em `telemetry.etus.dev/privacy`)
- [x] URL do repositório GitHub do projeto: `github.com/etusdigital/etus-open-telemetry`
- [ ] Revisão jurídica — recomendado antes de produção, especialmente:
  - Cláusula de processador (Cloudflare) — termos do DPA da CF
  - Base legal mencionada (LGPD legítimo interesse vs consentimento — defendemos consentimento via opt-in)
  - Janela de 15 dias úteis para DSR (LGPD permite até 15 dias; GDPR permite 30; vamos com o mais restritivo)
- [ ] Tradução EN revisada por nativo ou ferramenta de qualidade
- [ ] Como expor esta política no site público (parsing do MD ou hand-rolled HTML)
