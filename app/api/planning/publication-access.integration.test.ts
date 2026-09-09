import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { GET as getEventDetail } from '@/app/api/planning/events/[eventType]/[eventId]/route';
import { GET as getAssignmentSwaps } from '@/app/api/me/assignment-swaps/route';
import {
  ChatValidationError,
  getOrCreateEventRoom,
  listChatEvents,
} from '@/lib/chat/service';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('visibilité avant première publication globale (issue #147)', () => {
  const roomIds: string[] = [];
  const eventIds: Array<{ clubId: string; eventId: string }> = [];

  afterEach(async () => {
    const db = await getDb();
    if (roomIds.length) {
      await db.getRepository('ChatReadState').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
      await db.getRepository('ChatMessage').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
      await db.getRepository('ChatParticipant').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: roomIds }).execute();
      await db.getRepository('ChatRoom').createQueryBuilder().delete().where('id IN (:...ids)', { ids: roomIds }).execute();
      roomIds.length = 0;
    }
    for (const item of eventIds) {
      await db.getRepository('Entrainement').delete({ id: item.eventId, clubId: item.clubId });
      await db.getRepository('MatchAuditLog').delete({ entityId: item.eventId, clubId: item.clubId });
      await db.query('DELETE FROM planning_records WHERE club_id = ?', [item.clubId]);
      // Les tables de configuration peuvent ne pas exister dans certaines variantes de
      // schéma de test ; leur nettoyage est opportuniste et ne fait pas partie du contrat.
      await db.query('DELETE FROM club_tenants WHERE id = ?', [item.clubId]).catch(() => undefined);
    }
    eventIds.length = 0;
  });

  async function setupLiveOnlyEvent() {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const eventId = `live-only-${randomBytes(6).toString('hex')}`;
    const db = await getDb();
    await db.getRepository('Entrainement').save({
      id: eventId,
      clubId,
      date: '20/09/2026',
      time: '18:00',
      payload: {
        id: eventId,
        type: 'entrainement',
        date: '20/09/2026',
        time: '18:00',
        lieu: 'Terrain test',
        categorie: 'U13',
        planningStatus: 'published',
        encadrants: [{
          nom: account.user.nom,
          numero: '',
          personId: account.user.id,
          personType: 'encadrant',
          status: 'pending',
        }],
      },
    });
    eventIds.push({ clubId, eventId });
    return { ...account, clubId, eventId };
  }

  it('le détail personnel ne retombe pas sur le live', async () => {
    const account = await setupLiveOnlyEvent();
    try {
      const response = await getEventDetail(
        new NextRequest(
          `http://localhost/api/planning/events/entrainement/${account.eventId}?scope=personal`,
          { headers: { cookie: `session_token=${account.token}` } },
        ),
        { params: { eventType: 'entrainement', eventId: account.eventId } },
      );

      expect(response.status).toBe(404);
    } finally {
      await account.cleanup();
    }
  });

  it('les échanges ne retombent pas sur le live', async () => {
    const account = await setupLiveOnlyEvent();
    try {
      const response = await getAssignmentSwaps(new NextRequest(
        `http://localhost/api/me/assignment-swaps?eventType=entrainement&eventId=${account.eventId}&role=encadrant`,
        { headers: { cookie: `session_token=${account.token}` } },
      ));

      expect(response.status).toBe(404);
    } finally {
      await account.cleanup();
    }
  });

  it('le chat ne liste ni ne crée un salon depuis le live', async () => {
    const account = await setupLiveOnlyEvent();
    try {
      const session = await getSessionUser(account.token);
      expect(session).not.toBeNull();
      const db = await getDb();

      const events = await runWithClubId(account.clubId, () => listChatEvents(db, session!));
      expect(events).toEqual([]);

      await expect(
        runWithClubId(account.clubId, () =>
          getOrCreateEventRoom(db, session!, 'entrainement', account.eventId),
        ),
      ).rejects.toBeInstanceOf(ChatValidationError);
    } finally {
      await account.cleanup();
    }
  });
});
