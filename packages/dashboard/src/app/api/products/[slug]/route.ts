import { NextResponse } from 'next/server';
import {
  actorFromHeaders,
  purgeProduct,
  transitionProduct,
  type ProductAction,
} from '@/lib/admin';

export const runtime = 'edge';

// POST /api/products/:slug — transição de status ou purge.
// Body: { action: 'approve'|'reject'|'disable'|'enable'|'purge', owner?, notes? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = actorFromHeaders(req.headers);

  let body: { action?: ProductAction; owner?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = body.action;

  if (action === 'purge') {
    const purged = await purgeProduct(slug, actor);
    return NextResponse.json({ ok: true, slug, purged });
  }

  if (action === 'approve' || action === 'reject' || action === 'disable' || action === 'enable') {
    const changes = await transitionProduct(slug, action, actor, {
      ...(body.owner ? { owner: body.owner } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    });
    if (changes === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug, action });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
