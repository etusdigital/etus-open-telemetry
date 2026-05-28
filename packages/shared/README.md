# @etus/telemetry-shared

Utilitários internos compartilhados:
- Hashing pseudonimo (`hash(seed || install_uuid || product)`)
- Buckets (mapeia número exato → faixa publicável)
- Detecção de ambiente (SO, arch, runtime, deployment, CI)
