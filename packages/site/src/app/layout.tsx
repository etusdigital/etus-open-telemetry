import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'ETUS Open Telemetry',
  description:
    'Opt-in telemetry for ETUS open source projects — what we collect, why, and how to control it.',
  icons: {
    icon: '/etus-logo.png',
    apple: '/etus-logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <nav className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
              <Link href="/" className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/etus-logo.png"
                  alt="ETUS"
                  className="h-8 w-8 rounded-lg shadow-sm"
                />
                <span className="font-semibold tracking-tight">
                  ETUS Open Telemetry
                </span>
              </Link>
              <div className="flex items-center gap-5">
                <ul className="flex gap-5 text-sm">
                  <li>
                    <Link href="/privacy" className="hover:underline">
                      privacidade
                    </Link>
                  </li>
                  <li>
                    <Link href="/stats" className="hover:underline">
                      stats
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://github.com/etusdigital/etus-open-telemetry"
                      className="hover:underline"
                      rel="noreferrer"
                    >
                      github
                    </a>
                  </li>
                </ul>
                <ThemeToggle />
              </div>
            </div>
          </nav>
          {children}
          <footer className="mx-auto max-w-4xl px-6 py-12 text-xs text-slate-500">
            opt-in · whitelist · sem PII · hash+seed
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
