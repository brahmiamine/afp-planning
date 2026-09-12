import { describe, expect, it, vi } from 'vitest';
import { fetchSportCoricoMatch, parseSportCoricoMatchApiResponse, sportCoricoMatchApiUrl } from './sportcorico-api.client';

describe('parseSportCoricoMatchApiResponse', () => {
  it('refuse un JSON sans objet match', () => {
    expect(() => parseSportCoricoMatchApiResponse({}, 'demo-slug')).toThrow(
      'Réponse SportCorico invalide pour demo-slug',
    );
    expect(() => parseSportCoricoMatchApiResponse({ match: {} }, 'demo-slug')).toThrow(
      'Réponse SportCorico invalide pour demo-slug',
    );
  });
});

describe('fetchSportCoricoMatch', () => {
  it('retourne le match API quand la réponse est valide', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      match: {
        id: 5710278,
        slug: 'demo-slug',
        home_team_name: 'Afp 18 Seniors 1',
        outside_team_name: 'CA de Paris 14 Seniors 1',
      },
    }), { status: 200 }));

    await expect(fetchSportCoricoMatch('demo-slug', fetchImpl)).resolves.toMatchObject({
      id: 5710278,
      slug: 'demo-slug',
    });
    expect(fetchImpl).toHaveBeenCalledWith(sportCoricoMatchApiUrl('demo-slug'), {
      headers: { Accept: 'application/json' },
    });
  });

  it('signale une erreur explicite sur un 404', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => new Response('missing', { status: 404 }));
    await expect(fetchSportCoricoMatch('missing-slug', fetchImpl)).rejects.toThrow(
      'SportCorico API 404 pour missing-slug',
    );
  });

  it('signale une erreur explicite quand le JSON est invalide', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => new Response('{', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(fetchSportCoricoMatch('broken-slug', fetchImpl)).rejects.toThrow(
      'Réponse SportCorico invalide pour broken-slug',
    );
  });
});
