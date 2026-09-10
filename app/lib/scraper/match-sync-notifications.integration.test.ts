import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import type { NotificationEntity } from '@/lib/db/schemas';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { runWithClubId } from '@/lib/auth/club-context';
import { syncOfficialMatchesData } from '@/lib/db/json-migrator';
import { deliverOfficialMatchSyncNotifications } from '@/lib/scraper/match-sync-notifications';
import type { Match, MatchesData } from '@/types/match';

const dbAvailable = await isDbAvailable();

function scraperData(match: Match, scrapedAt: string): MatchesData {
  return {
    club: { name: 'Club test', description: '', logo: '' },
    url: 'https://example.test/matches',
    scrapedAt,
    matches: { [match.date]: [match] },
  };
}

describe.skipIf(!dbAvailable)('deliverOfficialMatchSyncNotifications (issue #336)', () => {
  it('notifie les administrateurs quand un match publié est modifié par la source', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const matchId = `official-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const source: Match = {
      id: matchId,
      type: 'officiel',
      date: '20/09/2026',
      time: '15:00',
      competition: 'Championnat',
      localTeam: 'Club test',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '14:00',
      details: {
        stadium: 'Stade source',
        dateTime: '20/09/2026 - 15:00',
        competition: 'Championnat',
        address: '1 rue Source',
        terrainType: 'Synthétique',
        itineraryLink: '',
        rawText: '',
      },
      staff: null,
    };

    try {
      const db = await getDb();
      await runWithClubId(clubId, () => syncOfficialMatchesData(db, scraperData(source, '2026-09-01T08:00:00.000Z'), clubId));

      const extraRepo = db.getRepository('MatchExtra');
      const extraRow = await extraRepo.findOneByOrFail({ matchId, clubId });
      extraRow.payload = {
        ...(extraRow.payload as Record<string, unknown>),
        id: matchId,
        planningStatus: 'published',
        publishedAt: '2026-09-01T09:00:00.000Z',
      };
      await extraRepo.save(extraRow);

      const rescheduledSource: Match = {
        ...source,
        time: '16:30',
        horaireRendezVous: '15:00',
        details: {
          ...source.details!,
          dateTime: '20/09/2026 - 16:30',
        },
      };

      const syncResult = await runWithClubId(clubId, () =>
        syncOfficialMatchesData(db, scraperData(rescheduledSource, '2026-09-02T08:00:00.000Z'), clubId),
      );
      expect(syncResult.notifications).toHaveLength(1);
      expect(syncResult.notifications[0]?.type).toBe('updated');

      await deliverOfficialMatchSyncNotifications(db, clubId, syncResult.notifications);

      const notifications = await db.getRepository<NotificationEntity>('Notification').find({
        where: { userId: admin.user.id },
      });
      expect(notifications.some((item) => item.type === 'official_match_updated')).toBe(true);
      expect(notifications.some((item) => item.message.includes('SportCorico'))).toBe(true);
    } finally {
      const db = await getDb();
      await db.getRepository('Notification').delete({ userId: admin.user.id });
      await db.getRepository('MatchExtra').delete({ matchId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: matchId, clubId });
      await db.getRepository('AppMeta').delete([
        { key: `matches_club_info:${clubId}` },
        { key: `matches_url:${clubId}` },
        { key: `matches_scraped_at:${clubId}` },
      ]);
      await admin.cleanup();
    }
  });
});
