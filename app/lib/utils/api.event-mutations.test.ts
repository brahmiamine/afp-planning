import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiPost, apiPut } from './api';

function jsonResponse(body: unknown = { success: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('planning event mutation routing (issue #275)', () => {
  it.each([
    ['/api/matches-amicaux', 'amical'],
    ['/api/entrainements', 'entrainement'],
    ['/api/plateaux', 'plateau'],
  ])('routes POST %s through the canonical planning event collection', async (legacyUrl, eventType) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await apiPost(legacyUrl, { date: '20/09/2026', time: '10:00' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/planning/events/${eventType}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it.each([
    ['/api/matches-amicaux', 'amical'],
    ['/api/entrainements', 'entrainement'],
    ['/api/plateaux', 'plateau'],
  ])('routes PUT %s through the canonical planning event resource', async (legacyUrl, eventType) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await apiPut(legacyUrl, { id: 'event-123', date: '20/09/2026' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/planning/events/${eventType}/event-123`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
  });

  it.each([
    ['/api/matches-amicaux?id=event-123', 'amical'],
    ['/api/entrainements?id=event-123', 'entrainement'],
    ['/api/plateaux?id=event-123', 'plateau'],
  ])('routes DELETE %s through the canonical planning event resource', async (legacyUrl, eventType) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await apiDelete(legacyUrl);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/planning/events/${eventType}/event-123`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
