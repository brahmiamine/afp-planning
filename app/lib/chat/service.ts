import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type {
  ChatMessageEntity,
  ChatParticipantEntity,
  ChatReadStateEntity,
  ChatRoomEntity,
  ChatRoomKind,
  UserEntity,
} from '@/lib/db/schemas';
import { type PlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import { listPublishedPlanningEventSnapshots } from '@/lib/planning/published-planning';
import { createTeamLogoResolver, type TeamLogoFields } from '@/lib/planning/team-logos';
import { canAccessChatRoom, directConversationKey, eventConversationKey } from './policy';
import type { ChatAttachmentInput, ChatMessageCommand } from './protocol';
import { readAppSettings } from '@/lib/settings-store';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secret-box';

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderUserId: number;
  senderName: string;
  clientMessageId: string;
  sequence: number;
  content: string;
  attachment: ChatAttachmentInput | null;
  createdAt: string;
}

export interface ChatParticipantDto {
  id: number;
  nom: string;
  accessRole: string;
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
  /** Salons d'événement : équipes et logos des deux clubs, pour le rendu visuel. */
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

export class ChatAccessError extends Error {}
export class ChatValidationError extends Error {}

/** Affiché à la place d'un contenu chiffré illisible (clé absente/changée, donnée
 * corrompue) plutôt que de laisser fuiter le texte chiffré dans le DTO (issue #261). */
const UNREADABLE_MESSAGE_PLACEHOLDER = '⚠️ Message illisible (clé de chiffrement invalide)';

function messageDto(message: ChatMessageEntity): ChatMessageDto {
  return {
    id: message.id,
    roomId: message.roomId,
    senderUserId: message.senderUserId,
    senderName: message.senderName,
    clientMessageId: message.clientMessageId,
    sequence: message.sequence,
    content: message.content ? decryptSecret(message.content) ?? UNREADABLE_MESSAGE_PLACEHOLDER : '',
    attachment: message.attachmentType && message.attachmentUrl
      ? {
        type: message.attachmentType,
        url: message.attachmentUrl,
        mimeType: message.attachmentMimeType ?? '',
        name: message.attachmentName ?? '',
        size: message.attachmentSize ?? 0,
      }
      : null,
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

/** Vérifie que l'utilisateur peut lire/écrire dans ce salon (ex : avant d'accepter un upload). */
export async function assertRoomAccess(db: DataSource, user: SessionUser, roomId: string): Promise<ChatRoomEntity> {
  const { room } = await roomForUser(db.manager, user, roomId);
  return room;
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
    const eventChatEnabled = (await readAppSettings(manager, room.clubId)).features.eventChat;
    if (!eventChatEnabled) throw new ChatAccessError('Le chat des événements est désactivé par l\'administrateur');
    if (!(await isCurrentEventVisible(manager, room))) {
      throw new ChatAccessError('Cet événement n’est plus publié');
    }
  }
  return { room, participantUserIds: ids };
}

/**
 * Clés (`eventType:eventId`) des événements actuellement publiés pour un club — une
 * seule lecture de `planning_records`, réutilisable pour vérifier plusieurs salons
 * d'événement à la fois (voir `listRooms`, qui interrogeait sinon cette même ligne
 * une fois par salon).
 */
async function publishedEventKeys(manager: EntityManager, clubId: string): Promise<Set<string>> {
  try {
    const publicationRows = await manager.query(
      'SELECT payload FROM planning_records WHERE id = ? AND club_id = ? AND kind = ? LIMIT 1',
      [`published-planning:${clubId}`, clubId, 'published-planning'],
    ) as Array<{ payload?: string }>;
    const raw = publicationRows[0]?.payload;
    if (!raw) return new Set();
    const payload = JSON.parse(raw) as { events?: PlanningEventSnapshot[] };
    return new Set((payload.events ?? []).map((snapshot) => `${snapshot.eventType}:${snapshot.eventId}`));
  } catch {
    // Snapshot absent, table indisponible ou payload illisible : aucun fallback live.
    return new Set();
  }
}

function eventRoomKey(room: Pick<ChatRoomEntity, 'eventType' | 'eventId'>): string {
  return `${room.eventType}:${room.eventId}`;
}

async function isCurrentEventVisible(manager: EntityManager, room: ChatRoomEntity): Promise<boolean> {
  if (!room.eventType || !room.eventId || !validEventType(room.eventType)) return false;
  const keys = await publishedEventKeys(manager, room.clubId);
  return keys.has(eventRoomKey(room));
}

/** Dernier message de chaque salon, en une seule requête agrégée (évite un N+1 dans `listRooms`). */
async function lastMessagesByRoom(db: DataSource, roomIds: string[]): Promise<Map<string, ChatMessageEntity>> {
  if (roomIds.length === 0) return new Map();
  const placeholders = roomIds.map(() => '?').join(',');
  const rows = await db.manager.query(
    `SELECT m.* FROM chat_messages m
     INNER JOIN (
       SELECT roomId, MAX(sequence) AS maxSequence FROM chat_messages WHERE roomId IN (${placeholders}) GROUP BY roomId
     ) latest ON latest.roomId = m.roomId AND latest.maxSequence = m.sequence`,
    roomIds,
  ) as ChatMessageEntity[];
  return new Map(rows.map((row) => [row.roomId, row]));
}

/** Nombre de messages non lus par salon pour un utilisateur, en une seule requête agrégée
 * (évite un N+1 dans `listRooms`). */
async function unreadCountsByRoom(db: DataSource, roomIds: string[], userId: number): Promise<Map<string, number>> {
  if (roomIds.length === 0) return new Map();
  const placeholders = roomIds.map(() => '?').join(',');
  const rows = await db.manager.query(
    `SELECT m.roomId AS roomId, COUNT(*) AS unread
     FROM chat_messages m
     LEFT JOIN chat_read_states r ON r.roomId = m.roomId AND r.userId = ?
     WHERE m.roomId IN (${placeholders})
       AND m.senderUserId != ?
       AND m.sequence > COALESCE(r.lastReadSequence, 0)
     GROUP BY m.roomId`,
    [userId, ...roomIds, userId],
  ) as Array<{ roomId: string; unread: number | string }>;
  return new Map(rows.map((row) => [row.roomId, Number(row.unread)]));
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
  return users.map((item) => ({ id: item.id, nom: item.nom, accessRole: item.accessRole }));
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
  const snapshots = await listPublishedPlanningEventSnapshots(db);
  if (!snapshots) return [];
  let resolveLogos: ((event: unknown) => TeamLogoFields) | null = null;
  try {
    const resolver = await createTeamLogoResolver(db, user.clubId);
    resolveLogos = (event) => resolver(event as Parameters<typeof resolver>[0]);
  } catch {
    resolveLogos = null;
  }
  return snapshots
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((snapshot) => ({
      eventType: snapshot.eventType,
      eventId: snapshot.eventId,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
      location: snapshot.location,
      planningStatus: snapshot.planningStatus,
      ...(resolveLogos ? resolveLogos((snapshot as { event?: unknown }).event) : {}),
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
  const published = await listPublishedPlanningEventSnapshots(db);
  const snapshot = published?.find(
    (item) => item.eventType === eventType && item.eventId === eventId,
  ) ?? null;
  if (!snapshot) throw new ChatValidationError('Événement introuvable');

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

function requireAdmin(user: SessionUser): void {
  if (user.accessRole !== 'admin') {
    throw new ChatAccessError('Gestion des canaux réservée aux administrateurs');
  }
}

export async function createChannel(
  db: DataSource,
  user: SessionUser,
  input: unknown,
  participantUserIds: readonly number[],
): Promise<ChatRoomEntity> {
  requireAdmin(user);
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
  requireAdmin(user);
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
  requireAdmin(user);
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
): Promise<{ room: ChatRoomEntity; participantUserIds: number[]; messages: ChatMessageDto[]; peerReadSequence: number }> {
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
  const otherIds = participantUserIds.filter((id) => id !== user.id);
  const peerReadStates = otherIds.length
    ? await db.getRepository<ChatReadStateEntity>('ChatReadState').findBy({ roomId, userId: In(otherIds) })
    : [];
  const peerReadSequence = peerReadStates.reduce((max, state) => Math.max(max, state.lastReadSequence), 0);
  return { room, participantUserIds, messages: messages.map(messageDto), peerReadSequence };
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

    const attachment: ChatAttachmentInput | null = command.attachment;
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
      content: command.content ? encryptSecret(command.content) : '',
      attachmentType: attachment?.type ?? null,
      attachmentUrl: attachment?.url ?? null,
      attachmentMimeType: attachment?.mimeType ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
    });
    return { room, participantUserIds: access.participantUserIds, message: messageDto(saved), duplicate: false };
  });
}

export async function markRoomRead(
  db: DataSource,
  user: SessionUser,
  roomId: string,
  sequence: number,
): Promise<{ room: ChatRoomEntity }> {
  const { room } = await roomForUser(db.manager, user, roomId);
  if (!Number.isInteger(sequence) || sequence < 0) throw new ChatValidationError('Séquence invalide');
  const repository = db.getRepository<ChatReadStateEntity>('ChatReadState');
  const existing = await repository.findOneBy({ roomId, userId: user.id });
  if (!existing || existing.lastReadSequence < sequence) {
    await repository.save({ roomId, userId: user.id, lastReadSequence: sequence });
  }
  return { room };
}

export async function participantIdsForRoom(db: DataSource, roomId: string): Promise<number[]> {
  const rows = await db.getRepository<ChatParticipantEntity>('ChatParticipant').findBy({ roomId });
  return rows.map((row) => row.userId);
}

export async function listRooms(db: DataSource, user: SessionUser): Promise<ChatRoomDto[]> {
  const eventChatEnabled = (await readAppSettings(db, user.clubId)).features.eventChat;
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
  // Une seule lecture de la publication du club (au lieu d'une requête planning_records
  // par salon d'événement) : la visibilité de chaque salon se réduit à un test en mémoire.
  const eventKeys = eventChatEnabled && rooms.some((room) => room.type === 'event')
    ? await publishedEventKeys(db.manager, user.clubId)
    : new Set<string>();
  const accessible: ChatRoomEntity[] = [];
  for (const room of rooms) {
    if (room.type === 'event' && !eventChatEnabled) continue;
    if (!canAccessChatRoom(user, room, byRoom.get(room.id) ?? [])) continue;
    if (room.type === 'event' && !eventKeys.has(eventRoomKey(room))) continue;
    accessible.push(room);
  }
  const allUserIds = Array.from(new Set(accessible.flatMap((room) => byRoom.get(room.id) ?? [])));
  const roomUsers = allUserIds.length
    ? await db.getRepository<UserEntity>('User').findBy({ id: In(allUserIds), clubId: user.clubId })
    : [];
  const userById = new Map(roomUsers.map((item) => [item.id, item]));
  const accessibleRoomIds = accessible.map((room) => room.id);
  // Dernier message et compteur de non-lus : une requête agrégée chacun, quel que soit
  // le nombre de salons (au lieu de 2 requêtes par salon).
  const [lastMessageByRoom, unreadByRoom] = await Promise.all([
    lastMessagesByRoom(db, accessibleRoomIds),
    unreadCountsByRoom(db, accessibleRoomIds, user.id),
  ]);

  // Salons d'événement : logos des deux clubs (best-effort, une seule résolution).
  const eventLogosByKey = new Map<string, TeamLogoFields>();
  if (accessible.some((room) => room.type === 'event' && room.eventType && room.eventId)) {
    try {
      const [snapshots, resolveLogos] = await Promise.all([
        listPublishedPlanningEventSnapshots(db),
        createTeamLogoResolver(db, user.clubId),
      ]);
      const eventByKey = new Map<string, unknown>();
      for (const snapshot of snapshots ?? []) {
        eventByKey.set(`${snapshot.eventType}:${snapshot.eventId}`, (snapshot as { event?: unknown }).event);
      }
      for (const room of accessible) {
        if (room.type !== 'event' || !room.eventType || !room.eventId) continue;
        const key = `${room.eventType}:${room.eventId}`;
        const event = eventByKey.get(key) as Parameters<typeof resolveLogos>[0];
        eventLogosByKey.set(key, resolveLogos(event));
      }
    } catch (error) {
      console.error('Chat room logo enrichment failed:', error);
    }
  }

  return Promise.all(
    accessible.map(async (room) => {
      const ids = byRoom.get(room.id) ?? [];
      const roomParticipants = ids.flatMap((id) => {
        const item = userById.get(id);
        return item ? [{ id: item.id, nom: item.nom, accessRole: item.accessRole }] : [];
      });
      const last = lastMessageByRoom.get(room.id) ?? null;
      const unreadCount = unreadByRoom.get(room.id) ?? 0;
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
        canManage: room.type === 'channel' && user.accessRole === 'admin',
        ...(room.type === 'event' && room.eventType && room.eventId
          ? eventLogosByKey.get(`${room.eventType}:${room.eventId}`) ?? {}
          : {}),
      };
    }),
  );
}
