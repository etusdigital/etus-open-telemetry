# @etus/dummy-app

App de exemplo. Importa o `@etus/telemetry-sdk`, simula opt-in do operador, envia **um heartbeat** e termina. Serve para validar o fluxo ponta-a-ponta:

```
SDK → Worker (HTTP) → Queue → Persistor → D1
```

## Rodar

Em uma aba, com migrations já aplicadas:

```sh
pnpm --filter @etus/telemetry-worker dev
```

Em outra aba:

```sh
pnpm --filter @etus/dummy-app send
```

Para conferir que chegou no D1:

```sh
pnpm --filter @etus/telemetry-worker wrangler d1 execute etus-telemetry --local \
  --command "SELECT event_id, event_type, product_name, product_version, datetime(received_at/1000, 'unixepoch') FROM events"
```
