// Pseudo-anonimização do instance.id. Ver docs/02-event-schema.md §Pseudo-anon e
// ADR-0001 decisão 5.
//
// Usa Web Crypto (disponível em Node 20+ e em Workers). Retorna base32 lowercase
// dos primeiros 16 bytes do SHA-256 — fica curto sem perder unicidade prática.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

export async function buildInstanceId(
  seed: string,
  installUuid: string,
  productName: string,
): Promise<string> {
  const input = `${seed}|${installUuid}|${productName}`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return base32(new Uint8Array(digest).slice(0, 16));
}

export function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base32(bytes);
}
