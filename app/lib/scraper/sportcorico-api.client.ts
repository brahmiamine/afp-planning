import type { SportCoricoMatchApi, SportCoricoMatchApiResponse } from './sportcorico-api.types';

export const SPORTCORICO_API_BASE_URL = 'https://api.sportcorico.com/api';

export function sportCoricoMatchApiUrl(slug: string): string {
  return `${SPORTCORICO_API_BASE_URL}/match/${encodeURIComponent(slug)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isSportCoricoMatchApi(value: unknown): value is SportCoricoMatchApi {
  if (!isRecord(value)) return false;
  return typeof value.id === 'number' && typeof value.slug === 'string' && value.slug.trim().length > 0;
}

export function parseSportCoricoMatchApiResponse(payload: unknown, slug: string): SportCoricoMatchApi {
  if (!isRecord(payload) || !isSportCoricoMatchApi(payload.match)) {
    throw new Error(`Réponse SportCorico invalide pour ${slug}`);
  }
  return payload.match;
}

export async function fetchSportCoricoMatch(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SportCoricoMatchApi> {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    throw new Error('Slug SportCorico manquant');
  }

  const response = await fetchImpl(sportCoricoMatchApiUrl(trimmedSlug), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`SportCorico API ${response.status} pour ${trimmedSlug}`);
  }

  let payload: unknown;
  try {
    payload = await response.json() as SportCoricoMatchApiResponse;
  } catch {
    throw new Error(`Réponse SportCorico invalide pour ${trimmedSlug}`);
  }

  return parseSportCoricoMatchApiResponse(payload, trimmedSlug);
}
