import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import type { NotificationEntity } from '@/lib/db/schemas';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { listPublishedPlanningEventSnapshots } from '@/lib/planning/published-planning';
import { createTeamLogoResolver } from '@/lib/planning/team-logos';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const repo = db.getRepository<NotificationEntity>('Notification');
    const notifications = await repo.find({
      where: { userId: auth.user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const unread = await repo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId: auth.user.id })
      .andWhere('notification.readAt IS NULL')
      .getCount();

    // Notifications liées à un match : on joint les logos des deux clubs pour un
    // rendu visuel côté /mon-planning. Best-effort, et uniquement quand l'appelant
    // le demande (`?withLogos=1`) pour ne pas alourdir le simple compteur non-lus.
    const withLogos = new URL(request.url).searchParams.get('withLogos') === '1';
    let payload: unknown[] = notifications;
    if (withLogos && notifications.some((item) => item.eventType && item.eventId)) {
      try {
        const [snapshots, resolveLogos] = await Promise.all([
          listPublishedPlanningEventSnapshots(db, auth.user.clubId),
          createTeamLogoResolver(db, auth.user.clubId),
        ]);
        type ResolvableEvent = Parameters<typeof resolveLogos>[0];
        const eventByKey = new Map<string, ResolvableEvent>();
        for (const snapshot of snapshots ?? []) {
          eventByKey.set(`${snapshot.eventType}:${snapshot.eventId}`, snapshot.event as ResolvableEvent);
        }
        payload = notifications.map((item) =>
          item.eventType && item.eventId
            ? { ...item, ...resolveLogos(eventByKey.get(`${item.eventType}:${item.eventId}`)) }
            : item,
        );
      } catch (enrichError) {
        console.error('Notification logo enrichment failed:', enrichError);
      }
    }

    return NextResponse.json({ notifications: payload, unread });
  } catch (error) {
    console.error('Error loading notifications:', error);
    return NextResponse.json({ error: 'Impossible de charger les notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const db = await getDb();
    const repo = db.getRepository<NotificationEntity>('Notification');

    if (body.all === true) {
      await repo
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('userId = :userId', { userId: auth.user.id })
        .andWhere('readAt IS NULL')
        .execute();
      return NextResponse.json({ success: true });
    }

    const id = Number.parseInt(String(body.id ?? ''), 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Notification invalide' }, { status: 400 });
    }

    const notification = await repo.findOneBy({ id, userId: auth.user.id });
    if (!notification) return NextResponse.json({ error: 'Notification introuvable' }, { status: 404 });
    notification.readAt = new Date();
    await repo.save(notification);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour la notification' }, { status: 500 });
  }
}
