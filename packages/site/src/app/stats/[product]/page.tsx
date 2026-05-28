import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const revalidate = 300;

interface VersionRow {
  version: string;
  active_instances: number;
}

interface ProductStats {
  product: string;
  generated_at: string;
  day: string;
  schema: string;
  '30d'?: { by_version: VersionRow[] };
  '90d'?: { by_version: VersionRow[] };
  '365d'?: { by_version: VersionRow[] };
}

async function loadProductStats(product: string): Promise<ProductStats | null> {
  const { env } = getRequestContext();
  const key = `stats/v1/${product}.json`;
  const obj = await env.R2_PUBLIC.get(key);
  if (!obj) return null;
  const raw = await obj.text();
  return JSON.parse(raw) as ProductStats;
}

export default async function ProductStatsPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product } = await params;
  const stats = await loadProductStats(product);
  if (!stats) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/stats" className="text-xs text-slate-500 hover:underline">
        ← todos os produtos
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">
        {stats.product}
      </h1>
      <p className="mt-1 text-xs text-slate-500">
        gerado em {new Date(stats.generated_at).toLocaleString('pt-BR')} ·
        schema {stats.schema}
      </p>

      <div className="mt-8 grid gap-6">
        {(['30d', '90d', '365d'] as const).map((range) => {
          const block = stats[range];
          if (!block) return null;
          return (
            <section
              key={range}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Últimos {range} — por versão
              </h2>
              {block.by_version.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Sem dados.</p>
              ) : (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 font-normal">Versão</th>
                      <th className="pb-2 font-normal text-right">Instâncias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.by_version.map((r) => (
                      <tr
                        key={r.version}
                        className="border-t border-slate-100 dark:border-slate-900"
                      >
                        <td className="py-2">{r.version}</td>
                        <td className="py-2 text-right font-bold tabular-nums">
                          {r.active_instances.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
