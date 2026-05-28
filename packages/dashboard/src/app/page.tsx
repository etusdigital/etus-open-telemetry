import {
  activeByDimension,
  activeByProduct,
  activeByVersion,
  instanceStatusByProduct,
  totalActiveInstances,
  totalInstanceStatus,
} from '@/lib/queries';
import { BigNumber, Card, CountTable, StatusSplit } from '@/components/Card';
import { WindowPicker } from '@/components/WindowPicker';
import { parseWindow } from '@/lib/db';

export const runtime = 'edge';
export const revalidate = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const { window: windowRaw } = await searchParams;
  const window = parseWindow(windowRaw);

  const [
    total,
    byProduct,
    byVersion,
    byOs,
    byDeployment,
    statusTotals,
    statusByProduct,
  ] = await Promise.all([
    totalActiveInstances(window),
    activeByProduct(window),
    activeByVersion(window),
    activeByDimension('$.environment.os', window),
    activeByDimension('$.environment.deployment', window),
    totalInstanceStatus(),
    instanceStatusByProduct(),
  ]);

  // Junta status_by_product nos byProduct rows (mesmo product_name)
  const statusMap = new Map(statusByProduct.map((r) => [r.product_name, r]));

  const linkSuffix = `?window=${window}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Visão geral
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Janela ativa: {window}. Atualização: a cada 60s.
          </p>
        </div>
        <WindowPicker current={window} basePath="/" />
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Instâncias ativas" hint={`distinct(instance_id), ${window}`}>
          <BigNumber value={total} label="instâncias" />
        </Card>

        <Card title="Status atual" hint="threshold 7d sem eventos">
          <StatusSplit
            active={statusTotals.active}
            inactive={statusTotals.inactive}
          />
        </Card>

        <Card title="Por produto" hint="clique para line charts">
          <CountTable
            labelHeader="Produto"
            rows={byProduct.map((r) => {
              const s = statusMap.get(r.product_name);
              const sub = s
                ? `${s.active} ativas · ${s.inactive} inativas`
                : undefined;
              return {
                label: r.product_name,
                ...(sub ? { sublabel: sub } : {}),
                value: r.instances,
                href: `/products/${encodeURIComponent(r.product_name)}${linkSuffix}`,
              };
            })}
          />
        </Card>

        <div className="md:col-span-2 lg:col-span-3">
          <Card title="Por versão" hint="produto + versão">
            <CountTable
              labelHeader="Produto/Versão"
              rows={byVersion.map((r) => ({
                label: r.product_name,
                sublabel: r.product_version,
                value: r.instances,
                href: `/products/${encodeURIComponent(r.product_name)}${linkSuffix}`,
              }))}
            />
          </Card>
        </div>

        <Card title="Por sistema operacional">
          <CountTable
            labelHeader="OS"
            rows={byOs.map((r) => ({
              label: r.value,
              sublabel: r.product_name,
              value: r.instances,
              href: `/products/${encodeURIComponent(r.product_name)}${linkSuffix}`,
            }))}
          />
        </Card>

        <div className="md:col-span-1 lg:col-span-2">
          <Card title="Por deployment">
            <CountTable
              labelHeader="Deployment"
              rows={byDeployment.map((r) => ({
                label: r.value,
                sublabel: r.product_name,
                value: r.instances,
                href: `/products/${encodeURIComponent(r.product_name)}${linkSuffix}`,
              }))}
            />
          </Card>
        </div>
      </div>

      <footer className="mt-12 text-xs text-slate-500">
        opt-in telemetry · agregados · linhas brutas nunca expostas
      </footer>
    </main>
  );
}
