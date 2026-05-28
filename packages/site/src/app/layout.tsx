import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Etus Open Telemetry',
  description:
    'Opt-in telemetry for Etus open source projects — what we collect, why, and how to control it.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-mono antialiased">
        <nav className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-bold">
              etus-open-telemetry
            </Link>
            <ul className="flex gap-6 text-sm">
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
                  href="https://github.com/etus/etus-open-telemetry"
                  className="hover:underline"
                  rel="noreferrer"
                >
                  github
                </a>
              </li>
            </ul>
          </div>
        </nav>
        {children}
        <footer className="mx-auto max-w-4xl px-6 py-12 text-xs text-zinc-500">
          opt-in · whitelist · sem PII · hash+seed
        </footer>
      </body>
    </html>
  );
}
