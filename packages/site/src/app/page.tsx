import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/etus-logo.png"
          alt="ETUS"
          className="h-14 w-14 rounded-xl shadow-sm"
        />
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            ETUS Open Telemetry
          </h1>
          <p className="text-sm text-slate-500">opt-in · anônima · self-hosted</p>
        </div>
      </header>

      <p className="mt-6 max-w-2xl text-lg text-slate-700 dark:text-slate-300">
        Telemetria <strong>opt-in</strong> e <strong>anônima</strong> dos
        projetos open source da ETUS. Coletamos só sobre a instância (versão,
        sistema, features ativas) — nunca sobre quem a usa.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Como ativar
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Telemetria está desligada por padrão. Para ativar:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-100 p-3 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            export ETUS_TELEMETRY=enabled
          </pre>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Como desativar
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            A qualquer momento, uma destas opções:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-100 p-3 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {`export ETUS_TELEMETRY=disabled
# ou o sinal universal:
export DO_NOT_TRACK=1`}
          </pre>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link
          href="/privacy"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-slate-50 transition-colors hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Ler a política completa →
        </Link>
        <Link
          href="/stats"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Ver estatísticas públicas →
        </Link>
      </div>
    </main>
  );
}
