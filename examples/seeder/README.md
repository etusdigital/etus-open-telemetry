# @etus/seeder

Dev tool. Sintetiza heartbeats + lifecycle events variados no D1 local para que os line charts do dashboard tenham múltiplas séries e janelas longas (até 365d) para renderizar. **Não usar em prod.**

## O que faz

1. **WIPE** — apaga todos os eventos no D1 local
2. Constrói todos os eventos em memória, envia em batches concorrentes (50 simultâneos)
3. Aguarda a Queue drenar (proporcional ao volume)
4. Alinha `received_at = emitted_at` para que as queries do dashboard vejam os eventos distribuídos no tempo

## Fixtures

10 fixtures sintéticas (`src/fixtures.ts`) cobrindo:

- **3 produtos**: `etus-foo`, `etus-bar`, `etus-baz`
- **8 versões** distintas (incluindo versões intermediárias do `version_history`)
- **3 OSes**: linux (maioria), macos, windows
- **2 archs**: x86_64, arm64
- **3 deployments**: docker, kubernetes, native
- **3 db engines**: postgres, mysql, sqlite
- **5 features** possíveis: sso, audit_log, mfa, webhooks, encryption_at_rest
- **4 integrations** possíveis: slack, github, jira, datadog

Cada fixture tem `joined_days_ago` — dias atrás em que a instância "foi instalada". Distribuição:

| Fixture | Idade |
|---|---|
| etus-foo 1.3.0 (legacy mysql) | 360d (oldest) |
| etus-foo 1.5.0 veteranos | 280-320d |
| etus-foo 1.4.2 | 150-200d |
| etus-bar 2.1.0 | 90-120d |
| etus-bar 2.0.0 | 45d |
| etus-baz 0.3.0 | 8-20d (newest) |

Resultado: simula adoção gradual ao longo de ~1 ano. Os charts de janela 365d mostram instâncias entrando ao longo do tempo.

Crescimento de `users` e `storage_bytes` é linear, partindo de ~60-70% do valor base no dia da instalação até 100% hoje. `uptime_days` decai linearmente para trás (no dia da instalação, uptime=0).

## Lifecycle events

Além dos heartbeats, o seeder emite eventos `instance.lifecycle` para cada fixture:

- **1 `install`** no dia exato de `joined_days_ago` — `to_version` = primeira versão do `version_history` ou `fixture.version`
- **N `upgrade`** events (uma por transição em `version_history`) — `from_version`/`to_version` apropriados, no offset da transição
- **1 `feature_enabled`** por feature em `fixture.features`, em um dia determinístico após instalação
- **1 `feature_enabled`** por integração em `fixture.integrations`, idem (mesmo namespace de `feature` na lifecycle por simplicidade do schema)

O dia de cada feature_enabled é derivado de hash determinístico `(idx + nome)` → re-rodar o seeder produz os mesmos timestamps. Total atual: **~36 lifecycle events** (10 installs + 6 upgrades + 20 feature_enabled).

## Version history

Fixtures podem opcionalmente declarar `version_history` — trajetória de versão da instância ao longo do tempo:

```ts
version: '1.5.0',
joined_days_ago: 320,
version_history: [
  { from_days_ago: 320, version: '1.4.0' },  // instalou nesta versão
  { from_days_ago: 200, version: '1.4.2' },  // upgrade aos 200d
  { from_days_ago: 60,  version: '1.5.0' },  // upgrade aos 60d, atual
],
```

Quando presente:
- **Heartbeats** carregam a versão **vigente naquele offset** (não a `version` atual)
- Cada transição vira um `upgrade` lifecycle event
- O `install` event leva a primeira versão do histórico

Sem `version_history`, a instância usa `fixture.version` em todos os heartbeats e o install é registrado com `to_version = fixture.version`.

## Uso

```sh
# aba 1
pnpm --filter @etus/telemetry-worker dev

# aba 2
pnpm --filter @etus/seeder seed

# aba 3
pnpm --filter @etus/telemetry-dashboard dev
# abra http://localhost:3000
```

`instance.id` é determinístico por fixture (hash de seed estável). Re-rodar o seeder produz os mesmos IDs — mas como o passo 1 é wipe, não acumula dados.

## Variáveis

- `ETUS_ENDPOINT` — endpoint do worker. Default `http://localhost:8787`.
- `ETUS_DAYS_BACK` — janela coberta pelo seeder em dias. Default `365`. Use `30` para subir rápido se só quer testar UI.

## Volume

Com defaults (365 dias × 10 fixtures, respeitando `joined_days_ago`): **~1600 heartbeats + 36 lifecycle** distribuídos ao longo do ano.

Tempo de execução em dev local: ~10-15s (concurrent batches + queue drain).

## Limitações conhecidas

- O step de WIPE também limpa `rollup_daily` — vai precisar rodar o cron de novo se quiser dados públicos no R2.
- O alinhamento `received_at = emitted_at` é executado em **todos** os eventos do D1, não só os do seeder. Por design — assume um banco limpo.
- `feature_enabled` e "integration enabled" usam o mesmo lifecycle.type — o schema só tem `feature` como slot livre.
- Não há `feature_disabled` nem `uninstall` events.
- Features ativadas hoje são as mesmas da instalação (não há toggles ao longo do tempo) — cada feature/integração é emitida uma única vez por instância.
