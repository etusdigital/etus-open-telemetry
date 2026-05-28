# Guia de Integração — Para times de produto da Etus

Documento **interno**, voltado para devs que mantêm os OSS web da Etus (`etus-foo`, `etus-bar`, etc.) e querem (ou precisam) integrar o `@etus/telemetry-sdk`.

> **Quem é a audiência aqui:** você, dev de produto. **Quem NÃO é:** o operador que vai rodar o seu produto. Para esse, veja [`04-privacy-policy.md`](04-privacy-policy.md).

---

## Sumário

1. [Quick start](#1-quick-start) — copy-paste em 30 segundos
2. [Quando chamar cada método](#2-quando-chamar-cada-método)
3. [Ativar e desativar (consentimento)](#3-ativar-e-desativar-consentimento) — precedência, valores, mecanismos
4. [Referência de campos — o que pode/deve ser enviado](#4-referência-de-campos--o-que-podedeve-ser-enviado)
5. [Privacy linting — o que NUNCA passar](#5-privacy-linting--o-que-nunca-passar)
6. [Testando sua integração](#6-testando-sua-integração)
7. [Documentação que você deve adicionar no seu produto](#7-documentação-que-você-deve-adicionar-no-seu-produto)
8. [Mudanças no schema — como coordenar](#8-mudanças-no-schema--como-coordenar)
9. [Exemplos de implementação](#9-exemplos-de-implementação) — Express, Fastify, Next.js, serverless, Python, Go
10. [FAQ e armadilhas](#10-faq-e-armadilhas)

---

## 1. Quick start

Instale o SDK:

```sh
pnpm add @etus/telemetry-sdk
```

No boot do seu produto (uma vez):

```ts
import { telemetry } from '@etus/telemetry-sdk';

const consent = telemetry.init({
  product: 'etus-foo',                              // identificador único do seu OSS
  version: process.env.npm_package_version ?? '0.0.0',
  optedIn: configFromOperator.telemetry === 'enabled', // opt-in vindo do config do operador
});

logger.info('telemetry consent:', consent);
// Ex: { enabled: true, reason: 'env_enabled' } ou { enabled: false, reason: 'ci_detected' }
```

No seu scheduler diário:

```ts
await telemetry.heartbeat({
  database: { engine: 'postgres', version_major: '16' },
  usage: {
    // mapa dinâmico — use as métricas do SEU produto (snake_case, inteiro ≥ 0)
    active_users: await countActiveUsers(),
    storage_bytes: await sumStorageUsedBytes(),
    uptime_days: daysSince(processStartedAt),
  },
  features: {
    enabled: Object.keys(enabledFeatures),       // já filtrados pela whitelist!
    integrations: Object.keys(activeIntegrations),
  },
});
```

Em transições importantes:

```ts
await telemetry.lifecycle({
  type: 'upgrade',
  from_version: '1.4.0',
  to_version: '1.5.0',
  feature: null,
});
```

Pronto. Continua nas seções abaixo para fazer direito.

---

## 2. Quando chamar cada método

### `telemetry.init(config)` — **uma vez no boot**

Sempre. Mesmo se o operador não deu opt-in. O `init` é o ponto que **determina o consentimento** e prepara o estado. Se o operador não consentiu, ele simplesmente retorna `{ enabled: false, reason }` e os métodos seguintes viram no-op.

> ⚠️ **Nunca chame `init` mais de uma vez** no ciclo de vida do processo. Se você precisa "resetar" em testes, use `telemetry.__reset()`.

### `telemetry.heartbeat(stats?)` — **uma vez a cada 24h**

O heartbeat carrega o **estado atual** da instância. Recomendação de cadência:

- **Primeira chamada**: 1 a 5 minutos após o boot (não no primeiro instante — dá tempo de a instância "subir" antes de medir uso).
- **Chamadas subsequentes**: a cada 24 horas, com jitter de ±30min para evitar pico exato.

Padrão pronto em [§9](#9-padrões-comuns-prontos-para-copiar).

### `telemetry.lifecycle({ type, ... })` — **eventual**

Dispare em transições significativas. Eventos suportados:

| Type | Quando |
|---|---|
| `install` | Primeira execução após instalar limpo (sem `instance.id` prévio em disco) |
| `upgrade` | Detectou que `current_version > last_known_version` salvo localmente |
| `feature_enabled` | Operador acabou de habilitar uma feature listada na whitelist do seu produto |
| `feature_disabled` | Inverso |
| `uninstall` | Best-effort no shutdown limpo. Pode não chegar (rede caindo, kill -9, etc.) |

### `telemetry.inspect()` — debug / UX de transparência

Retorna o payload que **seria enviado**, sem enviar. Use para:
- Logar no console em modo verbose, se o operador pedir
- Expor num endpoint admin tipo `GET /admin/telemetry/preview`

---

## 3. Ativar e desativar (consentimento)

A LGPD pede consentimento **ativo, livre e informado**. Não basta ter um env var escondido. Esta seção é o contrato completo de como o SDK decide se coleta ou não.

### 3.1 Como o SDK resolve o consentimento (precedência)

Toda decisão acontece dentro de `telemetry.init()`, que retorna `{ enabled, reason }`. A ordem de precedência é **de cima para baixo — o primeiro que casar vence**:

| Ordem | Sinal | Resultado | `reason` |
|---|---|---|---|
| 1 | `DO_NOT_TRACK=1` (ou `true`) | 🔴 desligado | `do_not_track` |
| 2 | Qualquer sinal de CI presente | 🔴 desligado | `ci_detected` |
| 3 | `ETUS_TELEMETRY=disabled` (ou `0`/`false`) | 🔴 desligado | `env_disabled` |
| 4 | `ETUS_TELEMETRY=enabled` (ou `1`/`true`) | 🟢 ligado | `env_enabled` |
| 5 | `optedIn: false` passado ao `init()` | 🔴 desligado | `config_disabled` |
| 6 | `optedIn: true` passado ao `init()` | 🟢 ligado | `config_enabled` |
| 7 | nada definido | 🔴 desligado (padrão) | `default_off` |

**Leitura prática:**
- `DO_NOT_TRACK` e CI **sempre ganham**, mesmo que o operador tenha dado opt-in via config. É proposital: ninguém quer telemetria saindo de pipelines de CI ou de quem sinalizou explicitamente "não me rastreie".
- A env var `ETUS_TELEMETRY` ganha do config do app — permite o operador sobrescrever pontualmente sem mexer no config persistido.
- Sem nenhum sinal, é **desligado**. Opt-in é sempre ativo.

Sinais de CI reconhecidos (qualquer um liga o modo CI): `CI`, `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, `GITLAB_CI`, `BUILDKITE`, `CIRCLECI`, `JENKINS_URL`.

Valores aceitos:
- **Ligar**: `ETUS_TELEMETRY` ∈ `{ enabled, 1, true }`
- **Desligar**: `ETUS_TELEMETRY` ∈ `{ disabled, 0, false }`
- **DO_NOT_TRACK**: `{ 1, true }` desliga

> **Endpoint é obrigatório e não tem default.** Mesmo com consentimento, o SDK só envia se um endpoint estiver resolvido — de `init({ endpoint })` ou da env var **`ETUS_TELEMETRY_ENDPOINT`** (não há valor embutido). Sem endpoint, `init()` retorna `{ enabled: false, reason: 'no_endpoint' }` e `heartbeat`/`lifecycle` viram no-op. Em produção, o operador (ou o deploy do seu produto) define `ETUS_TELEMETRY_ENDPOINT` apontando para o ingestor da Etus.

### 3.2 Os 3 mecanismos de ativação

Seu produto deve suportar **pelo menos os dois primeiros**.

**(a) Variável de ambiente** — resolvida pelo SDK automaticamente, você não escreve código:

```sh
export ETUS_TELEMETRY=enabled
```

**(b) Config do app** — você lê do seu config e passa em `optedIn`:

```yaml
# config.yaml do operador
telemetry:
  enabled: true
```
```ts
telemetry.init({
  product: 'etus-foo',
  version: pkg.version,
  optedIn: config.telemetry?.enabled ?? null,  // null = "não decidido" → cai no default
});
```

**(c) Toggle em runtime** — operador liga/desliga pelo admin. Persiste no config e re-inicializa:

```ts
async function setTelemetry(enabled: boolean) {
  await config.set('telemetry.enabled', enabled);
  telemetry.__reset();
  telemetry.init({ product: 'etus-foo', version: pkg.version, optedIn: enabled });
}
```

> ⚠️ `optedIn` aceita `true | false | null | undefined`. Use **`null`** quando o operador ainda não decidiu — assim o SDK cai no `default_off` em vez de tratar como negativa explícita. Importante se você quiser, no futuro, distinguir "recusou" de "não perguntei ainda".

### 3.3 Os mecanismos de desativação

Qualquer um destes desliga imediatamente (sem reenvio):

```sh
export ETUS_TELEMETRY=disabled    # explícito
export DO_NOT_TRACK=1             # sinal universal, ganha de tudo
```
```ts
telemetry.init({ ..., optedIn: false });   // via config
```

Além disso, **desliga automaticamente** (você não faz nada):
- Em CI (qualquer sinal da lista acima)
- Por padrão, se nada foi configurado

### 3.4 Pedir consentimento no primeiro setup

Se o seu produto tem onboarding ou wizard inicial, **inclua um passo dedicado**. Modelo de copy (PT-BR):

> 📊 **Compartilhar dados de uso anônimos?**
>
> A Etus coleta dados agregados (versão, sistema operacional, número de usuários ativos da sua instância) — **nunca** dados sobre as pessoas que usam o seu sistema. É opt-in: você pode habilitar agora, depois, ou nunca.
>
> [ Saiba mais ] (link para a política pública)
>
> ( ) Habilitar  ( ) Não, obrigado  ( ) Decidir depois

As três opções mapeiam para `optedIn: true`, `optedIn: false`, `optedIn: null`.

### 3.5 Expor controles no admin

Endpoints sugeridos:
- `PUT /admin/telemetry { enabled: true|false }` → chama `setTelemetry()` (3.2c)
- `GET /admin/telemetry/preview` → `telemetry.inspect()` (mostra o payload que sairia)
- `GET /admin/telemetry/status` → `{ enabled: telemetry.isEnabled() }`

### 3.6 Documentar no README do seu produto

Inclua uma seção "Telemetria" no README do `etus-foo`, com link para `https://telemetry.etus.dev/privacy` e exemplos dos mecanismos de ativação/desativação.

---

## 4. Referência de campos — o que pode/deve ser enviado

Esta é a referência completa de cada campo do payload. Schema canônico em [`02-event-schema.md`](02-event-schema.md); aqui está em forma prática, com origem e restrições.

**Legenda da coluna "Origem":**
- 🤖 **SDK** — preenchido automaticamente, você não passa nada
- 👤 **você** — você fornece via argumento de `heartbeat()`/`lifecycle()`
- ⚙️ **config** — vem do `init()`

### 4.1 Envelope (comum a todos os eventos)

Todo evento — heartbeat ou lifecycle — carrega este envelope. **Tudo aqui é 🤖 SDK ou ⚙️ config; você nunca monta o envelope à mão.**

| Campo | Tipo | Origem | Obrigatório | Restrição / valor | Exemplo |
|---|---|---|---|---|---|
| `schema_version` | string (semver) | 🤖 SDK | sim | `CURRENT_SCHEMA_VERSION` da dep | `"1.0.0"` |
| `event` | enum | 🤖 SDK | sim | `instance.heartbeat` \| `instance.lifecycle` | `"instance.heartbeat"` |
| `event_id` | string (UUID v4) | 🤖 SDK | sim | gerado por evento (dedup) | `"5c1e…"` |
| `timestamp` | string (ISO 8601 UTC) | 🤖 SDK | sim | momento da emissão | `"2026-05-28T14:32:00.000Z"` |
| `product.name` | string | ⚙️ config (`init`) | sim | 1–64 chars; identifica seu OSS | `"etus-foo"` |
| `product.version` | string (semver) | ⚙️ config (`init`) | sim | versão instalada | `"2.4.1"` |
| `instance.id` | string (hash) | 🤖 SDK | sim | base32 de SHA-256(seed‖uuid‖product); opaco | `"heapvqcsszbf…"` |
| `instance.first_seen_at` | string (ISO 8601) | 🤖 SDK | sim | quando o opt-in foi ativado | `"2026-01-10T00:00:00.000Z"` |

### 4.2 `environment` (só heartbeat) — 🤖 SDK, override opcional

Você **não precisa passar nada** — o SDK detecta tudo. Override só se necessário (ex: runtime Bun).

| Campo | Tipo | Origem | Obrigatório | Valores aceitos | Exemplo |
|---|---|---|---|---|---|
| `os` | enum | 🤖 SDK | — | `linux` \| `macos` \| `windows` \| `unknown` | `"linux"` |
| `arch` | enum | 🤖 SDK | — | `x86_64` \| `arm64` \| `unknown` | `"arm64"` |
| `runtime` | string | 🤖 SDK (override 👤) | — | max 32 chars | `"node"` |
| `runtime_version` | string | 🤖 SDK (override 👤) | — | max 32 chars | `"20.12.2"` |
| `deployment` | enum | 🤖 SDK | — | `docker` \| `kubernetes` \| `native` \| `unknown` | `"docker"` |
| `is_containerized` | boolean | 🤖 SDK | — | — | `true` |

Override via `heartbeat()`:
```ts
await telemetry.heartbeat({ runtime: 'bun', runtime_version: '1.1.0' /* , ... */ });
```
Os demais campos de `environment` (`os`, `arch`, `deployment`, `is_containerized`) **não são overridáveis** — sempre detectados pelo SDK.

### 4.3 `database` (só heartbeat) — 👤 você

Identifica o engine de persistência. Opcional: omita se não fizer sentido pro seu produto.

| Campo | Tipo | Origem | Obrigatório | Restrição | Exemplo |
|---|---|---|---|---|---|
| `database.engine` | string | 👤 você | — (se enviar `database`, é obrigatório) | enum **por produto** (whitelist); max 32 | `"postgres"` |
| `database.version_major` | string | 👤 você | — (idem) | só major(.minor); max 16 | `"16"` ou `"16.2"` |

```ts
database: { engine: 'postgres', version_major: '16' }
```
`engine` deve ser um valor que **seu produto suporta oficialmente** — coordene a whitelist com o time da telemetria ([§8](#8-mudanças-no-schema--como-coordenar)). Não mande versão patch (`16.2.1`) — só major(.minor), pra evitar fragmentar a análise.

### 4.4 `usage` (só heartbeat) — 👤 você, **mapa dinâmico de métricas**

`usage` é um **mapa aberto** `metric_name → inteiro ≥ 0` ([ADR-0004](adr/0004-usage-dynamic-metrics.md)). Você define as métricas que fazem sentido pro seu produto — não há campos fixos.

| Aspecto | Regra |
|---|---|
| Chave (nome da métrica) | `^[a-z][a-z0-9_]{0,63}$` — snake_case, começa com letra, ≤ 64 chars |
| Valor | inteiro `≥ 0` (sem fracionário/negativo) |
| Quantidade | máx 50 métricas por heartbeat |
| Obrigatório | nenhuma chave; `usage` pode ser omitido ou `{}` |
| Unidade | sufixo `_bytes` → dashboard formata como bytes; senão inteiro |

```ts
// produto de mensageria
usage: {
  messages_sent: await countMessagesSent(),
  active_contacts: await countContacts(),
  uptime_days: Math.floor((Date.now() - startedAt) / 86_400_000),
}

// produto de docs
usage: {
  documents: await countDocuments(),
  storage_bytes: await sumStorageUsedBytes(),  // _bytes → formatado como GB no dashboard
}
```

> **As métricas são decisão sua, de produto.** Defina cada uma claramente (ex: "usuários ativos nos últimos 7 dias") e **documente no README**. Trate os nomes de métrica como a whitelist de features — coordene com o time da telemetria ([§8](#8-mudanças-no-schema--como-coordenar)) para não fragmentar a análise com sinônimos (`users` vs `active_users`).

> ⚠️ Chaves fora do padrão (`"Active Users"`, `"a.b"`, acento) e valores fracionários/negativos são **rejeitados (400)** pelo ingestor. Use snake_case e `Math.floor`/`Math.round`.

### 4.5 `features` (só heartbeat) — 👤 você, **whitelist estrita**

Arrays de strings, cada uma da whitelist do seu produto.

| Campo | Tipo | Origem | Obrigatório | Restrição | Exemplo |
|---|---|---|---|---|---|
| `features.enabled` | string[] | 👤 você | — (se enviar `features`, é obrigatório) | max 64 itens, cada ≤ 64 chars, **whitelist** | `["sso","mfa"]` |
| `features.integrations` | string[] | 👤 você | — (idem) | idem | `["slack","github"]` |

```ts
features: {
  enabled: ['sso', 'audit_log', 'webhooks'],
  integrations: ['slack', 'github', 'jira'],
}
```

> **Nunca passe valores dinâmicos** (ex: nome do webhook configurado, URL do Slack). Só o **fato** de a feature/integração estar habilitada — o nome dela, da whitelist. Cada feature nova exige PR coordenado ([§8](#8-mudanças-no-schema--como-coordenar)).

### 4.6 `lifecycle` (só evento lifecycle) — 👤 você

Passado para `telemetry.lifecycle(...)`.

| Campo | Tipo | Origem | Obrigatório | Valores / restrição | Exemplo |
|---|---|---|---|---|---|
| `type` | enum | 👤 você | sim | `install` \| `upgrade` \| `feature_enabled` \| `feature_disabled` \| `uninstall` | `"upgrade"` |
| `from_version` | string\|null | 👤 você | sim (pode ser `null`) | semver ou `null` | `"1.4.0"` |
| `to_version` | string\|null | 👤 você | sim (pode ser `null`) | semver ou `null` | `"1.5.0"` |
| `feature` | string\|null | 👤 você | sim (pode ser `null`) | whitelist, só em `feature_*`; senão `null` | `"sso"` ou `null` |

Combinações por `type`:

| `type` | `from_version` | `to_version` | `feature` |
|---|---|---|---|
| `install` | `null` | versão instalada | `null` |
| `upgrade` | versão antiga | versão nova | `null` |
| `feature_enabled` | `null` | `null` | nome da feature |
| `feature_disabled` | `null` | `null` | nome da feature |
| `uninstall` | versão atual (ou `null`) | `null` | `null` |

### 4.7 Resumo: o que VOCÊ realmente preenche

De toda a referência acima, o que sai do seu código é só:
- `product.name` + `product.version` → no `init()`
- `database`, `usage`, `features` → no `heartbeat()` (todos opcionais)
- `lifecycle.*` → no `lifecycle()`
- opcionalmente `runtime`/`runtime_version` se não for Node

Todo o resto (envelope, ambiente, hashing do id) é 🤖 SDK.

---

## 5. Privacy linting — o que NUNCA passar

A lista que está em [`04-privacy-policy.md` §3](04-privacy-policy.md) é o contrato com seu operador. Resumindo o que você, dev, **nunca** deve mandar:

- ❌ Nomes ou IDs de usuários, organizações, projetos
- ❌ Emails, telefones, endereços
- ❌ Hostnames, URLs, paths de arquivo
- ❌ Conteúdo de tabelas / linhas / registros
- ❌ Texto de logs, mensagens de erro, stack traces
- ❌ Variáveis de ambiente além das que o SDK lê
- ❌ Identificadores comerciais (license keys, contract IDs)
- ❌ IPs ou rangos

> ✅ **Como o tipo te protege:** os campos do `HeartbeatStats` aceitam só os shapes documentados. Tentar `features.enabled.push(userEmail)` quebra o tipo no TypeScript. Não desabilite o strict mode, não use `as any` no payload.

---

## 6. Testando sua integração

### 6.1 Rodar contra o worker local da telemetria

No repo `etus-open-telemetry`:
```sh
pnpm --filter @etus/telemetry-worker dev
```

No seu produto, aponte o endpoint para localhost:
```sh
ETUS_TELEMETRY=enabled \
  ETUS_TELEMETRY_ENDPOINT=http://localhost:8787 \
  pnpm dev
```

Verificar no D1 local:
```sh
pnpm --filter @etus/telemetry-worker exec wrangler d1 execute etus-telemetry \
  --local --persist-to ../../.wrangler/state \
  --command "SELECT product_name, event_type, product_version, datetime(received_at/1000, 'unixepoch') FROM events ORDER BY received_at DESC LIMIT 10"
```

### 6.2 Inspecionar sem enviar

```ts
const preview = await telemetry.inspect({
  usage: { users: 1, storage_bytes: 0, uptime_days: 0 },
});
console.log(JSON.stringify(preview, null, 2));
```

Útil em testes automatizados: assert que o payload tem (e só tem) os campos esperados.

### 6.3 Testar com opt-in OFF

Confirme que o seu produto **não quebra** quando o opt-in está desligado:

```sh
# default = off
unset ETUS_TELEMETRY
pnpm test
```

A SDK retorna `null` de `heartbeat()` e `lifecycle()` quando o consent é off. Seu código não pode crashar nesse cenário.

### 6.4 Testar em CI

Em CI, o SDK auto-desliga por causa de `CI=true` (ou `GITHUB_ACTIONS`, etc.). Confirme que seus testes passam sem ele:

```ts
it('does not call telemetry endpoint in CI', async () => {
  // mock fetch
  // ... rode seu código
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('telemetry'));
});
```

---

## 7. Documentação que você deve adicionar no seu produto

Cada OSS da Etus que integra telemetria precisa ter:

### 7.1 Seção `## Telemetry` no README do produto

Conteúdo mínimo:
- 1 parágrafo: "esse produto coleta telemetria opt-in. Ver `https://telemetry.etus.dev/privacy`."
- Como ativar (env var + config exemplo)
- Como desativar
- Como inspecionar
- Link para a política pública

### 7.2 Tooltip / link no admin UI

No painel do operador, ao lado da opção "Compartilhar dados anônimos":
- Link "Saiba mais" → política pública
- Botão "Visualizar o que seria enviado" → endpoint `inspect`

### 7.3 Entrada no CHANGELOG

Quando ativar telemetria pela primeira vez **ou** quando o schema mudar, faça uma entrada destacada no CHANGELOG do seu produto:

> ## [1.5.0] - 2026-XX-XX
> ### Added
> - Telemetria opt-in (desligada por padrão). [Política pública](URL) · [Como ativar](README#telemetry)

---

## 8. Mudanças no schema — como coordenar

O schema (`@etus/telemetry-schema`) é **contrato público versionado**. Mudanças seguem semver e exigem coordenação.

### 8.1 Você quer rastrear uma feature nova do seu produto

Ex: `etus-foo` ganhou suporte a SAML e você quer ver quantas instâncias estão usando.

1. **PR no repo `etus-open-telemetry`** atualizando a whitelist de features do seu produto (vai ficar em algum doc/arquivo de allow-list por produto — em definição).
2. A política pública também precisa refletir.
3. Bump de `schema_version` MINOR (campo novo opcional).
4. Após merge, atualize seu produto para enviar o novo valor no `features.enabled`.

### 8.2 Você precisa de um campo novo no envelope

Caso raro. Exige RFC interna + ADR no repo da telemetria + revisão jurídica (porque muda a política pública).

### 8.3 Versão do schema que o seu produto suporta

O SDK carrega a `CURRENT_SCHEMA_VERSION`. Você não precisa se preocupar — é versionada via dep.

---

## 9. Exemplos de implementação

Cada subseção é um cenário diferente. Os blocos `9.1`–`9.2` são utilitários reusados pelos exemplos de framework `9.3`–`9.6`. As seções `9.8`–`9.9` cobrem produtos **fora do Node** (sem SDK, via HTTP cru).

### 9.1 Coletor de stats (reusável)

Separe a coleta de métricas do envio. Esse `getStats` é injetado em todos os exemplos abaixo.

```ts
import type { HeartbeatStats } from '@etus/telemetry-sdk';

const startedAt = Date.now();

export async function getStats(): Promise<HeartbeatStats> {
  return {
    database: { engine: 'postgres', version_major: '16' },
    usage: {
      users: await countActiveUsers(),                       // sua definição
      storage_bytes: await sumStorageUsedBytes(),
      uptime_days: Math.floor((Date.now() - startedAt) / 86_400_000),
    },
    features: {
      enabled: listEnabledFeatures(),                        // só whitelist
      integrations: listActiveIntegrations(),
    },
  };
}
```

### 9.2 Scheduler de heartbeat com jitter

```ts
import { telemetry, type HeartbeatStats } from '@etus/telemetry-sdk';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const JITTER_MS = 60 * 60 * 1000; // ±1h

export function scheduleHeartbeats(getStats: () => Promise<HeartbeatStats>) {
  const tick = async () => {
    try {
      await telemetry.heartbeat(await getStats());
    } catch (err) {
      logger.warn('heartbeat stats collection failed', err); // getStats pode falhar; SDK não
    }
    const next = ONE_DAY_MS + Math.floor((Math.random() - 0.5) * 2 * JITTER_MS);
    setTimeout(tick, next).unref(); // .unref() para não segurar o event loop
  };
  setTimeout(tick, 60_000 + Math.random() * 240_000).unref(); // 1ª chamada em 1–5min
}
```

### 9.3 Express (servidor long-running)

```ts
import express from 'express';
import { telemetry } from '@etus/telemetry-sdk';
import { getStats } from './telemetry-stats';
import { scheduleHeartbeats } from './telemetry-schedule';

const app = express();

// 1. init no boot
const consent = telemetry.init({
  product: 'etus-foo',
  version: pkg.version,
  optedIn: config.telemetry?.enabled ?? null,
});
logger.info('telemetry:', consent);

// 2. agenda heartbeats (no-op interno se consent off)
scheduleHeartbeats(getStats);

// 3. endpoint admin de transparência
app.get('/admin/telemetry/preview', requireAdmin, async (_req, res) => {
  res.json(await telemetry.inspect(await getStats()));
});

app.listen(3000);
```

### 9.4 Fastify (com plugin)

```ts
import Fastify from 'fastify';
import { telemetry } from '@etus/telemetry-sdk';
import { getStats } from './telemetry-stats';
import { scheduleHeartbeats } from './telemetry-schedule';

const fastify = Fastify();

fastify.register(async (instance) => {
  telemetry.init({
    product: 'etus-foo',
    version: pkg.version,
    optedIn: instance.config.telemetry?.enabled ?? null,
  });
  scheduleHeartbeats(getStats);

  instance.get('/admin/telemetry/preview', { preHandler: requireAdmin }, async () =>
    telemetry.inspect(await getStats()),
  );
});

await fastify.listen({ port: 3000 });
```

### 9.5 Next.js self-hosted (`instrumentation.ts`)

Next roda `register()` uma vez no boot do server. Ideal para `init` + scheduler. Note o guard de runtime (não roda no Edge).

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // só no server Node
  const { telemetry } = await import('@etus/telemetry-sdk');
  const { getStats } = await import('./lib/telemetry-stats');
  const { scheduleHeartbeats } = await import('./lib/telemetry-schedule');

  telemetry.init({
    product: 'etus-foo',
    version: process.env.APP_VERSION ?? '0.0.0',
    optedIn: process.env.TELEMETRY_ENABLED === 'true' ? true : null,
  });
  scheduleHeartbeats(getStats);
}
```

### 9.6 Serverless / processo efêmero

Em FaaS (Lambda, Cloud Run com scale-to-zero) **não existe processo de 24h** para o scheduler. Padrão recomendado:

- Dispare o heartbeat por um **cron externo** (EventBridge, Cloud Scheduler) que invoca uma rota dedicada, **não** a cada request:

```ts
// rota /internal/telemetry-tick, chamada 1x/dia pelo cron da sua infra
export async function handler() {
  telemetry.init({ product: 'etus-foo', version: APP_VERSION, optedIn: TELEMETRY_ENABLED });
  await telemetry.heartbeat(await getStats());
}
```

- **Nunca** chame `heartbeat()` no caminho de request normal — geraria um evento por request (ruído + custo). O ingestor não rate-limita por instância.
- O estado (seed/id) precisa de disco persistente. Em FaaS efêmero, monte um volume ou guarde a seed num secret/KV — senão cada cold start vira uma "instância nova".

### 9.7 Detecção de install / upgrade + feature toggle

```ts
// no boot, após init:
const last = await readLastKnownVersion();        // string | null
const current = pkg.version;
if (last === null) {
  await telemetry.lifecycle({ type: 'install', from_version: null, to_version: current, feature: null });
} else if (last !== current) {
  await telemetry.lifecycle({ type: 'upgrade', from_version: last, to_version: current, feature: null });
}
await writeLastKnownVersion(current);

// no toggle de feature:
async function setFeatureEnabled(feature: string, enabled: boolean) {
  await db.features.update({ feature, enabled });
  await telemetry.lifecycle({
    type: enabled ? 'feature_enabled' : 'feature_disabled',
    from_version: null, to_version: null, feature,
  });
}
```

---

### 9.8 Produto em Python (sem SDK, HTTP cru)

Sem SDK Node, você implementa o protocolo na mão. Responsabilidades: **consentimento**, **estado persistente** (seed/id), **payload no formato certo**, **falha silenciosa**.

```python
import os, json, uuid, time, hashlib, base64, secrets, urllib.request
from pathlib import Path

PRODUCT = "etus-foo"
VERSION = "2.4.1"
ENDPOINT = os.environ.get("ETUS_TELEMETRY_ENDPOINT")  # sem default; vazio = não envia
STATE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "etus-telemetry" / f"{PRODUCT}.json"

CI_SIGNALS = ("CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS", "GITLAB_CI",
              "BUILDKITE", "CIRCLECI", "JENKINS_URL")

def consent_enabled(opted_in: bool | None) -> bool:
    if os.environ.get("DO_NOT_TRACK") in ("1", "true"): return False
    if any(os.environ.get(s) for s in CI_SIGNALS): return False
    env = os.environ.get("ETUS_TELEMETRY")
    if env in ("enabled", "1", "true"): return True
    if env in ("disabled", "0", "false"): return False
    return bool(opted_in)

def b32(b: bytes) -> str:  # base32 lowercase sem padding (= alfabeto do SDK)
    return base64.b32encode(b).decode().lower().rstrip("=")

def load_or_init_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    st = {
        "version": 1,
        "seed": b32(secrets.token_bytes(32)),
        "install_uuid": str(uuid.uuid4()),
        "first_seen_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st))
    STATE.chmod(0o600)
    return st

def instance_id(st: dict) -> str:
    raw = f"{st['seed']}|{st['install_uuid']}|{PRODUCT}".encode()
    return b32(hashlib.sha256(raw).digest()[:16])

def send_heartbeat(opted_in: bool | None = None) -> None:
    if not consent_enabled(opted_in) or not ENDPOINT:
        return  # sem consentimento ou sem endpoint → não envia
    st = load_or_init_state()
    payload = {
        "schema_version": "1.0.0",
        "event": "instance.heartbeat",
        "event_id": str(uuid.uuid4()),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "product": {"name": PRODUCT, "version": VERSION},
        "instance": {"id": instance_id(st), "first_seen_at": st["first_seen_at"]},
        "environment": {
            "os": "linux", "arch": "x86_64", "runtime": "python",
            "runtime_version": "3.12", "deployment": "docker", "is_containerized": True,
        },
        "usage": {"users": count_active_users(), "storage_bytes": storage_bytes(), "uptime_days": uptime_days()},
        "features": {"enabled": enabled_features(), "integrations": active_integrations()},
    }
    req = urllib.request.Request(
        f"{ENDPOINT}/v1/events",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"}, method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)   # falha silenciosa
    except Exception:
        pass
```

### 9.9 Produto em Go (sem SDK, HTTP cru)

```go
package telemetry

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"
)

const product = "etus-foo"

var ciSignals = []string{"CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS",
	"GITLAB_CI", "BUILDKITE", "CIRCLECI", "JENKINS_URL"}

// base32 lowercase sem padding (= alfabeto do SDK)
var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

func encode(b []byte) string { return strings.ToLower(b32.EncodeToString(b)) }

func consentEnabled(optedIn bool) bool {
	if v := os.Getenv("DO_NOT_TRACK"); v == "1" || v == "true" {
		return false
	}
	for _, s := range ciSignals {
		if os.Getenv(s) != "" {
			return false
		}
	}
	switch os.Getenv("ETUS_TELEMETRY") {
	case "enabled", "1", "true":
		return true
	case "disabled", "0", "false":
		return false
	}
	return optedIn
}

func instanceID(seed, uuid string) string {
	sum := sha256.Sum256([]byte(seed + "|" + uuid + "|" + product))
	return encode(sum[:16])
}

func newSeed() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return encode(b)
}

func SendHeartbeat(version string, optedIn bool, stats map[string]any) {
	if !consentEnabled(optedIn) {
		return
	}
	st := loadOrInitState() // lê/cria ~/.config/etus-telemetry/<product>.json (seed, install_uuid, first_seen_at), chmod 0600
	payload := map[string]any{
		"schema_version": "1.0.0",
		"event":          "instance.heartbeat",
		"event_id":       newUUIDv4(),
		"timestamp":      time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		"product":        map[string]string{"name": product, "version": version},
		"instance":       map[string]string{"id": instanceID(st.Seed, st.InstallUUID), "first_seen_at": st.FirstSeenAt},
		"environment":    map[string]any{"os": "linux", "arch": "x86_64", "runtime": "go", "runtime_version": "1.22", "deployment": "docker", "is_containerized": true},
		"usage":          stats["usage"],
		"features":       stats["features"],
	}
	body, _ := json.Marshal(payload)
	endpoint := os.Getenv("ETUS_TELEMETRY_ENDPOINT")
	if endpoint == "" {
		return // sem endpoint configurado → não envia (sem default)
	}
	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(endpoint+"/v1/events", "application/json", bytes.NewReader(body))
	if err == nil {
		_ = resp.Body.Close() // falha silenciosa
	}
}
```

> **Algoritmo do `instance.id`** (para qualquer linguagem reproduzir igual ao SDK):
> ```
> seed         = 32 bytes aleatórios → base32 lowercase sem padding
> install_uuid = UUIDv4
> instance.id  = base32_lower( SHA-256( seed + "|" + install_uuid + "|" + product )[:16] )
> ```
> O separador é `|` (pipe). Persista `seed`, `install_uuid` e `first_seen_at` num arquivo `0600` em `$XDG_CONFIG_HOME/etus-telemetry/<product>.json`. A seed **nunca** sai do disco; só o hash trafega.

---

## 10. FAQ e armadilhas

### Meu produto é em Python / Go / Ruby — e agora?

O SDK hoje é **só Node** (TS, distribuído via npm). Se seu produto não é Node, opções:

1. **Sidecar Node** — empacota o SDK como processo separado. Overhead.
2. **Reimplementar o protocolo HTTP** — o `POST /v1/events` é simples, é só montar o payload corretamente. Você é responsável por respeitar o consent, gerar `instance.id` (hash+seed), e fazer falha silenciosa.
3. **Pedir um SDK na sua linguagem** — abra issue no repo `etus-open-telemetry`.

### "Onde gravar o `lastKnownVersion`?"

Use o mesmo dir do SDK: `$XDG_CONFIG_HOME/etus-telemetry/<product>.json`. O SDK não toca em chaves customizadas — você pode adicionar `last_known_version` ao mesmo arquivo (lendo, parseando, escrevendo com permissão `0600`). Ou use outro arquivo no mesmo dir.

### "Posso enviar mais de um heartbeat por dia?"

Tecnicamente sim. O ingestor não rate-limita por instância (só por IP em rate de borda). Mas é **desencorajado** — gera ruído sem ganho analítico. Cron diário com jitter é o suficiente.

### "E se o operador tiver milhares de usuários / mensagens?"

Qualquer métrica em `usage` aceita inteiros grandes (até 2^53, limite seguro de JS). Sem teto de valor. O único limite é **50 métricas distintas** por heartbeat.

### "Quais nomes de métrica posso usar em `usage`?"

Qualquer `snake_case` (`^[a-z][a-z0-9_]{0,63}$`): `active_users`, `messages_sent`, `documents`, `storage_bytes`, etc. Mas **coordene com o time da telemetria** como faz com features — pra não ter `users` num produto e `active_users` em outro medindo a mesma coisa. Sufixo `_bytes` é formatado como bytes no dashboard.

### "O endpoint cai. Meu produto trava?"

Não. O SDK tem retry exponencial (3 tentativas) e depois **falha silenciosamente**. Seu produto nunca para por causa do SDK. Se você suspeitar do contrário, **abra um bug** — é regressão.

### "Como faço meu produto saber se está em CI?"

Não precisa. O SDK já desliga em CI automaticamente (`CI=true`, `GITHUB_ACTIONS`, etc.). Mas se você quiser saber pra sua própria lógica, use o utilitário:

```ts
import { isCi } from '@etus/telemetry-shared';
if (isCi()) skipExpensiveThing();
```

### "Qual o tamanho típico do payload?"

Heartbeat completo: ~1-2 KB. Lifecycle: ~500 B. Sob nenhum cenário razoável passa de 10 KB.

### "Posso desabilitar em dev?"

Sim:
```sh
export ETUS_TELEMETRY=disabled
# ou
export DO_NOT_TRACK=1
```

Ou simplesmente não passe `optedIn: true` no `init()`.

### "Onde está o roadmap da telemetria?"

Issues e milestones do repo `etus-open-telemetry`. Mudanças que afetam você (devs de produto) ganham label `breaking-for-products`.

---

## Checklist final antes de mergear sua integração

- [ ] `telemetry.init()` chamado no boot, **antes** de qualquer `heartbeat`/`lifecycle`
- [ ] `optedIn` vem do config do operador, não está hard-coded `true`
- [ ] Scheduler de heartbeat com jitter, com `unref()`
- [ ] Lifecycle `install` na primeira execução
- [ ] Lifecycle `upgrade` detectado via `lastKnownVersion`
- [ ] Endpoint admin `/admin/telemetry/preview` exposto
- [ ] README do produto tem seção "Telemetry" com link para política pública
- [ ] CHANGELOG anuncia o opt-in destacadamente
- [ ] Testes confirmam que o produto não chama endpoint quando opt-in está OFF
- [ ] Testes confirmam que CI desliga automático
- [ ] `features.enabled` e `features.integrations` só contêm valores da whitelist
- [ ] Nenhum string-livre passado para o SDK

---

## Contato

- Issues sobre o SDK ou integração: repo `etus-open-telemetry`, label `integration`
- Mudança de whitelist de features: repo `etus-open-telemetry`, label `schema-change`
- Política / compliance: time de privacidade da Etus
