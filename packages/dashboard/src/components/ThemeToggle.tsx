'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';

type Pref = 'light' | 'system' | 'dark';

// Toggle de 3 estados (light / system / dark), espelhando a referência.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Antes de montar, `theme` é desconhecido no server → render neutro
  // para evitar hydration mismatch.
  const current = (mounted ? theme : undefined) as Pref | undefined;

  const opt = (value: Pref, label: string, icon: ReactNode) => {
    const active = current === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setTheme(value)}
        title={label}
        aria-label={label}
        aria-pressed={active}
        className={[
          'flex h-7 w-7 items-center justify-center rounded transition-colors',
          active
            ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        ].join(' ')}
      >
        {icon}
      </button>
    );
  };

  return (
    <div className="inline-flex gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {opt('light', 'Tema claro', <SunIcon />)}
      {opt('system', 'Tema do sistema', <MonitorIcon />)}
      {opt('dark', 'Tema escuro', <MoonIcon />)}
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
