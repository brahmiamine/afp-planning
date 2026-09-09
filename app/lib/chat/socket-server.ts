import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser, onSessionRevocation, type SessionUser } from '@/lib/auth/session';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { getDb } from '@/lib/db';
import {
  appendMessage,
  assertRoomAccess,
  ChatAccessError,
  ChatValidationError,
  listMessages,
  markRoomRead,
  participantIdsForRoom,
  type ChatMessageDto,
} from './service';
import { ChatProtocolError, parseMessageCommand, parseResumeCommand, parseTypingCommand } from './protocol';
import { handshakeClientAddress } from './socket-security';

interface ClientToServerEvents {
  'chat:resume': (
    command: unknown,
    acknowledge?: (result: { ok: true; messages: ChatMessageDto[] } | { ok: false; error: string }) => void,
  ) => void;
  'chat:send': (
    command: unknown,
    acknowledge?: (result: { ok: true; message: ChatMessageDto } | { ok: false; error: string }) => void,
  ) => void;
  'chat:read': (
    command: unknown,
    acknowledge?: (result: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  /**
   * Indicateur de frappe (issue #267) : signal éphémère, jamais persisté, sans accusé
   * (fire-and-forget) — un échec silencieux (accès refusé, limite atteinte) n'a pas
   * besoin d'être remonté au client, ce n'est qu'un indicateur de confort.
   */
  'chat:typing': (command: unknown) => void;
}

interface ServerToClientEvents {
  'chat:message': (message: ChatMessageDto) => void;
  'chat:read': (receipt: { roomId: string; userId: number; sequence: number }) => void;
  /**
   * Signal léger (sans contenu) qu'un salon a reçu une activité — utilisé par la liste
   * des conversations (`ChatView`) pour rafraîchir sans que chaque socket connecté au
   * club n'ait à recevoir le contenu complet des messages d'événement.
   */
  'chat:room-touched': (touch: { roomId: string }) => void;
  /** Indicateur de frappe (issue #267) : relayé aux participants du salon, non persisté. */
  'chat:typing': (payload: { roomId: string; userId: number; nom: string }) => void;
}

interface SocketData {
  user: SessionUser;
  sessionToken: string;
}

export interface ChatSocketServerHandle {
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  stopSessionRevocationListener: () => void;
}

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
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  // Développement : toujours autoriser localhost / 127.0.0.1, quelle que soit la
  // configuration (évite qu'un APP_BASE_URL de prod dans .env casse le temps réel
  // en local).
  if (process.env.NODE_ENV !== 'production'
    && (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1')) {
    return true;
  }

  // Origine explicitement configurée.
  if (process.env.APP_BASE_URL) {
    try {
      if (originUrl.origin === new URL(process.env.APP_BASE_URL).origin) return true;
    } catch {
      // APP_BASE_URL mal formé : on retombe sur la comparaison d'hôte ci-dessous.
    }
  }

  // Repli : même hôte que la requête (reverse-proxy inclus via x-forwarded-host).
  const forwardedHost = Array.isArray(headers['x-forwarded-host'])
    ? headers['x-forwarded-host'][0]
    : headers['x-forwarded-host'];
  const host = forwardedHost || (Array.isArray(headers.host) ? headers.host[0] : headers.host);
  return !!host && originUrl.host === host.split(',')[0]?.trim();
}

function userSocketRoom(clubId: string, userId: number): string {
  return `chat:club:${clubId}:user:${userId}`;
}

function clubSocketRoom(clubId: string): string {
  return `chat:club:${clubId}`;
}

/**
 * Salon socket dédié à un salon de discussion donné. Un socket ne le rejoint qu'après
 * avoir démontré un accès valide (résolution réussie de `chat:resume` pour ce salon) —
 * c'est sur ce canal, et non `clubSocketRoom`, que sont diffusés les messages et
 * accusés de lecture d'un salon d'événement : seuls les sockets ayant réellement
 * ouvert cette conversation les reçoivent, au lieu de tout le club connecté.
 */
function roomSocketRoom(roomId: string): string {
  return `chat:room:${roomId}`;
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

/**
 * Contrairement aux quotas d'upload de pièces jointes (`attachments.ts`), sérialisés par
 * verrou MariaDB `GET_LOCK` pour rester corrects même avec plusieurs instances Next,
 * les limites de débit du chat ci-dessous (connexions, actions, messages, handshakes)
 * sont des `Map` en mémoire, **par instance de processus**. En déploiement mono-instance
 * (le cas aujourd'hui : le Dockerfile ne lance qu'un seul conteneur, `pnpm run start`),
 * elles sont donc correctes. En déploiement multi-instances (plusieurs conteneurs/pods
 * derrière un même load balancer), un utilisateur peut contourner ces limites en changeant
 * de nœud — il faudrait alors les remplacer par un compteur partagé (ex. Redis, ou un
 * verrou MariaDB comme pour les uploads).
 *
 * Garde-fou : `CHAT_INSTANCE_COUNT` (optionnelle, défaut 1) documente explicitement le
 * nombre d'instances de cette application derrière lesquelles le chat est déployé. Un
 * opérateur qui passe à plusieurs instances doit la renseigner pour être averti que ces
 * limites de débit ne sont plus appliquées correctement tant qu'elles restent en mémoire.
 */
function warnIfMultiInstanceDeployment(): void {
  const raw = process.env.CHAT_INSTANCE_COUNT?.trim();
  if (!raw) return;
  const count = Number(raw);
  if (Number.isFinite(count) && count > 1) {
    console.error(
      `[chat] CHAT_INSTANCE_COUNT=${raw} : les limites de débit du chat (socket-server.ts) sont en `
      + 'mémoire par instance et ne sont PAS appliquées correctement en déploiement multi-instances. '
      + 'Un utilisateur peut les contourner en changeant de nœud. Voir le commentaire au-dessus de cette '
      + 'fonction avant de déployer plusieurs instances.',
    );
  }
}

export function attachChatSocketServer(httpServer: HttpServer): ChatSocketServerHandle {
  warnIfMultiInstanceDeployment();
  const connectionCounts = new Map<number, number>();
  const actionTimestamps = new Map<number, number[]>();
  const messageTimestamps = new Map<number, number[]>();
  // Indicateur de frappe (issue #267) : limite dédiée, distincte de celle des messages
  // — un signal éphémère ne doit pas consommer le même budget que l'envoi de messages.
  const typingTimestamps = new Map<number, number[]>();
  const TYPING_WINDOW_MS = 2_000;
  const handshakeTimestamps = new Map<string, number[]>();
  let globalHandshakeWindowStartedAt = Date.now();
  let globalHandshakeCount = 0;

  const acceptsWithinLimit = (
    timestampsByUser: Map<number, number[]>,
    userId: number,
    maximum: number,
    now = Date.now(),
    windowMs = 10_000,
  ): boolean => {
    const timestamps = (timestampsByUser.get(userId) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (timestamps.length >= maximum) {
      timestampsByUser.set(userId, timestamps);
      return false;
    }
    timestamps.push(now);
    timestampsByUser.set(userId, timestamps);
    return true;
  };

  const acceptsHandshake = (clientAddress: string): boolean => {
    const now = Date.now();
    if (now - globalHandshakeWindowStartedAt >= 10_000) {
      globalHandshakeWindowStartedAt = now;
      globalHandshakeCount = 0;
    }
    if (globalHandshakeCount >= 2_000) return false;
    globalHandshakeCount += 1;

    const timestamps = (handshakeTimestamps.get(clientAddress) ?? [])
      .filter((timestamp) => now - timestamp < 10_000);
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
  };

  const releaseConnection = (userId: number): void => {
    const nextCount = (connectionCounts.get(userId) ?? 1) - 1;
    if (nextCount > 0) connectionCounts.set(userId, nextCount);
    else connectionCounts.delete(userId);
  };

  const reserveConnection = (userId: number): boolean => {
    const nextCount = (connectionCounts.get(userId) ?? 0) + 1;
    if (nextCount > 8) return false;
    connectionCounts.set(userId, nextCount);
    return true;
  };

  const clearInactiveRateLimitEntries = (userId: number): void => {
    const now = Date.now();
    const hasRecentActions = (actionTimestamps.get(userId) ?? [])
      .some((timestamp) => now - timestamp < 10_000);
    const hasRecentMessages = (messageTimestamps.get(userId) ?? [])
      .some((timestamp) => now - timestamp < 10_000);
    const hasRecentTyping = (typingTimestamps.get(userId) ?? [])
      .some((timestamp) => now - timestamp < TYPING_WINDOW_MS);
    if (!hasRecentActions) actionTimestamps.delete(userId);
    if (!hasRecentMessages) messageTimestamps.delete(userId);
    if (!hasRecentTyping) typingTimestamps.delete(userId);
  };

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 32 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    allowRequest: (request, callback) => {
      const clientAddress = handshakeClientAddress(request.headers, request.socket.remoteAddress);
      callback(null, isAllowedOrigin(request.headers) && acceptsHandshake(clientAddress));
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
    // Canaux `chat:room:*` rejoints par ce socket (voir chat:resume) : leur accès a été
    // vérifié pour le club courant, donc invalidé dès que celui-ci change.
    const joinedRoomChannels = new Set<string>();

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
        // Sans cela, un socket transféré vers un autre club continuerait de recevoir
        // les messages des salons d'événement de son ancien club (revue #288).
        for (const roomChannel of joinedRoomChannels) await socket.leave(roomChannel);
        joinedRoomChannels.clear();
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
        if (!acceptsWithinLimit(actionTimestamps, user.id, 60)) {
          throw new ChatProtocolError('Trop de requêtes, veuillez patienter');
        }
        await revalidateSession();
        setCurrentClubId(user.clubId);
        const command = parseResumeCommand(rawCommand);
        // Rejoint le canal dédié au salon AVANT de lire l'historique (et non après) :
        // un message envoyé par un autre participant entre les deux serait sinon à la
        // fois absent de l'instantané ci-dessous et émis avant que ce socket n'appartienne
        // au salon, donc invisible jusqu'à la prochaine reprise (revue #288). Si l'accès
        // s'avère refusé, on quitte aussitôt.
        const roomChannel = roomSocketRoom(command.roomId);
        await socket.join(roomChannel);
        joinedRoomChannels.add(roomChannel);
        let result;
        try {
          result = await listMessages(await getDb(), user, command.roomId, {
            afterSequence: command.afterSequence,
            limit: 200,
          });
        } catch (error) {
          await socket.leave(roomChannel);
          joinedRoomChannels.delete(roomChannel);
          throw error;
        }
        acknowledgeSafely(acknowledge, { ok: true, messages: result.messages });
      } catch (error) {
        acknowledgeSafely(acknowledge, { ok: false, error: publicSocketError(error, 'Reprise impossible') });
      }
    });

    socket.on('chat:send', async (rawCommand, acknowledge) => {
      try {
        if (!acceptsWithinLimit(actionTimestamps, user.id, 60)) {
          throw new ChatProtocolError('Trop de requêtes, veuillez patienter');
        }
        await revalidateSession();
        setCurrentClubId(user.clubId);
        if (!acceptsWithinLimit(messageTimestamps, user.id, 20)) {
          throw new ChatProtocolError('Trop de messages, veuillez patienter');
        }
        const command = parseMessageCommand(rawCommand);
        const result = await appendMessage(await getDb(), user, command);
        if (!result.duplicate) {
          if (result.room.type === 'event') {
            // Contenu réservé aux sockets ayant ouvert ce salon (join sur `chat:resume`) ;
            // un signal sans contenu prévient tout le club pour rafraîchir la liste des
            // conversations (dernier message / non-lus) sans lui envoyer le message lui-même.
            io.to(roomSocketRoom(result.room.id)).emit('chat:message', result.message);
            io.to(clubSocketRoom(result.room.clubId)).emit('chat:room-touched', { roomId: result.room.id });
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

    socket.on('chat:read', async (rawCommand, acknowledge) => {
      try {
        if (!acceptsWithinLimit(actionTimestamps, user.id, 60)) {
          throw new ChatProtocolError('Trop de requêtes, veuillez patienter');
        }
        await revalidateSession();
        setCurrentClubId(user.clubId);
        const command = parseResumeCommand(rawCommand);
        const { room } = await markRoomRead(await getDb(), user, command.roomId, command.afterSequence);
        const receipt = { roomId: room.id, userId: user.id, sequence: command.afterSequence };
        if (room.type === 'event') {
          // Qui a lu quoi dans un salon d'événement ne regarde que les sockets ayant
          // ouvert ce salon, pas tout le club.
          io.to(roomSocketRoom(room.id)).emit('chat:read', receipt);
        } else {
          for (const participantUserId of await participantIdsForRoom(await getDb(), room.id)) {
            io.to(userSocketRoom(room.clubId, participantUserId)).emit('chat:read', receipt);
          }
        }
        acknowledgeSafely(acknowledge, { ok: true });
      } catch (error) {
        acknowledgeSafely(acknowledge, { ok: false, error: publicSocketError(error, 'Marquage lu impossible') });
      }
    });

    // Indicateur de frappe (issue #267) : signal éphémère, sans accusé, jamais persisté.
    // Un échec (limite atteinte, accès refusé) est ignoré silencieusement — ce n'est
    // qu'un indicateur de confort, pas une action dont l'utilisateur attend un résultat.
    socket.on('chat:typing', async (rawCommand) => {
      try {
        if (!acceptsWithinLimit(typingTimestamps, user.id, 1, Date.now(), TYPING_WINDOW_MS)) return;
        await revalidateSession();
        setCurrentClubId(user.clubId);
        const command = parseTypingCommand(rawCommand);
        const room = await assertRoomAccess(await getDb(), user, command.roomId);
        const payload = { roomId: room.id, userId: user.id, nom: user.nom };
        if (room.type === 'event') {
          // `socket.to` (et non `io.to`) exclut automatiquement l'émetteur du salon.
          socket.to(roomSocketRoom(room.id)).emit('chat:typing', payload);
        } else {
          for (const participantUserId of await participantIdsForRoom(await getDb(), room.id)) {
            if (participantUserId === user.id) continue;
            io.to(userSocketRoom(room.clubId, participantUserId)).emit('chat:typing', payload);
          }
        }
      } catch {
        // Signal éphémère : aucune erreur remontée au client.
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

  return { io, stopSessionRevocationListener };
}
