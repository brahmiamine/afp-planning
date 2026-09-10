import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { ChatRoomEntity, UserEntity } from '@/lib/db/schemas';
import type { ChatMessageDto } from './service';

const enqueueUserNotificationIntents = vi.fn(async (_db: unknown, user: UserEntity, input: Record<string, unknown>, key?: string) => [{
  user,
  items: [{ id: `outbox-${user.id}`, ...input, idempotency: key }],
}]);
const deliverEnqueuedNotifications = vi.fn(async () => undefined);

vi.mock('@/lib/notifications/service', () => ({
  enqueueUserNotificationIntents: (
    db: unknown,
    user: UserEntity,
    input: Record<string, unknown>,
    key?: string,
  ) => enqueueUserNotificationIntents(db, user, input, key),
  deliverEnqueuedNotifications: () => deliverEnqueuedNotifications(),
}));

import { notifyChatMessage } from './notifications';

function user(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 1,
    clubId: 'afp',
    email: 'a@example.com',
    nom: 'Alice',
    accessRole: 'dirigeant',
    planningFunctions: [],
    active: true,
    ...overrides,
  } as UserEntity;
}

function room(overrides: Partial<ChatRoomEntity> = {}): ChatRoomEntity {
  return {
    id: 'room-dm',
    type: 'direct',
    clubId: 'afp',
    name: 'Alice / Bob',
    eventType: null,
    eventId: null,
    ...overrides,
  } as ChatRoomEntity;
}

function message(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'msg-1',
    roomId: 'room-dm',
    senderUserId: 1,
    senderName: 'Alice',
    clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
    sequence: 1,
    content: 'Salut @Bob',
    attachment: null,
    replyTo: null,
    forwardedFromName: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

const alice = user({ id: 1, nom: 'Alice' });
const bob = user({ id: 2, nom: 'Bob', email: 'b@example.com' });
const cara = user({ id: 3, nom: 'Cara', email: 'c@example.com' });
const otherClub = user({ id: 4, nom: 'Zoe', clubId: 'other' });
const sender: SessionUser = { id: 1, clubId: 'afp', email: 'a@example.com', nom: 'Alice', accessRole: 'dirigeant' } as SessionUser;

function fakeDb(users: UserEntity[]): DataSource {
  return {
    getRepository: () => ({ find: async () => users }),
  } as unknown as DataSource;
}

describe('notifyChatMessage (issue #321)', () => {
  beforeEach(() => {
    enqueueUserNotificationIntents.mockClear();
    deliverEnqueuedNotifications.mockClear();
  });

  it('notifie le destinataire d’un DM, jamais l’auteur', async () => {
    await notifyChatMessage(
      fakeDb([alice, bob, otherClub]),
      sender,
      { room: room(), participantUserIds: [1, 2], message: message({ content: 'Coucou' }), duplicate: false },
    );

    const recipients = enqueueUserNotificationIntents.mock.calls.map((call) => (call[1] as UserEntity).id);
    const types = enqueueUserNotificationIntents.mock.calls.map((call) => (call[2] as { type: string }).type);
    expect(recipients).toEqual([2]);
    expect(types).toEqual(['chat-dm']);
    expect(enqueueUserNotificationIntents.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      eventType: 'chat',
      eventId: 'room-dm',
    }));
  });

  it('crée une mention dédiée et évite le doublon message général', async () => {
    await notifyChatMessage(
      fakeDb([alice, bob, cara]),
      sender,
      {
        room: room({ type: 'channel', id: 'room-ch', name: 'Staff' }),
        participantUserIds: [1, 2, 3],
        message: message({ roomId: 'room-ch', content: 'Salut @Bob' }),
        duplicate: false,
      },
      [2],
    );

    const byUser = enqueueUserNotificationIntents.mock.calls.map((call) => ({
      id: (call[1] as UserEntity).id,
      type: (call[2] as { type: string }).type,
      urgency: (call[2] as { urgency: string }).urgency,
    }));
    expect(byUser).toEqual([
      { id: 2, type: 'chat-mention', urgency: 'important' },
      { id: 3, type: 'chat-channel-message', urgency: 'normal' },
    ]);
  });

  it('ignore un retry dupliqué et une mention hors club / hors salon', async () => {
    await notifyChatMessage(
      fakeDb([alice, bob]),
      sender,
      { room: room(), participantUserIds: [1, 2], message: message(), duplicate: true },
      [2],
    );
    expect(enqueueUserNotificationIntents).not.toHaveBeenCalled();

    await notifyChatMessage(
      fakeDb([alice, bob, otherClub]),
      sender,
      { room: room(), participantUserIds: [1, 2], message: message(), duplicate: false },
      [4, 99],
    );
    const mentioned = enqueueUserNotificationIntents.mock.calls.filter((call) => (call[2] as { type: string }).type === 'chat-mention');
    expect(mentioned).toHaveLength(0);
  });

  it('notifie le club entier pour un salon d’événement, sauf l’auteur', async () => {
    await notifyChatMessage(
      fakeDb([alice, bob, cara]),
      sender,
      {
        room: room({ type: 'event', id: 'room-evt', name: 'AFP – Visiteur' }),
        participantUserIds: [],
        message: message({ roomId: 'room-evt', content: 'RDV 14h' }),
        duplicate: false,
      },
    );
    expect(enqueueUserNotificationIntents.mock.calls.map((call) => (call[1] as UserEntity).id).sort()).toEqual([2, 3]);
    expect(enqueueUserNotificationIntents.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ type: 'chat-event-message' }));
  });
});
