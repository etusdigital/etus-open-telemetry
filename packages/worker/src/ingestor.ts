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

  await c.env.QUEUE.send({
    event: parsed.data,
    received_at: Date.now(),
  });

  return c.json({ ok: true }, 202);
});

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
