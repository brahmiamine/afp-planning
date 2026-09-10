/**
 * Utilitaires pour les appels API
 */

export interface ApiError {
  error: string;
  details?: unknown;
}

/**
 * Certaines routes (ex. publication du planning) renvoient, en plus du message
 * générique, une liste détaillée de blocages ou de violations, sous l'une de ces
 * clés JSON selon la route : `blockers`, `details` ou `violations` (ex.
 * `app/api/matches/[id]/route.ts`). `Error.message` seul ne suffit pas à les
 * afficher : ce type préserve cette liste pour que l'appelant puisse la
 * restituer s'il le souhaite, sans rien changer pour le code existant qui ne
 * lit que `.message`.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

const LEGACY_PLANNING_EVENT_MUTATION_TYPES: Record<string, 'amical' | 'entrainement' | 'plateau'> = {
  '/api/matches-amicaux': 'amical',
  '/api/entrainements': 'entrainement',
  '/api/plateaux': 'plateau',
};

function payloadEventId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>).id;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const id = String(raw).trim();
  return id || null;
}

function canonicalPlanningMutationUrl(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  data?: unknown,
): string {
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  const eventType = LEGACY_PLANNING_EVENT_MUTATION_TYPES[pathname];
  if (!eventType) return url;

  if (method === 'POST') {
    return `/api/planning/events/${eventType}`;
  }

  if (method === 'PUT') {
    const id = payloadEventId(data);
    return id ? `/api/planning/events/${eventType}/${encodeURIComponent(id)}` : url;
  }

  const id = new URLSearchParams(query).get('id')?.trim();
  return id ? `/api/planning/events/${eventType}/${encodeURIComponent(id)}` : url;
}

/**
 * Les anciens écrans transportent déjà `planningRevision` dans les objets événement.
 * Lorsqu'ils passent par la façade canonique, on la promeut en `expectedRevision`
 * afin que la route puisse répondre 409 sur une écriture obsolète plutôt que d'écraser
 * silencieusement une modification concurrente.
 */
function withExpectedRevision(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  if (typeof record.expectedRevision === 'number') return data;
  if (typeof record.planningRevision !== 'number') return data;
  return { ...record, expectedRevision: record.planningRevision };
}

function mutationIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchWithError<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const headers = new Headers(options?.headers);
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    if (!headers.has('Pragma')) {
      headers.set('Pragma', 'no-cache');
    }

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new ApiRequestError(
        errorData.error || 'Une erreur est survenue',
        response.status,
        errorData.blockers ?? errorData.violations ?? errorData.details,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Erreur réseau inconnue');
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  return fetchWithError<T>(url, { method: 'GET' });
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const routedUrl = canonicalPlanningMutationUrl(url, 'POST', data);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (routedUrl !== url) {
    // Un même HTTP POST rejoué par la couche réseau conserve cette clé ; le serveur
    // canonique peut alors renvoyer le résultat déjà créé au lieu de dupliquer l'événement.
    headers['Idempotency-Key'] = mutationIdempotencyKey();
  }
  return fetchWithError<T>(routedUrl, {
    method: 'POST',
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut<T>(url: string, data: unknown): Promise<T> {
  const routedData = withExpectedRevision(data);
  return fetchWithError<T>(canonicalPlanningMutationUrl(url, 'PUT', routedData), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(routedData),
  });
}

export async function apiPatch<T>(url: string, data: unknown): Promise<T> {
  return fetchWithError<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function apiDelete<T>(url: string): Promise<T> {
  return fetchWithError<T>(canonicalPlanningMutationUrl(url, 'DELETE'), { method: 'DELETE' });
}
