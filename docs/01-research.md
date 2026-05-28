# Pesquisa: Telemetria para Projetos Open Source da Etus

> Esta é a versão de referência da pesquisa que originou o projeto.
> Documento vivo — atualizar quando a direção mudar.

## Contexto

A Etus quer construir uma aplicação para registrar o uso de suas soluções open source — com base em consentimento explícito dos usuários. Antes de definir arquitetura, código ou stack, esta etapa mapeou o estado da arte: o que outras ferramentas/projetos OSS já fazem, quais funcionalidades aparecem repetidamente, e quais armadilhas evitar (especialmente em torno de privacidade e LGPD/GDPR).

## 1. Panorama: Dois Mundos de Telemetria

### 1.1. Observabilidade de Infra/Aplicação (OpenTelemetry e cia)
Foco: traces, métricas e logs **de dentro de uma aplicação** rodando em produção. Útil para quem opera o software, não para quem o publica como OSS.

- **OpenTelemetry (OTel)** — padrão CNCF, vendor-neutral, SDKs em 12+ linguagens.
- **Backends**: Jaeger, SigNoz, Uptrace, Grafana Alloy, Logz.io.

**Decisão Etus**: este projeto **não** é sobre OTel. O nome `etus-open-telemetry` significa "telemetria dos OSS da Etus".

### 1.2. Telemetria de Adoção / Uso de OSS (o foco real deste projeto)

| Projeto | O que coletam | Modelo |
|---|---|---|
| Next.js | Comando, nº CPUs, OS, CI flag | Opt-out, anônimo |
| Astro | Comando, máquina, integrações/config | Opt-out, anônimo |
| Nuxt | Versão, build info, módulos usados | Opt-out, hash+seed |
| Homebrew | Install event + fórmula + opções | Opt-out, API pública |
| .NET CLI | Comando, versão, OS, geo aproximado | Opt-out via env var |
| GitHub CLI | Comando + flags | Opt-out (polêmico em 2026) |
| Umami | Heartbeat self-hosted | Opt-out |
| Plausible CE | Heartbeat self-hosted | Opt-out |

**Linha vermelha consensual** (ninguém coleta):
- Variáveis de ambiente, paths, conteúdos de arquivo
- Logs, stack traces brutos
- PII, dados de git remote
- Qualquer coisa que permita re-identificar o usuário

## 2. Funcionalidades Recorrentes

### Coleta (SDK no projeto OSS)
- ID anônimo persistente por instância (UUID local + hash+seed)
- Eventos mínimos: comando/feature invocada, versão da lib, versão do runtime
- Metadados de ambiente: SO, arch, detecção de CI
- Allow-list de propriedades (whitelist)
- Envio assíncrono, fallback silencioso em falha de rede

### Consentimento
- Aviso na primeira execução com link para política
- Comandos: `enable/disable/status/inspect`
- Múltiplos opt-outs: comando, config, env var (`DO_NOT_TRACK=1`)
- Respeitar `CI=true` por padrão
- Inspeção do payload antes de enviar

### Backend
- HTTPS recebendo JSON em batch
- Rate limiting + validação de schema
- Storage event-oriented (ClickHouse é o padrão de facto: PostHog, Plausible, Umami, SigNoz)
- Retenção definida + pseudonimização

### Visualização
- Volumes por versão
- Distribuição por SO/arch/runtime
- Adoção de features
- Retenção (DAU/WAU/MAU)
- API pública opcional (estilo Homebrew)

## 3. Direção Escolhida para o Projeto Etus

- **Alvo de instrumentação**: aplicações web auto-hospedáveis da Etus (modelo Plausible/Umami/Sentry — cada instância self-hosted "telefona para casa").
- **Stack**: construir do zero — SDK embed, ingestor de eventos, storage próprio, dashboard.
- **Consentimento**: **opt-in explícito** (alinhado a LGPD/GDPR).

### Componentes do sistema
1. **SDK embarcado** — biblioteca leve incluída em cada OSS web app da Etus. Lê config (opt-in/off), gera ID anônimo da instância, monta payload, envia em background.
2. **Endpoint de ingestão** — API HTTPS que recebe payloads, valida schema, escreve em storage.
3. **Storage** — banco event-oriented (proposta MVP: Postgres + tabela append-only; eventual migração para ClickHouse).
4. **Dashboard** — painel interno + API pública estilo Homebrew.
5. **Política de privacidade pública** — documenta o schema versionado.

## 4. Considerações de LGPD / GDPR (firmes)

- Opt-in explícito (não opt-out).
- Schema completo público e versionado (modelo Astro/Next).
- Hash + seed no ID anônimo (modelo Nuxt) — protege mesmo em caso de vazamento.
- IDs não correlacionáveis entre projetos OSS diferentes.
- `DO_NOT_TRACK=1` respeitado.
- Por padrão não coletar em ambientes não-interativos (modelo Kong/kongctl).

## Próximos Passos

1. Definir schema de eventos do MVP ← **próximo agora**
2. Decidir stack técnica de cada componente
3. Estruturar o monorepo
4. Prototipar caminho ponta-a-ponta
5. Integrar no primeiro OSS real como piloto
6. Publicar política de privacidade + abrir projeto como OSS

## Fontes

- [Next.js Telemetry](https://nextjs.org/telemetry)
- [Astro Telemetry](https://astro.build/telemetry/)
- [Nuxt Telemetry](https://github.com/nuxt/telemetry)
- [Homebrew Analytics](https://docs.brew.sh/Analytics)
- [.NET CLI Telemetry](https://learn.microsoft.com/en-us/dotnet/core/tools/telemetry)
- [GitHub CLI Telemetry](https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/)
- [Kong/kongctl Privacy-First Design](https://github.com/Kong/kongctl/issues/733)
- [PostHog vs Plausible](https://posthog.com/blog/posthog-vs-plausible)
- [Best Open Source Analytics Tools](https://posthog.com/blog/best-open-source-analytics-tools)
- [Umami](https://github.com/umami-software/umami)
