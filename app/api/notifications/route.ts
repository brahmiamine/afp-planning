import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import type { NotificationEntity } from '@/lib/db/schemas';
import { setCurrentClubId } from '@/lib/auth/club-context';

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
    const unread = notifications.filter((item) => item.readAt === null).length;
    return NextResponse.json({ notifications, unread });
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
