import type { AuthSession, UserRole } from '@/types/auth';
import { isUserRole } from '@/types/auth';

export const AFP_SESSION_COOKIE = 'afp_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET doit contenir au moins 32 caractères');
  }

  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToString(value: string): string {
  return decoder.decode(base64UrlToBytes(value));
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionToken(input: {
  sub: number;
  email: string;
  role: UserRole;
  personId?: number;
  personName?: string;
}): Promise<string> {
  const payload: AuthSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const key = await getHmacKey();
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload)),
  );

  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const [encodedPayload, encodedSignature] = token.split('.');

    if (!encodedPayload || !encodedSignature) {
      return null;
    }

    const key = await getHmacKey();
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload),
    );

    if (!isValid) {
      return null;
    }

    const parsed = JSON.parse(base64UrlToString(encodedPayload)) as Partial<AuthSession>;

    if (
      typeof parsed.sub !== 'number' ||
      typeof parsed.email !== 'string' ||
      !isUserRole(parsed.role) ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      sub: parsed.sub,
      email: parsed.email,
      role: parsed.role,
      ...(typeof parsed.personId === 'number' ? { personId: parsed.personId } : {}),
      ...(typeof parsed.personName === 'string' ? { personName: parsed.personName } : {}),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
