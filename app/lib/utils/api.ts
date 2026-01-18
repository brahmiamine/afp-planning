/**
 * Utilitaires pour les appels API
 */

/**
 * Type pour les réponses d'erreur API
 */
export interface ApiError {
  error: string;
  details?: unknown;
}

/**
 * Fetch avec gestion d'erreur améliorée
 */
export async function fetchWithError<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    // Ajouter des en-têtes pour éviter le cache
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
      throw new Error(errorData.error || 'Une erreur est survenue');
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erreur réseau inconnue');
  }
}

/**
 * GET request helper
 */
export async function apiGet<T>(url: string): Promise<T> {
  return fetchWithError<T>(url, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return fetchWithError<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T>(url: string, data: unknown): Promise<T> {
  return fetchWithError<T>(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T>(url: string): Promise<T> {
  return fetchWithError<T>(url, { method: 'DELETE' });
}
