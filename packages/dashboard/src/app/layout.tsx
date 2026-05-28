import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Etus Open Telemetry — Dashboard',
  description: 'Adoption metrics for Etus open source projects',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
