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
      className="inline-flex rounded-md border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
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
                ? 'rounded bg-zinc-900 px-3 py-1 font-semibold text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                : 'rounded px-3 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
            }
          >
            {LABELS[w]}
          </Link>
        );
      })}
    </nav>
  );
}
