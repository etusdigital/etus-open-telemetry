import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

// Barra de marca global: logo da Etus + título + toggle de tema.
export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/etus-logo.png"
            alt="Etus"
            className="h-8 w-8 rounded-lg shadow-sm"
          />
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Etus Open Telemetry
          </span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
