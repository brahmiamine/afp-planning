import { describe, expect, it } from 'vitest';
import { PENDING_NOTIFICATION_NAV_TTL_MS, parsePendingNotificationRecord } from './pending-navigation';

describe('parsePendingNotificationRecord', () => {
  it('accepte une URL récente écrite par le service worker', () => {
    const now = 1_700_000_000_000;
    expect(parsePendingNotificationRecord(JSON.stringify({
      url: 'https://club.example/club/chat?roomId=r1',
      at: now - 1_000,
    }), now)).toBe('https://club.example/club/chat?roomId=r1');
  });

  it('ignore une URL trop ancienne pour ne pas rediriger un prochain lancement', () => {
    const now = 1_700_000_000_000;
    expect(parsePendingNotificationRecord(JSON.stringify({
      url: 'https://club.example/club/chat',
      at: now - PENDING_NOTIFICATION_NAV_TTL_MS - 1,
    }), now)).toBeNull();
  });
});
