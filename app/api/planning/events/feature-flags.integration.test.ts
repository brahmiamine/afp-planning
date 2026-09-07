import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { updateAppSettings } from '@/lib/settings-store';
import { GET as getEventDetail } from '@/app/api/planning/events/[eventType]/[eventId]/route';
import { GET as getReports } from '@/app/api/planning/events/[eventType]/[eventId]/reports/route';
import { GET as getAttachments } from '@/app/api/planning/events/[eventType]/[eventId]/attachments/route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('feature flags espace événement (issue #149)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('garde le détail accessible mais bloque rapports et documents quand collaboration est désactivée', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const account = await createTestUserAndSession('admin', { clubId });
    const eventId = `feature-event-${randomBytes(6).toString('hex')}`;
    const db = await getDb();

    cleanups.push(async () => {
      await db.getRepository('Entrainement').delete({ id: eventId, clubId });
      await db.getRepository('MatchAuditLog').delete({ entityId: eventId, clubId });
      await account.cleanup();
      await db.getRepository('ClubTenant').delete({ id: clubId }).catch(() => undefined);
    });

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
        planningStatus: 'draft',
        encadrants: [],
      },
    });

    await updateAppSettings(db, clubId, (current) => ({
      ...current,
      features: {
        ...current.features,
        collaboration: false,
        travelAndWeather: false,
        eventChat: false,
      },
    }));

    const headers = { cookie: `session_token=${account.token}` };
    const params = { eventType: 'entrainement', eventId };

    const detail = await getEventDetail(
      new NextRequest(`http://localhost/api/planning/events/entrainement/${eventId}`, { headers }),
      { params },
    );
    expect(detail.status).toBe(200);

    const reports = await getReports(
      new NextRequest(`http://localhost/api/planning/events/entrainement/${eventId}/reports`, { headers }),
      { params },
    );
    expect(reports).toBeDefined();
    if (!reports) throw new Error('La route rapports n’a retourné aucune réponse');
    expect(reports.status).toBe(409);
    expect(await reports.json()).toMatchObject({ feature: 'collaboration' });

    const attachments = await getAttachments(
      new NextRequest(`http://localhost/api/planning/events/entrainement/${eventId}/attachments`, { headers }),
      { params },
    );
    expect(attachments).toBeDefined();
    if (!attachments) throw new Error('La route documents n’a retourné aucune réponse');
    expect(attachments.status).toBe(409);
    expect(await attachments.json()).toMatchObject({ feature: 'collaboration' });
  });
});
