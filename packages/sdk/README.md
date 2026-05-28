# @etus/telemetry-sdk

SDK leve embarcado nas aplicações open source da Etus para enviar telemetria **opt-in** anônima sobre a instância self-hosted.

## Princípios

- **Desligado por padrão.** Só envia se o operador da instância der opt-in explícito (env var `ETUS_TELEMETRY=enabled` ou config).
- **Falha silenciosa.** Nunca lança exceção que afete o app hospedeiro.
- **Whitelist estrita.** Só campos listados em `@etus/telemetry-schema` são enviados.

## Uso esperado (rascunho)

```ts
import { telemetry } from '@etus/telemetry-sdk';

telemetry.init({
  product: 'etus-foo',
  version: '2.4.1',
});
```

Mais detalhes em [`../../docs/03-architecture.md`](../../docs/03-architecture.md).
