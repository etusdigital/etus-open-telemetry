# ADR-0003 — `usage.*` como inteiros exatos, não buckets

- **Status**: Aceito (refinado depois por [ADR-0004](0004-usage-dynamic-metrics.md), que mudou a *forma* de `usage` mantendo o princípio dos inteiros)
- **Data**: 2026-05-27
- **Substitui**: o trecho do schema MVP que previa buckets em `usage`

## Contexto

O schema MVP original previa três campos em `usage` carregando **buckets discretos**:

```
usage.users_bucket:       '0' | '1' | '2-10' | '10-100' | '100-1k' | '1k-10k' | '10k+'
usage.storage_bucket:     '<100MB' | '100MB-1GB' | '1-10GB' | '10-100GB' | '100GB+'
usage.uptime_days_bucket: '<1' | '1-7' | '7-30' | '30-90' | '90-365' | '365+'
```

A motivação dos buckets era reduzir o risco de re-identificação: número exato de usuários (`47`), bytes de storage e dias de uptime juntos formam uma quase-impressão-digital de cada instância. Buckets dilatam categorias e tornam várias instâncias indistinguíveis.

A equipe pediu para usar inteiros exatos: o ganho de clareza de leitura nos dashboards (ver tamanho real, somar, calcular percentis) supera o risco de re-identificação dado o perfil esperado — **opt-in explícito + baixo volume + ausência de outros identificadores fortes**.

## Decisão

`usage` passa a carregar **inteiros não-negativos exatos**, não buckets:

```
usage.users:         integer ≥ 0    (contagem de usuários ativos)
usage.storage_bytes: integer ≥ 0    (storage usado, em bytes)
usage.uptime_days:   integer ≥ 0    (dias desde o último start)
```

Os enums de bucket e os utilitários de bucketização foram removidos do schema e do pacote shared.

> **Nota histórica:** [ADR-0004](0004-usage-dynamic-metrics.md) depois transformou `usage` de campos fixos num **mapa dinâmico** de métricas por-produto. O que este ADR estabeleceu — *valores são inteiros não-negativos exatos* — continua valendo; o que mudou foi a forma (campos fixos → mapa aberto).

## Trade-offs assumidos

**Perdas**
- **Privacidade por agregação.** Um conjunto de métricas exatas é quase-único e, combinado com `os`/`runtime_version`/`features`, fica plausivelmente único.
- **Resistência a correlação.** Se a instância já é identificável por outro meio (ex.: operador comentou em fórum "rodo a versão X com Y usuários"), os exatos permitem ligar isso à row no banco.

**Ganhos**
- Análise quantitativa real (soma, média, p50/p95).
- Leitura direta nos dashboards (números, não rótulos arbitrários).
- Schema mais simples (sem enum de bucket a versionar).

## Mitigações

1. **`instance.id` opaco** — hash+seed (ADR-0001 §5); sem isso o risco seria muito maior.
2. **Agregador nunca publica linhas brutas** em R2 — só agregados (somas, contagens, percentis por dimensão).
3. **Retenção** de 365 dias nos eventos brutos; agregações ficam mais tempo.
4. **Política de privacidade** explicita que `usage.*` são exatos e por que isso é aceitável dado o opt-in.

## Revisitar quando

- Se houver incidente real de re-identificação ou solicitação LGPD baseada nesses campos → voltar a buckets ou adicionar ruído (differential privacy leve).
- Se o volume crescer ordens de magnitude → os exatos perdem valor relativo e o risco muda.
