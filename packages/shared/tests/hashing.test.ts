import { describe, expect, it } from 'vitest';
import { buildInstanceId, generateSeed } from '../src/hashing.js';

describe('buildInstanceId', () => {
  it('is deterministic for the same inputs', async () => {
    const a = await buildInstanceId('seed-x', 'uuid-1', 'etus-foo');
    const b = await buildInstanceId('seed-x', 'uuid-1', 'etus-foo');
    expect(a).toBe(b);
  });

  it('differs when seed changes', async () => {
    const a = await buildInstanceId('seed-1', 'uuid-1', 'etus-foo');
    const b = await buildInstanceId('seed-2', 'uuid-1', 'etus-foo');
    expect(a).not.toBe(b);
  });

  it('differs when install_uuid changes', async () => {
    const a = await buildInstanceId('seed-x', 'uuid-1', 'etus-foo');
    const b = await buildInstanceId('seed-x', 'uuid-2', 'etus-foo');
    expect(a).not.toBe(b);
  });

  it('differs when product name changes (per-product seed property)', async () => {
    const a = await buildInstanceId('seed-x', 'uuid-1', 'etus-foo');
    const b = await buildInstanceId('seed-x', 'uuid-1', 'etus-bar');
    expect(a).not.toBe(b);
  });

  it('returns lowercase base32 with no padding (16 bytes → 26 chars)', async () => {
    const id = await buildInstanceId('seed-x', 'uuid-1', 'etus-foo');
    expect(id).toMatch(/^[a-z2-7]+$/);
    expect(id.length).toBeGreaterThanOrEqual(25);
    expect(id.length).toBeLessThanOrEqual(27);
  });
});

describe('generateSeed', () => {
  it('returns a non-empty base32 string', () => {
    const s = generateSeed();
    expect(s).toMatch(/^[a-z2-7]+$/);
    expect(s.length).toBeGreaterThan(40);
  });

  it('returns different values across calls (overwhelmingly likely)', () => {
    const a = generateSeed();
    const b = generateSeed();
    expect(a).not.toBe(b);
  });
});
