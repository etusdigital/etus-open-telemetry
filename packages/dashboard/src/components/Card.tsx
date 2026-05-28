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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          {title}
        </h2>
        {hint ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
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
      <span className="text-5xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value.toLocaleString('pt-BR')}
      </span>
      <span className="text-xs uppercase tracking-wider text-zinc-500">
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
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          ativas
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-bold tabular-nums text-zinc-500 dark:text-zinc-500">
          {inactive.toLocaleString('pt-BR')}
        </span>
        <span className="text-xs uppercase tracking-wider text-zinc-500">
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
      <p className="text-sm text-zinc-500 dark:text-zinc-500">Sem dados.</p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
          <th className="pb-2 font-normal">{labelHeader}</th>
          <th className="pb-2 font-normal text-right">Instâncias</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const labelNode = (
            <div className="flex items-center gap-2">
              <span className="text-zinc-900 dark:text-zinc-50">{r.label}</span>
              {r.sublabel ? (
                <span className="text-xs text-zinc-500">{r.sublabel}</span>
              ) : null}
            </div>
          );
          return (
            <tr
              key={`${r.label}-${r.sublabel ?? ''}-${i}`}
              className="border-t border-zinc-100 dark:border-zinc-900"
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
                  className="mt-1 h-1 rounded bg-zinc-900/80 dark:bg-zinc-50/80"
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
