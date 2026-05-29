import { listProducts, type ProductRow } from '@/lib/admin';
import { ProductActions } from '@/components/ProductActions';

export const runtime = 'edge';
export const revalidate = 0;

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  disabled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default async function RegistryPage() {
  const products = await listProducts();
  const pending = products.filter((p) => p.status === 'pending');

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Registro de produtos
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          Produtos só são publicados nos stats públicos após aprovados.
          {pending.length > 0 && (
            <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">
              {pending.length} aguardando revisão.
            </span>
          )}
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Produto</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Visto em</th>
              <th className="px-4 py-2.5">Mudou por</th>
              <th className="px-4 py-2.5">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhum produto ainda.
                </td>
              </tr>
            )}
            {products.map((p: ProductRow) => (
              <tr key={p.slug} className="bg-white dark:bg-slate-950">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  {p.slug}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[p.status] ?? STATUS_STYLE['disabled']
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(p.first_seen_at)}</td>
                <td className="px-4 py-3 text-slate-500">{p.status_changed_by ?? '—'}</td>
                <td className="px-4 py-3">
                  <ProductActions slug={p.slug} status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-8 text-xs text-slate-500">
        purge é irreversível · ações registradas em audit_log · ADR-0005
      </footer>
    </main>
  );
}
