import Link from 'next/link';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const revalidate = 300;

interface ProductIndex {
  name: string;
  generated_at: string;
}

async function listProducts(): Promise<ProductIndex[]> {
  const { env } = getRequestContext();
  const listing = await env.R2_PUBLIC.list({ prefix: 'stats/v1/' });
  const out: ProductIndex[] = [];
  for (const obj of listing.objects) {
    const name = obj.key.replace(/^stats\/v1\//, '').replace(/\.json$/, '');
    out.push({ name, generated_at: obj.uploaded.toISOString() });
  }
  return out;
}

export default async function StatsIndex() {
  let products: ProductIndex[] = [];
  let error: string | null = null;
  try {
    products = await listProducts();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
        Estatísticas públicas
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Agregados diários. Atualizados às 03:00 UTC pelo cron do worker.
        Nenhuma linha individual é exposta.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Consumível por máquina via API pública:{' '}
        <a
          href="/v1/public/stats"
          className="font-mono underline hover:text-slate-900 dark:hover:text-slate-50"
        >
          GET /v1/public/stats
        </a>
      </p>

      {error ? (
        <p className="mt-8 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Erro listando R2: {error}
        </p>
      ) : products.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          Ainda não há produtos com estatísticas publicadas. O aggregator
          materializa nos primeiros 03:00 UTC após receber heartbeats.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-slate-200 dark:divide-slate-800">
          {products.map((p) => (
            <li key={p.name} className="py-4">
              <Link
                href={`/stats/${p.name}`}
                className="flex items-baseline justify-between hover:underline"
              >
                <span className="text-lg font-semibold">{p.name}</span>
                <span className="text-xs text-slate-500">
                  atualizado em {new Date(p.generated_at).toLocaleString('pt-BR')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
