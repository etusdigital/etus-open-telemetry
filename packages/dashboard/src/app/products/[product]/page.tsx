import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, StatusSplit } from '@/components/Card';
import { LifecycleTimeline } from '@/components/LifecycleTimeline';
import { MultiLineChart, SingleLineChart } from '@/components/LineChart';
import { WindowPicker } from '@/components/WindowPicker';
import {
  ProductTabs,
  parseProductTab,
  type ProductTab,
} from '@/components/ProductTabs';
import {
  BUCKET_LABEL_PT,
  parseWindow,
  windowBucket,
  type WindowOption,
} from '@/lib/db';
import { cohortForProduct, statusForProduct } from '@/lib/queries';
import {
  activeByDbEnginePerDay,
  activeByDeploymentPerDay,
  activeByOsPerDay,
  activeByVersionPerDay,
  activeInstancesPerDay,
  discoverUsageMetrics,
  featuresAdoptionPerDay,
  featuresEnabledPerDay,
  installsPerDay,
  integrationsAdoptionPerDay,
  pivotWide,
  recentLifecycle,
  sumMetricPerDay,
} from '@/lib/timeseries';

export const runtime = 'edge';
export const revalidate = 60;

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>;
  searchParams: Promise<{ window?: string | string[]; tab?: string | string[] }>;
}) {
  const { product } = await params;
  const { window: windowRaw, tab: tabRaw } = await searchParams;
  const window = parseWindow(windowRaw);
  const tab = parseProductTab(tabRaw);
  const bucket = windowBucket(window);

  // Existência + header. Barato e sempre necessário.
  const status = await statusForProduct(product);
  if (status.active + status.inactive === 0) notFound();

  const basePath = `/products/${encodeURIComponent(product)}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href={`/?window=${window}`}
        className="text-xs text-slate-500 hover:underline"
      >
        ← overview
      </Link>
      <header className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {product}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Janela ativa: {window} · Agrupamento: {BUCKET_LABEL_PT[bucket]} UTC ·
            Atualização: 60s
          </p>
        </div>
        <WindowPicker
          current={window}
          basePath={basePath}
          extraParams={{ tab }}
        />
      </header>

      <ProductTabs current={tab} basePath={basePath} window={window} />

      {tab === 'overview' ? (
        <OverviewTab product={product} window={window} status={status} />
      ) : null}
      {tab === 'dimensions' ? (
        <DimensionsTab product={product} window={window} />
      ) : null}
      {tab === 'adoption' ? (
        <AdoptionTab product={product} window={window} />
      ) : null}
      {tab === 'timeline' ? (
        <TimelineTab product={product} window={window} />
      ) : null}

      <footer className="mt-12 text-xs text-slate-500">
        Dados agregados a partir de eventos brutos · linhas brutas nunca expostas
      </footer>
    </main>
  );
}

// ============================================================
// Tabs — cada uma roda só as suas queries (Server Components async)
// ============================================================

async function OverviewTab({
  product,
  window,
  status,
}: {
  product: string;
  window: WindowOption;
  status: { active: number; inactive: number };
}) {
  const [cohort, active, metricKeys] = await Promise.all([
    cohortForProduct(product),
    activeInstancesPerDay(product, window),
    discoverUsageMetrics(product, window),
  ]);

  // Métricas de usage são dinâmicas por produto (ADR-0004) — uma série por chave.
  const metricSeries = await Promise.all(
    metricKeys.map((m) => sumMetricPerDay(product, m, window)),
  );

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card title="Status atual" hint="threshold 7d sem eventos">
        <StatusSplit active={status.active} inactive={status.inactive} />
        {cohort.oldest_install_at !== null ? (
          <p className="mt-3 text-xs text-slate-500">
            instância mais antiga (relógio do operador):{' '}
            <time
              dateTime={new Date(cohort.oldest_install_at).toISOString()}
              className="font-mono tabular-nums"
            >
              {new Date(cohort.oldest_install_at).toLocaleDateString('pt-BR')}
            </time>
            {' · '}
            {cohort.with_operator_install}/{cohort.total} com dado disponível
          </p>
        ) : null}
      </Card>
      <Card title="Instâncias ativas" hint="distinct(instance_id) / dia">
        <SingleLineChart data={active} format="int" />
      </Card>
      {metricKeys.map((metric, i) => (
        <Card
          key={metric}
          title={metric}
          hint="soma · último heartbeat / instância / dia"
        >
          <SingleLineChart
            data={metricSeries[i] ?? []}
            format={metric.endsWith('_bytes') ? 'bytes' : 'int'}
          />
        </Card>
      ))}
    </div>
  );
}

async function DimensionsTab({
  product,
  window,
}: {
  product: string;
  window: WindowOption;
}) {
  const [byVersion, byOs, byDeployment, byDbEngine] = await Promise.all([
    activeByVersionPerDay(product, window),
    activeByOsPerDay(product, window),
    activeByDeploymentPerDay(product, window),
    activeByDbEnginePerDay(product, window),
  ]);

  const byVersionWide = pivotWide(byVersion);
  const byOsWide = pivotWide(byOs);
  const byDeploymentWide = pivotWide(byDeployment);
  const byDbEngineWide = pivotWide(byDbEngine);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title="Por versão" hint="instâncias / versão / dia">
        <MultiLineChart
          data={byVersionWide.data}
          seriesNames={byVersionWide.seriesNames}
        />
      </Card>
      <Card title="Por sistema operacional">
        <MultiLineChart data={byOsWide.data} seriesNames={byOsWide.seriesNames} />
      </Card>
      <Card title="Por deployment">
        <MultiLineChart
          data={byDeploymentWide.data}
          seriesNames={byDeploymentWide.seriesNames}
        />
      </Card>
      <Card title="Por engine de banco">
        <MultiLineChart
          data={byDbEngineWide.data}
          seriesNames={byDbEngineWide.seriesNames}
        />
      </Card>
    </div>
  );
}

async function AdoptionTab({
  product,
  window,
}: {
  product: string;
  window: WindowOption;
}) {
  const [features, integrations] = await Promise.all([
    featuresAdoptionPerDay(product, window),
    integrationsAdoptionPerDay(product, window),
  ]);

  const featuresWide = pivotWide(features);
  const integrationsWide = pivotWide(integrations);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title="Features habilitadas">
        <MultiLineChart
          data={featuresWide.data}
          seriesNames={featuresWide.seriesNames}
        />
      </Card>
      <Card title="Integrações habilitadas">
        <MultiLineChart
          data={integrationsWide.data}
          seriesNames={integrationsWide.seriesNames}
        />
      </Card>
    </div>
  );
}

async function TimelineTab({
  product,
  window,
}: {
  product: string;
  window: WindowOption;
}) {
  const [installs, featuresEnabled, lifecycleEvents] = await Promise.all([
    installsPerDay(product, window),
    featuresEnabledPerDay(product, window),
    recentLifecycle(product, window),
  ]);

  const featuresEnabledWide = pivotWide(featuresEnabled);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title="Novas instalações" hint="installs / período">
        <SingleLineChart data={installs} format="int" />
      </Card>
      <Card title="Features ativadas" hint="feature_enabled / período / feature">
        <MultiLineChart
          data={featuresEnabledWide.data}
          seriesNames={featuresEnabledWide.seriesNames}
        />
      </Card>
      <div className="md:col-span-2">
        <Card
          title="Eventos recentes"
          hint={`últimos ${lifecycleEvents.length} eventos`}
        >
          <LifecycleTimeline rows={lifecycleEvents} />
        </Card>
      </div>
    </div>
  );
}
