/**
 * Utilitaires pour les appels API
 */

export interface ApiError {
  error: string;
  details?: unknown;
}

/**
 * Certaines routes (ex. publication du planning) renvoient, en plus du message
 * générique, une liste détaillée de blocages (`blockers`) ou de violations
 * (`details`). `Error.message` seul ne suffit pas à les afficher : ce type
 * préserve cette liste pour que l'appelant puisse la restituer s'il le souhaite,
 * sans rien changer pour le code existant qui ne lit que `.message`.
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
        errorData.blockers ?? errorData.details,
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
  return fetchWithError<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut<T>(url: string, data: unknown): Promise<T> {
  return fetchWithError<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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
  return fetchWithError<T>(url, { method: 'DELETE' });
}
