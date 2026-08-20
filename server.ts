import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import { SESSION_COOKIE_NAME } from './app/lib/auth/constants';
import { getSessionUser, onSessionRevocation, type SessionUser } from './app/lib/auth/session';
import { getDb } from './app/lib/db';
import {
  appendMessage,
  ChatAccessError,
  ChatValidationError,
  listMessages,
  type ChatMessageDto,
} from './app/lib/chat/service';
import { ChatProtocolError, parseMessageCommand, parseResumeCommand } from './app/lib/chat/protocol';
import { handshakeClientAddress } from './app/lib/chat/socket-security';

interface ClientToServerEvents {
  'chat:resume': (
    command: unknown,
    acknowledge?: (result: { ok: true; messages: ChatMessageDto[] } | { ok: false; error: string }) => void,
  ) => void;
  'chat:send': (
    command: unknown,
    acknowledge?: (result: { ok: true; message: ChatMessageDto } | { ok: false; error: string }) => void,
  ) => void;
}

interface ServerToClientEvents {
  'chat:message': (message: ChatMessageDto) => void;
}

interface SocketData {
  user: SessionUser;
  sessionToken: string;
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isAllowedOrigin(headers: Record<string, string | string[] | undefined>): boolean {
  const origin = Array.isArray(headers.origin) ? headers.origin[0] : headers.origin;
  if (!origin) return false;
  try {
    const configured = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).origin : null;
    if (configured) return new URL(origin).origin === configured;
    const forwardedHost = Array.isArray(headers['x-forwarded-host'])
      ? headers['x-forwarded-host'][0]
      : headers['x-forwarded-host'];
    const host = forwardedHost || (Array.isArray(headers.host) ? headers.host[0] : headers.host);
    return !!host && new URL(origin).host === host.split(',')[0]?.trim();
  } catch {
    return false;
  }
}

function userSocketRoom(clubId: string, userId: number): string {
  return `chat:club:${clubId}:user:${userId}`;
}

function clubSocketRoom(clubId: string): string {
  return `chat:club:${clubId}`;
}

const MAX_CONNECTIONS_PER_USER = 8;
const connectionCounts = new Map<number, number>();
const actionTimestamps = new Map<number, number[]>();
const messageTimestamps = new Map<number, number[]>();
const handshakeTimestamps = new Map<string, number[]>();
let globalHandshakeWindowStartedAt = Date.now();
let globalHandshakeCount = 0;

function acceptsWithinLimit(
  timestampsByUser: Map<number, number[]>,
  userId: number,
  maximum: number,
  now = Date.now(),
): boolean {
  const timestamps = (timestampsByUser.get(userId) ?? []).filter((timestamp) => now - timestamp < 10_000);
  if (timestamps.length >= maximum) {
    timestampsByUser.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  timestampsByUser.set(userId, timestamps);
  return true;
}

function acceptsAction(userId: number): boolean {
  return acceptsWithinLimit(actionTimestamps, userId, 60);
}

function acceptsMessage(userId: number): boolean {
  return acceptsWithinLimit(messageTimestamps, userId, 20);
}

function acceptsHandshake(clientAddress: string): boolean {
  const now = Date.now();
  if (now - globalHandshakeWindowStartedAt >= 10_000) {
    globalHandshakeWindowStartedAt = now;
    globalHandshakeCount = 0;
  }
  if (globalHandshakeCount >= 2_000) return false;
  globalHandshakeCount += 1;

  const timestamps = (handshakeTimestamps.get(clientAddress) ?? []).filter((timestamp) => now - timestamp < 10_000);
  if (timestamps.length >= 40) {
    handshakeTimestamps.set(clientAddress, timestamps);
    return false;
  }
  timestamps.push(now);
  handshakeTimestamps.set(clientAddress, timestamps);
  if (handshakeTimestamps.size > 10_000) {
    for (const [address, values] of handshakeTimestamps) {
      if (!values.some((timestamp) => now - timestamp < 10_000)) handshakeTimestamps.delete(address);
    }
  }
  return true;
}

function publicSocketError(error: unknown, fallback: string): string {
  if (
    error instanceof ChatAccessError
    || error instanceof ChatValidationError
    || error instanceof ChatProtocolError
  ) {
    return error.message;
  }
  return fallback;
}

function acknowledgeSafely<T>(acknowledge: ((result: T) => void) | undefined, result: T): void {
  if (typeof acknowledge === 'function') acknowledge(result);
}

function releaseConnection(userId: number): void {
  const nextCount = (connectionCounts.get(userId) ?? 1) - 1;
  if (nextCount > 0) connectionCounts.set(userId, nextCount);
  else connectionCounts.delete(userId);
}

function reserveConnection(userId: number): boolean {
  const nextCount = (connectionCounts.get(userId) ?? 0) + 1;
  if (nextCount > MAX_CONNECTIONS_PER_USER) return false;
  connectionCounts.set(userId, nextCount);
  return true;
}

function clearInactiveRateLimitEntries(userId: number): void {
  const now = Date.now();
  const hasRecentActions = (actionTimestamps.get(userId) ?? []).some((timestamp) => now - timestamp < 10_000);
  const hasRecentMessages = (messageTimestamps.get(userId) ?? []).some((timestamp) => now - timestamp < 10_000);
  if (!hasRecentActions) actionTimestamps.delete(userId);
  if (!hasRecentMessages) messageTimestamps.delete(userId);
}

await app.prepare();

const httpServer = createServer((request, response) => handle(request, response));
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  path: '/socket.io',
  serveClient: false,
  maxHttpBufferSize: 32 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  allowRequest: (request, callback) => {
    const clientAddress = handshakeClientAddress(request.headers, request.socket.remoteAddress);
    const allowed = isAllowedOrigin(request.headers) && acceptsHandshake(clientAddress);
    callback(null, allowed);
  },
});

io.use(async (socket, nextMiddleware) => {
  try {
    const token = cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
    const user = await getSessionUser(token);
    if (!user) return nextMiddleware(new Error('Non authentifié'));
    socket.data.user = user;
    socket.data.sessionToken = token!;
    nextMiddleware();
  } catch {
    nextMiddleware(new Error('Non authentifié'));
  }
});

io.on('connection', (socket) => {
  let user = socket.data.user;
  if (!reserveConnection(user.id)) {
    socket.disconnect(true);
    return;
  }
  void socket.join([userSocketRoom(user.clubId, user.id), clubSocketRoom(user.clubId)]);

  const revalidateSession = async () => {
    const activeUser = await getSessionUser(socket.data.sessionToken);
    if (!activeUser || activeUser.id !== user.id) {
      socket.disconnect(true);
      throw new Error('Session expirée');
    }
    if (activeUser.clubId !== user.clubId) {
      await socket.leave(userSocketRoom(user.clubId, user.id));
      await socket.leave(clubSocketRoom(user.clubId));
      await socket.join(userSocketRoom(activeUser.clubId, activeUser.id));
      await socket.join(clubSocketRoom(activeUser.clubId));
    }
    user = activeUser;
    socket.data.user = activeUser;
    return activeUser;
  };
  const sessionCheck = setInterval(() => {
    void revalidateSession().catch(() => undefined);
  }, 15_000);

  socket.on('chat:resume', async (rawCommand, acknowledge) => {
    try {
      if (!acceptsAction(user.id)) throw new ChatProtocolError('Trop de requêtes, veuillez patienter');
      await revalidateSession();
      const command = parseResumeCommand(rawCommand);
      const result = await listMessages(await getDb(), user, command.roomId, {
        afterSequence: command.afterSequence,
        limit: 200,
      });
      acknowledgeSafely(acknowledge, { ok: true, messages: result.messages });
    } catch (error) {
      acknowledgeSafely(acknowledge, { ok: false, error: publicSocketError(error, 'Reprise impossible') });
    }
  });

  socket.on('chat:send', async (rawCommand, acknowledge) => {
    try {
      if (!acceptsAction(user.id)) throw new ChatProtocolError('Trop de requêtes, veuillez patienter');
      await revalidateSession();
      if (!acceptsMessage(user.id)) throw new ChatProtocolError('Trop de messages, veuillez patienter');
      const command = parseMessageCommand(rawCommand);
      const result = await appendMessage(await getDb(), user, command);
      if (!result.duplicate) {
        if (result.room.type === 'event') {
          io.to(clubSocketRoom(result.room.clubId)).emit('chat:message', result.message);
        } else {
          for (const participantUserId of result.participantUserIds) {
            io.to(userSocketRoom(result.room.clubId, participantUserId)).emit('chat:message', result.message);
          }
        }
      }
      acknowledgeSafely(acknowledge, { ok: true, message: result.message });
    } catch (error) {
      acknowledgeSafely(acknowledge, { ok: false, error: publicSocketError(error, 'Envoi impossible') });
    }
  });
  socket.on('disconnect', () => {
    clearInterval(sessionCheck);
    releaseConnection(user.id);
    clearInactiveRateLimitEntries(user.id);
  });
});

const stopSessionRevocationListener = onSessionRevocation((event) => {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.user.id !== event.userId) continue;
    if (event.sessionToken && socket.data.sessionToken !== event.sessionToken) continue;
    socket.disconnect(true);
  }
});

httpServer.listen(port, hostname, () => {
  console.log(`AFP Planning listening on http://${hostname}:${port}`);
});

function shutdown() {
  stopSessionRevocationListener();
  io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
