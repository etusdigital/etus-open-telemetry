import { Hono } from 'hono';
import { TelemetryEvent } from '@etus/telemetry-schema';
import type { Env } from './env.js';
import { publicApi } from './public.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.text('ok'));

// API pública de leitura (estilo Homebrew): /v1/public/stats[/:product]
app.route('/v1/public', publicApi);

app.post('/v1/events', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = TelemetryEvent.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'invalid_schema', issues: parsed.error.issues },
      400,
    );
  }

  if (
    !isSchemaAccepted(parsed.data.schema_version, c.env.SCHEMA_MIN_VERSION)
  ) {
    return c.json({ error: 'schema_version_unsupported' }, 400);
  }

  // Gate do registro de produtos (ADR-0005): produto 'rejected' é descartado
  // silenciosamente (202 sem enfileirar) — discreto contra typo/spam recorrente.
  // Demais status (pending/approved/disabled/desconhecido) seguem normais.
  const status = await getProductStatus(c.env, parsed.data.product.name);
  if (status === 'rejected') {
    return c.json({ ok: true }, 202);
  }

  await c.env.QUEUE.send({
    event: parsed.data,
    received_at: Date.now(),
  });

  return c.json({ ok: true }, 202);
});

// Cache curto do status por slug. Isolates do Worker são efêmeros — é
// best-effort, evita um SELECT por request na maioria dos casos.
const STATUS_TTL_MS = 60_000;
const statusCache = new Map<string, { status: string | null; exp: number }>();

async function getProductStatus(
  env: Env,
  slug: string,
): Promise<string | null> {
  const now = Date.now();
  const hit = statusCache.get(slug);
  if (hit && hit.exp > now) return hit.status;

  const row = await env.DB.prepare('SELECT status FROM products WHERE slug = ?')
    .bind(slug)
    .first<{ status: string }>();
  const status = row?.status ?? null;
  statusCache.set(slug, { status, exp: now + STATUS_TTL_MS });
  return status;
}

// Exportado para testes (permite limpar o cache entre casos).
export const __test__ = { statusCache };

// Compatível com semver simples X.Y.Z (sem pre-release no MVP).
// Aceita mesmo MAJOR, igual ou superior em MINOR.PATCH.
function isSchemaAccepted(actual: string, min: string): boolean {
  const [aMaj = 0, aMin = 0, aPat = 0] = actual.split('.').map(Number);
  const [mMaj = 0, mMin = 0, mPat = 0] = min.split('.').map(Number);
  if (aMaj !== mMaj) return false;
  if (aMin !== mMin) return aMin > mMin;
  return aPat >= mPat;
}

export { app as ingestorApp };
