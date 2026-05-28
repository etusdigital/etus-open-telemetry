import Link from 'next/link';
import { WINDOW_OPTIONS, type WindowOption } from '@/lib/db';
import { buildHref } from '@/lib/url';

const LABELS: Record<WindowOption, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  '365d': '365 dias',
};

export function WindowPicker({
  current,
  basePath,
  extraParams = {},
}: {
  current: WindowOption;
  basePath: string;
  /** Outros query params a preservar ao trocar de janela (ex: tab). */
  extraParams?: Record<string, string>;
}) {
  return (
    <nav
      aria-label="Janela de tempo"
      className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-xs dark:border-slate-700 dark:bg-slate-900"
    >
      {WINDOW_OPTIONS.map((w) => {
        const active = w === current;
        return (
          <Link
            key={w}
            href={buildHref(basePath, { ...extraParams, window: w })}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded bg-slate-900 px-3 py-1 font-semibold text-slate-50 dark:bg-slate-50 dark:text-slate-900'
                : 'rounded px-3 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
            }
          >
            {LABELS[w]}
          </Link>
        );
      })}
    </nav>
  );
}
