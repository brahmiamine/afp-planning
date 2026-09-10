import { NextResponse, type NextRequest } from 'next/server';
import type { DataSource } from 'typeorm';
import { getClientIp } from '@/lib/auth/client-ip';
import {
  checkLoginRateLimit,
  hashBucketComponent,
  recordFailedLoginAttempt,
} from '@/lib/auth/login-rate-limit';

/** Message unique pour les capability-URLs (issue #381) : ne pas distinguer 429 de 404. */
export const CAPABILITY_TOO_MANY_REQUESTS = 'Trop de requêtes. Réessayez plus tard.';

export function capabilityTooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: CAPABILITY_TOO_MANY_REQUESTS },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export function capabilityIpBucket(routeKey: string, request: NextRequest): string {
  return `${routeKey}:ip:${hashBucketComponent(getClientIp(request))}`;
}

export function capabilityTokenBucket(routeKey: string, token: string): string {
  return `${routeKey}:token:${hashBucketComponent(token)}`;
}

/** Vérifie le verrou IP avant tout travail (même pattern que login #274 / settings #342). */
export async function checkCapabilityIpRateLimit(
  db: DataSource,
  request: NextRequest,
  routeKey: string,
): Promise<NextResponse | null> {
  const limit = await checkLoginRateLimit(db, capabilityIpBucket(routeKey, request));
  if (limit.limited) return capabilityTooManyRequests(limit.retryAfterSeconds!);
  return null;
}

/** Incrémente le compteur IP ; renvoie 429 si un palier est franchi. */
export async function recordCapabilityIpAttempt(
  db: DataSource,
  request: NextRequest,
  routeKey: string,
): Promise<NextResponse | null> {
  const result = await recordFailedLoginAttempt(db, capabilityIpBucket(routeKey, request));
  if (result.limited) return capabilityTooManyRequests(result.retryAfterSeconds!);
  return null;
}

/** Vérifie le verrou token (en plus de l'IP) pour les jetons d'invitation / iCal / share. */
export async function checkCapabilityTokenRateLimit(
  db: DataSource,
  routeKey: string,
  token: string,
): Promise<NextResponse | null> {
  const limit = await checkLoginRateLimit(db, capabilityTokenBucket(routeKey, token));
  if (limit.limited) return capabilityTooManyRequests(limit.retryAfterSeconds!);
  return null;
}

/** Incrémente le compteur token ; renvoie 429 si un palier est franchi. */
export async function recordCapabilityTokenAttempt(
  db: DataSource,
  routeKey: string,
  token: string,
): Promise<NextResponse | null> {
  const result = await recordFailedLoginAttempt(db, capabilityTokenBucket(routeKey, token));
  if (result.limited) return capabilityTooManyRequests(result.retryAfterSeconds!);
  return null;
}
