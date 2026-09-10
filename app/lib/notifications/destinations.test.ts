import { describe, expect, it } from 'vitest';
import {
  FALLBACK_PUSH_NOTIFICATION_URL,
  chatRoomHref,
  notificationDestinationHref,
  notificationsInboxHref,
} from './destinations';

describe('notification destinations (issue #321)', () => {
  it('n’utilise jamais la route inexistante /notifications', () => {
    expect(FALLBACK_PUSH_NOTIFICATION_URL).toBe('/club/notifications');
    expect(notificationsInboxHref('club')).toBe('/club/notifications');
    expect(notificationsInboxHref('personal')).toBe('/mon-planning/notifications');
    expect(notificationDestinationHref({ accessRole: 'admin', type: 'generic' })).toBe('/club/notifications');
    expect(notificationDestinationHref({ accessRole: 'dirigeant', type: 'generic' })).toBe('/mon-planning/notifications');
  });

  it('ouvre l’espace événement pour une notification de planning', () => {
    expect(notificationDestinationHref({
      accessRole: 'admin',
      type: 'planning-published-added',
      eventType: 'amical',
      eventId: 'm-1',
    })).toBe('/club/evenements/amical/m-1?from=planning');
    expect(notificationDestinationHref({
      accessRole: 'dirigeant',
      type: 'assignment-created',
      eventType: 'officiel',
      eventId: 'match 1',
    })).toBe('/mon-planning/evenements/officiel/match%201');
  });

  it('ouvre directement le salon pour une notification de chat', () => {
    expect(notificationDestinationHref({
      accessRole: 'admin',
      type: 'chat-dm',
      eventType: 'chat',
      eventId: 'room-abc',
    })).toBe('/club/chat?roomId=room-abc');
    expect(chatRoomHref('personal', 'room-xyz')).toBe('/mon-planning/chat?roomId=room-xyz');
  });
});
