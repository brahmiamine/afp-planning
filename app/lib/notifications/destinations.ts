import type { ClubAccessRole } from '@/lib/auth/roles';
import {
  eventWorkspaceHref,
  personalEventWorkspaceHref,
  type PlanningEventLinkType,
} from '@/lib/planning/event-links';

export type NotificationSpace = 'club' | 'personal';

const PLANNING_EVENT_TYPES = new Set<PlanningEventLinkType>(['officiel', 'amical', 'entrainement', 'plateau']);

export function notificationSpace(accessRole: ClubAccessRole | null | undefined): NotificationSpace {
  return accessRole === 'admin' ? 'club' : 'personal';
}

export function notificationsInboxHref(space: NotificationSpace): string {
  return space === 'club' ? '/club/notifications' : '/mon-planning/notifications';
}

export function chatRoomHref(space: NotificationSpace, roomId: string): string {
  const base = space === 'club' ? '/club/chat' : '/mon-planning/chat';
  return `${base}?roomId=${encodeURIComponent(roomId)}`;
}

function isPlanningEventType(value: string): value is PlanningEventLinkType {
  return PLANNING_EVENT_TYPES.has(value as PlanningEventLinkType);
}

/**
 * Destination réelle d'une notification (issue #321) : plus jamais `/notifications`,
 * qui n'existe pas. Chat → salon, événement de planning → espace événement, sinon inbox.
 */
export function notificationDestinationHref(input: {
  accessRole?: ClubAccessRole | null;
  type?: string | null;
  eventType?: string | null;
  eventId?: string | null;
}): string {
  const space = notificationSpace(input.accessRole);
  const eventType = input.eventType?.trim() || null;
  const eventId = input.eventId?.trim() || null;

  if (eventType === 'chat' && eventId) {
    return chatRoomHref(space, eventId);
  }

  if (eventType && eventId && isPlanningEventType(eventType)) {
    return space === 'club'
      ? eventWorkspaceHref(eventType, eventId)
      : personalEventWorkspaceHref(eventType, eventId);
  }

  return notificationsInboxHref(space);
}

export const FALLBACK_PUSH_NOTIFICATION_URL = '/club/notifications';
