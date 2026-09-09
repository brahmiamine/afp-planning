import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { savePlanningRecord } from '@/lib/planning/records';
import {
  anonymizeMessagesForDeletedUser,
  ANONYMIZED_SENDER_NAME,
  appendMessage,
  archiveChannel,
  ChatAccessError,
  ChatValidationError,
  createChannel,
  deleteMessage,
  getOrCreateEventRoom,
  listMessages,
  listRooms,
} from './service';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('chat service integration', () => {
  const roomIds: string[] = [];

  afterEach(async () => {
    if (roomIds.length === 0) return;
    const db = await getDb();
    await db.getRepository('ChatReadState').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
    await db.getRepository('ChatMessage').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
    await db.getRepository('ChatParticipant').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
    await db.getRepository('ChatRoom').createQueryBuilder().delete().where('id IN (:...ids)', { ids: roomIds }).execute();
    roomIds.length = 0;
  });

  it('applies a retried message exactly once', async () => {
    const first = await createTestUserAndSession('admin', { clubId: 'afp' });
    const second = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const firstSession = await getSessionUser(first.token);
      const secondSession = await getSessionUser(second.token);
      expect(firstSession).not.toBeNull();
      expect(secondSession).not.toBeNull();
      const room = await createChannel(await getDb(), firstSession!, { name: 'Opérations' }, [second.user.id]);
      roomIds.push(room.id);
      const command = {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Message unique',
        attachment: null,
      };

      const initial = await appendMessage(await getDb(), firstSession!, command);
      const retry = await appendMessage(await getDb(), firstSession!, command);
      const history = await listMessages(await getDb(), secondSession!, room.id);

      expect(initial.duplicate).toBe(false);
      expect(retry.duplicate).toBe(true);
      expect(retry.message.id).toBe(initial.message.id);
      expect(history.messages).toHaveLength(1);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it('lists rooms with a bounded number of raw queries, independent of the room count', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const memberSession = await getSessionUser(member.token);
      const db = await getDb();

      const rooms = await Promise.all(
        Array.from({ length: 4 }, (_, index) => createChannel(db, adminSession!, { name: `Salon ${index}` }, [member.user.id])),
      );
      for (const room of rooms) roomIds.push(room.id);
      for (const [index, room] of rooms.entries()) {
        await appendMessage(db, adminSession!, {
          roomId: room.id,
          clientMessageId: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, '0')}`,
          content: `Message dans ${room.name}`,
          attachment: null,
        });
      }

      const querySpy = vi.spyOn(db.manager, 'query');
      const dtos = await listRooms(db, memberSession!);
      const queriesForFourRooms = querySpy.mock.calls.length;
      querySpy.mockRestore();

      expect(dtos.filter((dto) => rooms.some((room) => room.id === dto.id))).toHaveLength(4);
      for (const dto of dtos) {
        const room = rooms.find((item) => item.id === dto.id);
        if (!room) continue;
        expect(dto.lastMessage?.content).toBe(`Message dans ${room.name}`);
        expect(dto.unreadCount).toBe(1);
      }
      // Deux requêtes agrégées (dernier message + non-lus), quel que soit le nombre de
      // salons — avant #256, c'était 2 requêtes PAR salon (N+1).
      expect(queriesForFourRooms).toBe(2);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });

  it('rejects a channel participant from another club', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const outsider = await createTestUserAndSession('dirigeant', { clubId: 'other' }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const outsiderSession = await getSessionUser(outsider.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Club AFP' }, []);
      roomIds.push(room.id);

      await expect(listMessages(await getDb(), outsiderSession!, room.id)).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await admin.cleanup();
      await outsider.cleanup();
    }
  });

  it('does not expose the planning corpus from another club', async () => {
    const outsider = await createTestUserAndSession('dirigeant', { clubId: 'other' }, ['arbitre_club']);
    const db = await getDb();
    try {
      const outsiderSession = await getSessionUser(outsider.token);
      await expect(
        runWithClubId(outsiderSession!.clubId, () =>
          getOrCreateEventRoom(db, outsiderSession!, 'officiel', 'foreign-event'),
        ),
      ).rejects.toBeInstanceOf(ChatValidationError);
    } finally {
      await outsider.cleanup();
    }
  });

  it('revokes event-chat access when the event is no longer published', async () => {
    const clubId = process.env.APP_CLUB_ID || 'afp';
    const member = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const eventId = `chat-event-${Date.now()}`;
    const db = await getDb();
    try {
      await db.getRepository('MatchOfficial').save({
        id: eventId,
        clubId,
        date: '20/08/2026',
        time: '18:00',
        payload: {
          id: eventId,
          date: '20/08/2026',
          time: '18:00',
          localTeam: 'AFP',
          awayTeam: 'Visiteur',
          type: 'officiel',
        },
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
          publishedByUserId: member.user.id,
          events: [{
            eventId,
            eventType: 'officiel',
            title: 'AFP – Visiteur',
            date: '20/08/2026',
            time: '18:00',
            durationMinutes: 90,
            location: null,
            planningStatus: 'published',
            event: {
              id: eventId,
              date: '20/08/2026',
              time: '18:00',
              localTeam: 'AFP',
              awayTeam: 'Visiteur',
              type: 'officiel',
            },
            extras: { id: eventId, planningStatus: 'published' },
            assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
          }],
        },
      }));
      const session = await getSessionUser(member.token);
      const room = await runWithClubId(clubId, () => getOrCreateEventRoom(db, session!, 'officiel', eventId));
      roomIds.push(room.id);

      // Une republication qui retire l'événement révoque le salon ; le statut live n'est
      // plus consulté comme source de visibilité.
      await runWithClubId(clubId, () => savePlanningRecord(db, {
        id: `published-planning:${clubId}`,
        clubId,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: member.user.id,
          events: [],
        },
      }));

      await expect(listMessages(db, session!, room.id)).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [`published-planning:${clubId}`, clubId]);
      await db.getRepository('MatchExtra').delete({ matchId: eventId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: eventId, clubId });
      await member.cleanup();
    }
  });

  it('makes an archived channel and its history inaccessible', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    try {
      const session = await getSessionUser(admin.token);
      const room = await createChannel(await getDb(), session!, { name: 'Archives' }, []);
      roomIds.push(room.id);
      await archiveChannel(await getDb(), session!, room.id);

      await expect(listMessages(await getDb(), session!, room.id)).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await admin.cleanup();
    }
  });

  it('lets an admin delete a message: content/attachment purged, readers see the placeholder (issue #259)', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const memberSession = await getSessionUser(member.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Modération' }, [member.user.id]);
      roomIds.push(room.id);

      const posted = await appendMessage(await getDb(), memberSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655449900',
        content: 'Message à modérer',
        attachment: { type: 'image', url: '/api/chat/attachments/550e8400-e29b-41d4-a716-446655449901', mimeType: 'image/png', name: 'photo.png', size: 42 },
      });

      const result = await deleteMessage(await getDb(), adminSession!, room.id, posted.message.id);
      expect(result.message.content).toBe('');
      expect(result.message.attachment).toBeNull();
      expect(result.message.deletedAt).not.toBeNull();

      const history = await listMessages(await getDb(), memberSession!, room.id);
      const stillThere = history.messages.find((m) => m.id === posted.message.id);
      expect(stillThere).toBeDefined();
      expect(stillThere!.content).toBe('');
      expect(stillThere!.attachment).toBeNull();
      expect(stillThere!.deletedAt).not.toBeNull();
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });

  it('rejects message deletion by a non-admin', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const memberSession = await getSessionUser(member.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Modération 2' }, [member.user.id]);
      roomIds.push(room.id);
      const posted = await appendMessage(await getDb(), memberSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655449902',
        content: 'Message',
        attachment: null,
      });

      await expect(deleteMessage(await getDb(), memberSession!, room.id, posted.message.id))
        .rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });

  it('rejects message deletion by an admin who is not a participant of a direct room', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const outsiderAdmin = await createTestUserAndSession('admin', { clubId: 'afp' });
    try {
      const adminSession = await getSessionUser(admin.token);
      const outsiderAdminSession = await getSessionUser(outsiderAdmin.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Privé admin' }, []);
      roomIds.push(room.id);
      const posted = await appendMessage(await getDb(), adminSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655449903',
        content: 'Message privé',
        attachment: null,
      });

      await expect(deleteMessage(await getDb(), outsiderAdminSession!, room.id, posted.message.id))
        .rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await admin.cleanup();
      await outsiderAdmin.cleanup();
    }
  });

  it('anonymizes senderName across all of a deleted account\'s messages (issue #259)', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const memberSession = await getSessionUser(member.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Anonymisation' }, [member.user.id]);
      roomIds.push(room.id);
      await appendMessage(await getDb(), memberSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655449904',
        content: 'Un message',
        attachment: null,
      });

      await anonymizeMessagesForDeletedUser(await getDb(), member.user.id);

      const history = await listMessages(await getDb(), adminSession!, room.id);
      expect(history.messages[0]!.senderName).toBe(ANONYMIZED_SENDER_NAME);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });
});
