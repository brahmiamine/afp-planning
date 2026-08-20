import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createChannel, type ChatMessageDto } from './service';
import { attachChatSocketServer } from './socket-server';

const dbAvailable = await isDbAvailable();

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
    const admin = await createTestUserAndSession('superadmin', { clubId: 'afp' });
    const member = await createTestUserAndSession('arbitre', { clubId: 'afp' });
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
});
