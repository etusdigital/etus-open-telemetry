// Acesso ao D1 dentro de Server Components.
// Edge runtime; getRequestContext() vem do adapter Cloudflare Pages.

import { getRequestContext } from '@cloudflare/next-on-pages';

export function db(): D1Database {
  return getRequestContext().env.DB;
}

// Janelas de tempo suportadas no dashboard. URL search param `?window=...`.
export const WINDOW_OPTIONS = ['7d', '30d', '90d', '365d'] as const;
export type WindowOption = (typeof WINDOW_OPTIONS)[number];

export const DEFAULT_WINDOW: WindowOption = '30d';

const WINDOW_DAYS: Record<WindowOption, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

// ============================================================
// Densidade automática: o bucket dos charts depende da janela.
// - Janelas curtas → bucket diário (mais detalhe)
// - Janelas médias → semanal (~13 pontos em 90d)
// - Janelas longas → mensal (~12 pontos em 365d)
// ============================================================
export type BucketGranularity = 'day' | 'week' | 'month';

const WINDOW_BUCKET: Record<WindowOption, BucketGranularity> = {
  '7d': 'day',
  '30d': 'day',
  '90d': 'week',
  '365d': 'month',
};

export function windowBucket(window: WindowOption): BucketGranularity {
  return WINDOW_BUCKET[window];
}

export const BUCKET_LABEL_PT: Record<BucketGranularity, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
};

/** Aceita `string | string[] | undefined` (forma de `searchParams.X`). */
export function parseWindow(raw: string | string[] | undefined): WindowOption {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return WINDOW_OPTIONS.includes(v as WindowOption)
    ? (v as WindowOption)
    : DEFAULT_WINDOW;
}

export function windowStartMs(
  window: WindowOption,
  now = Date.now(),
): number {
  return now - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000;
}

/**
 * Retorna a expressão SQLite para o início do bucket que contém `column`
 * (que deve ser `received_at` em epoch ms). Resultado: string ISO 'YYYY-MM-DD'
 * apontando para o início do bucket (Monday para week, primeiro dia para month).
 *
 * **Não é seguro** contra SQL injection se `bucket` ou `column` vierem de
 * input do usuário — aqui ambos são constantes derivadas de tipos.
 */
export function bucketExpr(column: string, bucket: BucketGranularity): string {
  const ts = `${column}/1000, 'unixepoch'`;
  switch (bucket) {
    case 'day':
      return `date(${ts})`;
    case 'week':
      // Segunda-feira da semana que contém `column`.
      // SQLite `%w`: 0=Dom..6=Sáb. Para Monday-start: subtrai ((%w + 6) % 7) dias.
      return `date(${ts}, '-' || ((cast(strftime('%w', ${ts}) as integer) + 6) % 7) || ' days')`;
    case 'month':
      return `date(${ts}, 'start of month')`;
  }
}

/** Deprecated — manter por compat enquanto migramos chamadores. */
export function activeWindowStart(now = Date.now()): number {
  return windowStartMs(DEFAULT_WINDOW, now);
}
