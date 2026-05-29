import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

// Barra de marca global: logo da ETUS + título + toggle de tema.
export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/etus-logo.png"
            alt="ETUS"
            className="h-8 w-8 rounded-lg shadow-sm"
          />
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            ETUS Open Telemetry
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <nav className="flex gap-5 text-sm text-slate-600 dark:text-slate-400">
            <Link href="/" className="hover:underline">
              visão geral
            </Link>
            <Link href="/registry" className="hover:underline">
              registro
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
