import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
        Etus Open Telemetry
      </h1>
      <p className="mt-4 max-w-2xl text-zinc-700 dark:text-zinc-300">
        Telemetria <strong>opt-in</strong> e <strong>anônima</strong> dos
        projetos open source da Etus. Coletamos só sobre a instância (versão,
        sistema, features ativas) — nunca sobre quem a usa.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Como ativar</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Telemetria está desligada por padrão. Para ativar:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
            export ETUS_TELEMETRY=enabled
          </pre>
        </section>

        <section className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Como desativar</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            A qualquer momento, uma destas opções:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
            {`export ETUS_TELEMETRY=disabled
# ou o sinal universal:
export DO_NOT_TRACK=1`}
          </pre>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link
          href="/privacy"
          className="rounded border border-zinc-900 px-4 py-2 hover:bg-zinc-900 hover:text-zinc-50 dark:border-zinc-50 dark:hover:bg-zinc-50 dark:hover:text-zinc-900"
        >
          Ler a política completa →
        </Link>
        <Link
          href="/stats"
          className="rounded border border-zinc-300 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Ver estatísticas públicas →
        </Link>
      </div>
    </main>
  );
}
