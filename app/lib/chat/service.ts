import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type {
  ChatMessageEntity,
  ChatParticipantEntity,
  ChatReadStateEntity,
  ChatRoomEntity,
  ChatRoomKind,
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
  UserEntity,
} from '@/lib/db/schemas';
import { getPlanningEventSnapshot, listPlanningEventSnapshots, type PlanningEventType } from '@/lib/planning/event-store';
import { isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { canAccessChatRoom, directConversationKey, eventConversationKey, isPlanningClub } from './policy';
import type { ChatMessageCommand } from './protocol';

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderUserId: number;
  senderName: string;
  clientMessageId: string;
  sequence: number;
  content: string;
  createdAt: string;
}

export interface ChatParticipantDto {
  id: number;
  nom: string;
  roles: string[];
}

export interface ChatRoomDto {
  id: string;
  type: ChatRoomKind;
  name: string;
  description: string | null;
  eventType: string | null;
  eventId: string | null;
  participants: ChatParticipantDto[];
  lastMessage: ChatMessageDto | null;
  unreadCount: number;
  canManage: boolean;
}

export class ChatAccessError extends Error {}
export class ChatValidationError extends Error {}

function messageDto(message: ChatMessageEntity): ChatMessageDto {
  return {
    id: message.id,
    roomId: message.roomId,
    senderUserId: message.senderUserId,
    senderName: message.senderName,
    clientMessageId: message.clientMessageId,
    sequence: message.sequence,
    content: message.content,
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

function validEventType(value: string): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

async function participantIds(manager: EntityManager, roomId: string): Promise<number[]> {
  const rows = await manager.getRepository<ChatParticipantEntity>('ChatParticipant').findBy({ roomId });
  return rows.map((row) => row.userId);
}

async function roomForUser(
  manager: EntityManager,
  user: SessionUser,
  roomId: string,
): Promise<{ room: ChatRoomEntity; participantUserIds: number[] }> {
  const room = await manager.getRepository<ChatRoomEntity>('ChatRoom').findOneBy({ id: roomId });
  if (!room) throw new ChatValidationError('Salon introuvable');
  return authorizeRoomForUser(manager, user, room);
}

async function authorizeRoomForUser(
  manager: EntityManager,
  user: SessionUser,
  room: ChatRoomEntity,
): Promise<{ room: ChatRoomEntity; participantUserIds: number[] }> {
  const ids = await participantIds(manager, room.id);
  if (!canAccessChatRoom(user, room, ids)) throw new ChatAccessError('Accès au salon refusé');
  if (room.archivedAt) throw new ChatAccessError('Ce canal est archivé');
  if (room.type === 'event') {
    if (!isPlanningClub(room.clubId, planningClubId())) {
      throw new ChatAccessError('Accès aux événements du club refusé');
    }
    if (!(await isCurrentEventVisible(manager, room))) {
      throw new ChatAccessError('Cet événement n’est plus publié');
    }
  }
  return { room, participantUserIds: ids };
}

async function isCurrentEventVisible(manager: EntityManager, room: ChatRoomEntity): Promise<boolean> {
  if (!room.eventType || !room.eventId || !validEventType(room.eventType)) return false;

  if (room.eventType === 'officiel' || room.eventType === 'amical') {
    const event = room.eventType === 'officiel'
      ? await manager.getRepository<MatchOfficialEntity>('MatchOfficial').findOneBy({ id: room.eventId })
      : await manager.getRepository<MatchAmicalEntity>('MatchAmical').findOneBy({ id: room.eventId });
    if (!event) return false;
    const extras = await manager.getRepository<MatchExtraEntity>('MatchExtra').findOneBy({ matchId: room.eventId });
    const payload = extras?.payload as Record<string, unknown> | undefined;
    return isVisiblePublicationStatus(normalizePlanningStatus(payload?.planningStatus));
  }

  const event = room.eventType === 'entrainement'
    ? await manager.getRepository<EntrainementEntity>('Entrainement').findOneBy({ id: room.eventId })
    : await manager.getRepository<PlateauEntity>('Plateau').findOneBy({ id: room.eventId });
  if (!event) return false;
  const payload = event.payload as Record<string, unknown>;
  return isVisiblePublicationStatus(normalizePlanningStatus(payload.planningStatus));
}

function planningClubId(): string {
  return process.env.APP_CLUB_ID || 'afp';
}

async function usersInClub(
  manager: EntityManager,
  clubId: string,
  ids: readonly number[],
): Promise<UserEntity[]> {
  if (ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  const users = await manager.getRepository<UserEntity>('User').findBy({
    id: In(uniqueIds),
    clubId,
    active: true,
  });
  if (users.length !== uniqueIds.length) {
    throw new ChatValidationError('Un ou plusieurs participants sont invalides');
  }
  return users;
}

async function saveParticipants(
  manager: EntityManager,
  roomId: string,
  userIds: readonly number[],
  addedByUserId: number,
): Promise<void> {
  const repository = manager.getRepository<ChatParticipantEntity>('ChatParticipant');
  const rows = Array.from(new Set(userIds)).map((userId) => ({ roomId, userId, addedByUserId }));
  if (rows.length > 0) await repository.insert(rows);
}

export async function listChatUsers(db: DataSource, user: SessionUser): Promise<ChatParticipantDto[]> {
  const users = await db.getRepository<UserEntity>('User').find({
    where: { clubId: user.clubId, active: true },
    order: { nom: 'ASC' },
  });
  return users.map((item) => ({ id: item.id, nom: item.nom, roles: item.roles }));
}

export async function getOrCreateDirectRoom(
  db: DataSource,
  user: SessionUser,
  targetUserId: number,
): Promise<ChatRoomEntity> {
  if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === user.id) {
    throw new ChatValidationError('Destinataire invalide');
  }
  const roomKey = directConversationKey(user.clubId, user.id, targetUserId);
  const existing = await db.getRepository<ChatRoomEntity>('ChatRoom').findOneBy({ roomKey });
  if (existing) return existing;

  try {
    return await db.transaction(async (manager) => {
      await usersInClub(manager, user.clubId, [user.id, targetUserId]);
      const room = manager.getRepository<ChatRoomEntity>('ChatRoom').create({
        id: randomUUID(),
        type: 'direct',
        clubId: user.clubId,
        roomKey,
        name: null,
        description: null,
        eventType: null,
        eventId: null,
        createdByUserId: user.id,
        nextSequence: 1,
        archivedAt: null,
      });
      await manager.getRepository<ChatRoomEntity>('ChatRoom').save(room);
      await saveParticipants(manager, room.id, [user.id, targetUserId], user.id);
      return room;
    });
  } catch (error) {
    const concurrent = await db.getRepository<ChatRoomEntity>('ChatRoom').findOneBy({ roomKey });
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function listChatEvents(db: DataSource, user: SessionUser) {
  if (!isPlanningClub(user.clubId, planningClubId())) return [];
  const snapshots = await listPlanningEventSnapshots(db);
  return snapshots
    .filter((snapshot) => isVisiblePublicationStatus(snapshot.planningStatus))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((snapshot) => ({
      eventType: snapshot.eventType,
      eventId: snapshot.eventId,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
      location: snapshot.location,
      planningStatus: snapshot.planningStatus,
    }));
}

export async function getOrCreateEventRoom(
  db: DataSource,
  user: SessionUser,
  eventType: string,
  eventId: string,
): Promise<ChatRoomEntity> {
  if (!validEventType(eventType) || !eventId || eventId.length > 200) {
    throw new ChatValidationError('Événement invalide');
  }
  if (!isPlanningClub(user.clubId, planningClubId())) {
    throw new ChatAccessError('Accès aux événements du club refusé');
  }
  const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
  if (!snapshot) throw new ChatValidationError('Événement introuvable');
  if (!isVisiblePublicationStatus(snapshot.planningStatus)) {
    throw new ChatAccessError('Cet événement n’est pas encore publié');
  }

  const roomKey = eventConversationKey(user.clubId, eventType, eventId);
  const existing = await db.getRepository<ChatRoomEntity>('ChatRoom').findOneBy({ roomKey });
  if (existing) return existing;

  try {
    return await db.getRepository<ChatRoomEntity>('ChatRoom').save({
      id: randomUUID(),
      type: 'event',
      clubId: user.clubId,
      roomKey,
      name: snapshot.title,
      description: [snapshot.date, snapshot.time, snapshot.location].filter(Boolean).join(' · '),
      eventType,
      eventId,
      createdByUserId: user.id,
      nextSequence: 1,
      archivedAt: null,
    });
  } catch (error) {
    const concurrent = await db.getRepository<ChatRoomEntity>('ChatRoom').findOneBy({ roomKey });
    if (concurrent) return concurrent;
    throw error;
  }
}

function normalizedChannelInput(value: unknown): { name: string; description: string | null } {
  const body = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (name.length < 2 || name.length > 100) throw new ChatValidationError('Nom du canal invalide');
  if (description.length > 500) throw new ChatValidationError('Description trop longue');
  return { name, description: description || null };
}

function requireSuperadmin(user: SessionUser): void {
  if (!user.roles.includes('superadmin')) {
    throw new ChatAccessError('Gestion des canaux réservée au Super Admin');
  }
}

export async function createChannel(
  db: DataSource,
  user: SessionUser,
  input: unknown,
  participantUserIds: readonly number[],
): Promise<ChatRoomEntity> {
  requireSuperadmin(user);
  const channel = normalizedChannelInput(input);
  const selected = Array.from(new Set([user.id, ...participantUserIds]));
  if (selected.length > 500) throw new ChatValidationError('Trop de participants');

  return db.transaction(async (manager) => {
    await usersInClub(manager, user.clubId, selected);
    const id = randomUUID();
    const room = manager.getRepository<ChatRoomEntity>('ChatRoom').create({
      id,
      type: 'channel',
      clubId: user.clubId,
      roomKey: `channel:${user.clubId}:${id}`,
      name: channel.name,
      description: channel.description,
      eventType: null,
      eventId: null,
      createdByUserId: user.id,
      nextSequence: 1,
      archivedAt: null,
    });
    await manager.getRepository<ChatRoomEntity>('ChatRoom').save(room);
    await saveParticipants(manager, room.id, selected, user.id);
    return room;
  });
}

export async function updateChannel(
  db: DataSource,
  user: SessionUser,
  roomId: string,
  input: unknown,
  participantUserIds: readonly number[],
): Promise<ChatRoomEntity> {
  requireSuperadmin(user);
  const channel = normalizedChannelInput(input);
  const selected = Array.from(new Set([user.id, ...participantUserIds]));
  if (selected.length > 500) throw new ChatValidationError('Trop de participants');

  return db.transaction(async (manager) => {
    const room = await manager
      .getRepository<ChatRoomEntity>('ChatRoom')
      .createQueryBuilder('room')
      .setLock('pessimistic_write')
      .where('room.id = :roomId', { roomId })
      .getOne();
    if (!room || room.type !== 'channel') throw new ChatValidationError('Canal introuvable');
    if (room.clubId !== user.clubId) throw new ChatAccessError('Accès au canal refusé');
    await usersInClub(manager, user.clubId, selected);
    room.name = channel.name;
    room.description = channel.description;
    await manager.getRepository<ChatRoomEntity>('ChatRoom').save(room);
    await manager.getRepository<ChatParticipantEntity>('ChatParticipant').delete({ roomId });
    await saveParticipants(manager, room.id, selected, user.id);
    return room;
  });
}

export async function archiveChannel(db: DataSource, user: SessionUser, roomId: string): Promise<void> {
  requireSuperadmin(user);
  await db.transaction(async (manager) => {
    const room = await manager
      .getRepository<ChatRoomEntity>('ChatRoom')
      .createQueryBuilder('room')
      .setLock('pessimistic_write')
      .where('room.id = :roomId', { roomId })
      .getOne();
    if (!room || room.type !== 'channel') throw new ChatValidationError('Canal introuvable');
    if (room.clubId !== user.clubId) throw new ChatAccessError('Accès au canal refusé');
    room.archivedAt = new Date();
    await manager.getRepository<ChatRoomEntity>('ChatRoom').save(room);
  });
}

export async function listMessages(
  db: DataSource,
  user: SessionUser,
  roomId: string,
  options?: { afterSequence?: number; limit?: number },
): Promise<{ room: ChatRoomEntity; participantUserIds: number[]; messages: ChatMessageDto[] }> {
  const { room, participantUserIds } = await roomForUser(db.manager, user, roomId);
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 200));
  const query = db
    .getRepository<ChatMessageEntity>('ChatMessage')
    .createQueryBuilder('message')
    .where('message.roomId = :roomId', { roomId })
    .orderBy('message.sequence', options?.afterSequence ? 'ASC' : 'DESC')
    .take(limit);
  if (options?.afterSequence && options.afterSequence > 0) {
    query.andWhere('message.sequence > :afterSequence', { afterSequence: options.afterSequence });
  }
  const messages = await query.getMany();
  if (!options?.afterSequence) messages.reverse();
  return { room, participantUserIds, messages: messages.map(messageDto) };
}

export async function appendMessage(
  db: DataSource,
  user: SessionUser,
  command: ChatMessageCommand,
): Promise<{ room: ChatRoomEntity; participantUserIds: number[]; message: ChatMessageDto; duplicate: boolean }> {
  return db.transaction(async (manager) => {
    const room = await manager
      .getRepository<ChatRoomEntity>('ChatRoom')
      .createQueryBuilder('room')
      .setLock('pessimistic_write')
      .where('room.id = :roomId', { roomId: command.roomId })
      .getOne();
    if (!room) throw new ChatValidationError('Salon introuvable');
    const access = await authorizeRoomForUser(manager, user, room);
    const messageRepository = manager.getRepository<ChatMessageEntity>('ChatMessage');
    const duplicate = await messageRepository.findOneBy({
      roomId: command.roomId,
      senderUserId: user.id,
      clientMessageId: command.clientMessageId,
    });
    if (duplicate) {
      return { ...access, message: messageDto(duplicate), duplicate: true };
    }

    const sequence = room.nextSequence;
    room.nextSequence += 1;
    await manager.getRepository<ChatRoomEntity>('ChatRoom').save(room);
    const saved = await messageRepository.save({
      id: randomUUID(),
      roomId: room.id,
      senderUserId: user.id,
      senderName: user.nom,
      clientMessageId: command.clientMessageId,
      sequence,
      content: command.content,
    });
    return { room, participantUserIds: access.participantUserIds, message: messageDto(saved), duplicate: false };
  });
}

export async function markRoomRead(
  db: DataSource,
  user: SessionUser,
  roomId: string,
  sequence: number,
): Promise<void> {
  await roomForUser(db.manager, user, roomId);
  if (!Number.isInteger(sequence) || sequence < 0) throw new ChatValidationError('Séquence invalide');
  const repository = db.getRepository<ChatReadStateEntity>('ChatReadState');
  const existing = await repository.findOneBy({ roomId, userId: user.id });
  if (existing && existing.lastReadSequence >= sequence) return;
  await repository.save({ roomId, userId: user.id, lastReadSequence: sequence });
}

export async function listRooms(db: DataSource, user: SessionUser): Promise<ChatRoomDto[]> {
  const rooms = await db.getRepository<ChatRoomEntity>('ChatRoom').find({
    where: { clubId: user.clubId, archivedAt: IsNull() },
    order: { updatedAt: 'DESC' },
  });
  const participants = rooms.length
    ? await db.getRepository<ChatParticipantEntity>('ChatParticipant').findBy({ roomId: In(rooms.map((room) => room.id)) })
    : [];
  const byRoom = new Map<string, number[]>();
  for (const participant of participants) {
    byRoom.set(participant.roomId, [...(byRoom.get(participant.roomId) ?? []), participant.userId]);
  }
  const accessible: ChatRoomEntity[] = [];
  for (const room of rooms) {
    if (!canAccessChatRoom(user, room, byRoom.get(room.id) ?? [])) continue;
    if (room.type === 'event' && !isPlanningClub(room.clubId, planningClubId())) continue;
    if (room.type === 'event' && !(await isCurrentEventVisible(db.manager, room))) continue;
    accessible.push(room);
  }
  const allUserIds = Array.from(new Set(accessible.flatMap((room) => byRoom.get(room.id) ?? [])));
  const roomUsers = allUserIds.length
    ? await db.getRepository<UserEntity>('User').findBy({ id: In(allUserIds), clubId: user.clubId })
    : [];
  const userById = new Map(roomUsers.map((item) => [item.id, item]));
  const readStates = accessible.length
    ? await db.getRepository<ChatReadStateEntity>('ChatReadState').findBy({
        roomId: In(accessible.map((room) => room.id)),
        userId: user.id,
      })
    : [];
  const readByRoom = new Map(readStates.map((state) => [state.roomId, state.lastReadSequence]));

  return Promise.all(
    accessible.map(async (room) => {
      const ids = byRoom.get(room.id) ?? [];
      const roomParticipants = ids.flatMap((id) => {
        const item = userById.get(id);
        return item ? [{ id: item.id, nom: item.nom, roles: item.roles }] : [];
      });
      const last = await db.getRepository<ChatMessageEntity>('ChatMessage').findOne({
        where: { roomId: room.id },
        order: { sequence: 'DESC' },
      });
      const lastRead = readByRoom.get(room.id) ?? 0;
      const unreadCount = await db
        .getRepository<ChatMessageEntity>('ChatMessage')
        .createQueryBuilder('message')
        .where('message.roomId = :roomId', { roomId: room.id })
        .andWhere('message.sequence > :lastRead', { lastRead })
        .andWhere('message.senderUserId != :userId', { userId: user.id })
        .getCount();
      const other = roomParticipants.find((participant) => participant.id !== user.id);
      return {
        id: room.id,
        type: room.type,
        name: room.type === 'direct' ? other?.nom ?? 'Conversation privée' : room.name ?? 'Salon',
        description: room.description,
        eventType: room.eventType,
        eventId: room.eventId,
        participants: roomParticipants,
        lastMessage: last ? messageDto(last) : null,
        unreadCount,
        canManage: room.type === 'channel' && user.roles.includes('superadmin'),
      };
    }),
  );
}
