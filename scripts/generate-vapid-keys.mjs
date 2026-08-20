import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error('Unable to export P-256 VAPID keys');
}

const publicPoint = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicJwk.x, 'base64url'),
  Buffer.from(publicJwk.y, 'base64url'),
]);

console.log(`VAPID_PUBLIC_KEY=${publicPoint.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);
console.log('VAPID_SUBJECT=mailto:admin@example.com');
