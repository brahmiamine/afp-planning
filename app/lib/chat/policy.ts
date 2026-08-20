import { createHash } from 'node:crypto';
import type { UserRole } from '@/lib/auth/roles';

export type ChatRoomType = 'direct' | 'event' | 'channel';

export interface ChatPolicyUser {
  id: number;
  clubId: string;
  roles: readonly UserRole[];
}

export interface ChatPolicyRoom {
  type: ChatRoomType;
  clubId: string;
  createdByUserId: number;
}

export function canAccessChatRoom(
  user: ChatPolicyUser,
  room: ChatPolicyRoom,
  participantUserIds: readonly number[],
): boolean {
  if (user.clubId !== room.clubId) return false;
  if (room.type === 'event') return true;
  return participantUserIds.includes(user.id);
}

export function canManageChatChannel(user: ChatPolicyUser, room: ChatPolicyRoom): boolean {
  return room.type === 'channel' && user.clubId === room.clubId && user.roles.includes('superadmin');
}

export function isPlanningClub(userClubId: string, planningClubId: string): boolean {
  return userClubId === planningClubId;
}

function conversationKey(parts: readonly (string | number)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function directConversationKey(clubId: string, firstUserId: number, secondUserId: number): string {
  const [low, high] = [firstUserId, secondUserId].sort((a, b) => a - b) as [number, number];
  return conversationKey(['direct', clubId, low, high]);
}

export function eventConversationKey(clubId: string, eventType: string, eventId: string): string {
  return conversationKey(['event', clubId, eventType, eventId]);
}
