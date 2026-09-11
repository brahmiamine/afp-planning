import { describe, expect, it } from 'vitest';
import {
  canUseWebPush,
  isEmbeddedBrowser,
  isPushServiceUnavailableError,
  subscriptionUsesVapidKey,
} from './web-push-client';

describe('web-push-client', () => {
  it('détecte les navigateurs embarqués sans service push', () => {
    expect(isEmbeddedBrowser('Mozilla/5.0 Electron/33.0.0')).toBe(true);
    expect(isEmbeddedBrowser('Mozilla/5.0 Cursor/1.0')).toBe(true);
    expect(isEmbeddedBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile')).toBe(false);
  });

  it('refuse Web Push hors contexte sécurisé ou dans un navigateur embarqué', () => {
    const mobileChrome = 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile';
    expect(canUseWebPush(mobileChrome, true)).toBe(true);
    expect(canUseWebPush(mobileChrome, false)).toBe(false);
    expect(canUseWebPush('Mozilla/5.0 Electron/33.0.0', true)).toBe(false);
  });

  it('reconnaît l’erreur « push service not available »', () => {
    expect(isPushServiceUnavailableError(new DOMException('Registration failed - push service not available'))).toBe(true);
    expect(isPushServiceUnavailableError(new DOMException('Aborted', 'AbortError'))).toBe(false);
    expect(isPushServiceUnavailableError(new Error('Network error'))).toBe(false);
  });

  it('compare une applicationServerKey avec la clé VAPID publique', () => {
    const publicKey = Buffer.from('vapid-public-key-bytes').toString('base64url');
    const bytes = Uint8Array.from(Buffer.from(publicKey, 'base64url'));
    expect(subscriptionUsesVapidKey(bytes.buffer, publicKey)).toBe(true);
    expect(subscriptionUsesVapidKey(bytes.buffer, 'bbbb')).toBe(false);
    expect(subscriptionUsesVapidKey(null, publicKey)).toBe(false);
  });
});
