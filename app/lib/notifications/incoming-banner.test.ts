import { describe, expect, it } from 'vitest';
import {
  INCOMING_NOTIFICATION_SW_TYPE,
  incomingBannerFromChatMessage,
  incomingBannerFromChatReaction,
  incomingBannerFromPushPayload,
  previewIncomingMessage,
  setActiveChatRoomId,
  shouldSuppressIncomingBanner,
} from './incoming-banner';

describe('incoming banners', () => {
  it('tronque le texte et gère les pièces jointes', () => {
    expect(previewIncomingMessage('Salut', false)).toBe('Salut');
    expect(previewIncomingMessage('', true)).toBe('Pièce jointe');
    expect(previewIncomingMessage('x'.repeat(200), false).endsWith('…')).toBe(true);
  });

  it('ignore les messages supprimés et construit un bandeau chat', () => {
    expect(incomingBannerFromChatMessage({
      id: 'm1',
      roomId: 'room-1',
      senderUserId: 2,
      senderName: 'Alice',
      content: 'Coucou',
      deletedAt: '2026-09-11T10:00:00.000Z',
    }, '/club/chat?roomId=room-1')).toBeNull();

    expect(incomingBannerFromChatMessage({
      id: 'm2',
      roomId: 'room-1',
      senderUserId: 2,
      senderName: 'Alice',
      content: 'Coucou',
    }, '/club/chat?roomId=room-1')).toEqual({
      id: 'chat:m2',
      title: 'Alice',
      body: 'Coucou',
      href: '/club/chat?roomId=room-1',
      roomId: 'room-1',
    });
  });

  it('construit un bandeau pour une réaction ajoutée', () => {
    expect(incomingBannerFromChatReaction({
      roomId: 'room-1',
      messageId: 'm2',
      actorUserId: 3,
      actorName: 'Bob',
      emoji: '❤️',
      added: false,
      preview: 'Coucou',
    }, '/club/chat?roomId=room-1')).toBeNull();

    expect(incomingBannerFromChatReaction({
      roomId: 'room-1',
      messageId: 'm2',
      actorUserId: 3,
      actorName: 'Bob',
      emoji: '❤️',
      added: true,
      preview: 'Coucou',
    }, '/club/chat?roomId=room-1')).toEqual({
      id: 'chat-reaction:m2:❤️:3',
      title: 'Bob a réagi avec ❤️',
      body: 'Coucou',
      href: '/club/chat?roomId=room-1',
      roomId: 'room-1',
    });
  });

  it('lit un payload service worker et ignore le reste', () => {
    expect(incomingBannerFromPushPayload({ type: 'other', title: 'X', url: '/club' })).toBeNull();
    expect(incomingBannerFromPushPayload({
      type: INCOMING_NOTIFICATION_SW_TYPE,
      title: 'Message de Bob',
      body: 'On se voit ?',
      url: 'https://club.example/club/chat?roomId=r1',
      notificationId: 'n-1',
    })).toEqual({
      id: 'n-1',
      title: 'Message de Bob',
      body: 'On se voit ?',
      href: 'https://club.example/club/chat?roomId=r1',
      icon: undefined,
    });
  });

  it('masque le bandeau pour ses propres messages et la conversation déjà ouverte', () => {
    setActiveChatRoomId(null);
    expect(shouldSuppressIncomingBanner({
      id: 'chat:m',
      title: 'Moi',
      body: 'x',
      href: '/club/chat?roomId=r1',
      roomId: 'r1',
    }, 1, 1)).toBe(true);

    setActiveChatRoomId('r1');
    expect(shouldSuppressIncomingBanner({
      id: 'chat:m',
      title: 'Alice',
      body: 'x',
      href: '/club/chat?roomId=r1',
      roomId: 'r1',
    }, 1, 2)).toBe(true);

    setActiveChatRoomId('other');
    expect(shouldSuppressIncomingBanner({
      id: 'chat:m',
      title: 'Alice',
      body: 'x',
      href: '/club/chat?roomId=r1',
      roomId: 'r1',
    }, 1, 2)).toBe(false);
    setActiveChatRoomId(null);
  });
});
