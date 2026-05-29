import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/admin';

export const runtime = 'edge';

// GET /api/products — lista o registro (para a fila de revisão).
export async function GET() {
  const products = await listProducts();
  return NextResponse.json({ products });
}
