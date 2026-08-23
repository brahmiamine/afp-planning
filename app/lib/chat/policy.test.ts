import { describe, expect, it } from 'vitest';
import {
  canAccessChatRoom,
  canManageChatChannel,
  directConversationKey,
  eventConversationKey,
  isPlanningClub,
} from './policy';

const member = {
  id: 12,
  clubId: 'afp',
  roles: ['arbitre'] as const,
};

describe('chat authorization policy', () => {
  it('isolates direct conversations by club and participant membership', () => {
    const room = { type: 'direct' as const, clubId: 'afp', createdByUserId: 10 };

    expect(canAccessChatRoom(member, room, [10, 12])).toBe(true);
    expect(canAccessChatRoom(member, room, [10, 14])).toBe(false);
    expect(canAccessChatRoom({ ...member, clubId: 'other' }, room, [10, 12])).toBe(false);
  });

  it('opens an event room to every authenticated member of the same club', () => {
    const room = { type: 'event' as const, clubId: 'afp', createdByUserId: 1 };

    expect(canAccessChatRoom(member, room, [])).toBe(true);
    expect(canAccessChatRoom({ ...member, clubId: 'other' }, room, [])).toBe(false);
  });

  it('limits channels to the users selected by the admin', () => {
    const room = { type: 'channel' as const, clubId: 'afp', createdByUserId: 1 };

    expect(canAccessChatRoom(member, room, [12, 15])).toBe(true);
    expect(canAccessChatRoom(member, room, [15, 16])).toBe(false);
  });

  it('reserves channel management to an admin from the room club', () => {
    const room = { type: 'channel' as const, clubId: 'afp', createdByUserId: 1 };

    expect(canManageChatChannel({ id: 1, clubId: 'afp', roles: ['admin'] }, room)).toBe(true);
    expect(canManageChatChannel({ id: 2, clubId: 'afp', roles: ['arbitre'] }, room)).toBe(false);
    expect(canManageChatChannel({ id: 3, clubId: 'other', roles: ['admin'] }, room)).toBe(false);
  });
});

describe('chat room identities', () => {
  it('uses one stable direct room key regardless of participant order', () => {
    expect(directConversationKey('afp', 42, 7)).toBe(directConversationKey('afp', 7, 42));
    expect(directConversationKey('afp', 42, 7)).not.toBe(directConversationKey('other', 42, 7));
  });

  it('isolates event rooms by club, event type and event id', () => {
    expect(eventConversationKey('afp', 'officiel', 'match-1')).not.toBe(
      eventConversationKey('afp', 'amical', 'match-1'),
    );
    expect(eventConversationKey('afp', 'officiel', 'match-1')).not.toBe(
      eventConversationKey('other', 'officiel', 'match-1'),
    );
  });
});

describe('planning event ownership', () => {
  it('only exposes the single-club planning corpus to its configured club', () => {
    expect(isPlanningClub('afp', 'afp')).toBe(true);
    expect(isPlanningClub('other', 'afp')).toBe(false);
  });
});
