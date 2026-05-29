import { NextResponse } from 'next/server';
import { actorFromHeaders, purgeInstance } from '@/lib/admin';

export const runtime = 'edge';

// POST /api/instances/:id — purge por instância (DSR LGPD/GDPR).
// Body: { action: 'purge' }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (body.action !== 'purge') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const purged = await purgeInstance(id, actor);
  return NextResponse.json({ ok: true, instance_id: id, purged });
}
