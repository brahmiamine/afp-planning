import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { savePlanningRecord } from '@/lib/planning/records';
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
    const first = await createTestUserAndSession('admin', { clubId: 'afp' });
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
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
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

  it('never falls back to the live draft for a personal account before the first global publication (issue #147)', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const member = await createTestUserAndSession('arbitre', { clubId });
    const eventId = `chat-event-${randomBytes(4).toString('hex')}`;
    const db = await getDb();
    try {
      // Le champ live dit déjà 'published', mais le club n'a jamais exécuté de publication
      // globale (aucun snapshot published-planning) : un compte personnel ne doit rien voir.
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
      const session = await getSessionUser(member.token);
      await expect(
        runWithClubId(clubId, () => getOrCreateEventRoom(db, session!, 'officiel', eventId)),
      ).rejects.toBeInstanceOf(ChatValidationError);
    } finally {
      await db.getRepository('MatchExtra').delete({ matchId: eventId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: eventId, clubId });
      await member.cleanup();
    }
  });

  it('revokes event-chat access when the event is no longer published', async () => {
    // Club synthétique et unique à ce test : jamais l'APP_CLUB_ID réel, pour ne pas
    // interférer avec le planning publié réel d'un développeur lançant `pnpm test` en local
    // (cf. revue Codex sur #169/#177).
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const member = await createTestUserAndSession('arbitre', { clubId });
    const eventId = `chat-event-${Date.now()}`;
    const db = await getDb();
    const publishedRecordId = `published-planning:${clubId}`;
    const eventSnapshot = {
      eventId,
      eventType: 'officiel' as const,
      title: 'AFP – Visiteur',
      date: '20/08/2026',
      time: '18:00',
      durationMinutes: 90,
      location: null,
      planningStatus: 'published' as const,
      event: { id: eventId, date: '20/08/2026', time: '18:00', localTeam: 'AFP', awayTeam: 'Visiteur', type: 'officiel' },
      extras: { id: eventId, planningStatus: 'published' },
      assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    };
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
      // Un compte personnel ne doit jamais ouvrir un chat d'événement dont le club n'a
      // jamais publié le planning global, même si le statut live dit « published »
      // (issue #147) : le snapshot publié doit donc exister pour que ce test passe la
      // création de la room comme le ferait un vrai club ayant déjà publié.
      await savePlanningRecord(db, {
        id: publishedRecordId,
        clubId,
        kind: 'published-planning',
        payload: { schemaVersion: 1, publishedAt: new Date().toISOString(), publishedByUserId: 0, events: [eventSnapshot] },
      });
      const session = await getSessionUser(member.token);
      const room = await runWithClubId(clubId, () => getOrCreateEventRoom(db, session!, 'officiel', eventId));
      roomIds.push(room.id);

      // L'événement est retiré du snapshot publié (ex. annulation propagée à la republication) :
      // l'accès au chat doit être révoqué même si le live n'a pas changé.
      await savePlanningRecord(db, {
        id: publishedRecordId,
        clubId,
        kind: 'published-planning',
        payload: { schemaVersion: 1, publishedAt: new Date().toISOString(), publishedByUserId: 0, events: [] },
      });

      await expect(listMessages(db, session!, room.id)).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedRecordId, clubId]);
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
});
