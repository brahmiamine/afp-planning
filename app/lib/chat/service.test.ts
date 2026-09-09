import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { savePlanningRecord } from '@/lib/planning/records';
import {
  appendMessage,
  archiveChannel,
  assertRoomAccess,
  ChatAccessError,
  ChatValidationError,
  createChannel,
  getOrCreateEventRoom,
  listMessages,
  listRooms,
} from './service';
import { getChatAttachment, saveChatAttachment } from './attachments';

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
        replyToMessageId: null,
        forwardedFromName: null,
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

  it('paginates message history backwards with beforeSequence', async () => {
    const first = await createTestUserAndSession('admin', { clubId: 'afp' });
    const second = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const firstSession = await getSessionUser(first.token);
      const secondSession = await getSessionUser(second.token);
      const room = await createChannel(await getDb(), firstSession!, { name: 'Historique' }, [second.user.id]);
      roomIds.push(room.id);

      const total = 5;
      for (let i = 0; i < total; i += 1) {
        await appendMessage(await getDb(), firstSession!, {
          roomId: room.id,
          clientMessageId: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
          content: `Message ${i}`,
          attachment: null,
          replyToMessageId: null,
          forwardedFromName: null,
        });
      }

      const firstPage = await listMessages(await getDb(), secondSession!, room.id, { limit: 2 });
      expect(firstPage.messages.map((m) => m.content)).toEqual(['Message 3', 'Message 4']);
      expect(firstPage.hasMoreBefore).toBe(true);

      const oldestOfFirstPage = firstPage.messages[0]!.sequence;
      const secondPage = await listMessages(await getDb(), secondSession!, room.id, {
        beforeSequence: oldestOfFirstPage,
        limit: 2,
      });
      expect(secondPage.messages.map((m) => m.content)).toEqual(['Message 1', 'Message 2']);
      expect(secondPage.hasMoreBefore).toBe(true);

      const thirdPage = await listMessages(await getDb(), secondSession!, room.id, {
        beforeSequence: secondPage.messages[0]!.sequence,
        limit: 2,
      });
      expect(thirdPage.messages.map((m) => m.content)).toEqual(['Message 0']);
      expect(thirdPage.hasMoreBefore).toBe(false);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it('never returns more than `limit` messages on forward pagination (afterSequence)', async () => {
    // Régression : la borne « une page de plus pour détecter hasMoreBefore » ne doit
    // s'appliquer qu'au chargement DESC (initial / beforeSequence), jamais à la reprise
    // ASC (afterSequence) — sinon resumeFrom (ChatConversation) reçoit systématiquement
    // limit+1 lignes, ne remplit jamais sa condition `=== limit` et arrête la pagination.
    const first = await createTestUserAndSession('admin', { clubId: 'afp' });
    const second = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const firstSession = await getSessionUser(first.token);
      const secondSession = await getSessionUser(second.token);
      const room = await createChannel(await getDb(), firstSession!, { name: 'Reprise' }, [second.user.id]);
      roomIds.push(room.id);

      const total = 5;
      let firstMessageSequence = 0;
      for (let i = 0; i < total; i += 1) {
        const appended = await appendMessage(await getDb(), firstSession!, {
          roomId: room.id,
          clientMessageId: `550e8400-e29b-41d4-a716-4466554401${String(i).padStart(2, '0')}`,
          content: `Reprise ${i}`,
          attachment: null,
          replyToMessageId: null,
          forwardedFromName: null,
        });
        if (i === 0) firstMessageSequence = appended.message.sequence;
      }

      // Reprend juste après le tout premier message (afterSequence: 0, lui, est équivalent
      // à « pas de curseur » et renverrait la dernière page — voir listMessages).
      const resumed = await listMessages(await getDb(), secondSession!, room.id, {
        afterSequence: firstMessageSequence,
        limit: 2,
      });
      expect(resumed.messages).toHaveLength(2);
      expect(resumed.messages.map((m) => m.content)).toEqual(['Reprise 1', 'Reprise 2']);

      const nextSequence = resumed.messages.at(-1)!.sequence;
      const nextPage = await listMessages(await getDb(), secondSession!, room.id, { afterSequence: nextSequence, limit: 2 });
      expect(nextPage.messages).toHaveLength(2);
      expect(nextPage.messages.map((m) => m.content)).toEqual(['Reprise 3', 'Reprise 4']);
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
          replyToMessageId: null,
          forwardedFromName: null,
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

  it('replies to a message with an author + snippet preview, and rejects citing a message from another room (issue #268)', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const member = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    try {
      const db = await getDb();
      const adminSession = await getSessionUser(admin.token);
      const memberSession = await getSessionUser(member.token);
      const room = await createChannel(db, adminSession!, { name: 'Réponses' }, [member.user.id]);
      const otherRoom = await createChannel(db, adminSession!, { name: 'Autre salon' }, [member.user.id]);
      roomIds.push(room.id, otherRoom.id);

      const original = await appendMessage(db, adminSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440200',
        content: 'On se retrouve à 18h ?',
        attachment: null,
        replyToMessageId: null,
        forwardedFromName: null,
      });

      const reply = await appendMessage(db, memberSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440201',
        content: 'Oui, parfait',
        attachment: null,
        replyToMessageId: original.message.id,
        forwardedFromName: null,
      });
      expect(reply.message.replyTo).toEqual({
        id: original.message.id,
        authorName: admin.user.nom,
        snippet: 'On se retrouve à 18h ?',
        deleted: false,
      });

      const history = await listMessages(db, memberSession!, room.id);
      const replyInHistory = history.messages.find((m) => m.id === reply.message.id);
      expect(replyInHistory?.replyTo?.snippet).toBe('On se retrouve à 18h ?');

      await expect(
        appendMessage(db, memberSession!, {
          roomId: room.id,
          clientMessageId: '550e8400-e29b-41d4-a716-446655440202',
          content: 'Référence invalide',
          attachment: null,
          replyToMessageId: '550e8400-e29b-41d4-a716-446655449999',
          forwardedFromName: null,
        }),
      ).rejects.toBeInstanceOf(ChatValidationError);

      const otherRoomMessage = await appendMessage(db, adminSession!, {
        roomId: otherRoom.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440203',
        content: 'Message dans un autre salon',
        attachment: null,
        replyToMessageId: null,
        forwardedFromName: null,
      });
      await expect(
        appendMessage(db, memberSession!, {
          roomId: room.id,
          clientMessageId: '550e8400-e29b-41d4-a716-446655440204',
          content: 'Citation hors salon',
          attachment: null,
          replyToMessageId: otherRoomMessage.message.id,
          forwardedFromName: null,
        }),
      ).rejects.toBeInstanceOf(ChatValidationError);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });

  it('forwarding an attachment duplicates it into the target room so its participants can open it, even without access to the source room (issue #268)', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const target = await createTestUserAndSession('dirigeant', { clubId: 'afp' }, ['arbitre_club']);
    const attachmentIds: string[] = [];
    try {
      const db = await getDb();
      const adminSession = await getSessionUser(admin.token);
      const targetSession = await getSessionUser(target.token);
      const sourceRoom = await createChannel(db, adminSession!, { name: 'Salon source' }, []);
      const targetRoom = await createChannel(db, adminSession!, { name: 'Salon cible' }, [target.user.id]);
      roomIds.push(sourceRoom.id, targetRoom.id);

      const original = await saveChatAttachment(db, {
        clubId: adminSession!.clubId,
        roomId: sourceRoom.id,
        kind: 'image',
        fileName: 'photo.png',
        mimeType: 'image/png',
        content: Buffer.from('fake-png-bytes'),
        uploadedByUserId: admin.user.id,
      });
      attachmentIds.push(original.id);

      // `target` n'a jamais eu accès au salon source : la preuve que le transfert
      // fonctionne, c'est justement qu'il peut malgré tout ouvrir la pièce jointe.
      await expect(assertRoomAccess(db, targetSession!, sourceRoom.id)).rejects.toBeInstanceOf(ChatAccessError);

      const forwarded = await appendMessage(db, adminSession!, {
        roomId: targetRoom.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440210',
        content: 'Regarde ça',
        attachment: {
          type: 'image',
          url: `/api/chat/attachments/${original.id}`,
          mimeType: 'image/png',
          name: 'photo.png',
          size: 14,
        },
        replyToMessageId: null,
        forwardedFromName: 'Alice',
      });
      expect(forwarded.message.forwardedFromName).toBe('Alice');
      expect(forwarded.message.attachment?.url).not.toBe(`/api/chat/attachments/${original.id}`);

      const copiedId = forwarded.message.attachment!.url.split('/').pop()!;
      attachmentIds.push(copiedId);
      const copied = await getChatAttachment(db, copiedId);
      expect(copied?.roomId).toBe(targetRoom.id);
      expect(copied?.content.toString()).toBe('fake-png-bytes');

      const targetHistory = await listMessages(db, targetSession!, targetRoom.id);
      expect(targetHistory.messages.at(-1)?.attachment?.url).toBe(`/api/chat/attachments/${copiedId}`);
    } finally {
      if (attachmentIds.length > 0) {
        await (await getDb()).query(`DELETE FROM chat_attachments WHERE id IN (${attachmentIds.map(() => '?').join(',')})`, attachmentIds);
      }
      await admin.cleanup();
      await target.cleanup();
    }
  });

  it('rejects forwarding an attachment whose source room the sender cannot access (issue #268)', async () => {
    const admin = await createTestUserAndSession('admin', { clubId: 'afp' });
    const owner = await createTestUserAndSession('admin', { clubId: 'afp' });
    const attachmentIds: string[] = [];
    try {
      const db = await getDb();
      const adminSession = await getSessionUser(admin.token);
      const ownerSession = await getSessionUser(owner.token);
      const privateRoom = await createChannel(db, ownerSession!, { name: 'Salon privé' }, []);
      const adminRoom = await createChannel(db, adminSession!, { name: 'Salon admin' }, []);
      roomIds.push(privateRoom.id, adminRoom.id);

      const attachment = await saveChatAttachment(db, {
        clubId: ownerSession!.clubId,
        roomId: privateRoom.id,
        kind: 'image',
        fileName: 'secret.png',
        mimeType: 'image/png',
        content: Buffer.from('secret-bytes'),
        uploadedByUserId: owner.user.id,
      });
      attachmentIds.push(attachment.id);

      await expect(
        appendMessage(db, adminSession!, {
          roomId: adminRoom.id,
          clientMessageId: '550e8400-e29b-41d4-a716-446655440220',
          content: 'Tentative',
          attachment: {
            type: 'image',
            url: `/api/chat/attachments/${attachment.id}`,
            mimeType: 'image/png',
            name: 'secret.png',
            size: 12,
          },
          replyToMessageId: null,
          forwardedFromName: 'Inconnu',
        }),
      ).rejects.toBeInstanceOf(ChatAccessError);
    } finally {
      if (attachmentIds.length > 0) {
        await (await getDb()).query(`DELETE FROM chat_attachments WHERE id IN (${attachmentIds.map(() => '?').join(',')})`, attachmentIds);
      }
      await admin.cleanup();
      await owner.cleanup();
    }
  });
});
