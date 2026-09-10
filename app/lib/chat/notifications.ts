import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { normalizeAccessRole } from '@/lib/auth/roles';
import type { ChatRoomEntity, UserEntity } from '@/lib/db/schemas';
import {
  deliverEnqueuedNotifications,
  enqueueUserNotificationIntents,
  type EnqueuedContactNotification,
} from '@/lib/notifications/service';
import { canAccessChatRoom } from './policy';
import type { ChatMessageDto } from './service';

export interface ChatMessageNotificationSource {
  room: ChatRoomEntity;
  participantUserIds: number[];
  message: ChatMessageDto;
  duplicate: boolean;
}

function preview(message: ChatMessageDto): string {
  const text = message.content.trim();
  if (text) return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  return message.attachment ? 'Pièce jointe' : 'Nouveau message';
}

function generalType(room: ChatRoomEntity): 'chat-dm' | 'chat-event-message' | 'chat-channel-message' {
  if (room.type === 'event') return 'chat-event-message';
  if (room.type === 'channel') return 'chat-channel-message';
  return 'chat-dm';
}

function generalTitle(room: ChatRoomEntity, senderName: string): string {
  if (room.type === 'event') return `${senderName} a écrit dans ${room.name || 'la discussion d’événement'}`;
  if (room.type === 'channel') return `${senderName} a écrit dans ${room.name || 'le canal'}`;
  return `Message de ${senderName}`;
}

async function loadActiveClubUsers(db: DataSource, clubId: string): Promise<UserEntity[]> {
  return db.getRepository<UserEntity>('User').find({ where: { clubId, active: true } });
}

function validatedMentions(
  usersById: Map<number, UserEntity>,
  room: ChatRoomEntity,
  participantUserIds: number[],
  mentionedUserIds: number[],
  senderId: number,
): UserEntity[] {
  const seen = new Set<number>();
  const mentions: UserEntity[] = [];
  for (const id of mentionedUserIds) {
    if (id === senderId || seen.has(id)) continue;
    const user = usersById.get(id);
    if (!user || user.clubId !== room.clubId || !user.active) continue;
    if (!canAccessChatRoom(
      { id: user.id, clubId: user.clubId, accessRole: normalizeAccessRole(user.accessRole) },
      room,
      participantUserIds,
    )) continue;
    seen.add(id);
    mentions.push(user);
  }
  return mentions;
}

function generalRecipients(
  room: ChatRoomEntity,
  users: UserEntity[],
  participantUserIds: number[],
  senderId: number,
  mentionedIds: Set<number>,
): UserEntity[] {
  return users.filter((user) => {
    if (user.id === senderId || mentionedIds.has(user.id)) return false;
    if (room.type === 'event') return true;
    return participantUserIds.includes(user.id);
  });
}

/**
 * Notifications durables après un `chat:send` réussi (issue #321).
 * À appeler APRÈS le commit du message : jamais de réseau dans la transaction métier,
 * et un retry avec le même `clientMessageId` ne doit rien recréer (`duplicate` ou clés d'idempotence).
 */
export async function notifyChatMessage(
  db: DataSource,
  sender: SessionUser,
  result: ChatMessageNotificationSource,
  mentionedUserIds: number[] = [],
): Promise<void> {
  if (result.duplicate) return;

  const users = await loadActiveClubUsers(db, sender.clubId);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const mentions = validatedMentions(
    usersById,
    result.room,
    result.participantUserIds,
    mentionedUserIds,
    sender.id,
  );
  const mentionedIds = new Set(mentions.map((user) => user.id));
  const others = generalRecipients(
    result.room,
    users,
    result.participantUserIds,
    sender.id,
    mentionedIds,
  );

  const snippet = preview(result.message);
  const eventType = 'chat';
  const eventId = result.room.id;
  const idempotencyBase = `chat:${result.room.id}:${result.message.clientMessageId}`;
  const enqueued: EnqueuedContactNotification[] = [];

  for (const user of mentions) {
    enqueued.push(...await enqueueUserNotificationIntents(
      db,
      user,
      {
        type: 'chat-mention',
        title: `${sender.nom} vous a mentionné`,
        message: snippet,
        eventType,
        eventId,
        urgency: 'important',
      },
      `${idempotencyBase}:mention:${user.id}`,
    ));
  }

  const type = generalType(result.room);
  const title = generalTitle(result.room, sender.nom);
  for (const user of others) {
    enqueued.push(...await enqueueUserNotificationIntents(
      db,
      user,
      {
        type,
        title,
        message: snippet,
        eventType,
        eventId,
        urgency: 'normal',
      },
      `${idempotencyBase}:${user.id}`,
    ));
  }

  await deliverEnqueuedNotifications(db, enqueued);
}
