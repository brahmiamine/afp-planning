export interface ChatMessageCommand {
  roomId: string;
  clientMessageId: string;
  content: string;
}

export class ChatProtocolError extends Error {}

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const CLIENT_MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_CHAT_MESSAGE_LENGTH = 4_000;

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseMessageCommand(value: unknown): ChatMessageCommand {
  const input = recordOf(value);
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) throw new ChatProtocolError('Message vide');
  if (content.length > MAX_CHAT_MESSAGE_LENGTH) throw new ChatProtocolError('Message trop long');

  const roomId = typeof input.roomId === 'string' ? input.roomId : '';
  if (!ROOM_ID_PATTERN.test(roomId)) throw new ChatProtocolError('Salon invalide');

  const clientMessageId = typeof input.clientMessageId === 'string' ? input.clientMessageId : '';
  if (!CLIENT_MESSAGE_ID_PATTERN.test(clientMessageId)) {
    throw new ChatProtocolError('Identifiant de message invalide');
  }

  return { roomId, clientMessageId, content };
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
