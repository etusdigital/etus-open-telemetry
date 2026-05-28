import { Hono } from 'hono';
import type { Env } from './env.js';

// API pública de leitura — estilo Homebrew (formulae.brew.sh/api/...).
// Serve os agregados que o aggregator publica em R2 (stats/v1/<product>.json).
// Sem auth (dados públicos), CORS aberto, cacheável.

const app = new Hono<{ Bindings: Env }>();

// Nome de produto seguro: alfanumérico + . _ - ; nunca barras ou `..`.
const PRODUCT_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

const PUBLIC_HEADERS = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=3600',
};

// GET /v1/public/stats — índice dos produtos com stats publicados.
app.get('/stats', async (c) => {
  const listing = await c.env.R2_PUBLIC.list({ prefix: 'stats/v1/' });
  const products = listing.objects
    .filter((o) => o.key.endsWith('.json'))
    .map((o) => {
      const product = o.key
        .replace(/^stats\/v1\//, '')
        .replace(/\.json$/, '');
      return {
        product,
        url: `/v1/public/stats/${product}`,
        updated_at: o.uploaded.toISOString(),
        size_bytes: o.size,
      };
    });

  return c.json(
    {
      schema: 'public-stats-index/v1',
      generated_at: new Date().toISOString(),
      products,
    },
    200,
    PUBLIC_HEADERS,
  );
});

// GET /v1/public/stats/:product — JSON agregado do produto.
app.get('/stats/:product', async (c) => {
  const product = c.req.param('product');
  if (!PRODUCT_RE.test(product)) {
    return c.json({ error: 'invalid_product' }, 400, PUBLIC_HEADERS);
  }

  const obj = await c.env.R2_PUBLIC.get(`stats/v1/${product}.json`);
  if (!obj) {
    return c.json({ error: 'not_found' }, 404, PUBLIC_HEADERS);
  }

  // Repassa o corpo cru do R2 (já é JSON válido produzido pelo aggregator).
  const body = await obj.text();
  return new Response(body, {
    status: 200,
    headers: { ...PUBLIC_HEADERS, 'content-type': 'application/json' },
  });
});

export { app as publicApi };
