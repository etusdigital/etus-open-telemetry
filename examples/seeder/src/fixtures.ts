// Sintéticos. NÃO usar em produção. NÃO espelha nenhum cliente real.
// Só serve para o dashboard ter dados ricos pra renderizar.

const GB = 1024 ** 3;

export interface Fixture {
  product: string;
  version: string;
  os: 'linux' | 'macos' | 'windows';
  arch: 'x86_64' | 'arm64';
  deployment: 'docker' | 'kubernetes' | 'native';
  is_containerized: boolean;
  runtime: string;
  runtime_version: string;
  db_engine: string;
  db_major: string;
  features: string[];
  integrations: string[];
  /**
   * Métricas de usage — valores BASE (no presente). Chaves variam por produto
   * (ADR-0004): mensageria mede `messages_sent`, CRM mede `active_contacts`...
   * `uptime_days`, se presente, é tratado especial (decai com o offset).
   */
  metrics: Record<string, number>;
  /**
   * Dias atrás em que essa instância foi "instalada". O seeder não emite
   * heartbeats para offsets maiores que isso — simula adoção gradual.
   */
  joined_days_ago: number;
  /**
   * Trajetória de versão da instância ao longo do tempo. Se omitido, a
   * instância usa `version` por toda a vida.
   *  - `{ from_days_ago, version }` — versão entrou em uso nesse offset.
   *  - Primeira entrada: `from_days_ago === joined_days_ago` (versão instalada).
   *  - Última entrada: `version === fixture.version` (versão atual).
   *  - `from_days_ago` decrescente (mais antigo → mais novo).
   */
  version_history?: Array<{ from_days_ago: number; version: string }>;
}

export const FIXTURES: Fixture[] = [
  // === etus-foo — produto principal; métricas: active_users, storage_bytes, uptime_days ===
  // 1. Veterano: instalou 320d atrás em 1.4.0, subiu para 1.4.2, hoje em 1.5.0
  {
    product: 'etus-foo',
    version: '1.5.0',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.12.2',
    db_engine: 'postgres',
    db_major: '16',
    features: ['sso', 'audit_log', 'mfa'],
    integrations: ['slack', 'github'],
    metrics: { active_users: 250, storage_bytes: 12 * GB, uptime_days: 45 },
    joined_days_ago: 320,
    version_history: [
      { from_days_ago: 320, version: '1.4.0' },
      { from_days_ago: 200, version: '1.4.2' },
      { from_days_ago: 60, version: '1.5.0' },
    ],
  },
  // 2. Cluster k8s arm64, subiu 1.4.1 → 1.4.2 → 1.5.0
  {
    product: 'etus-foo',
    version: '1.5.0',
    os: 'linux',
    arch: 'arm64',
    deployment: 'kubernetes',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.12.2',
    db_engine: 'postgres',
    db_major: '16',
    features: ['sso', 'mfa'],
    integrations: ['github', 'datadog'],
    metrics: { active_users: 800, storage_bytes: 45 * GB, uptime_days: 120 },
    joined_days_ago: 280,
    version_history: [
      { from_days_ago: 280, version: '1.4.1' },
      { from_days_ago: 150, version: '1.4.2' },
      { from_days_ago: 30, version: '1.5.0' },
    ],
  },
  // 3. Versão anterior: instalou em 1.4.0, hoje em 1.4.2
  {
    product: 'etus-foo',
    version: '1.4.2',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.11.1',
    db_engine: 'postgres',
    db_major: '15',
    features: ['audit_log'],
    integrations: ['slack'],
    metrics: { active_users: 120, storage_bytes: 6 * GB, uptime_days: 30 },
    joined_days_ago: 200,
    version_history: [
      { from_days_ago: 200, version: '1.4.0' },
      { from_days_ago: 90, version: '1.4.2' },
    ],
  },
  // 4. Dev local em macOS
  {
    product: 'etus-foo',
    version: '1.4.2',
    os: 'macos',
    arch: 'arm64',
    deployment: 'native',
    is_containerized: false,
    runtime: 'node',
    runtime_version: '20.12.0',
    db_engine: 'sqlite',
    db_major: '3',
    features: [],
    integrations: [],
    metrics: { active_users: 5, storage_bytes: Math.round(0.3 * GB), uptime_days: 10 },
    joined_days_ago: 150,
  },
  // 5. Setup legado em MySQL
  {
    product: 'etus-foo',
    version: '1.3.0',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '18.20.4',
    db_engine: 'mysql',
    db_major: '8',
    features: [],
    integrations: [],
    metrics: { active_users: 30, storage_bytes: Math.round(1.5 * GB), uptime_days: 200 },
    joined_days_ago: 360,
  },

  // === etus-bar — mensageria; métricas: messages_sent, active_contacts, uptime_days ===
  // 6. Cliente médio docker
  {
    product: 'etus-bar',
    version: '2.1.0',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.12.2',
    db_engine: 'mysql',
    db_major: '8',
    features: ['webhooks', 'encryption_at_rest'],
    integrations: ['slack', 'jira'],
    metrics: { messages_sent: 95_000, active_contacts: 95, uptime_days: 60 },
    joined_days_ago: 120,
    version_history: [
      { from_days_ago: 120, version: '2.0.0' },
      { from_days_ago: 40, version: '2.1.0' },
    ],
  },
  // 7. Cluster arm64
  {
    product: 'etus-bar',
    version: '2.1.0',
    os: 'linux',
    arch: 'arm64',
    deployment: 'kubernetes',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.12.2',
    db_engine: 'mysql',
    db_major: '8',
    features: ['webhooks'],
    integrations: ['datadog'],
    metrics: { messages_sent: 180_000, active_contacts: 180, uptime_days: 90 },
    joined_days_ago: 90,
  },
  // 8. Versão anterior do etus-bar
  {
    product: 'etus-bar',
    version: '2.0.0',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.11.1',
    db_engine: 'mysql',
    db_major: '8',
    features: [],
    integrations: ['slack'],
    metrics: { messages_sent: 22_000, active_contacts: 22, uptime_days: 15 },
    joined_days_ago: 45,
  },

  // === etus-baz — gerenciador de docs; métricas: documents, storage_bytes ===
  // 9. Adopter inicial
  {
    product: 'etus-baz',
    version: '0.3.0',
    os: 'linux',
    arch: 'x86_64',
    deployment: 'docker',
    is_containerized: true,
    runtime: 'node',
    runtime_version: '20.12.2',
    db_engine: 'postgres',
    db_major: '16',
    features: ['encryption_at_rest'],
    integrations: ['github'],
    metrics: { documents: 800, storage_bytes: Math.round(0.5 * GB) },
    joined_days_ago: 20,
  },
  // 10. Recém-instalado em Windows
  {
    product: 'etus-baz',
    version: '0.3.0',
    os: 'windows',
    arch: 'x86_64',
    deployment: 'native',
    is_containerized: false,
    runtime: 'node',
    runtime_version: '20.12.0',
    db_engine: 'sqlite',
    db_major: '3',
    features: [],
    integrations: [],
    metrics: { documents: 300, storage_bytes: Math.round(0.1 * GB) },
    joined_days_ago: 8,
  },
];
