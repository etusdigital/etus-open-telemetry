import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Edge runtime não suporta node:fs. Página de privacidade é estática:
// lemos o MD em build time e o conteúdo vira parte do bundle.
export const dynamic = 'force-static';

async function loadPolicy(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const policyPath = resolve(here, '../../../../../docs/04-privacy-policy.md');
  const raw = await readFile(policyPath, 'utf8');
  // Remove a seção interna "Pontos a confirmar" antes de publicar.
  const internalMark = '## Pontos a confirmar antes de publicar';
  const idx = raw.indexOf(internalMark);
  return idx === -1 ? raw : raw.slice(0, idx).trimEnd();
}

export default async function PrivacyPage() {
  const policy = await loadPolicy();
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-mono prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{policy}</ReactMarkdown>
      </article>
    </main>
  );
}
