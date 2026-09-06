export interface GeoPoint {
  lat: number;
  lon: number;
}

export type TravelEstimate =
  | { status: 'ok'; minutes: number; distanceKm: number; source: 'osrm' }
  | { status: 'unavailable'; straightLineKm: number; source: 'unavailable' };

export interface TravelEstimateOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export function validGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.lat === 'number'
    && Number.isFinite(candidate.lat)
    && candidate.lat >= -90
    && candidate.lat <= 90
    && typeof candidate.lon === 'number'
    && Number.isFinite(candidate.lon)
    && candidate.lon >= -180
    && candidate.lon <= 180;
}

export function haversineDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = radians(to.lat - from.lat);
  const dLon = radians(to.lon - from.lon);
  const first = radians(from.lat);
  const second = radians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(first) * Math.cos(second) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function estimateTravelMinutes(
  from: GeoPoint,
  to: GeoPoint,
  options: TravelEstimateOptions = {},
): Promise<TravelEstimate> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? process.env.ROUTING_API_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 1800;
  const straightLineKm = haversineDistanceKm(from, to);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/route/v1/driving/${encodeURIComponent(String(from.lon))},${encodeURIComponent(String(from.lat))};${encodeURIComponent(String(to.lon))},${encodeURIComponent(String(to.lat))}?overview=false&alternatives=false&steps=false`;
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { status: 'unavailable', straightLineKm, source: 'unavailable' };
    const data = await response.json() as { routes?: Array<{ duration?: number; distance?: number }> };
    const route = data.routes?.[0];
    if (!route || !Number.isFinite(route.duration) || !Number.isFinite(route.distance)) {
      return { status: 'unavailable', straightLineKm, source: 'unavailable' };
    }
    return {
      status: 'ok',
      minutes: Math.max(0, Math.round((route.duration ?? 0) / 60)),
      distanceKm: Math.max(0, Math.round(((route.distance ?? 0) / 1000) * 10) / 10),
      source: 'osrm',
    };
  } catch {
    return { status: 'unavailable', straightLineKm, source: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Géocode une adresse ou un lieu via Open-Meteo (même mécanisme que la météo planning).
 * Retourne `null` si le lieu est introuvable ou le service indisponible.
 */
export async function geocodePlace(location: string, options: TravelEstimateOptions = {}): Promise<GeoPoint | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = process.env.OPEN_METEO_GEOCODING_URL?.trim() || 'https://geocoding-api.open-meteo.com/v1/search';
  try {
    const url = new URL(base);
    url.searchParams.set('name', location);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'fr');
    url.searchParams.set('format', 'json');
    const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(3500), cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
    const first = data.results?.[0];
    return first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)
      ? { lat: Number(first.latitude), lon: Number(first.longitude) }
      : null;
  } catch {
    return null;
  }
}

export function travelFitsPreference(estimate: TravelEstimate, maxTravelMinutes: number | null): boolean | null {
  if (maxTravelMinutes === null) return true;
  if (estimate.status !== 'ok') return null;
  return estimate.minutes <= maxTravelMinutes;
}
