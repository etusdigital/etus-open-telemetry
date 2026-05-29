# @etus/telemetry-sdk

SDK leve embarcado nas aplicações open source da ETUS para enviar telemetria **opt-in** anônima sobre a instância self-hosted.

> Pacote **self-contained**: zero dependências de runtime além dos built-ins do Node (`crypto`, `fs`, `os`, `path`). ESM + CJS + tipos. Node ≥ 20.

## Instalação

```sh
npm install @etus/telemetry-sdk
# ou: pnpm add @etus/telemetry-sdk
```

## Uso

> **Requer `ETUS_TELEMETRY_ENDPOINT`** (ou `init({ endpoint })`). Sem ele, todos os métodos são no-op silencioso — ver [Endpoint](#endpoint-obrigatório).

```ts
import { telemetry } from '@etus/telemetry-sdk';

// 1. no boot (uma vez) — requer ETUS_TELEMETRY_ENDPOINT, senão vira no-op
const consent = telemetry.init({
  product: 'etus-foo',
  version: '2.4.1',
  optedIn: config.telemetry?.enabled ?? null, // opt-in do operador
});

// 2. a cada 24h
await telemetry.heartbeat({
  database: { engine: 'postgres', version_major: '16' },
  usage: { active_users: 47, messages_sent: 12_034 }, // métricas dinâmicas
  features: { enabled: ['sso'], integrations: ['slack'] },
});

// 3. em transições
await telemetry.lifecycle({
  type: 'upgrade', from_version: '2.3.0', to_version: '2.4.1', feature: null,
});
```

## Endpoint (obrigatório)

**Não há endpoint default.** O destino vem de `init({ endpoint })` ou da env var `ETUS_TELEMETRY_ENDPOINT` (precedência: `init` > env var).

```sh
export ETUS_TELEMETRY_ENDPOINT=https://otw.etus.dev
```

Sem endpoint configurado, o SDK opera em **no-op silencioso**:

- `init()` retorna `{ enabled: false, reason: 'no_endpoint' }`.
- `heartbeat()` e `lifecycle()` não enviam nada e retornam `null`.
- `inspect()` continua funcionando (mostra o payload que *seria* enviado).

Não é erro — é o comportamento esperado quando o operador não definiu para onde enviar.

## Princípios

- **Desligado por padrão.** Só envia com opt-in explícito (`ETUS_TELEMETRY=enabled`, `optedIn: true`, etc.) **e** endpoint configurado. Respeita `DO_NOT_TRACK=1` e desliga em CI.
- **Falha silenciosa.** Nunca lança exceção que afete o app hospedeiro. Retry exponencial e desiste.
- **Anônimo.** `instance.id` é hash+seed local; a seed nunca trafega.

## API

| Método | Descrição |
|---|---|
| `telemetry.init(config)` | Resolve consentimento e prepara estado. Retorna `{ enabled, reason }`. |
| `telemetry.heartbeat(stats?)` | Envia o estado atual. No-op se opt-in off. |
| `telemetry.lifecycle(evt)` | Envia transição (install/upgrade/feature_*). |
| `telemetry.inspect(stats?)` | Retorna o payload que seria enviado, sem enviar. |
| `telemetry.isEnabled()` | `true` se o consentimento está ligado. |

Guia completo de integração (consentimento, referência de campos, exemplos em Express/Fastify/Next.js/Python/Go): [`docs/05-integration-guide.md`](https://github.com/etusdigital/etus-open-telemetry/blob/main/docs/05-integration-guide.md).

Política de privacidade: [`docs/04-privacy-policy.md`](https://github.com/etusdigital/etus-open-telemetry/blob/main/docs/04-privacy-policy.md).
