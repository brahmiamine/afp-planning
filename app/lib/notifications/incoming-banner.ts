export interface IncomingBanner {
  id: string;
  title: string;
  body: string;
  href: string;
  icon?: string;
  roomId?: string;
}

export const INCOMING_NOTIFICATION_SW_TYPE = 'incoming-notification';

let activeChatRoomId: string | null = null;

export function setActiveChatRoomId(roomId: string | null): void {
  activeChatRoomId = roomId;
}

export function getActiveChatRoomId(): string | null {
  return activeChatRoomId;
}

export function previewIncomingMessage(content: string, hasAttachment: boolean): string {
  const text = content.trim();
  if (text) return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  return hasAttachment ? 'Pièce jointe' : 'Nouveau message';
}

export function incomingBannerFromChatMessage(
  message: {
    id: string;
    roomId: string;
    senderUserId: number;
    senderName: string;
    content: string;
    attachment?: unknown;
    deletedAt?: string | null;
  },
  href: string,
): IncomingBanner | null {
  if (message.deletedAt) return null;
  return {
    id: `chat:${message.id}`,
    title: message.senderName || 'Nouveau message',
    body: previewIncomingMessage(message.content, Boolean(message.attachment)),
    href,
    roomId: message.roomId,
  };
}

export function incomingBannerFromPushPayload(payload: {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  icon?: string;
  notificationId?: string;
}): IncomingBanner | null {
  if (payload.type !== INCOMING_NOTIFICATION_SW_TYPE) return null;
  const title = payload.title?.trim();
  const href = payload.url?.trim();
  if (!title || !href) return null;
  return {
    id: payload.notificationId?.trim() || `push:${title}:${href}`,
    title,
    body: payload.body?.trim() || 'Vous avez une nouvelle notification.',
    href,
    icon: payload.icon,
  };
}

export function shouldSuppressIncomingBanner(banner: IncomingBanner, currentUserId: number | null | undefined, senderUserId?: number): boolean {
  if (senderUserId != null && currentUserId != null && senderUserId === currentUserId) return true;
  if (banner.roomId && banner.roomId === activeChatRoomId) return true;
  return false;
}
