import type { ChatAttachmentType } from '@/lib/db/schemas';

export interface ChatAttachmentInput {
  type: ChatAttachmentType;
  url: string;
  mimeType: string;
  name: string;
  size: number;
}

export interface ChatMessageCommand {
  roomId: string;
  clientMessageId: string;
  content: string;
  attachment: ChatAttachmentInput | null;
  /** Réponse/citation à un autre message du même salon (issue #268). */
  replyToMessageId: string | null;
  /**
   * Transfert (issue #268) : id du message d'origine. Le nom affiché comme
   * « Transféré de … » n'est JAMAIS pris tel quel côté client — il est dérivé
   * côté serveur à partir de ce message, après vérification que l'expéditeur y a
   * accès, pour empêcher qu'un client n'attribue un message à n'importe qui.
   */
  forwardSourceMessageId: string | null;
}

export class ChatProtocolError extends Error {}

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const CLIENT_MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CHAT_MESSAGE_LENGTH = 4_000;
const ATTACHMENT_TYPES: ChatAttachmentType[] = ['image', 'video', 'audio', 'gif'];
const ATTACHMENT_URL_PATTERN = /^\/api\/chat\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAttachment(value: unknown): ChatAttachmentInput | null {
  if (value === null || value === undefined) return null;
  const input = recordOf(value);
  const type = input.type;
  if (typeof type !== 'string' || !ATTACHMENT_TYPES.includes(type as ChatAttachmentType)) {
    throw new ChatProtocolError('Type de pièce jointe invalide');
  }
  const url = typeof input.url === 'string' ? input.url : '';
  if (!ATTACHMENT_URL_PATTERN.test(url)) throw new ChatProtocolError('Pièce jointe invalide');
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.slice(0, 100) : '';
  const name = typeof input.name === 'string' ? input.name.slice(0, 200) : '';
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size < 0 || size > 200 * 1024 * 1024) {
    throw new ChatProtocolError('Pièce jointe invalide');
  }
  return { type: type as ChatAttachmentType, url, mimeType, name, size };
}

export function parseMessageCommand(value: unknown): ChatMessageCommand {
  const input = recordOf(value);
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const attachment = parseAttachment(input.attachment);
  if (!content && !attachment) throw new ChatProtocolError('Message vide');
  if (content.length > MAX_CHAT_MESSAGE_LENGTH) throw new ChatProtocolError('Message trop long');

  const roomId = typeof input.roomId === 'string' ? input.roomId : '';
  if (!ROOM_ID_PATTERN.test(roomId)) throw new ChatProtocolError('Salon invalide');

  const clientMessageId = typeof input.clientMessageId === 'string' ? input.clientMessageId : '';
  if (!CLIENT_MESSAGE_ID_PATTERN.test(clientMessageId)) {
    throw new ChatProtocolError('Identifiant de message invalide');
  }

  const rawReplyToMessageId = input.replyToMessageId;
  const replyToMessageId = typeof rawReplyToMessageId === 'string' ? rawReplyToMessageId : null;
  if (replyToMessageId !== null && !MESSAGE_ID_PATTERN.test(replyToMessageId)) {
    throw new ChatProtocolError('Message cité invalide');
  }

  const rawForwardSourceMessageId = input.forwardSourceMessageId;
  const forwardSourceMessageId = typeof rawForwardSourceMessageId === 'string' ? rawForwardSourceMessageId : null;
  if (forwardSourceMessageId !== null && !MESSAGE_ID_PATTERN.test(forwardSourceMessageId)) {
    throw new ChatProtocolError('Message à transférer invalide');
  }

  return { roomId, clientMessageId, content, attachment, replyToMessageId, forwardSourceMessageId };
}

export interface ChatResumeCommand {
  roomId: string;
  afterSequence: number;
}

export function parseResumeCommand(value: unknown): ChatResumeCommand {
  const input = recordOf(value);
  const roomId = typeof input.roomId === 'string' ? input.roomId : '';
  if (!ROOM_ID_PATTERN.test(roomId)) throw new ChatProtocolError('Salon invalide');
  const afterSequence = Number(input.afterSequence ?? 0);
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    throw new ChatProtocolError('Séquence de reprise invalide');
  }
  return { roomId, afterSequence };
}
