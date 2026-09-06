import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, fetchWithError } from './api';

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => body,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithError', () => {
  it('captures blockers when present', async () => {
    mockFetchOnce(409, { error: 'Incomplet', blockers: [{ code: 'missing-arbitre' }] });
    await expect(fetchWithError('/x')).rejects.toMatchObject({
      message: 'Incomplet',
      status: 409,
      details: [{ code: 'missing-arbitre' }],
    });
  });

  it('falls back to violations when there are no blockers', async () => {
    mockFetchOnce(422, { error: 'Invalide', violations: [{ code: 'unknown-person' }] });
    const error = await fetchWithError('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).details).toEqual([{ code: 'unknown-person' }]);
  });

  it('falls back to details when there are neither blockers nor violations', async () => {
    mockFetchOnce(400, { error: 'Mauvaise requête', details: { field: 'nom' } });
    const error = await fetchWithError('/x').catch((e) => e);
    expect((error as ApiRequestError).details).toEqual({ field: 'nom' });
  });
});
