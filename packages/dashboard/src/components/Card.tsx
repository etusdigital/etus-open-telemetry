import type { ReactNode } from 'react';
import Link from 'next/link';

export function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {title}
        </h2>
        {hint ? (
          <span className="text-xs text-slate-500 dark:text-slate-500">
            {hint}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function BigNumber({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-5xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
        {value.toLocaleString('pt-BR')}
      </span>
      <span className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  );
}

export function StatusSplit({
  active,
  inactive,
}: {
  active: number;
  inactive: number;
}) {
  return (
    <div className="flex items-baseline gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {active.toLocaleString('pt-BR')}
        </span>
        <span className="text-xs uppercase tracking-wider text-slate-500">
          ativas
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-bold tabular-nums text-slate-500 dark:text-slate-500">
          {inactive.toLocaleString('pt-BR')}
        </span>
        <span className="text-xs uppercase tracking-wider text-slate-500">
          inativas
        </span>
      </div>
    </div>
  );
}

export function CountTable({
  rows,
  labelHeader,
}: {
  rows: Array<{ label: string; sublabel?: string; value: number; href?: string }>;
  labelHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-500">Sem dados.</p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
          <th className="pb-2 font-normal">{labelHeader}</th>
          <th className="pb-2 font-normal text-right">Instâncias</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const labelNode = (
            <div className="flex items-center gap-2">
              <span className="text-slate-900 dark:text-slate-50">{r.label}</span>
              {r.sublabel ? (
                <span className="text-xs text-slate-500">{r.sublabel}</span>
              ) : null}
            </div>
          );
          return (
            <tr
              key={`${r.label}-${r.sublabel ?? ''}-${i}`}
              className="border-t border-slate-100 dark:border-slate-900"
            >
              <td className="py-2">
                {r.href ? (
                  <Link href={r.href} className="hover:underline">
                    {labelNode}
                  </Link>
                ) : (
                  labelNode
                )}
                <div
                  className="mt-1 h-1 rounded bg-slate-900/80 dark:bg-slate-50/80"
                  style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                />
              </td>
              <td className="py-2 text-right font-bold tabular-nums">
                {r.value.toLocaleString('pt-BR')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
