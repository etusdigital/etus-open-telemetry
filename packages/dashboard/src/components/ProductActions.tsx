'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Action = 'approve' | 'reject' | 'disable' | 'enable' | 'purge';

const BTN: Record<Action, { label: string; cls: string }> = {
  approve: { label: 'Aprovar', cls: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  reject: { label: 'Rejeitar', cls: 'bg-amber-600 hover:bg-amber-500 text-white' },
  disable: { label: 'Desativar', cls: 'bg-slate-600 hover:bg-slate-500 text-white' },
  enable: { label: 'Reativar', cls: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  purge: { label: 'Purgar', cls: 'bg-red-700 hover:bg-red-600 text-white' },
};

// Botões disponíveis por status atual do produto.
const ACTIONS_FOR: Record<string, Action[]> = {
  pending: ['approve', 'reject'],
  approved: ['disable'],
  disabled: ['enable', 'purge'],
  rejected: ['approve', 'purge'],
};

export function ProductActions({ slug, status }: { slug: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const actions = ACTIONS_FOR[status] ?? [];

  async function run(action: Action) {
    if (action === 'purge') {
      const ok = window.confirm(
        `Purgar "${slug}"? Isso APAGA todos os eventos, instâncias, rollups e o JSON público. Irreversível.`,
      );
      if (!ok) return;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(`Erro: ${e.error ?? res.status}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a}
          onClick={() => run(a)}
          disabled={busy !== null}
          className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${BTN[a].cls}`}
        >
          {busy === a ? '…' : BTN[a].label}
        </button>
      ))}
    </div>
  );
}
