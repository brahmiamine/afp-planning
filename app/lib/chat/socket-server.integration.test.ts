import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { runWithClubId } from '@/lib/auth/club-context';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { savePlanningRecord } from '@/lib/planning/records';
import { createChannel, getOrCreateEventRoom, type ChatMessageDto } from './service';
import { attachChatSocketServer } from './socket-server';

async function waitForDatabase(): Promise<boolean> {
  const attempts = process.env.CI ? 10 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isDbAvailable()) return true;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

const dbAvailable = await waitForDatabase();
if (process.env.CI && !dbAvailable) {
  throw new Error('MariaDB is required for the Socket.IO integration test in CI');
}

interface SendAcknowledgement {
  ok: boolean;
  error?: string;
  message?: ChatMessageDto;
}

function connectClient(origin: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(origin, {
      autoConnect: false,
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        Origin: origin,
      },
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO connection timeout'));
    }, 5_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });
}

describe.skipIf(!dbAvailable)('Socket.IO chat integration', () => {
  const sockets: Socket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  it('persists one message and broadcasts it to a second authenticated client', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    const db = await getDb();
    const adminSession = await getSessionUser(admin.token);
    expect(adminSession).not.toBeNull();
    const room = await createChannel(db, adminSession!, { name: 'Socket E2E' }, [member.user.id]);
    const httpServer = createServer((_request, response) => {
      response.writeHead(404).end();
    });
    const socketServer = attachChatSocketServer(httpServer);

    try {
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const address = httpServer.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;
      const [sender, receiver] = await Promise.all([
        connectClient(origin, admin.token),
        connectClient(origin, member.token),
      ]);
      sockets.push(sender, receiver);

      const received = new Promise<ChatMessageDto>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Message broadcast timeout')), 5_000);
        receiver.once('chat:message', (message: ChatMessageDto) => {
          clearTimeout(timeout);
          resolve(message);
        });
      });

      const command = {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440001',
        content: 'Message Socket.IO persistant',
      };
      const acknowledgement = await new Promise<SendAcknowledgement>((resolve) => {
        sender.emit('chat:send', command, resolve);
      });
      const broadcast = await received;

      expect(acknowledgement.ok).toBe(true);
      expect(acknowledgement.message?.id).toBe(broadcast.id);
      expect(broadcast.content).toBe(command.content);
      const persisted = await db.getRepository('ChatMessage').findBy({ roomId: room.id });
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.content).toBe(command.content);
      expect(persisted[0]?.sequence).toBe(1);
    } finally {
      socketServer.stopSessionRevocationListener();
      await new Promise<void>((resolve) => socketServer.io.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await db.getRepository('ChatReadState').delete({ roomId: room.id });
      await db.getRepository('ChatMessage').delete({ roomId: room.id });
      await db.getRepository('ChatParticipant').delete({ roomId: room.id });
      await db.getRepository('ChatRoom').delete({ id: room.id });
      await admin.cleanup();
      await member.cleanup();
    }
  });

  it('scopes an event room message to sockets that opened that room, not the whole club', async () => {
    const clubId = process.env.APP_CLUB_ID || 'afp';
    const admin = await createTestUserAndSession('admin', { clubId });
    const viewer = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const bystander = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const db = await getDb();
    const eventId = `chat-event-socket-${Date.now()}`;
    const httpServer = createServer((_request, response) => {
      response.writeHead(404).end();
    });
    const socketServer = attachChatSocketServer(httpServer);
    let roomId: string | null = null;

    try {
      await db.getRepository('MatchOfficial').save({
        id: eventId,
        clubId,
        date: '20/08/2026',
        time: '18:00',
        payload: { id: eventId, date: '20/08/2026', time: '18:00', localTeam: 'AFP', awayTeam: 'Visiteur', type: 'officiel' },
      });
      await db.getRepository('MatchExtra').save({
        matchId: eventId,
        clubId,
        payload: { id: eventId, planningStatus: 'published' },
      });
      await runWithClubId(clubId, () => savePlanningRecord(db, {
        id: `published-planning:${clubId}`,
        clubId,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: admin.user.id,
          events: [{
            eventId,
            eventType: 'officiel',
            title: 'AFP – Visiteur',
            date: '20/08/2026',
            time: '18:00',
            durationMinutes: 90,
            location: null,
            planningStatus: 'published',
            event: { id: eventId, date: '20/08/2026', time: '18:00', localTeam: 'AFP', awayTeam: 'Visiteur', type: 'officiel' },
            extras: { id: eventId, planningStatus: 'published' },
            assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
          }],
        },
      }));

      const adminSession = await getSessionUser(admin.token);
      const room = await runWithClubId(clubId, () => getOrCreateEventRoom(db, adminSession!, 'officiel', eventId));
      roomId = room.id;

      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const address = httpServer.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;
      const [sender, viewerSocket, bystanderSocket] = await Promise.all([
        connectClient(origin, admin.token),
        connectClient(origin, viewer.token),
        connectClient(origin, bystander.token),
      ]);
      sockets.push(sender, viewerSocket, bystanderSocket);

      // Le viewer ouvre le salon (comme ChatConversation au montage) : le serveur le fait
      // rejoindre le canal socket dédié à ce salon après avoir vérifié son accès.
      await new Promise<void>((resolve, reject) => {
        viewerSocket.emit('chat:resume', { roomId: room.id, afterSequence: 0 }, (result: { ok: boolean; error?: string }) => {
          if (!result.ok) reject(new Error(result.error));
          else resolve();
        });
      });

      const viewerReceived = new Promise<ChatMessageDto>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('viewer message timeout')), 5_000);
        viewerSocket.once('chat:message', (message: ChatMessageDto) => {
          clearTimeout(timeout);
          resolve(message);
        });
      });
      const bystanderTouched = new Promise<{ roomId: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('room-touched timeout')), 5_000);
        bystanderSocket.once('chat:room-touched', (touch: { roomId: string }) => {
          clearTimeout(timeout);
          resolve(touch);
        });
      });
      let bystanderReceivedFullMessage = false;
      bystanderSocket.once('chat:message', () => { bystanderReceivedFullMessage = true; });

      const command = {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440099',
        content: 'Message événement ciblé',
      };
      const acknowledgement = await new Promise<SendAcknowledgement>((resolve) => {
        sender.emit('chat:send', command, resolve);
      });
      expect(acknowledgement.ok).toBe(true);

      const viewerMessage = await viewerReceived;
      expect(viewerMessage.content).toBe(command.content);

      const touch = await bystanderTouched;
      expect(touch.roomId).toBe(room.id);

      // Laisse le temps à un éventuel envoi club-wide (régression) d'arriver.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(bystanderReceivedFullMessage).toBe(false);
    } finally {
      socketServer.stopSessionRevocationListener();
      await new Promise<void>((resolve) => socketServer.io.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (roomId) {
        await db.getRepository('ChatReadState').delete({ roomId });
        await db.getRepository('ChatMessage').delete({ roomId });
        await db.getRepository('ChatRoom').delete({ id: roomId });
      }
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [`published-planning:${clubId}`, clubId]);
      await db.getRepository('MatchExtra').delete({ matchId: eventId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: eventId, clubId });
      await admin.cleanup();
      await viewer.cleanup();
      await bystander.cleanup();
    }
  });
});
