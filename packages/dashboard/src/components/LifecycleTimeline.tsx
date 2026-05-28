import type { LifecycleRow } from '@/lib/timeseries';

const TYPE_COLOR: Record<string, string> = {
  install: 'bg-emerald-500',
  upgrade: 'bg-amber-500',
  feature_enabled: 'bg-blue-500',
  feature_disabled: 'bg-red-500',
  uninstall: 'bg-slate-500',
};

const TYPE_LABEL: Record<string, string> = {
  install: 'install',
  upgrade: 'upgrade',
  feature_enabled: 'feature on',
  feature_disabled: 'feature off',
  uninstall: 'uninstall',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function describeEvent(r: LifecycleRow): string {
  switch (r.lifecycle_type) {
    case 'install':
      return `→ ${r.to_version ?? r.product_version}`;
    case 'upgrade':
      return `${r.from_version ?? '?'} → ${r.to_version ?? '?'}`;
    case 'feature_enabled':
    case 'feature_disabled':
      return r.feature ?? '?';
    case 'uninstall':
      return r.from_version ?? r.product_version;
    default:
      return '';
  }
}

export function LifecycleTimeline({ rows }: { rows: LifecycleRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-500">
        Nenhum evento lifecycle na janela.
      </p>
    );
  }

  return (
    <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto pr-2 text-sm dark:divide-slate-900">
      {rows.map((r) => (
        <li key={r.event_id} className="flex items-start gap-3 py-2">
          <span
            aria-hidden
            className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
              TYPE_COLOR[r.lifecycle_type] ?? 'bg-slate-400'
            }`}
          />
          <time
            className="w-24 flex-shrink-0 font-mono text-xs tabular-nums text-slate-500"
            dateTime={new Date(r.emitted_at).toISOString()}
          >
            {formatDate(r.emitted_at)}
          </time>
          <span className="w-24 flex-shrink-0 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {TYPE_LABEL[r.lifecycle_type] ?? r.lifecycle_type}
          </span>
          <span className="flex-1 truncate text-slate-900 dark:text-slate-50">
            {describeEvent(r)}
          </span>
        </li>
      ))}
    </ul>
  );
}
