import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildVapidAuthorization, type VapidConfig } from './vapid';

function createTestConfig(): { config: VapidConfig; publicKeyObject: ReturnType<typeof createPublicKey> } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });

  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    throw new Error('Unable to create test VAPID key');
  }

  const publicPoint = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ]).toString('base64url');

  return {
    config: {
      publicKey: publicPoint,
      privateKey: privateJwk.d,
      subject: 'mailto:test@example.com',
    },
    publicKeyObject: createPublicKey({ key: publicJwk, format: 'jwk' }),
  };
}

describe('buildVapidAuthorization', () => {
  it('creates a valid ES256 VAPID token for the push service origin', () => {
    const { config, publicKeyObject } = createTestConfig();
    const now = new Date('2026-08-20T08:00:00.000Z');
    const authorization = buildVapidAuthorization(
      'https://push.example.test/subscription/123',
      config,
      now,
    );

    expect(authorization.startsWith('vapid t=')).toBe(true);
    expect(authorization.endsWith(`, k=${config.publicKey}`)).toBe(true);

    const token = authorization.slice('vapid t='.length).split(', k=')[0];
    if (!token) throw new Error('Missing VAPID token');

    const tokenParts = token.split('.');
    expect(tokenParts).toHaveLength(3);
    const [headerPart, payloadPart, signaturePart] = tokenParts;
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new Error('Invalid VAPID token');
    }

    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));

    expect(header).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(payload).toEqual({
      aud: 'https://push.example.test',
      exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
      sub: 'mailto:test@example.com',
    });

    expect(
      verify(
        'sha256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        { key: publicKeyObject, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signaturePart, 'base64url'),
      ),
    ).toBe(true);
  });
});
