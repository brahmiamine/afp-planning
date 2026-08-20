import { describe, expect, it } from 'vitest';
import { isTrustedPushEndpoint } from './endpoint';

describe('isTrustedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/example',
    'https://updates.push.services.mozilla.com/wpush/v2/example',
    'https://web.push.apple.com/Q/example',
  ])('accepts a browser push service endpoint: %s', (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/example',
    'https://localhost/internal',
    'https://127.0.0.1/internal',
    'https://169.254.169.254/latest/meta-data',
    'https://example.com/push',
    'not-a-url',
  ])('rejects an untrusted endpoint: %s', (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(false);
  });
});
