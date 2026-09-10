import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/push/config', () => {
  it('returns push configuration without authentication', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { enabled: boolean; publicKey: string | null };
    expect(typeof body.enabled).toBe('boolean');
    expect(body.publicKey === null || typeof body.publicKey === 'string').toBe(true);
  });
});
