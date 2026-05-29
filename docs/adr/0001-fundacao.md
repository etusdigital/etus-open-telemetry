# ADR-0001 — Decisões Fundacionais

- **Status**: Aceito
- **Data**: 2026-05-27
- **Contexto**: Início do projeto `etus-open-telemetry`, após pesquisa consolidada em [`../01-research.md`](../01-research.md)

## Decisão

Cinco decisões fundacionais ficam firmes a partir deste ADR. Mudá-las exige novo ADR que substitua este.

### 1. Escopo: instrumentação de OSS web auto-hospedáveis da ETUS

O sistema coleta telemetria sobre **instâncias** dos OSS da ETUS que terceiros hospedam, não sobre os usuários finais dessas instâncias.

**Implicação**: nada coletado pode permitir identificar pessoas físicas que usem as instâncias. O "sujeito" da telemetria é a instância, não a pessoa.

**Modelo de referência**: `telemetry.umami.is` do Umami; Plausible CE phone-home; Sentry self-hosted opt-in stats.

### 2. Consentimento: opt-in explícito

Telemetria desligada por padrão. O operador da instância habilita ativamente via env var ou config.

**Por quê**: jurisprudência LGPD/GDPR pede consentimento ativo; opt-out (modelo GitHub CLI 2026) está sob escrutínio na UE; é incoerente com o posicionamento de privacy-first que a ETUS quer projetar.

**Trade-off aceito**: volume de dados menor do que opt-out daria. Compensa pelo posicionamento.

### 3. Construir do zero (SDK + ingestor + storage + dashboard)

Não usar PostHog/Plausible/Umami como backend. Construir os 4 componentes próprios.

**Por quê**:
- Soberania total dos dados.
- Possibilidade de abrir o próprio etus-open-telemetry como OSS (coerência).
- PostHog é overkill (sub-componentes que nunca usaríamos); Plausible/Umami são focados em web analytics, não em telemetria de adoção de OSS.

**Trade-off aceito**: mais esforço inicial. Compensa porque o escopo dos dados coletados é estreito o suficiente para que construir do zero seja factível.

### 4. Stack inicial: TypeScript em todo o estack

| Componente | Stack |
|---|---|
| SDK | TypeScript, publicado em npm |
| Schema | TypeScript (source-of-truth) |
| Ingestor | Fastify (Node + TS) + zod |
| Storage | Postgres + JSONB (MVP); ClickHouse só se virar gargalo |
| Dashboard | Next.js + Tailwind |
| Monorepo | pnpm workspaces |

**Por quê**:
- Stack única reduz custo cognitivo.
- TS no schema → tipos compartilhados entre SDK e ingestor sem regenerar nada.
- Postgres aguenta dezenas de milhões de eventos; complicar com ClickHouse no MVP é prematuro.

**Trade-off aceito**: se os OSS da ETUS não forem em Node/JS, o SDK precisará de portas (Python/Go/Ruby/etc) depois. Decisão revisitável.

**Bloqueador conhecido**: validar com a equipe se faz sentido pra stack dos OSS da ETUS.

### 5. Pseudo-anonimização: hash + seed local, sem possibilidade de des-anonimizar

`instance.id = SHA-256(seed || install_uuid || product_name)` onde `seed` é gerada uma vez por (instância, produto) e nunca sai do disco da instância.

**Por quê**: mesmo num cenário de vazamento total do banco da ETUS, não dá pra correlacionar IDs de volta a instâncias específicas sem acesso ao filesystem delas. Cada produto tem seed própria → mesma instância rodando 2 produtos da ETUS aparece como 2 IDs não-correlacionáveis.

**Trade-off aceito**: não conseguimos detectar instâncias re-instaladas/migradas. É aceitável para o caso de uso.

## Consequências

- Schema de eventos é contrato público versionado ([`docs/02-event-schema.md`](../02-event-schema.md)).
- Política de privacidade pública (futura `docs/04-privacy-policy.md`) tem que espelhar o schema 1:1.
- Toda mudança de campo coletado vira breaking change + bump de `schema_version`.
- O projeto será aberto como OSS no momento certo (após MVP funcional e política publicada).

## Alternativas consideradas

1. **PostHog self-hosted**: rejeitado por complexidade operacional (ClickHouse + Kafka + Postgres + Redis) e por features que não usaríamos (session replay, feature flags).
2. **Plausible/Umami como backend**: rejeitado por serem focados em web analytics, não product/adoption analytics. Faltaria modelo de "instância phone-home".
3. **Opt-out (modelo Next.js/GitHub CLI)**: rejeitado por risco legal LGPD/GDPR e por estar fora do posicionamento.
4. **OpenTelemetry como base**: rejeitado por confusão de escopo (OTel é observabilidade de aplicação, não de adoção).

## Revisitar quando

- A equipe sinalizar que os OSS da ETUS não são compatíveis com SDK em TS.
- Volume de eventos passar de ~100M/mês (revisar Postgres → ClickHouse).
- LGPD/GDPR mudarem materialmente (improvável no curto prazo).
