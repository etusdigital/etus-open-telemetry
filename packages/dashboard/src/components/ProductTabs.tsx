import Link from 'next/link';
import { buildHref } from '@/lib/url';

export const PRODUCT_TABS = [
  'overview',
  'dimensions',
  'adoption',
  'timeline',
] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

const LABELS: Record<ProductTab, string> = {
  overview: 'Visão geral',
  dimensions: 'Dimensões',
  adoption: 'Adoção',
  timeline: 'Linha do tempo',
};

export function parseProductTab(
  raw: string | string[] | undefined,
): ProductTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PRODUCT_TABS.includes(v as ProductTab)
    ? (v as ProductTab)
    : 'overview';
}

export function ProductTabs({
  current,
  basePath,
  window,
}: {
  current: ProductTab;
  basePath: string;
  window: string;
}) {
  return (
    <nav
      aria-label="Seções do produto"
      className="mb-8 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
    >
      {PRODUCT_TABS.map((t) => {
        const active = t === current;
        return (
          <Link
            key={t}
            href={buildHref(basePath, { window, tab: t })}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? '-mb-px border-b-2 border-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                : '-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
            }
          >
            {LABELS[t]}
          </Link>
        );
      })}
    </nav>
  );
}
