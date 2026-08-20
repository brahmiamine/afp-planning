import { createPrivateKey, sign } from 'node:crypto';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function createVapidPrivateKey(config: VapidConfig) {
  const publicPoint = decodeBase64Url(config.publicKey);
  const privateScalar = decodeBase64Url(config.privateKey);

  if (publicPoint.length !== 65 || publicPoint[0] !== 4) {
    throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 public key');
  }
  if (privateScalar.length !== 32) {
    throw new Error('VAPID_PRIVATE_KEY must be a 32-byte P-256 private key');
  }

  const x = publicPoint.subarray(1, 33).toString('base64url');
  const y = publicPoint.subarray(33, 65).toString('base64url');

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: privateScalar.toString('base64url'),
    },
    format: 'jwk',
  });
}

export function buildVapidAuthorization(
  endpoint: string,
  config: VapidConfig,
  now = new Date(),
): string {
  const audience = new URL(endpoint).origin;
  const header = encodeBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = encodeBase64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
      sub: config.subject,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsignedToken), {
    key: createVapidPrivateKey(config),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');

  return `vapid t=${unsignedToken}.${signature}, k=${config.publicKey}`;
}
