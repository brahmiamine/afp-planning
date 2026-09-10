import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { runWithClubId } from '@/lib/auth/club-context';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from './records';
import { findUserReferences } from './user-references';
import type { PlanningEventSnapshot } from './event-store';

const dbAvailable = await isDbAvailable();

function snapshot(id: string, personId: number): PlanningEventSnapshot {
  return {
    eventId: id,
    eventType: 'amical',
    title: `AFP – ${id}`,
    date: '12/09/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {
      id,
      type: 'amical',
      date: '12/09/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: id,
      venue: 'domicile',
      planningRevision: 0,
    },
    extras: { id, planningRevision: 0 },
    assignments: {
      arbitre: [],
      encadrant: [{ nom: 'Test', numero: '', personType: 'encadrant', personId, status: 'accepted' }],
      accompagnateur: [],
    },
    revision: 0,
  };
}

describe.skipIf(!dbAvailable)('findUserReferences (issue #273)', () => {
  const cleanupRecordIds: string[] = [];

  afterEach(async () => {
    const db = await getDb();
    for (const id of cleanupRecordIds) {
      await db.query('DELETE FROM planning_records WHERE id = ?', [id]);
    }
    cleanupRecordIds.length = 0;
  });

  it("ne signale rien pour un compte sans aucune référence", async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    try {
      const db = await getDb();
      const report = await runWithClubId(clubId, () => findUserReferences(db, clubId, account.user.id));
      expect(report.referenced).toBe(false);
      expect(report.reasons).toEqual([]);
    } finally {
      await account.cleanup();
    }
  });

  it('signale une référence dans le planning publié', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const recordId = `published-planning:${clubId}`;
    cleanupRecordIds.push(recordId);
    try {
      const db = await getDb();
      await runWithClubId(clubId, () => savePlanningRecord(db, {
        id: recordId,
        clubId,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: account.user.id,
          events: [snapshot('pub-1', account.user.id)],
        },
      }));

      const report = await runWithClubId(clubId, () => findUserReferences(db, clubId, account.user.id));
      expect(report.referenced).toBe(true);
      expect(report.reasons.some((reason) => reason.includes('publié'))).toBe(true);
    } finally {
      await account.cleanup();
    }
  });

  it("signale une référence dans l'historique de publication", async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const recordId = `published-planning-history:${clubId}`;
    cleanupRecordIds.push(recordId);
    try {
      const db = await getDb();
      await runWithClubId(clubId, () => savePlanningRecord(db, {
        id: recordId,
        clubId,
        kind: 'published-planning-history',
        payload: {
          schemaVersion: 1,
          events: [snapshot('hist-1', account.user.id)],
        },
      }));

      const report = await runWithClubId(clubId, () => findUserReferences(db, clubId, account.user.id));
      expect(report.referenced).toBe(true);
      expect(report.reasons.some((reason) => reason.includes('historique'))).toBe(true);
    } finally {
      await account.cleanup();
    }
  });

  it('signale une référence par un autre enregistrement de planning (personId)', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const recordId = `availability-request:${randomBytes(6).toString('hex')}`;
    cleanupRecordIds.push(recordId);
    try {
      const db = await getDb();
      await runWithClubId(clubId, () => savePlanningRecord(db, {
        id: recordId,
        clubId,
        kind: 'availability-request',
        personType: 'officiel',
        personId: account.user.id,
        payload: { note: 'Indisponible le week-end' },
      }));

      const report = await runWithClubId(clubId, () => findUserReferences(db, clubId, account.user.id));
      expect(report.referenced).toBe(true);
      expect(report.reasons.some((reason) => reason.includes('autre enregistrement'))).toBe(true);
    } finally {
      await account.cleanup();
    }
  });

  it('signale une participation à une conversation de chat', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const member = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    try {
      const db = await getDb();
      const room = await db.getRepository('ChatRoom').save({
        id: `room-${randomBytes(6).toString('hex')}`,
        type: 'channel',
        clubId,
        roomKey: `channel:${randomBytes(6).toString('hex')}`,
        name: 'Discussion test',
        createdByUserId: admin.user.id,
        nextSequence: 1,
      });
      await db.getRepository('ChatParticipant').save({ roomId: room.id, userId: member.user.id, addedByUserId: admin.user.id });

      const report = await runWithClubId(clubId, () => findUserReferences(db, clubId, member.user.id));
      expect(report.referenced).toBe(true);
      expect(report.reasons.some((reason) => reason.includes('chat'))).toBe(true);

      await db.getRepository('ChatParticipant').delete({ roomId: room.id, userId: member.user.id });
      await db.getRepository('ChatRoom').delete({ id: room.id });
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });
});
