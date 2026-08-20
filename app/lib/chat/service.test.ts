import { afterEach, describe, expect, it } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import {
  appendMessage,
  archiveChannel,
  ChatAccessError,
  ChatValidationError,
  createChannel,
  getOrCreateEventRoom,
  listMessages,
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
    const first = await createTestUserAndSession('superadmin', { clubId: 'afp' });
    const second = await createTestUserAndSession('arbitre', { clubId: 'afp' });
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

  it('rejects a channel participant from another club', async () => {
    const admin = await createTestUserAndSession('superadmin', { clubId: 'afp' });
    const outsider = await createTestUserAndSession('arbitre', { clubId: 'other' });
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
    const outsider = await createTestUserAndSession('arbitre', { clubId: 'other' });
    try {
      const outsiderSession = await getSessionUser(outsider.token);
      await expect(
        runWithClubId(outsiderSession!.clubId, () =>
          getOrCreateEventRoom(await getDb(), outsiderSession!, 'officiel', 'foreign-event'),
        ),
      ).rejects.toBeInstanceOf(ChatValidationError);
    } finally {
      await outsider.cleanup();
    }
  });

  it('revokes event-chat access when the event is no longer published', async () => {
    const clubId = process.env.APP_CLUB_ID || 'afp';
    const member = await createTestUserAndSession('arbitre', { clubId });
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
      const session = await getSessionUser(member.token);
      const room = await runWithClubId(clubId, () => getOrCreateEventRoom(db, session!, 'officiel', eventId));
      roomIds.push(room.id);

      await db.getRepository('MatchExtra').save({
        matchId: eventId,
        clubId,
        payload: { id: eventId, planningStatus: 'cancelled' },
      });

      await expect(listMessages(db, session!, room.id)).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await db.getRepository('MatchExtra').delete({ matchId: eventId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: eventId, clubId });
      await member.cleanup();
    }
  });

  it('makes an archived channel and its history inaccessible', async () => {
    const admin = await createTestUserAndSession('superadmin', { clubId: 'afp' });
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
});
